"""Outbound email — Resend (HTTPS) primary, SMTP fallback.

Three call sites today:
  · Brand invite           → send_brand_invite_email(...)
  · Consumer OTP           → send_otp_email(...)
  · Brand password reset   → send_password_reset_email(...)

Transport selection (highest priority first):

  1. Resend  — when `RESEND_API_KEY` is set. HTTPS to api.resend.com:443.
               This is the prod path on the DigitalOcean droplet because
               DO blocks outbound SMTP on ports 465 + 587; HTTPS isn't
               affected. Get a key at resend.com → Settings → API Keys.

  2. SMTP    — when `SMTP_PASSWORD` is set and Resend isn't. Useful for
               local dev when you have a Google Workspace App Password
               and want to round-trip real email without signing up for
               Resend. Will fail with [Errno 101] on cloud hosts that
               block outbound SMTP — that's expected.

  3. Stub    — when neither is set. Logs the body to stdout so the
               operator can hand-deliver the link / OTP. Same behavior
               as the original SMTP-less stub from Phase 4.

Failure mode: any transport exception is logged and falls through to the
stub so the surrounding business logic (invite handler, OTP request,
password-reset) keeps returning 200. The setup_url is still in the
response body and the operator can paste it manually if SMTP/HTTPS both
break at runtime.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Final

from app.database import settings

logger = logging.getLogger(__name__)


def _resend_configured() -> bool:
    return bool(settings.resend_api_key)


def _smtp_configured() -> bool:
    return bool(settings.smtp_password)


def _stub(to_email: str, subject: str, text_body: str) -> None:
    # Single, grep-friendly format. Read out of the API container with:
    #   docker compose logs api | grep "EMAIL STUB"
    logger.info(
        "EMAIL STUB to=%s subject=%s\n--- BODY ---\n%s\n------------",
        to_email,
        subject,
        text_body,
    )
    print(
        f"\n=== EMAIL STUB ===\n"
        f"  to:      {to_email}\n"
        f"  subject: {subject}\n"
        f"  body:\n{text_body}\n"
        f"==================\n",
        flush=True,
    )


def _send_via_resend(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str,
) -> bool:
    """Resend REST API via the official Python SDK. Imported lazily so the
    SDK only loads when the env actually configures it — keeps the
    container's import-time surface clean for local dev."""
    try:
        import resend  # noqa: PLC0415 — local import is intentional
    except ImportError:
        logger.error(
            "EMAIL FAILED via Resend — `resend` SDK not installed. "
            "Add `resend` to requirements.txt and rebuild the api image."
        )
        _stub(to_email, subject, text_body)
        return False

    resend.api_key = settings.resend_api_key

    params: dict = {
        "from": settings.smtp_from,  # reuse the friendly From header
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }

    try:
        result = resend.Emails.send(params)
        message_id = result.get("id") if isinstance(result, dict) else None
        logger.info(
            "EMAIL SENT via Resend to=%s subject=%s id=%s",
            to_email,
            subject,
            message_id or "(unknown)",
        )
        return True
    except Exception as exc:  # noqa: BLE001 — transport-layer catch-all is intended
        logger.warning(
            "EMAIL FAILED via Resend to=%s subject=%s err=%s — falling back to stdout stub",
            to_email,
            subject,
            exc,
        )
        _stub(to_email, subject, text_body)
        return False


def _send_via_smtp(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str,
) -> bool:
    """Stdlib smtplib path — used in local dev or whenever Resend isn't
    configured. Will hit [Errno 101] Network is unreachable on cloud
    hosts that block outbound SMTP (e.g. DigitalOcean default policy)."""

    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        if settings.smtp_use_ssl:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, context=ctx, timeout=20
            ) as server:
                server.login(settings.smtp_username, settings.smtp_password or "")
                server.send_message(msg)
        else:
            with smtplib.SMTP(
                settings.smtp_host, settings.smtp_port, timeout=20
            ) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(settings.smtp_username, settings.smtp_password or "")
                server.send_message(msg)
        logger.info("EMAIL SENT via SMTP to=%s subject=%s", to_email, subject)
        return True
    except Exception as exc:  # noqa: BLE001 — transport-layer catch-all is intended
        logger.warning(
            "EMAIL FAILED via SMTP to=%s subject=%s err=%s — falling back to stdout stub",
            to_email,
            subject,
            exc,
        )
        _stub(to_email, subject, text_body)
        return False


def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str | None = None,
) -> bool:
    """Send a multipart email. Returns True on success, False on any error
    (including stub fallback). Errors are logged, never raised, so the
    caller's surrounding business logic stays unblocked by transport
    issues — invitations are still resolvable via the API response's
    `setup_url` and the operator can hand-deliver if needed.

    Picks the first configured transport: Resend → SMTP → stub.
    """

    text = text_body or _strip_html(html_body)

    if _resend_configured():
        return _send_via_resend(to_email, subject, html_body, text)

    if _smtp_configured():
        return _send_via_smtp(to_email, subject, html_body, text)

    _stub(to_email, subject, text)
    return False


def _strip_html(html: str) -> str:
    """Tiny tag stripper so the multipart text/plain alternative is at least
    legible without pulling in an HTML parser. Good enough for our
    transactional copy (no nested markup, no entities beyond &amp;)."""
    import re

    text = re.sub(r"<\s*br\s*/?\s*>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</\s*p\s*>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&amp;", "&").replace("&nbsp;", " ")
    return text.strip()


# ─────────────────────────────────────────────────────────────────────
# Pre-baked transactional templates. Keeping these adjacent to the
# transport so the brand voice doesn't drift across the call sites.
# ─────────────────────────────────────────────────────────────────────

ESPRESSO: Final = "#1A1412"
MINT: Final = "#00E576"
TEXT_LIGHT: Final = "#F5F1EA"
MUTED: Final = "#8A847C"


def _wrap(title: str, body_html: str) -> str:
    """Common HTML chrome for transactional emails — Espresso/Mint brand
    palette, Google-Workspace-safe inline styles (Gmail strips most
    <style> blocks, so everything below is inline). Single-column,
    max-width 560px so it renders cleanly in mobile mail clients."""
    return f"""\
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>{title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:{ESPRESSO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:{TEXT_LIGHT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{ESPRESSO};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#211915;border:1px solid #2c211c;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-right:12px;">
                      <div style="width:36px;height:36px;border-radius:8px;background:{MINT};color:{ESPRESSO};font-weight:700;font-size:18px;line-height:36px;text-align:center;">L</div>
                    </td>
                    <td>
                      <div style="font-size:16px;font-weight:600;letter-spacing:-0.01em;color:{TEXT_LIGHT};">Local Coffee Perks</div>
                      <div style="font-size:11px;color:{MUTED};margin-top:2px;">For the regulars.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 36px 32px;">
                {body_html}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 28px 32px;border-top:1px solid #2c211c;">
                <div style="font-size:11px;color:{MUTED};line-height:1.6;">
                  You're receiving this because someone added your email to a Local Coffee Perks invite.
                  If this wasn't you, simply ignore the message — no account is created until you click the link.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def send_brand_invite_email(
    to_email: str,
    brand_name: str,
    setup_url: str,
) -> bool:
    """Welcome + setup CTA for a brand owner the super-admin just invited.

    The link is a 48h JWT (`tokens.encode_brand_invite`) and lands on the
    b2b-dashboard's /setup wizard — password → first cafe → Stripe.
    """
    subject = f"Welcome to Local Coffee Perks — finish setting up {brand_name}"
    body_html = f"""\
<h1 style="font-size:22px;font-weight:600;line-height:1.3;margin:0 0 12px 0;color:{TEXT_LIGHT};letter-spacing:-0.01em;">
  Welcome — let's get {brand_name} live.
</h1>
<p style="font-size:14px;line-height:1.6;margin:0 0 18px 0;color:{TEXT_LIGHT};opacity:0.9;">
  We've reserved your dashboard. Click the button below to set your password,
  add your first café, and start collecting stamps for your regulars. The link
  is valid for 48 hours.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px 0;">
  <tr>
    <td style="border-radius:10px;background:{MINT};">
      <a href="{setup_url}" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:600;color:{ESPRESSO};text-decoration:none;letter-spacing:-0.005em;">
        Set up your account →
      </a>
    </td>
  </tr>
</table>
<p style="font-size:12.5px;line-height:1.6;margin:0 0 6px 0;color:{MUTED};">
  Or paste this link into your browser:
</p>
<p style="font-size:12px;line-height:1.5;margin:0 0 18px 0;color:{TEXT_LIGHT};word-break:break-all;">
  <a href="{setup_url}" style="color:{MINT};text-decoration:none;">{setup_url}</a>
</p>
<p style="font-size:12.5px;line-height:1.6;margin:18px 0 0 0;color:{MUTED};">
  Questions? Reply to this email and we'll get back to you within a working day.
</p>
"""
    return send_email(to_email, subject, _wrap(subject, body_html))


def send_otp_email(to_email: str, code: str) -> bool:
    """4-digit consumer-app OTP. Plain, fast — no CTA button, since the user
    is already on the OTP screen waiting to type the code."""
    subject = f"Your Local Coffee Perks code: {code}"
    body_html = f"""\
<h1 style="font-size:20px;font-weight:600;line-height:1.3;margin:0 0 8px 0;color:{TEXT_LIGHT};">
  Your sign-in code
</h1>
<p style="font-size:14px;line-height:1.6;margin:0 0 18px 0;color:{TEXT_LIGHT};opacity:0.9;">
  Enter this code to finish signing in. It expires in 10 minutes.
</p>
<div style="margin:12px 0 22px 0;padding:18px;border-radius:10px;background:#1A1412;border:1px solid #2c211c;text-align:center;">
  <div style="font-size:30px;font-weight:600;letter-spacing:0.18em;color:{MINT};font-family:Menlo,Consolas,monospace;">
    {code}
  </div>
</div>
<p style="font-size:12.5px;line-height:1.6;margin:0;color:{MUTED};">
  Didn't request this? You can ignore this email — no one can sign in without the code.
</p>
"""
    return send_email(to_email, subject, _wrap(subject, body_html))


def send_password_reset_email(
    to_email: str,
    brand_name: str,
    reset_url: str,
) -> bool:
    """One-time link that takes a brand owner to the b2b-dashboard's
    /reset-password screen. 60-minute TTL, single-use, hashed server-side
    (see app/auth_routes.py::forgot_password)."""
    subject = "Reset your Local Coffee Perks password"
    body_html = f"""\
<h1 style="font-size:20px;font-weight:600;line-height:1.3;margin:0 0 12px 0;color:{TEXT_LIGHT};">
  Reset your password
</h1>
<p style="font-size:14px;line-height:1.6;margin:0 0 18px 0;color:{TEXT_LIGHT};opacity:0.9;">
  We got a request to reset the password on your <strong style="color:{MINT};">{brand_name}</strong> account.
  This link expires in 60 minutes.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px 0;">
  <tr>
    <td style="border-radius:10px;background:{MINT};">
      <a href="{reset_url}" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:600;color:{ESPRESSO};text-decoration:none;">
        Reset password →
      </a>
    </td>
  </tr>
</table>
<p style="font-size:12.5px;line-height:1.6;margin:0 0 6px 0;color:{MUTED};">
  Or paste this link into your browser:
</p>
<p style="font-size:12px;line-height:1.5;margin:0;color:{TEXT_LIGHT};word-break:break-all;">
  <a href="{reset_url}" style="color:{MINT};text-decoration:none;">{reset_url}</a>
</p>
"""
    return send_email(to_email, subject, _wrap(subject, body_html))
