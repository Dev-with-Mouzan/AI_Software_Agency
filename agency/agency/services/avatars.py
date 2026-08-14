"""Avatar storage — profile photos are written under the working area and
served back through the public GET /auth/avatar/{user_id} endpoint."""

from __future__ import annotations

import base64
import binascii
import re
import uuid
from pathlib import Path

from agency.config import get_settings

_ALLOWED = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
_MAX_BYTES = 2 * 1024 * 1024  # 2 MB

_DATA_URL_RE = re.compile(r"^data:(?P<mime>[^;,]+);base64,(?P<data>.+)$", re.DOTALL)


class AvatarError(ValueError):
    """Invalid avatar payload (bad type, oversize, malformed data URL)."""


def _avatars_dir() -> Path:
    directory = get_settings().working_area / "avatars"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def save_avatar(user_id: uuid.UUID, data_url: str) -> str:
    """Decode a base64 data-URL avatar and write it to disk.

    Returns the public path served by GET /auth/avatar/{id}.
    """
    match = _DATA_URL_RE.match(data_url or "")
    if not match:
        raise AvatarError("avatar must be a valid base64 data URL")
    mime = match.group("mime").lower()
    if mime not in _ALLOWED:
        raise AvatarError("avatar must be a PNG, JPEG, WebP or GIF image")

    try:
        raw = base64.b64decode(match.group("data"), validate=True)
    except (binascii.Error, ValueError):
        raise AvatarError("avatar contains invalid base64 data") from None
    if len(raw) > _MAX_BYTES:
        raise AvatarError("avatar image must be 2 MB or smaller")
    if not raw:
        raise AvatarError("avatar image is empty")

    delete_avatar(user_id)  # remove any previous file / extension
    path = _avatars_dir() / f"{user_id}{_ALLOWED[mime]}"
    path.write_bytes(raw)
    return f"/auth/avatar/{user_id}"


def find_avatar_file(user_id: uuid.UUID) -> Path | None:
    """Locate the stored avatar for a user regardless of extension."""
    directory = _avatars_dir()
    for path in directory.glob(f"{user_id}.*"):
        if path.is_file():
            return path
    return None


def delete_avatar(user_id: uuid.UUID) -> None:
    path = find_avatar_file(user_id)
    if path is not None:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
