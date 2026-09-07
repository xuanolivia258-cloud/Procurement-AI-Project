"""Small, non-sensitive presentation fields from the identity provider."""
from urllib.parse import parse_qsl, urlsplit


def safe_avatar_url(value: object) -> str | None:
    # Signed session cookies are small: never keep inline photos or token-bearing
    # URLs in them. Images are loaded by the browser, not fetched by the backend.
    if not isinstance(value, str):
        return None
    value = value.strip()
    try:
        size = len(value.encode("utf-8"))
    except UnicodeEncodeError:
        return None
    if not value or size > 512:
        return None
    if "\\" in value or any(char.isspace() or ord(char) < 33 or ord(char) == 127 for char in value):
        return None
    try:
        url = urlsplit(value)
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.fragment:
            return None
        if url.port not in (None, 443):
            return None
        sensitive = {"token", "access_token", "refresh_token", "id_token", "client_secret", "secret", "authorization", "code"}
        if any(key.lower() in sensitive for key, _ in parse_qsl(url.query)):
            return None
    except ValueError:
        return None
    return value


def avatar_from_profile(profile: dict) -> str | None:
    # These fields are optional. base.profile may not include a photograph.
    for key in ("avatar_url", "avatarUrl", "picture", "photoUrl", "photo_url"):
        if avatar := safe_avatar_url(profile.get(key)):
            return avatar
    return None
