"""Password hashing and JWT primitives (stdlib only).

- Passwords are hashed with PBKDF2-HMAC-SHA256 (per-password random salt).
- Access tokens are HS256 JWTs signed with the configured JWT secret.
- Refresh tokens are opaque random strings; only their SHA-256 hash is
  persisted so a leaked database cannot be replayed directly.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from agency.config import get_settings

_PBKDF2_ITERATIONS = 390_000
_SALT_BYTES = 16
_DK_BYTES = 32

_ALG = "HS256"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded)


# --- passwords ---------------------------------------------------------


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS, dklen=_DK_BYTES
    )
    return (
        f"pbkdf2${_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt_hex, hash_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, int(iterations), dklen=len(expected)
        )
        return hmac.compare_digest(dk, expected)
    except (ValueError, TypeError):
        return False


# --- JWT (HS256) -------------------------------------------------------


def _sign(header: str, payload: str) -> str:
    secret = get_settings().jwt_secret.encode("utf-8")
    message = f"{header}.{payload}".encode("ascii")
    return hmac.new(secret, message, hashlib.sha256).digest()


def create_access_token(subject: str, *, ttl_seconds: int | None = None) -> str:
    """Create an HS256 JWT access token for `subject` (a user id)."""
    settings = get_settings()
    ttl = ttl_seconds or settings.jwt_access_ttl
    now = int(time.time())
    header = _b64url(json.dumps({"alg": _ALG, "typ": "JWT"}).encode("utf-8"))
    payload = _b64url(
        json.dumps(
            {"sub": subject, "type": "access", "iat": now, "exp": now + ttl},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    return f"{header}.{payload}.{_b64url(_sign(header, payload))}"


def create_email_verify_token(email: str) -> str:
    """Short-lived JWT proving the holder verified an email address."""
    settings = get_settings()
    ttl = settings.verification_code_ttl_minutes * 60
    now = int(time.time())
    header = _b64url(json.dumps({"alg": _ALG, "typ": "JWT"}).encode("utf-8"))
    payload = _b64url(
        json.dumps(
            {"sub": email, "type": "email_verify", "iat": now, "exp": now + ttl},
            separators=(",", ":"),
        ).encode("utf-8")
    )
    return f"{header}.{payload}.{_b64url(_sign(header, payload))}"


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify a JWT's signature + expiry and return its payload.

    Raises ValueError for any invalid/malformed/expired token.
    """
    return _decode_jwt(token, expected_type="access")


def decode_email_verify_token(token: str) -> str:
    """Verify an email-verification JWT and return the verified email.

    Raises ValueError for any invalid/malformed/expired token.
    """
    payload = _decode_jwt(token, expected_type="email_verify")
    return payload.get("sub", "")


def _decode_jwt(token: str, *, expected_type: str) -> dict[str, Any]:
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        header = json.loads(_b64url_decode(header_b64))
        if header.get("alg") != _ALG:
            raise ValueError("unexpected algorithm")
        expected = _b64url(_sign(header_b64, payload_b64))
        if not hmac.compare_digest(expected, sig_b64):
            raise ValueError("bad signature")
        payload = json.loads(_b64url_decode(payload_b64))
        if payload.get("type") != expected_type:
            raise ValueError("wrong token type")
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("token expired")
        return payload
    except (ValueError, json.JSONDecodeError, KeyError) as exc:
        raise ValueError("invalid token") from exc


# --- refresh tokens ----------------------------------------------------


def new_refresh_token() -> tuple[str, str]:
    """Return (opaque_token, sha256_hex_hash). Only the hash is stored."""
    token = secrets.token_urlsafe(48)
    return token, _sha256(token)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_refresh_token(token: str) -> str:
    return _sha256(token)
