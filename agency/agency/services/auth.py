"""Authentication service: user lookup, sign-up, token issuance/rotation."""

from __future__ import annotations

import hmac
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agency.config import get_settings
from agency.db.models import EmailVerificationCode, RefreshToken, User
from agency.schemas.auth import TokenPair, UserOut
from agency.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)

_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"

# Sentinel distinguishing "not provided" from an explicit None/null.
_UNSET = object()


def hmac_matches(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


class AuthError(Exception):
    """Raised for authentication failures (mapped to 401/409 in the route)."""


class UserService:
    @staticmethod
    async def get_by_email(session: AsyncSession, email: str) -> User | None:
        return await session.scalar(select(User).where(User.email == email.lower().strip()))

    @staticmethod
    async def get_by_id(session: AsyncSession, user_id: UUID) -> User | None:
        return await session.get(User, user_id)

    @staticmethod
    async def create_user(
        session: AsyncSession,
        *,
        email: str,
        name: str = "",
        password_hash: str = "",
        google_id: str | None = None,
        email_verified: bool = False,
    ) -> User:
        user = User(
            email=email.lower().strip(),
            name=(name or "").strip()[:120],
            password_hash=password_hash,
            google_id=google_id,
            email_verified=email_verified,
        )
        session.add(user)
        await session.flush()
        return user

    # --- Email verification -------------------------------------------------

    @staticmethod
    def _code_hash(code: str) -> str:
        return sha256(code.encode("utf-8")).hexdigest()

    @staticmethod
    async def issue_email_code(session: AsyncSession, email: str) -> tuple[str, int]:
        """Create a fresh code for `email`. Returns (code, resend_after_seconds).

        Enforces a minimum delay between codes and replaces any previous
        unused code for the same address.
        """
        settings = get_settings()
        email = email.lower().strip()
        latest = await session.scalar(
            select(EmailVerificationCode)
            .where(EmailVerificationCode.email == email)
            .order_by(EmailVerificationCode.created_at.desc())
            .limit(1)
        )
        if latest is not None and not latest.used:
            elapsed = datetime.now(UTC) - latest.created_at.replace(tzinfo=UTC)
            wait = settings.verification_resend_seconds - int(elapsed.total_seconds())
            if wait > 0:
                raise AuthError(f"please wait {wait}s before requesting another code")

        # A fresh code supersedes all older ones for this address.
        old = await session.scalars(
            select(EmailVerificationCode).where(
                EmailVerificationCode.email == email,
                EmailVerificationCode.used.is_(False),
            )
        )
        for record in old:
            record.used = True

        from agency.services.email import generate_code

        code = generate_code()
        session.add(
            EmailVerificationCode(
                email=email,
                code_hash=UserService._code_hash(code),
                expires_at=datetime.now(UTC)
                + timedelta(minutes=settings.verification_code_ttl_minutes),
            )
        )
        await session.flush()
        return code, settings.verification_resend_seconds

    @staticmethod
    async def consume_email_code(session: AsyncSession, email: str, code: str) -> None:
        """Validate `code` for `email`, marking it used on success.

        Raises AuthError on wrong/expired/locked codes.
        """
        settings = get_settings()
        email = email.lower().strip()
        record = await session.scalar(
            select(EmailVerificationCode)
            .where(EmailVerificationCode.email == email, EmailVerificationCode.used.is_(False))
            .order_by(EmailVerificationCode.created_at.desc())
            .limit(1)
        )
        if record is None:
            raise AuthError("no verification code was requested for this email")

        if record.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
            raise AuthError("verification code has expired — request a new one")
        if record.attempts >= settings.verification_max_attempts:
            raise AuthError("too many attempts — request a new code")

        if not hmac_matches(record.code_hash, UserService._code_hash(code)):
            record.attempts += 1
            await session.flush()
            raise AuthError("incorrect verification code")
        record.used = True
        await session.flush()

    # --- Profile ------------------------------------------------------------

    @staticmethod
    async def update_profile(session: AsyncSession, user: User, *, name: str | None = None,
                             avatar: str | None = _UNSET) -> User:
        """Apply a profile edit. `avatar=None` removes the avatar, a data URL
        replaces it, and leaving it unset keeps the current one."""
        if name is not None:
            user.name = (name or "").strip()[:120]

        if avatar is not _UNSET:
            from agency.services.avatars import AvatarError, delete_avatar, save_avatar

            if avatar is None:
                delete_avatar(user.id)
                user.avatar_url = ""
            elif avatar:
                try:
                    user.avatar_url = save_avatar(user.id, avatar)
                except AvatarError as exc:
                    raise AuthError(str(exc)) from exc
        await session.flush()
        return user

    @staticmethod
    async def authenticate(session: AsyncSession, email: str, password: str) -> User:
        user = await UserService.get_by_email(session, email)
        if user is None or not user.password_hash or not verify_password(password, user.password_hash):
            raise AuthError("invalid email or password")
        return user

    @staticmethod
    async def google_verify(session: AsyncSession, id_token: str) -> User:
        """Verify a Google ID token via Google's tokeninfo endpoint and
        find-or-create the matching user. Signature verification is delegated
        to Google over HTTPS (the same endpoint Google documents for this)."""
        settings = get_settings()
        if not settings.google_client_id:
            raise AuthError("Google login is not configured on this server")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(_GOOGLE_TOKENINFO_URL, params={"id_token": id_token})
        except httpx.HTTPError as exc:
            raise AuthError("could not verify Google session — try again") from exc
        if resp.status_code != 200:
            raise AuthError("invalid Google session")
        info = resp.json()
        aud = info.get("aud")
        if aud != settings.google_client_id:
            raise AuthError("Google token was issued for a different application")
        email = str(info.get("email") or "").lower().strip()
        if not email or str(info.get("email_verified", "false")).lower() != "true":
            raise AuthError("Google account has no verified email")
        google_id = str(info.get("sub") or "")
        user = await session.scalar(select(User).where(User.google_id == google_id))
        if user is None:
            user = await UserService.get_by_email(session, email)
            if user is None:
                user = await UserService.create_user(
                    session,
                    email=email,
                    name=str(info.get("name") or email),
                    google_id=google_id,
                    email_verified=True,  # Google has already verified the address
                )
            else:
                user.google_id = google_id
        return user

    @staticmethod
    async def _issue_refresh(session: AsyncSession, user: User) -> str:
        token, token_hash = new_refresh_token()
        ttl_days = get_settings().jwt_refresh_ttl_days
        session.add(
            RefreshToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(UTC) + timedelta(days=ttl_days),
            )
        )
        await session.flush()
        return token

    @staticmethod
    async def issue_tokens(session: AsyncSession, user: User) -> TokenPair:
        user.last_login_at = datetime.now(UTC)
        refresh_token = await UserService._issue_refresh(session, user)
        await session.flush()
        return TokenPair(
            access_token=create_access_token(str(user.id)),
            refresh_token=refresh_token,
            user=UserService.user_out(user),
        )

    @staticmethod
    async def refresh(session: AsyncSession, refresh_token: str) -> TokenPair:
        token_hash = hash_refresh_token(refresh_token)
        record = await session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        if (
            record is None
            or record.revoked
            or record.expires_at.replace(tzinfo=UTC) < datetime.now(UTC)
        ):
            raise AuthError("invalid or expired refresh token")
        user = await session.get(User, record.user_id)
        if user is None:
            raise AuthError("account no longer exists")
        # Rotate: revoke the used token, issue a fresh pair.
        record.revoked = True
        await session.flush()
        return await UserService.issue_tokens(session, user)

    @staticmethod
    async def revoke(session: AsyncSession, refresh_token: str) -> None:
        record = await session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
        )
        if record is not None:
            record.revoked = True
            await session.flush()

    @staticmethod
    def user_out(user: User) -> UserOut:
        return UserOut(
            id=user.id,
            email=user.email,
            name=user.name or "",
            provider="google" if user.google_id else "email",
            email_verified=user.email_verified,
            avatar_url=user.avatar_url or "",
            created_at=user.created_at,
        )


user_service = UserService()
