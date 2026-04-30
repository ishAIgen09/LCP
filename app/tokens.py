"""JWT helpers for the app login flows.

Three audiences:
  - "admin"    → brand owner sessions (Business dashboard).
  - "store"    → in-store barista sessions (POS scanner). The `venue_api_key`
                 claim is the cafe UUID the scanner passes back as the
                 `Venue-API-Key` header on stamp/redeem — this keeps
                 `get_active_cafe` unchanged and backwards compatible with
                 the standalone `static/index.html` POS.
  - "consumer" → end-customer sessions (native Phase 4 app). `consumer_id`
                 claim is the 6-alphanumeric loyalty ID (same field as
                 `users.till_code`) that the QR encodes and the POS scans.

Signing key, TTL, and dev credentials live in `Settings` (app.database).
"""

from __future__ import annotations

import time
from typing import Any

import jwt

from app.database import settings

ALGORITHM = "HS256"


def _encode(claims: dict[str, Any]) -> str:
    now = int(time.time())
    payload = {
        **claims,
        "iat": now,
        "exp": now + settings.jwt_ttl_hours * 3600,
        "iss": "indie-coffee-loop",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def encode_admin(brand_id: str, email: str, brand_name: str) -> str:
    return _encode(
        {
            "sub": f"admin:{brand_id}",
            "aud": "admin",
            "brand_id": brand_id,
            "brand_name": brand_name,
            "email": email,
        }
    )


def encode_store(
    cafe_id: str,
    brand_id: str,
    cafe_name: str,
    brand_name: str,
    store_number: str,
) -> str:
    # venue_api_key is the raw cafe UUID so the scanner can continue to hit
    # the existing /api/venues/* endpoints via the Venue-API-Key header.
    return _encode(
        {
            "sub": f"store:{cafe_id}",
            "aud": "store",
            "cafe_id": cafe_id,
            "brand_id": brand_id,
            "cafe_name": cafe_name,
            "brand_name": brand_name,
            "store_number": store_number,
            "venue_api_key": cafe_id,
        }
    )


def encode_consumer(
    user_id: str,
    consumer_id: str,
    email: str,
    first_name: str | None,
    last_name: str | None,
) -> str:
    return _encode(
        {
            "sub": f"consumer:{user_id}",
            "aud": "consumer",
            "user_id": user_id,
            "consumer_id": consumer_id,
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
        }
    )


def encode_super_admin(super_admin_id: str, email: str) -> str:
    return _encode(
        {
            "sub": f"super-admin:{super_admin_id}",
            "aud": "super-admin",
            "super_admin_id": super_admin_id,
            "email": email,
        }
    )


def encode_brand_invite(
    email: str,
    brand_id: str,
    ttl_hours: int = 48,
) -> tuple[str, int]:
    """One-time-ish setup token for inviting a brand admin.

    Used by the Super Admin "Invite admin" flow: we sign an audience-
    scoped JWT carrying {email, brand_id} so the recipient can land on
    /setup?token=... and finalize their password without us having to
    persist a server-side single-use token table for the MVP.

    Returns (token, exp_unix_seconds) so the caller can echo the
    expiry to the dashboard.
    """
    now = int(time.time())
    exp = now + ttl_hours * 3600
    payload: dict[str, Any] = {
        "sub": f"invite:{brand_id}",
        "aud": "brand-invite",
        "brand_id": brand_id,
        "email": email,
        "iat": now,
        "exp": exp,
        "iss": "indie-coffee-loop",
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)
    return token, exp


def decode(token: str, audience: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[ALGORITHM],
        audience=audience,
        issuer="indie-coffee-loop",
    )
