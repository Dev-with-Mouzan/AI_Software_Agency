"""Authentication schemas."""

from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(v: str) -> str:
    email = (v or "").strip().lower()
    if not EMAIL_RE.fullmatch(email):
        raise ValueError("enter a valid email address")
    return email


def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("password must be at least 8 characters")
    if len(v) > 200:
        raise ValueError("password must be at most 200 characters")
    return v


class SignupIn(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    name: str = Field(default="", max_length=120)
    password: str
    # Required since verification became mandatory: returned by
    # POST /auth/verify-code and only redeemable for the same email.
    verification_token: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_email(v)

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        return _validate_password(v)


class SendCodeIn(BaseModel):
    email: str = Field(min_length=1, max_length=255)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_email(v)


class SendCodeOut(BaseModel):
    sent: bool
    # Only present when SMTP is not configured and the backend is not
    # production — lets the dev UI / tests proceed with the known code.
    dev_code: str | None = None
    resend_after: int = 60


class VerifyCodeIn(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=16)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_email(v)


class VerifyCodeOut(BaseModel):
    verified: bool
    verification_token: str


class UpdateMeIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    # Base64 data URL (PNG/JPEG/WebP/GIF, <= 2 MB). `null` removes the avatar.
    avatar: str | None = None


class LoginIn(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _validate_email(v)


class GoogleIn(BaseModel):
    id_token: str = Field(min_length=1)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=1)


class UserOut(BaseModel):
    id: UUID
    email: str
    name: str
    provider: str = "email"  # email | google
    email_verified: bool = False
    avatar_url: str = ""
    created_at: datetime


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut
