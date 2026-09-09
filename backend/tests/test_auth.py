from urllib.parse import parse_qs, urlparse
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.config import Settings, settings


@pytest.fixture(autouse=True)
def canonical_request_host(client):
    # The public Nginx preserves this Host while proxying to the backend.
    client.headers["Host"] = "cari.rnd.huawei.com"


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
    assert status.json()["login_ready"] is True
    assert status.json()["login_url"] == "https://cari.rnd.huawei.com/ai_procurement/api/auth/login"

    response = client.get("/api/projects")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    assert client.post("/api/projects", json={}).status_code == 401
    assert client.get("/api/health").status_code == 200


def test_auth_status_reports_missing_settings_without_exposing_secrets(client, monkeypatch):
    configure_w3(monkeypatch)
    monkeypatch.setattr(settings, "w3_client_id", "")
    response = client.get("/api/auth/status")
    assert response.json()["login_ready"] is False
    assert response.json()["configuration_issues"] == ["W3_CLIENT_ID"]
    assert "test-secret" not in response.text
    assert "test-session-secret" not in response.text


def test_auth_status_rejects_placeholder_credentials(client, monkeypatch):
    configure_w3(monkeypatch)
    monkeypatch.setattr(settings, "w3_client_secret", type(settings.w3_client_secret)("replace-with-w3-client-secret"))
    assert client.get("/api/auth/status").json()["configuration_issues"] == ["W3_CLIENT_SECRET"]


def test_auth_status_detects_callback_origin_mismatch(client, monkeypatch):
    configure_w3(monkeypatch)
    monkeypatch.setattr(settings, "site_url", "http://127.0.0.1:8080/ai_procurement")
    status = client.get("/api/auth/status").json()
    assert status["login_ready"] is False
    assert "SITE_URL / W3_REDIRECT_URI (origin mismatch)" in status["configuration_issues"]


def test_login_from_ip_moves_to_public_domain_before_creating_state(client, monkeypatch):
    configure_w3(monkeypatch)
    response = client.get("/api/auth/login?next=/projects", headers={"Host": "127.0.0.1:8080"}, follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "https://cari.rnd.huawei.com/ai_procurement/api/auth/login?next=%2Fprojects"
    assert "set-cookie" not in response.headers


def test_ai4news_domain_keeps_procurement_callback_and_session_isolated(client, monkeypatch):
    configure_w3(monkeypatch)
    site = "https://ai4news.rnd.huawei.com/ai_procurement"
    monkeypatch.setattr(settings, "site_url", site)
    monkeypatch.setattr(settings, "w3_redirect_uri", site + "/authorize")
    client.headers["Host"] = "ai4news.rnd.huawei.com"
    assert "ai4news.rnd.huawei.com" in settings.trusted_host_list

    status = client.get("/ai_procurement/api/auth/status").json()
    assert status["login_ready"] is True
    assert status["login_url"] == site + "/api/auth/login"
    for old_host in ("cari.rnd.huawei.com", "127.0.0.1:8080"):
        old_login = client.get("/api/auth/login?next=/projects", headers={"Host": old_host}, follow_redirects=False)
        assert old_login.status_code == 303
        assert old_login.headers["location"] == site + "/api/auth/login?next=%2Fprojects"
        assert "set-cookie" not in old_login.headers

    login = client.get("/ai_procurement/api/auth/login?next=/projects", follow_redirects=False)
    assert login.status_code == 302
    query = parse_qs(urlparse(login.headers["location"]).query)
    assert query["redirect_uri"] == [site + "/authorize"]
    cookie = login.headers["set-cookie"]
    assert cookie.startswith("cari_session=")
    assert "path=/ai_procurement" in cookie.lower()
    assert "domain=" not in cookie.lower()
    with (
        patch("app.sso.exchange_code_for_token", new=AsyncMock(return_value={"access_token": "test-token"})),
        patch("app.sso.fetch_w3_profile", new=AsyncMock(return_value={"uid": "shared-domain-user"})),
    ):
        callback = client.get("/ai_procurement/authorize", params={"code": "test-code", "state": query["state"][0]}, follow_redirects=False)
    assert callback.headers["location"] == site + "/projects"
    assert client.get("/ai_procurement/api/auth/status").json()["authenticated"] is True


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
    assert status.json()["actor"] == {"id": "test.user", "name": "Test User", "role": "member"}


@pytest.mark.parametrize("profile,expected_role", [
    ({"uid": " L00123456 "}, "admin"),
    ({"uid": "Z00876543", "displayName": "任意姓名", "displayNameEn": "Different Name"}, "admin"),
    ({"uid": "l99999999", "displayName": "l00123456", "displayNameEn": "z00876543"}, "member"),
    ({"uid": "l001234560", "displayName": "任意姓名"}, "member"),
    ({"uid": "00123456", "displayName": "任意姓名"}, "member"),
])
def test_initial_administrators_match_only_full_employee_ids(client, monkeypatch, profile, expected_role):
    configure_w3(monkeypatch)
    monkeypatch.setattr(settings, "initial_admin_ids", " L00123456, z00876543 ,, l00123456, ")
    # Existing deployments may still carry this setting; it must not grant access.
    monkeypatch.setattr(settings, "w3_default_role", "admin")
    login = client.get("/ai_procurement/api/auth/login", follow_redirects=False)
    state = parse_qs(urlparse(login.headers["location"]).query)["state"][0]
    with (
        patch("app.sso.exchange_code_for_token", new=AsyncMock(return_value={"access_token": "test-token"})),
        patch("app.sso.fetch_w3_profile", new=AsyncMock(return_value=profile)),
    ):
        callback = client.get("/ai_procurement/authorize", params={"code": "test-code", "state": state}, follow_redirects=False)
    assert callback.status_code == 303
    assert "auth_error" not in callback.headers["location"]
    # Nginx strips /ai_procurement before forwarding business API requests and
    # their cookies. Reproduce that forwarding when calling the backend directly.
    client.cookies.set("cari_session", client.cookies.get("cari_session"), path="/")

    # Identity alone is enough: no name registration or directory request is needed.
    with patch("httpx.AsyncClient", side_effect=AssertionError("Permissions must not call the directory")):
        status = client.get("/ai_procurement/api/auth/status").json()
        assert status["actor"]["id"] == profile["uid"].strip().lower()
        assert status["actor"]["role"] == expected_role
        assert client.get("/ai_procurement/api/auth/profile").json()["role"] == expected_role
        grants = client.get("/api/access-grants")
        assert grants.status_code == (200 if expected_role == "admin" else 403)
        if expected_role == "admin":
            assert [row["employee_id"] for row in grants.json()] == ["l00123456", "z00876543"]
            assert all(row["is_initial"] and row["cn_name"] is None and row["full_name"] is None for row in grants.json())
            assert client.put("/api/access-grants/z00876543", json={
                "employee_id": "z00876543", "role": "member",
            }).status_code == 409
            assert client.delete("/api/access-grants/z00876543").status_code == 409

            # Recalculate on the next request rather than trusting the signed session's role.
            monkeypatch.setattr(settings, "initial_admin_ids", "")
            assert client.get("/ai_procurement/api/auth/status").json()["actor"]["role"] == "member"
            assert client.get("/api/access-grants").status_code == 403


def test_disabled_mode_status_uses_the_same_id_based_permissions(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_mode", "disabled")
    monkeypatch.setattr(settings, "initial_admin_ids", "l00123456,z00876543")
    monkeypatch.setattr(settings, "local_actor_id", "local-test-user")
    monkeypatch.setattr(settings, "local_actor_name", "l00123456")
    assert client.get("/api/auth/status").json()["actor"]["role"] == "member"
    assert client.get("/api/access-grants").status_code == 403
    monkeypatch.setattr(settings, "initial_admin_ids", "l00123456,z00876543,local-test-user")
    assert client.get("/api/auth/status").json()["actor"]["role"] == "admin"
    assert client.get("/api/access-grants").status_code == 200


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
    assert query["redirect"] == ["https://cari.rnd.huawei.com/ai_procurement/?signed_out=1"]
    assert client.get("/ai_procurement/api/auth/status").json()["authenticated"] is False


def test_logout_without_provider_endpoint_does_not_restart_sso(client, monkeypatch):
    configure_w3(monkeypatch)
    monkeypatch.setattr(settings, "w3_logout_url", "")
    response = client.get("/api/auth/logout", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "https://cari.rnd.huawei.com/ai_procurement/?signed_out=1"
    assert client.get("/api/auth/status").json()["authenticated"] is False
