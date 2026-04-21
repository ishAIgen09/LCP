"""Consumer App (Phase 4) passwordless auth — email + 4-digit OTP.

Two routes:
  - POST /api/consumer/auth/request-otp  → generates + emails (for now: prints)
    a 4-digit code. If first_name + last_name are present and the email is
    unknown, a new Consumer row (the existing `users` table; see MEMORY.md)
    is created on the fly with a fresh 6-alphanumeric `till_code` that
    doubles as the consumer_id the QR encodes.
  - POST /api/consumer/auth/verify-otp   → validates the code, invalidates it,
    and returns a signed consumer JWT + profile.

Storage: `consumer_otps` table (see models.sql). Codes are bcrypt-hashed, not
stored in the clear. `expires_at` = now + OTP_TTL_MINUTES. Each verify bumps
`attempts` to cap brute force. Successful verify sets `used_at` so the same
row can't be replayed.

Email delivery is intentionally out of scope — for dev we print the code to
the server stdout so the QA loop works without SMTP. When we wire SES/Postmark
the only code change is inside `_send_otp_email`.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import tokens
from app.auth import ConsumerSession, get_consumer_session
from app.database import get_session
from app.models import (
    Brand,
    Cafe,
    ConsumerOTP,
    GlobalLedger,
    GlobalLedgerAction,
    Offer,
    User,
)
from app.schemas import (
    ConsumerAuthResponse,
    ConsumerBalanceResponse,
    ConsumerCafePayload,
    ConsumerHistoryEntry,
    ConsumerOfferPayload,
    ConsumerProfile,
    ConsumerRequestOTP,
    ConsumerRequestOTPResponse,
    ConsumerVerifyOTP,
    LatestEarnPayload,
)
from app.security import hash_password, verify_password

router = APIRouter(prefix="/api/consumer/auth", tags=["consumer-auth"])
consumer_router = APIRouter(prefix="/api/consumer", tags=["consumer"])

OTP_TTL_MINUTES = 10
MAX_OTP_ATTEMPTS = 5
TILL_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

# Decoy hash for timing-safe verification when the email / code lookup misses.
_DECOY_HASH = hash_password("decoy-not-a-real-otp")


def _generate_otp() -> str:
    # secrets.randbelow is cryptographically sound and avoids the bias of
    # ``randint`` on non-power-of-ten ranges.
    return f"{secrets.randbelow(10000):04d}"


def _generate_till_code() -> str:
    return "".join(secrets.choice(TILL_CODE_ALPHABET) for _ in range(6))


async def _unique_till_code(session: AsyncSession, max_attempts: int = 16) -> str:
    for _ in range(max_attempts):
        candidate = _generate_till_code()
        existing = (
            await session.execute(select(User.id).where(User.till_code == candidate))
        ).scalar_one_or_none()
        if existing is None:
            return candidate
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not allocate a unique consumer ID. Please retry.",
    )


def _send_otp_email(email: str, code: str) -> None:
    # Dev stub: prints to stdout. Replace with SES / Postmark / etc. later.
    # The surrounding dashes make the code easy to grep for in uvicorn logs.
    print(f"\n--- CONSUMER OTP ---\n  to:   {email}\n  code: {code}\n--------------------\n", flush=True)


@router.post("/request-otp", response_model=ConsumerRequestOTPResponse)
async def request_otp(
    payload: ConsumerRequestOTP,
    session: AsyncSession = Depends(get_session),
) -> ConsumerRequestOTPResponse:
    # FORCED LOG — fires before anything else so we can prove the route was
    # reached even if validation / DB work fails later. Pydantic has already
    # parsed `payload` by this point, so `payload.email` is safe to read; if
    # FastAPI returns 422 before this runs, we never get here at all, which
    # is itself a useful signal.
    email = payload.email
    print("\n🚨 OTP REQUEST RECEIVED FOR:", email, "\n", flush=True)

    normalized_email = email.strip().lower()

    # Either find the existing consumer OR create one if we have names.
    user_row = (
        await session.execute(
            select(User).where(func.lower(User.email) == normalized_email)
        )
    ).scalar_one_or_none()

    if user_row is None:
        # No consumer yet. A sign-up payload (names present) is the only
        # legitimate way to create one here; a log-in payload for a missing
        # email fails CLOSED so we don't silently register an empty row.
        if not (payload.first_name and payload.last_name):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "We couldn't find an account for that email. "
                    "Try signing up instead."
                ),
            )
        till_code = await _unique_till_code(session)
        user_row = User(
            email=normalized_email,
            first_name=payload.first_name.strip(),
            last_name=payload.last_name.strip(),
            till_code=till_code,
            barcode=secrets.token_hex(12),
        )
        session.add(user_row)
        await session.flush()

    # Always (re)issue a fresh OTP. Previous rows for the same email stay in
    # the table but their `used_at` is unaffected — the verify path filters
    # on `expires_at` + `used_at IS NULL` and picks the most recent.
    # TEMP DEV SHIM (2026-04-19): hardcode 1234 for saeed@test.com so the
    # end-to-end scanner loop can be exercised without chasing OTP prints.
    # Remove before any deploy — it trivially defeats the OTP.
    if normalized_email == "saeed@test.com":
        code = "1234"
    else:
        code = _generate_otp()
    otp_row = ConsumerOTP(
        email=normalized_email,
        code_hash=hash_password(code),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
    )
    session.add(otp_row)
    await session.commit()

    _send_otp_email(normalized_email, code)

    # Explicit single-line target for grepping uvicorn logs. Keep alongside
    # the banner above so it survives if the banner helper gets refactored.
    print(f"--- OTP for {normalized_email}: {code} ---", flush=True)

    return ConsumerRequestOTPResponse(ok=True, debug_code=None)


@router.post("/verify-otp", response_model=ConsumerAuthResponse)
async def verify_otp(
    payload: ConsumerVerifyOTP,
    session: AsyncSession = Depends(get_session),
) -> ConsumerAuthResponse:
    normalized_email = payload.email.strip().lower()
    now = datetime.now(timezone.utc)

    otp_row = (
        await session.execute(
            select(ConsumerOTP)
            .where(func.lower(ConsumerOTP.email) == normalized_email)
            .where(ConsumerOTP.used_at.is_(None))
            .where(ConsumerOTP.expires_at > now)
            .where(ConsumerOTP.attempts < MAX_OTP_ATTEMPTS)
            .order_by(ConsumerOTP.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    target_hash = otp_row.code_hash if otp_row else _DECOY_HASH
    code_ok = verify_password(payload.code, target_hash)

    if otp_row is None or not code_ok:
        if otp_row is not None:
            otp_row.attempts = (otp_row.attempts or 0) + 1
            await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That code is invalid or has expired. Request a new one.",
        )

    user_row = (
        await session.execute(
            select(User).where(func.lower(User.email) == normalized_email)
        )
    ).scalar_one_or_none()
    if user_row is None:
        # Should not happen — request-otp only issues codes once a User exists —
        # but fail safe rather than minting a token pointing at nothing.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found. Try signing up.",
        )

    otp_row.used_at = now
    await session.commit()

    token = tokens.encode_consumer(
        user_id=str(user_row.id),
        consumer_id=user_row.till_code,
        email=normalized_email,
        first_name=user_row.first_name,
        last_name=user_row.last_name,
    )
    return ConsumerAuthResponse(
        token=token,
        consumer=ConsumerProfile(
            consumer_id=user_row.till_code,
            first_name=user_row.first_name,
            last_name=user_row.last_name,
            email=user_row.email,
        ),
    )


# Home-screen polling endpoint. Returns the consumer's raw cross-cafe stamp
# balance — the same SUM(stamp_delta) that the B2B scan flow manipulates. With
# auto-rollover in /api/b2b/scan, this value naturally stays in 0..9, and the
# mobile app reads it as the "progress to the next free drink" counter.
REWARD_THRESHOLD = 10


@consumer_router.get("/me/balance", response_model=ConsumerBalanceResponse)
async def consumer_balance(
    consumer: ConsumerSession = Depends(get_consumer_session),
    session: AsyncSession = Depends(get_session),
) -> ConsumerBalanceResponse:
    # Pick up the latest EARNED global_ledger row + its cafe. The mobile app
    # uses this transaction_id as a fire-once key for the celebratory modal.
    # `consumer_id` on global_ledger is the till_code (CHAR(6)), not the UUID.
    # We ALSO join in the Brand so the balance sum below can be scoped by
    # the scheme type of the latest-earn's brand.
    latest_earn_row = (
        await session.execute(
            select(GlobalLedger, Cafe, Brand)
            .join(Cafe, Cafe.id == GlobalLedger.venue_id)
            .join(Brand, Brand.id == Cafe.brand_id)
            .where(
                GlobalLedger.consumer_id == consumer.consumer_id,
                GlobalLedger.action_type == GlobalLedgerAction.EARNED,
            )
            .order_by(GlobalLedger.timestamp.desc())
            .limit(1)
        )
    ).first()

    # Brand-scoped balance. Strictly isolated per the business rule:
    #   Global scheme → pooled across every Global-scheme brand
    #   Private scheme → only that one brand's cafes
    # The shown number always reflects the pool their LAST earn belongs to,
    # so the "X/10" in the app matches what the till just showed them. Brand-
    # new users with no earns see 0 (correct — they have no active pool).
    #
    # Deferred import: _scoped_balance_stmt lives in app.main and main imports
    # this router, so a module-level `from app.main import ...` would cycle.
    # b2b_routes.py uses the same pattern.
    from app.main import _scoped_balance_stmt

    scoped_balance = 0
    if latest_earn_row is not None:
        _earn, _cafe, earn_brand = latest_earn_row
        scoped_balance = int(
            (
                await session.execute(
                    _scoped_balance_stmt(consumer.user_id, earn_brand)
                )
            ).scalar_one()
        )

    latest_earn: LatestEarnPayload | None = None
    if latest_earn_row is not None:
        earn, cafe, _earn_brand = latest_earn_row
        # A rollover is a REDEEMED row committed in the same scan transaction
        # as the EARNED row. `now()` in Postgres returns the transaction start
        # time, so the two rows share an identical `timestamp` — equality is a
        # reliable same-scan check here.
        redeemed_hit = (
            await session.execute(
                select(GlobalLedger.transaction_id).where(
                    GlobalLedger.consumer_id == consumer.consumer_id,
                    GlobalLedger.venue_id == earn.venue_id,
                    GlobalLedger.action_type == GlobalLedgerAction.REDEEMED,
                    GlobalLedger.timestamp == earn.timestamp,
                )
            )
        ).first()
        latest_earn = LatestEarnPayload(
            transaction_id=earn.transaction_id,
            cafe_name=cafe.name,
            cafe_address=cafe.address,
            stamps_earned=earn.quantity,
            free_drink_unlocked=redeemed_hit is not None,
            timestamp=earn.timestamp,
        )

    return ConsumerBalanceResponse(
        consumer_id=consumer.consumer_id,
        stamp_balance=scoped_balance,
        threshold=REWARD_THRESHOLD,
        # Derived under the banking model (no more auto-rollover; balance
        # can exceed threshold). Clients should prefer current_stamps for
        # the X/10 progress display so it never shows "13/10".
        current_stamps=scoped_balance % REWARD_THRESHOLD,
        banked_rewards=scoped_balance // REWARD_THRESHOLD,
        latest_earn=latest_earn,
    )


# Recent activity for the mobile History tab. Reads from global_ledger
# (row-per-transaction shadow table) rather than stamp_ledger, so "+3 stamps
# at Cafe X" renders as one entry instead of three. Caller-capped `limit`
# defaults to 50 and is clamped to [1, 200] to keep the payload predictable.
@consumer_router.get("/me/history", response_model=list[ConsumerHistoryEntry])
async def consumer_history(
    limit: int = 50,
    consumer: ConsumerSession = Depends(get_consumer_session),
    session: AsyncSession = Depends(get_session),
) -> list[ConsumerHistoryEntry]:
    safe_limit = max(1, min(limit, 200))
    rows = (
        await session.execute(
            select(GlobalLedger, Cafe)
            .join(Cafe, Cafe.id == GlobalLedger.venue_id)
            .where(GlobalLedger.consumer_id == consumer.consumer_id)
            .order_by(GlobalLedger.timestamp.desc())
            .limit(safe_limit)
        )
    ).all()
    return [
        ConsumerHistoryEntry(
            transaction_id=ledger.transaction_id,
            kind="earn" if ledger.action_type == GlobalLedgerAction.EARNED else "redeem",
            quantity=ledger.quantity,
            cafe_name=cafe.name,
            cafe_address=cafe.address,
            timestamp=ledger.timestamp,
        )
        for ledger, cafe in rows
    ]


# Discover feed. One row per cafe across every brand that's enrolled, paired
# with the cafe's amenities and the brand's currently-live offers (window
# strictly contains `now()`). Consumer-auth'd — an anonymous visitor shouldn't
# be able to scrape the cafe directory.
@consumer_router.get("/cafes", response_model=list[ConsumerCafePayload])
async def consumer_cafes(
    _consumer: ConsumerSession = Depends(get_consumer_session),
    session: AsyncSession = Depends(get_session),
) -> list[ConsumerCafePayload]:
    cafe_rows = (
        await session.execute(select(Cafe).order_by(Cafe.name.asc()))
    ).scalars().all()

    # Live offers for every brand in the set. We fetch the raw Offer rows
    # (keeping target_cafe_ids) so we can do the per-cafe targeting filter in
    # Python — cleaner than a cross-join with array containment for a list
    # that's typically tiny (<50 live offers per brand).
    brand_ids = {cafe.brand_id for cafe in cafe_rows}
    offers_by_brand: dict[uuid.UUID, list[Offer]] = {}
    if brand_ids:
        now = datetime.now(timezone.utc)
        live_offers = (
            await session.execute(
                select(Offer)
                .where(
                    Offer.brand_id.in_(brand_ids),
                    Offer.starts_at <= now,
                    Offer.ends_at > now,
                )
                .order_by(Offer.ends_at.asc())
            )
        ).scalars().all()
        for offer in live_offers:
            offers_by_brand.setdefault(offer.brand_id, []).append(offer)

    def _offers_for_cafe(cafe: Cafe) -> list[ConsumerOfferPayload]:
        # Location targeting: an offer attaches to this cafe iff
        #   target_cafe_ids IS NULL  (broadcast across the brand)
        #   OR cafe.id appears in target_cafe_ids  (scoped subset includes us)
        # No FK on array elements — an orphan id (from a deleted cafe) simply
        # won't match and gets silently dropped, which is the right behavior.
        out: list[ConsumerOfferPayload] = []
        for offer in offers_by_brand.get(cafe.brand_id, []):
            if offer.target_cafe_ids is not None and cafe.id not in offer.target_cafe_ids:
                continue
            out.append(
                ConsumerOfferPayload(
                    id=offer.id,
                    offer_type=offer.offer_type,
                    target=offer.target,
                    amount=offer.amount,
                    starts_at=offer.starts_at,
                    ends_at=offer.ends_at,
                )
            )
        return out

    return [
        ConsumerCafePayload(
            id=cafe.id,
            name=cafe.name,
            address=cafe.address,
            phone=cafe.phone,
            food_hygiene_rating=cafe.food_hygiene_rating,
            amenities=list(cafe.amenities or []),
            live_offers=_offers_for_cafe(cafe),
        )
        for cafe in cafe_rows
    ]
