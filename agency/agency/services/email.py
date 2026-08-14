"""Email delivery for verification codes (stdlib `smtplib` only).

SMTP credentials come from the environment (`SMTP_HOST`, `SMTP_USERNAME`, ...).
Until SMTP is configured the code is logged and, outside production, returned
to the caller so the sign-up flow stays testable.
"""

from __future__ import annotations

import logging
import secrets
import smtplib
from email.message import EmailMessage

from agency.config import get_settings

logger = logging.getLogger(__name__)

# Well-known disposable / throwaway / temporary-mail domains. Verifying the
# address with a real email is the primary anti-fake gate; this blocklist is a
# cheap first line of defence so obviously fake addresses never get a code.
DISPOSABLE_DOMAINS = {
    "10minutemail.com",
    "1secmail.com",
    "33mail.com",
    "anonymmail.net",
    "discard.email",
    "dispostable.com",
    "emailondeck.com",
    "fakemailgenerator.com",
    "fakemail.net",
    "getnada.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "inboxkitten.com",
    "maildrop.cc",
    "mailinator.com",
    "mailnesia.com",
    "mintemail.com",
    "moakt.com",
    "mohmal.com",
    "nada.email",
    "nowmymail.com",
    "sharklasers.com",
    "spamgourmet.com",
    "tempmail.com",
    "tempr.email",
    "throwawaymail.com",
    "trashmail.com",
    "yopmail.com",
}


class EmailNotConfiguredError(RuntimeError):
    """SMTP is not configured, so no real email can be delivered."""


def is_disposable_email(email: str) -> bool:
    """True when the address uses a known disposable/temporary-mail domain."""
    domain = email.rsplit("@", 1)[-1].strip().lower()
    if domain in DISPOSABLE_DOMAINS:
        return True
    return any(domain.endswith(f".{d}") for d in DISPOSABLE_DOMAINS)


def generate_code() -> str:
    """Return a fresh 6-digit numeric verification code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _smtp_configured(settings) -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def send_email(to: str, subject: str, html: str) -> None:
    """Send an HTML email over SMTP. Raises EmailNotConfiguredError if unset."""
    settings = get_settings()
    if not _smtp_configured(settings):
        raise EmailNotConfiguredError(
            "SMTP is not configured — add SMTP_HOST/SMTP_FROM to the .env to send emails."
        )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = (
        f"{settings.smtp_from_name} <{settings.smtp_from}>"
        if settings.smtp_from_name
        else settings.smtp_from
    )
    message["To"] = to
    message.set_content("This email requires an HTML-capable client.")
    message.add_alternative(html, subtype="html")

    # Port 465 is implicit TLS (SMTP_SSL); everything else uses plain SMTP with
    # optional STARTTLS (e.g. 587).
    if settings.smtp_port == 465:
        with smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=20
        ) as server:
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            if settings.smtp_tls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)


def send_verification_code(to: str, code: str) -> None:
    """Deliver a verification code, returning normally even if SMTP is unset
    (the code is logged; in development it is also returned to the caller).

    Raises only when the backend claims production but SMTP is missing, so a
    broken prod deployment fails loudly instead of silently accepting sign-ups.
    """
    subject = "Your DevPilot AI verification code"
    html = f"""\
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0d14;color:#f2f6fa;border-radius:12px">
  <p style="margin:0 0 16px;font-size:14px;color:#9aa6bb">DevPilot AI</p>
  <h1 style="margin:0 0 8px;font-size:18px">Your verification code</h1>
  <p style="margin:0 0 20px;font-size:14px;color:#9aa6bb">Use the code below to finish creating your account. It expires in {get_settings().verification_code_ttl_minutes} minutes.</p>
  <p style="margin:0;font-size:28px;letter-spacing:8px;font-weight:700;color:#2fe6ce">{code}</p>
  <p style="margin:24px 0 0;font-size:12px;color:#6e7b93">If you did not request this, you can safely ignore this email.</p>
</div>"""

    try:
        send_email(to, subject, html)
        logger.info("verification code sent to %s", to)
    except EmailNotConfiguredError:
        settings = get_settings()
        if settings.environment == "production":
            raise
        logger.warning(
            "SMTP not configured — verification code for %s (dev only): %s", to, code
        )
    except smtplib.SMTPException as exc:
        logger.error("failed to send verification email to %s: %s", to, exc)
        if get_settings().environment == "production":
            raise
