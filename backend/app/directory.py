"""Display-only Owner lookup configuration, matching CARI DSTE's MRVP module."""
import re

from .config import settings
from .schemas import Actor


DIRECTORY_ENDPOINTS = {
    "https://wework-digitalspace-g.rnd.huawei.com/gw/etipublicconfig/etipublicconfig/v1/w3",
    "https://wework-digitalspace.hissit.huawei.com/gw/etipublicconfig/etipublicconfig/publicservices/public/api/v1/w3",
}


def yellowpage_avatar(account: str) -> str | None:
    # DSTE getUserID removes the W3 account's letter prefix. Preserve leading zeros.
    # Aliases and GUIDs are not employee numbers and must not become another person's photo.
    match = re.fullmatch(r"[a-zA-Z]?([0-9]{5,12})", account)
    if match:
        return f"https://w3.huawei.com/w3lab/rest/yellowpage/face/{match[1]}/45"
    return None


def owner_profile(actor: Actor) -> dict:
    profile = actor.model_dump(exclude_none=True)
    account = actor.id.strip().lower()
    if not settings.w3_directory_enabled or not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,63}", account):
        return profile
    if avatar := yellowpage_avatar(account):
        profile["avatar_url"] = avatar
    url = settings.w3_directory_url.strip()
    if url in DIRECTORY_ENDPOINTS:
        # The directory requires browser SSO cookies (as MRVP's withCredentials does).
        # Never forward procurement cookies or W3 access tokens to this other service.
        profile["directory_lookup"] = {
            "url": url, "account": account,
            "timeout_ms": round(settings.w3_directory_timeout_seconds * 1000),
        }
    return profile
