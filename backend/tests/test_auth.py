from urllib.parse import parse_qs, urlparse
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.config import Settings, settings


def test_auth_switch_defaults_off_and_reads_runtime_environment(monkeypatch):
    monkeypatch.delenv("AUTH_MODE", raising=False)
    assert Settings(_env_file=None).auth_mode == "disabled"
    monkeypatch.setenv("AUTH_MODE", "w3")
    assert Settings(_env_file=None).auth_mode == "w3"
    monkeypatch.setenv("AUTH_MODE", "disabled")
    assert Settings(_env_file=None).auth_mode == "disabled"


def configure_w3(monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "w3")
    monkeypatch.setattr(settings, "site_url", "https://cari.rnd.huawei.com/ai_procurement")
    monkeypatch.setattr(settings, "w3_client_id", "test-client")
    monkeypatch.setattr(settings, "w3_client_secret", type(settings.w3_client_secret)("test-secret"))
    monkeypatch.setattr(settings, "w3_redirect_uri", "https://cari.rnd.huawei.com/ai_procurement/authorize")
    monkeypatch.setattr(settings, "session_secret", type(settings.session_secret)("test-session-secret"))


def test_disabled_mode_keeps_local_actor(client):
    response = client.get("/ai_procurement/api/auth/status")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "authenticated": True,
        "mode": "disabled",
        "actor": {"id": "local-test-user", "name": "Local Test User", "role": "admin"},
    }


def test_w3_mode_requires_session_for_business_api(client, monkeypatch):
    configure_w3(monkeypatch)
    status = client.get("/ai_procurement/api/auth/status")
    assert status.status_code == 200
    assert status.headers["cache-control"] == "no-store"
    assert status.json()["authenticated"] is False

    response = client.get("/api/projects")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    assert client.post("/api/projects", json={}).status_code == 401
    assert client.get("/api/health").status_code == 200


@pytest.mark.parametrize("path", ["/api/auth/login", "/authorize?code=test&state=test"])
def test_missing_w3_config_shows_retry_page_without_bypassing_login(client, monkeypatch, path):
    configure_w3(monkeypatch)
    monkeypatch.setattr(settings, "w3_client_secret", type(settings.w3_client_secret)(""))
    with patch("app.sso.httpx.AsyncClient") as upstream:
        response = client.get(path, follow_redirects=False)
        upstream.assert_not_called()
    assert response.status_code == 303
    assert response.headers["location"] == "https://cari.rnd.huawei.com/ai_procurement/?auth_error=w3_not_configured"
    assert client.get("/api/auth/status").json()["authenticated"] is False
    assert client.get("/api/projects").status_code == 401


def test_disabled_mode_needs_no_w3_config_and_allows_project_testing(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "disabled")
    monkeypatch.setattr(settings, "w3_client_id", "")
    monkeypatch.setattr(settings, "w3_client_secret", type(settings.w3_client_secret)(""))
    monkeypatch.setattr(settings, "site_url", "http://testserver/ai_procurement")
    with patch("app.sso.httpx.AsyncClient") as upstream:
        assert client.get("/api/auth/status").json()["mode"] == "disabled"
        login = client.get("/api/auth/login?next=/projects", follow_redirects=False)
        assert login.headers["location"] == "http://testserver/ai_procurement/projects"
        for path in ("/authorize?code=old-code&state=old-state", "/api/auth/logout"):
            response = client.get(path, follow_redirects=False)
            assert response.status_code == 303
            assert response.headers["location"] == "http://testserver/ai_procurement/"
        project = client.post("/api/projects", json={"ceg": "Login rollback test"})
        assert project.status_code == 201
        assert client.get(f"/api/projects/{project.json()['id']}").status_code == 200
        upstream.assert_not_called()


def test_failed_w3_login_can_be_disabled_and_reenabled(client, monkeypatch):
    configure_w3(monkeypatch)
    login = client.get("/ai_procurement/api/auth/login", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    with patch("app.sso.exchange_code_for_token", new=AsyncMock(side_effect=httpx.ConnectError("W3 unavailable"))):
        callback = client.get(f"/ai_procurement/authorize?code=test-code&state={state}", follow_redirects=False)
    assert callback.headers["location"].endswith("?auth_error=w3_login_failed")
    assert client.get("/api/projects").status_code == 401

    monkeypatch.setattr(settings, "auth_mode", "disabled")
    status = client.get("/ai_procurement/api/auth/status")
    assert status.json()["actor"]["id"] == "local-test-user"
    assert status.json()["mode"] == "disabled"
    assert status.headers["cache-control"] == "no-store"
    assert client.post("/api/projects", json={}).status_code == 201

    monkeypatch.setattr(settings, "auth_mode", "w3")
    assert client.get("/ai_procurement/api/auth/status").json()["authenticated"] is False
    assert client.get("/api/projects").status_code == 401


def test_w3_authorization_code_flow_creates_local_session(client, monkeypatch):
    configure_w3(monkeypatch)
    login = client.get("/ai_procurement/api/auth/login?next=/ai_procurement/projects", follow_redirects=False)
    assert login.status_code == 302
    authorize_url = urlparse(login.headers["location"])
    authorize_query = parse_qs(authorize_url.query)
    assert authorize_query["client_id"] == ["test-client"]
    assert authorize_query["redirect_uri"] == ["https://cari.rnd.huawei.com/ai_procurement/authorize"]
    state = authorize_query["state"][0]

    with (
        patch("app.sso.exchange_code_for_token", new=AsyncMock(return_value={"access_token": "w3-token"})),
        patch("app.sso.fetch_w3_profile", new=AsyncMock(return_value={
            "uid": "Test.User", "displayName": "Test User", "email": "test.user@example.com",
        })),
    ):
        callback = client.get(f"/ai_procurement/authorize?code=authorization-code&state={state}", follow_redirects=False)

    assert callback.status_code == 303
    assert callback.headers["location"] == "https://cari.rnd.huawei.com/ai_procurement/projects"
    status = client.get("/ai_procurement/api/auth/status")
    assert status.status_code == 200
    assert status.json()["actor"] == {"id": "test.user", "name": "Test User", "role": "admin"}


def test_w3_login_rejects_external_next_url(client, monkeypatch):
    configure_w3(monkeypatch)
    login = client.get("/ai_procurement/api/auth/login?next=https://attacker.example/", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]

    with (
        patch("app.sso.exchange_code_for_token", new=AsyncMock(return_value={"access_token": "w3-token"})),
        patch("app.sso.fetch_w3_profile", new=AsyncMock(return_value={"uid": "safe-user"})),
    ):
        callback = client.get(f"/ai_procurement/authorize?code=authorization-code&state={state}", follow_redirects=False)

    assert callback.headers["location"] == "https://cari.rnd.huawei.com/ai_procurement/"


def test_w3_callback_rejects_unknown_state(client, monkeypatch):
    configure_w3(monkeypatch)
    response = client.get("/ai_procurement/authorize?code=authorization-code&state=unknown", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "https://cari.rnd.huawei.com/ai_procurement/?auth_error=invalid_state"


def test_w3_logout_clears_session_and_redirects_to_uniportal(client, monkeypatch):
    configure_w3(monkeypatch)
    login = client.get("/ai_procurement/api/auth/login", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    with (
        patch("app.sso.exchange_code_for_token", new=AsyncMock(return_value={"access_token": "w3-token"})),
        patch("app.sso.fetch_w3_profile", new=AsyncMock(return_value={"uid": "logout-user"})),
    ):
        client.get(f"/ai_procurement/authorize?code=authorization-code&state={state}", follow_redirects=False)

    logout = client.get("/ai_procurement/api/auth/logout", follow_redirects=False)
    assert logout.status_code == 303
    query = parse_qs(urlparse(logout.headers["location"]).query)
    assert query["clientId"] == ["test-client"]
    assert query["redirect"] == ["https://cari.rnd.huawei.com/ai_procurement/"]
    assert client.get("/ai_procurement/api/auth/status").json()["authenticated"] is False
