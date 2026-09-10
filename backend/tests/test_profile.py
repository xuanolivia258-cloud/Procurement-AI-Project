import base64
import json
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.profile import safe_avatar_url
from app.schemas import Actor
from app.sso import actor_from_profile


@pytest.mark.parametrize("field", ["avatar_url", "avatarUrl", "picture", "photoUrl", "photo_url"])
def test_profile_keeps_optional_photo_and_name(field):
    actor = actor_from_profile({"uid": "Test.User", "displayName": "Olivia Fang", field: "https://photos.huawei.com/avatar.jpg"})
    assert actor.name == "Olivia Fang"
    assert actor.id == "test.user"
    assert actor.avatar_url == "https://photos.huawei.com/avatar.jpg"


@pytest.mark.parametrize("value", [
    None, "", 42, {}, "http://photos.huawei.com/avatar.jpg", "//photos.huawei.com/a.jpg",
    "https:photos.huawei.com/a.jpg", "javascript:alert(1)", "data:image/png;base64,AAA",
    "https://user:password@photos.huawei.com/a.jpg", "https://photos.huawei.com/a.jpg#token",
    "https://photos.huawei.com:invalid/a.jpg", "https://photos.huawei.com:8080/a.jpg",
    "https://photos.huawei.com/a.jpg?access_token=private",
    "https://photos.huawei.com/a.jpg?%61ccess_token=private",
    "https://photos.huawei.com/a.jpg?Authorization=private",
    "https://photos.huawei.com/a.jpg?code=authorization-code",
    "https://photos.huawei.com/" + "a" * 500,
    "https://photos.huawei.com/a\nb.jpg", "https://photos.huawei.com\\a.jpg",
    "https://photos.huawei.com/" + chr(0xD800),
])
def test_unsafe_photo_never_breaks_identity(value):
    assert safe_avatar_url(value) is None
    actor = Actor(id="user", name="User", avatar_url=value)
    assert actor.avatar_url is None
    assert actor.id == "user"


def test_photo_can_have_non_sensitive_size_parameters():
    assert safe_avatar_url(" https://photos.huawei.com/a.jpg?size=64 ") == "https://photos.huawei.com/a.jpg?size=64"


def test_profile_skips_blank_names_and_invalid_photo_candidates():
    actor = actor_from_profile({
        "uid": " ", "uuid": "Fallback.User", "displayName": " ", "displayNameCn": "王小明",
        "avatar_url": "data:image/png;base64,AAA", "picture": "https://photos.huawei.com/a.jpg",
    })
    assert actor.id == "fallback.user"
    assert actor.name == "王小明"
    assert actor.avatar_url == "https://photos.huawei.com/a.jpg"


def test_legacy_identity_without_avatar_remains_valid():
    actor = Actor.model_validate({"id": "existing-user", "name": "Existing User", "role": "admin"})
    assert actor.avatar_url is None
    assert actor.name_en is None
    assert actor.model_dump(exclude_none=True) == {"id": "existing-user", "name": "Existing User", "role": "admin"}


def test_login_returns_photo_without_storing_w3_tokens_in_cookie(client, monkeypatch):
    site = "https://ai4news.rnd.huawei.com/ai_procurement"
    monkeypatch.setattr(settings, "auth_mode", "w3")
    monkeypatch.setattr(settings, "site_url", site)
    monkeypatch.setattr(settings, "w3_redirect_uri", site + "/authorize")
    monkeypatch.setattr(settings, "w3_client_id", "test-client")
    monkeypatch.setattr(settings, "w3_client_secret", type(settings.w3_client_secret)("test-secret"))
    monkeypatch.setattr(settings, "session_secret", type(settings.session_secret)("test-session-secret"))
    monkeypatch.setattr(settings, "initial_admin_ids", "test.user")
    client.headers["Host"] = "ai4news.rnd.huawei.com"
    login = client.get("/ai_procurement/api/auth/login", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    with (
        patch("app.sso.exchange_code_for_token", new=AsyncMock(return_value={"access_token": "private-w3-token"})),
        patch("app.sso.fetch_w3_profile", new=AsyncMock(return_value={
            "uid": "Test.User", "displayName": "Olivia Fang", "picture": "https://photos.huawei.com/a.jpg",
            "displayNameEn": "Olivia Fang",
            "telephoneNumber": "not-for-session", "access_token": "private-w3-token",
        })),
    ):
        callback = client.get("/ai_procurement/authorize", params={"code": "test-code", "state": state}, follow_redirects=False)
    assert callback.status_code == 303
    status = client.get("/ai_procurement/api/auth/status").json()
    assert status["actor"]["name"] == "Olivia Fang"
    assert status["actor"]["name_en"] == "Olivia Fang"
    assert status["actor"]["avatar_url"] == "https://photos.huawei.com/a.jpg"
    session = json.loads(base64.b64decode(client.cookies.get("cari_session").split(".")[0]))
    # The cookie stores identity/profile only. Effective authorization is resolved
    # from the allowlist on every request and is never trusted from the session.
    assert session["actor"] == {**status["actor"], "role": "member"}
    assert "private-w3-token" not in json.dumps(session)
    assert "not-for-session" not in json.dumps(session)


def test_english_header_name_does_not_replace_audit_name():
    actor = actor_from_profile({"uid": "test.user", "displayName": "王小明", "displayNameEn": " Xiaoming Wang "})
    assert actor.name == "王小明"
    assert actor.name_en == "Xiaoming Wang"


@pytest.mark.parametrize("value", [None, "", " ", 42, {}])
def test_missing_english_name_does_not_break_login(value):
    actor = actor_from_profile({"uid": "test.user", "displayName": "王小明", "displayNameEn": value})
    assert actor.name_en is None
