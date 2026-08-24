from fastapi import HTTPException, Request, status

from .config import settings
from .schemas import Actor


def get_actor(request: Request) -> Actor:
    if settings.auth_mode != "disabled":
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={"code": "AUTH_PROVIDER_NOT_CONFIGURED", "message": "External authentication is not configured."},
        )
    actor = Actor(id=settings.local_actor_id, name=settings.local_actor_name, role="admin")
    request.state.actor_id = actor.id
    return actor
