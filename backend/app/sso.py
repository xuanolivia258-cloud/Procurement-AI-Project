from __future__ import annotations

import secrets
import time
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from .config import settings
from .auth import get_actor
from .database import get_db
from .directory import owner_profile
from .logging_config import log_integration_event, log_request_error, summarize_http_response
from .profile import avatar_from_profile
from .schemas import Actor


router = APIRouter()
STATE_TTL_SECONDS = 10 * 60
MAX_PENDING_STATES = 5


def _safe_next(value: str | None) -> str:
    """Only allow an absolute path on this site, never a full external URL."""
    if not value or not value.startswith("/") or value.startswith("//"):
        return "/"
    base_path = urlparse(settings.site_url).path.rstrip("/")
    if base_path and value.startswith(base_path):
        suffix = value[len(base_path):]
        if not suffix:
            return "/"
        if suffix.startswith("/"):
            return suffix
        if suffix.startswith(("?", "#")):
            return f"/{suffix}"
    return value


def _site_url(path: str = "/") -> str:
    return f"{settings.site_url.rstrip('/')}{path}"


def _w3_configuration_issues() -> list[str]:
    values = {
        "W3_CLIENT_ID": settings.w3_client_id,
        "W3_CLIENT_SECRET": settings.w3_client_secret.get_secret_value(),
        "W3_AUTHORIZE_URL": settings.w3_authorize_url,
        "W3_ACCESS_TOKEN_URL": settings.w3_access_token_url,
        "W3_USERINFO_URL": settings.w3_userinfo_url,
        "W3_REDIRECT_URI": settings.w3_redirect_uri,
        "SESSION_SECRET": settings.session_secret.get_secret_value(),
    }
    missing = [
        name for name, value in values.items()
        if not value.strip() or value.strip().startswith("replace-with-")
    ]
    if settings.session_secret.get_secret_value() == "dev-only-change-me":
        missing.append("SESSION_SECRET")
    site = urlparse(settings.site_url)
    callback = urlparse(settings.w3_redirect_uri)
    if site.scheme not in {"http", "https"} or not site.netloc:
        missing.append("SITE_URL")
    if callback.scheme not in {"http", "https"} or not callback.netloc:
        missing.append("W3_REDIRECT_URI")
    elif (site.scheme.lower(), site.netloc.lower()) != (callback.scheme.lower(), callback.netloc.lower()):
        missing.append("SITE_URL / W3_REDIRECT_URI (origin mismatch)")
    return list(dict.fromkeys(missing))


def _require_w3_configuration() -> None:
    missing = _w3_configuration_issues()
    if missing:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "W3_NOT_CONFIGURED",
                "message": f"W3 authentication is not fully configured: {', '.join(missing)}.",
            },
        )


def _request_context(request: Request) -> dict[str, str]:
    return {
        "request_id": getattr(request.state, "request_id", "-"),
        "actor_id": getattr(request.state, "actor_id", "anonymous"),
    }


def _remember_state(request: Request, state: str, next_path: str) -> None:
    now = int(time.time())
    pending = request.session.get("w3_pending_states", [])
    if not isinstance(pending, list):
        pending = []
    pending = [
        item for item in pending
        if isinstance(item, dict) and now - int(item.get("created_at", 0)) <= STATE_TTL_SECONDS
    ]
    pending.append({"value": state, "next": next_path, "created_at": now})
    request.session["w3_pending_states"] = pending[-MAX_PENDING_STATES:]


def _consume_state(request: Request, state: str | None) -> str | None:
    now = int(time.time())
    pending = request.session.get("w3_pending_states", [])
    if not isinstance(pending, list):
        pending = []
    matched_next = None
    remaining = []
    for item in pending:
        if not isinstance(item, dict) or now - int(item.get("created_at", 0)) > STATE_TTL_SECONDS:
            continue
        if matched_next is None and state and secrets.compare_digest(str(item.get("value", "")), state):
            matched_next = _safe_next(str(item.get("next", "/")))
        else:
            remaining.append(item)
    request.session["w3_pending_states"] = remaining[-MAX_PENDING_STATES:]
    return matched_next


def _callback_error(code: str) -> RedirectResponse:
    return RedirectResponse(url=f"{_site_url('/')}?{urlencode({'auth_error': code})}", status_code=303)


async def exchange_code_for_token(request: Request, code: str) -> dict:
    payload = {
        "client_id": settings.w3_client_id,
        "client_secret": settings.w3_client_secret.get_secret_value(),
        "redirect_uri": settings.w3_redirect_uri,
        "grant_type": "authorization_code",
        "code": code,
    }
    response = None
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=settings.w3_request_timeout_seconds,
            verify=settings.w3_verify_ssl,
        ) as client:
            response = await client.post(settings.w3_access_token_url, json=payload)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict) or not data.get("access_token"):
            raise ValueError("W3 token response did not include access_token.")
        log_integration_event(
            **_request_context(request), service="huawei_w3", operation="token_exchange",
            result="success", url=settings.w3_access_token_url, status=response.status_code,
            duration_ms=(time.perf_counter() - started) * 1000,
            message="W3 authorization code exchanged successfully; token content omitted.",
        )
        return data
    except (httpx.HTTPError, ValueError) as exc:
        log_integration_event(
            **_request_context(request), service="huawei_w3", operation="token_exchange",
            result="failed", url=settings.w3_access_token_url,
            status=response.status_code if response is not None else "-",
            duration_ms=(time.perf_counter() - started) * 1000,
            response=summarize_http_response(response), message="W3 token exchange failed.", exc=exc,
        )
        raise


async def fetch_w3_profile(request: Request, access_token: str) -> dict:
    payload = {
        "client_id": settings.w3_client_id,
        "access_token": access_token,
        "scope": settings.w3_scope,
    }
    response = None
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            timeout=settings.w3_request_timeout_seconds,
            verify=settings.w3_verify_ssl,
        ) as client:
            response = await client.post(settings.w3_userinfo_url, json=payload)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("W3 userinfo response was not an object.")
        log_integration_event(
            **_request_context(request), service="huawei_w3", operation="userinfo",
            result="success", url=settings.w3_userinfo_url, status=response.status_code,
            duration_ms=(time.perf_counter() - started) * 1000,
            message="W3 user profile obtained successfully; profile content omitted.",
        )
        return data
    except (httpx.HTTPError, ValueError) as exc:
        log_integration_event(
            **_request_context(request), service="huawei_w3", operation="userinfo",
            result="failed", url=settings.w3_userinfo_url,
            status=response.status_code if response is not None else "-",
            duration_ms=(time.perf_counter() - started) * 1000,
            response=summarize_http_response(response), message="W3 userinfo request failed.", exc=exc,
        )
        raise


def actor_from_profile(profile: dict) -> Actor:
    identity = next(
        (str(profile[key]).strip() for key in ("uid", "uuid", "globalUserID") if profile.get(key) and str(profile[key]).strip()),
        "",
    )
    if not identity:
        raise ValueError("W3 profile did not include uid, uuid, or globalUserID.")
    name = next(
        (
            str(profile[key]).strip()
            for key in ("displayName", "displayNameEn", "displayNameCn", "givenName", "email")
            if profile.get(key) and str(profile[key]).strip()
        ),
        identity,
    )
    # Keep the audit/display name unchanged; the header can prefer W3's English name.
    english_name = profile.get("displayNameEn")
    english_name = english_name.strip()[:200] if isinstance(english_name, str) else ""
    # Login establishes identity only; get_actor resolves permissions by employee
    # ID on each request, including /api/auth/status. Legacy default roles do not grant access.
    return Actor(id=identity.lower(), name=name, name_en=english_name or None,
                 role="member", avatar_url=avatar_from_profile(profile))


@router.get("/api/auth/status")
def auth_status(request: Request, response: Response, db: Session = Depends(get_db)):
    # The browser must see a changed deployment switch, even after a failed login.
    response.headers["Cache-Control"] = "no-store"
    if settings.auth_mode == "disabled":
        request.session.clear()
    try:
        actor = get_actor(request, db)
    except HTTPException as exc:
        if exc.status_code != 401:
            raise
        issues = _w3_configuration_issues()
        return {
            "authenticated": False, "mode": "w3", "actor": None,
            "login_url": _site_url("/api/auth/login"),
            "login_ready": not issues,
            # Setting names only: never expose client secrets or session keys.
            "configuration_issues": issues,
        }
    return {"authenticated": True, "mode": settings.auth_mode, "actor": actor.model_dump(exclude_none=True)}


@router.get("/api/auth/profile")
def auth_profile(response: Response, actor: Actor = Depends(get_actor)):
    response.headers["Cache-Control"] = "no-store"
    # Query only the authenticated account. No user-supplied search/id parameter is accepted.
    if settings.auth_mode == "w3":
        return owner_profile(actor)
    return actor.model_dump(exclude_none=True)


@router.get("/api/auth/login")
def w3_login(request: Request, next: str | None = None):
    if settings.auth_mode == "disabled":
        return RedirectResponse(url=_site_url(_safe_next(next)), status_code=303)
    try:
        _require_w3_configuration()
    except HTTPException as exc:
        log_request_error(request, exc.status_code, exc.detail["code"], exc.detail["message"])
        return _callback_error("w3_not_configured")
    # Start the flow on the callback's host, even if the user opened the server
    # IP. A host-only session cookie issued on an IP cannot validate a callback
    # received on the public domain. The target is configured, never user-supplied.
    if request.headers.get("host", "").lower() != urlparse(settings.site_url).netloc.lower():
        return RedirectResponse(
            url=f"{_site_url('/api/auth/login')}?{urlencode({'next': _safe_next(next)})}",
            status_code=303,
        )
    state = secrets.token_urlsafe(32)
    _remember_state(request, state, _safe_next(next))
    params = {
        "client_id": settings.w3_client_id,
        "response_type": "code",
        "scope": settings.w3_scope,
        "redirect_uri": settings.w3_redirect_uri,
        "state": state,
    }
    return RedirectResponse(url=f"{settings.w3_authorize_url}?{urlencode(params)}", status_code=302)


@router.get("/authorize")
async def w3_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    if settings.auth_mode != "w3":
        return RedirectResponse(url=_site_url("/"), status_code=303)
    try:
        _require_w3_configuration()
    except HTTPException as exc:
        log_request_error(request, exc.status_code, exc.detail["code"], exc.detail["message"])
        return _callback_error("w3_not_configured")
    next_path = _consume_state(request, state)
    if error:
        return _callback_error("w3_cancelled")
    if next_path is None:
        return _callback_error("invalid_state")
    if not code:
        return _callback_error("missing_code")
    try:
        token_payload = await exchange_code_for_token(request, code)
        profile = await fetch_w3_profile(request, str(token_payload["access_token"]))
        actor = actor_from_profile(profile)
    except (httpx.HTTPError, ValueError, KeyError):
        return _callback_error("w3_login_failed")

    # Keep only the local identity in the signed session cookie. W3 access and
    # refresh tokens are deliberately discarded after userinfo is obtained.
    request.session.clear()
    request.session["actor"] = actor.model_dump(exclude_none=True)
    request.state.actor_id = actor.id
    return RedirectResponse(url=_site_url(next_path), status_code=303)


@router.get("/api/auth/logout")
def w3_logout(request: Request):
    request.session.clear()
    # An explicit logout must not immediately start a new (possibly silent) SSO login.
    local_redirect = _site_url("/?signed_out=1" if settings.auth_mode == "w3" else "/")
    if settings.auth_mode != "w3" or not settings.w3_logout_url:
        return RedirectResponse(url=local_redirect, status_code=303)
    params = {"clientId": settings.w3_client_id, "redirect": local_redirect}
    return RedirectResponse(url=f"{settings.w3_logout_url}?{urlencode(params)}", status_code=303)
