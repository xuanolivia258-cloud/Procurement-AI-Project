from fastapi import HTTPException, Request, status

from .config import settings
from .schemas import Actor


def get_actor(request: Request) -> Actor:
    if settings.auth_mode == "disabled":
        actor = Actor(id=settings.local_actor_id, name=settings.local_actor_name, role="admin")
        request.state.actor_id = actor.id
        return actor

    if settings.auth_mode != "w3":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "AUTH_MODE_INVALID", "message": "Authentication mode is invalid."},
        )

    raw_actor = request.session.get("actor")
    try:
        actor = Actor.model_validate(raw_actor)
    except Exception as exc:
        request.session.pop("actor", None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "AUTHENTICATION_REQUIRED",
                "message": "Your W3 session is missing or has expired.",
                "login_url": "/api/auth/login",
            },
        ) from exc

    request.state.actor_id = actor.id
    return actor
