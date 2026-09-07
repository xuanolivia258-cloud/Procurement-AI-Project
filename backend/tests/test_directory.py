from unittest.mock import patch

import pytest

from app.auth import get_actor
from app.config import settings
from app.directory import DIRECTORY_ENDPOINTS, owner_profile, yellowpage_avatar
from app.main import app
from app.schemas import Actor


@pytest.mark.parametrize("account,employee", [("l00123456", "00123456"), ("L00123456", "00123456"), ("00123456", "00123456")])
def test_face_id_matches_mrvp_without_losing_leading_zero(account, employee):
    assert yellowpage_avatar(account) == f"https://w3.huawei.com/w3lab/rest/yellowpage/face/{employee}/45"


@pytest.mark.parametrize("account", ["test.user", "../../other", "a123/45", "123", "l１２３４５６７８", "l00123456\n", "a" * 32])
def test_invalid_face_account_is_not_guessed(account):
    assert yellowpage_avatar(account) is None


def test_profile_requires_authentication(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "w3")
    assert client.get("/api/auth/profile").status_code == 401


def test_profile_uses_only_verified_actor_and_does_not_query_upstream(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "w3")
    monkeypatch.setattr(settings, "w3_directory_enabled", True)
    actor = Actor(id="l00123456", name="王小明", name_en="W3 Fallback", role="viewer")
    app.dependency_overrides[get_actor] = lambda: actor
    with patch("httpx.AsyncClient", side_effect=AssertionError("Directory cookies belong in the browser")):
        response = client.get("/ai_procurement/api/auth/profile?userInfo=another.user", headers={"x-user-name": "another.user"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    profile = response.json()
    assert profile["id"] == actor.id
    assert profile["name"] == actor.name
    assert profile["role"] == "viewer"
    assert profile["name_en"] == "W3 Fallback"
    assert profile["directory_lookup"]["account"] == actor.id
    assert profile["directory_lookup"]["url"] in DIRECTORY_ENDPOINTS
    assert profile["avatar_url"].endswith("/00123456/45")
    assert "set-cookie" not in response.headers
    assert not {"access_token", "secret", "cookie"}.intersection(profile)


def test_disabled_login_does_not_start_owner_lookup(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "disabled")
    response = client.get("/api/auth/profile")
    assert response.json() == {"id": "local-test-user", "name": "Local Test User", "role": "admin"}


def test_directory_switch_and_url_are_safe(monkeypatch):
    actor = Actor(id="l00123456", name="Test User", role="viewer")
    monkeypatch.setattr(settings, "w3_directory_enabled", False)
    assert owner_profile(actor) == actor.model_dump(exclude_none=True)
    monkeypatch.setattr(settings, "w3_directory_enabled", True)
    monkeypatch.setattr(settings, "w3_directory_url", "https://unrelated.example/collect")
    assert "directory_lookup" not in owner_profile(actor)
    assert owner_profile(actor)["avatar_url"].endswith("/00123456/45")


def test_unusable_identity_does_not_become_a_header(monkeypatch):
    monkeypatch.setattr(settings, "w3_directory_enabled", True)
    actor = Actor(id="user\r\nx-user-name: another", name="Test")
    assert "directory_lookup" not in owner_profile(actor)
