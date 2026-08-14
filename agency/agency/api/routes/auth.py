"""Authentication endpoints: verification, sign-up, login, Google, refresh,
logout, me, profile, avatar."""

from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError

from agency.api.deps import CurrentUser, DbSession
from agency.config import get_settings
from agency.schemas.auth import (
    GoogleIn,
    LoginIn,
    RefreshIn,
    SendCodeIn,
    SendCodeOut,
    SignupIn,
    TokenPair,
    UpdateMeIn,
    UserOut,
    VerifyCodeIn,
    VerifyCodeOut,
)
from agency.security import (
    create_email_verify_token,
    decode_email_verify_token,
    hash_password,
)
from agency.services.auth import AuthError, user_service
from agency.services.email import EmailNotConfiguredError, is_disposable_email

router = APIRouter(prefix="/auth", tags=["auth"])


def _public_avatar_response(user_id: UUID) -> FileResponse:
    from agency.services.avatars import find_avatar_file

    path = find_avatar_file(user_id)
    if path is None:
        raise HTTPException(404, "no avatar for this user")
    media = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}
    media_type = media.get(path.suffix.lstrip(".").lower()) or "application/octet-stream"
    return FileResponse(path, media_type=media_type)


@router.post("/send-code", response_model=SendCodeOut)
async def send_code(payload: SendCodeIn, session: DbSession) -> SendCodeOut:
    """Send a verification code to an email address.

    Fake/temporary-mail addresses are rejected outright; the code itself must
    be received before an account can be created.
    """
    if is_disposable_email(payload.email):
        raise HTTPException(422, "this email provider is not allowed")
    if await user_service.get_by_email(session, payload.email) is not None:
        raise HTTPException(409, "an account with this email already exists")

    try:
        code, resend_after = await user_service.issue_email_code(session, payload.email)
    except AuthError as exc:
        raise HTTPException(429, str(exc)) from exc

    dev_code: str | None = None
    settings = get_settings()
    if settings.environment == "production" or settings.smtp_host:
        # Production always sends (failing loudly if SMTP is missing); in dev
        # with SMTP configured, delivery is best-effort.
        from agency.services.email import send_verification_code

        try:
            await asyncio.to_thread(send_verification_code, payload.email, code)
        except EmailNotConfiguredError:
            raise HTTPException(503, "email delivery is not configured on this server") from None
    else:
        # Dev/test without SMTP: expose the code so the UI/tests can proceed.
        dev_code = code
    await session.commit()
    return SendCodeOut(sent=True, dev_code=dev_code, resend_after=resend_after)


@router.post("/verify-code", response_model=VerifyCodeOut)
async def verify_code(payload: VerifyCodeIn, session: DbSession) -> VerifyCodeOut:
    """Check a code and return a short-lived token the sign-up endpoint accepts."""
    try:
        await user_service.consume_email_code(session, payload.email, payload.code)
    except AuthError as exc:
        raise HTTPException(422, str(exc)) from exc
    await session.commit()
    return VerifyCodeOut(
        verified=True, verification_token=create_email_verify_token(payload.email.lower())
    )


@router.post("/signup", response_model=TokenPair, status_code=201)
async def signup(payload: SignupIn, session: DbSession) -> TokenPair:
    # Mandatory verification: the code must have been checked for this email
    # (browser) and this email (payload) before an account is created.
    try:
        verified_email = decode_email_verify_token(payload.verification_token)
    except ValueError:
        raise HTTPException(422, "email verification is required — verify your email first") from None
    if verified_email != payload.email:
        raise HTTPException(422, "verification does not match this email")

    existing = await user_service.get_by_email(session, payload.email)
    if existing is not None:
        raise HTTPException(409, "an account with this email already exists")
    user = await user_service.create_user(
        session,
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        email_verified=True,
    )
    try:
        await session.flush()
        tokens = await user_service.issue_tokens(session, user)
    except IntegrityError:
        raise HTTPException(409, "an account with this email already exists") from None
    await session.commit()
    return tokens


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginIn, session: DbSession) -> TokenPair:
    try:
        user = await user_service.authenticate(session, payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(401, str(exc)) from exc
    tokens = await user_service.issue_tokens(session, user)
    await session.commit()
    return tokens


@router.post("/google", response_model=TokenPair)
async def google_login(payload: GoogleIn, session: DbSession) -> TokenPair:
    try:
        user = await user_service.google_verify(session, payload.id_token)
    except AuthError as exc:
        raise HTTPException(401, str(exc)) from exc
    tokens = await user_service.issue_tokens(session, user)
    try:
        await session.commit()
    except IntegrityError:
        raise HTTPException(409, "an account with this email already exists") from None
    return tokens


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshIn, session: DbSession) -> TokenPair:
    try:
        tokens = await user_service.refresh(session, payload.refresh_token)
    except AuthError as exc:
        raise HTTPException(401, str(exc)) from exc
    await session.commit()
    return tokens


@router.post("/logout", status_code=204)
async def logout(payload: RefreshIn, session: DbSession) -> None:
    await user_service.revoke(session, payload.refresh_token)
    await session.commit()


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return user_service.user_out(user)


@router.patch("/me", response_model=UserOut)
async def update_me(payload: UpdateMeIn, session: DbSession, user: CurrentUser) -> UserOut:
    """Update the signed-in user's name and/or avatar.

    Only fields the client actually sent are applied, so a name-only edit never
    touches the avatar and vice-versa. `avatar: null` explicitly removes it.
    """
    kwargs: dict = {}
    if "name" in payload.model_fields_set:
        kwargs["name"] = payload.name
    if "avatar" in payload.model_fields_set:
        kwargs["avatar"] = payload.avatar
    try:
        updated = await user_service.update_profile(session, user, **kwargs)
    except AuthError as exc:
        raise HTTPException(422, str(exc)) from exc
    await session.commit()
    return user_service.user_out(updated)


@router.get("/avatar/{user_id}")
async def avatar(user_id: UUID) -> FileResponse:
    """Public endpoint so `<img src=...>` can render avatars without a token."""
    return _public_avatar_response(user_id)
