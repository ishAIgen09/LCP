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

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import tokens
from app.auth import ConsumerSession, get_consumer_session
from app.database import get_session
from app.email_sender import send_otp_email as _smtp_send_otp_email
from app.models import (
    Brand,
    Cafe,
    ConsumerOTP,
    GlobalLedger,
    GlobalLedgerAction,
    LedgerEventType,
    Offer,
    SchemeType,
    StampLedger,
    SuspendedCoffeeLedger,
    User,
)
from app.schemas import (
    ConsumerAuthResponse,
    ConsumerBalanceResponse,
    ConsumerCafePayload,
    ConsumerHistoryEntry,
    ConsumerOfferPayload,
    ConsumerProfile,
    ConsumerProfileUpdate,
    ConsumerRequestOTP,
    ConsumerRequestOTPResponse,
    ConsumerVerifyOTP,
    ConsumerWalletResponse,
    DonateLoyaltyRequest,
    LatestEarnPayload,
    SuspendedCoffeeMutationResponse,
    WalletBalanceBlock,
    WalletPrivateBrandBalance,
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
    # Real SMTP via app.email_sender (Google Workspace by default). When
    # SMTP_PASSWORD isn't set we fall back to the stdout stub inside
    # send_email, so local dev keeps working without creds.
    _smtp_send_otp_email(email, code)


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


# Consumer Profile-tab Edit Name flow. PATCH semantics — fields the
# client omits are left untouched; an empty string clears the field.
# Returns the freshly persisted profile so the client can drop it
# straight into its session state without a follow-up fetch.
@consumer_router.patch("/me", response_model=ConsumerProfile)
@consumer_router.put("/me", response_model=ConsumerProfile)
async def update_consumer_profile(
    payload: ConsumerProfileUpdate,
    consumer: ConsumerSession = Depends(get_consumer_session),
    session: AsyncSession = Depends(get_session),
) -> ConsumerProfile:
    user = await session.get(User, consumer.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Consumer session references an unknown user.",
        )
    fields = payload.model_dump(exclude_unset=True)
    if "first_name" in fields:
        cleaned = (fields["first_name"] or "").strip()
        user.first_name = cleaned or None
    if "last_name" in fields:
        cleaned = (fields["last_name"] or "").strip()
        user.last_name = cleaned or None
    await session.commit()
    await session.refresh(user)
    return ConsumerProfile(
        consumer_id=user.till_code,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
    )


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
            cafe_id=cafe.id,
            cafe_name=cafe.name,
            cafe_address=cafe.address,
            suspended_coffee_enabled=cafe.suspended_coffee_enabled,
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


# /me/wallet — full wallet state in one fetch. Splits the consumer's
# stamp_ledger into:
#   - a pooled "global" balance (every global-scheme brand contributes),
#   - one private-brand balance per private-scheme brand with any activity.
# Plus latest_earn so the mobile Home screen can keep its one-fetch-per-poll
# cadence instead of fanning out to /me/balance AND a wallet endpoint.
@consumer_router.get("/me/wallet", response_model=ConsumerWalletResponse)
async def consumer_wallet(
    consumer: ConsumerSession = Depends(get_consumer_session),
    session: AsyncSession = Depends(get_session),
) -> ConsumerWalletResponse:
    user_id = consumer.user_id

    # Global pool: SUM(stamp_delta) across every ledger row whose cafe's
    # brand is scheme_type='global'. COALESCE handles the "brand-new
    # consumer, no ledger rows yet" case without a second roundtrip.
    global_total = (
        await session.execute(
            select(func.coalesce(func.sum(StampLedger.stamp_delta), 0))
            .select_from(StampLedger)
            .join(Cafe, Cafe.id == StampLedger.cafe_id)
            .join(Brand, Brand.id == Cafe.brand_id)
            .where(
                StampLedger.customer_id == user_id,
                Brand.scheme_type == SchemeType.GLOBAL,
            )
        )
    ).scalar_one() or 0

    # Private pools: per-brand aggregates, filtered with HAVING so we only
    # return brands where the consumer has a non-zero balance. (Zero-balance
    # rows after a full redeem also drop off — correct UX: the mobile "My
    # Brand Cards" list hides fully-cashed-in punch cards.)
    private_rows = (
        await session.execute(
            select(
                Brand.id,
                Brand.name,
                func.coalesce(func.sum(StampLedger.stamp_delta), 0).label("total"),
            )
            .select_from(Brand)
            .join(Cafe, Cafe.brand_id == Brand.id)
            .join(StampLedger, StampLedger.cafe_id == Cafe.id)
            .where(
                StampLedger.customer_id == user_id,
                Brand.scheme_type == SchemeType.PRIVATE,
            )
            .group_by(Brand.id, Brand.name)
            .having(func.coalesce(func.sum(StampLedger.stamp_delta), 0) > 0)
            .order_by(Brand.name.asc())
        )
    ).all()

    # latest_earn mirrors the /me/balance shape exactly so the mobile
    # RewardModal delta-detection code doesn't need a new branch.
    latest_earn_row = (
        await session.execute(
            select(GlobalLedger, Cafe)
            .join(Cafe, Cafe.id == GlobalLedger.venue_id)
            .where(
                GlobalLedger.consumer_id == consumer.consumer_id,
                GlobalLedger.action_type == GlobalLedgerAction.EARNED,
            )
            .order_by(GlobalLedger.timestamp.desc())
            .limit(1)
        )
    ).first()

    latest_earn: LatestEarnPayload | None = None
    if latest_earn_row is not None:
        earn, cafe = latest_earn_row
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
            cafe_id=cafe.id,
            cafe_name=cafe.name,
            cafe_address=cafe.address,
            suspended_coffee_enabled=cafe.suspended_coffee_enabled,
            stamps_earned=earn.quantity,
            free_drink_unlocked=redeemed_hit is not None,
            timestamp=earn.timestamp,
        )

    return ConsumerWalletResponse(
        threshold=REWARD_THRESHOLD,
        global_balance=WalletBalanceBlock(
            stamp_balance=int(global_total),
            current_stamps=int(global_total) % REWARD_THRESHOLD,
            banked_rewards=int(global_total) // REWARD_THRESHOLD,
        ),
        private_balances=[
            WalletPrivateBrandBalance(
                brand_id=row.id,
                brand_name=row.name,
                stamp_balance=int(row.total),
                current_stamps=int(row.total) % REWARD_THRESHOLD,
                banked_rewards=int(row.total) // REWARD_THRESHOLD,
            )
            for row in private_rows
        ],
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
_EARTH_RADIUS_MILES = 3958.7613


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    # Standard great-circle distance in statute miles. Good enough for a
    # city-scale "nearest cafe" sort; a PostGIS-powered version would replace
    # this with ST_DistanceSphere on a geography column.
    import math
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return _EARTH_RADIUS_MILES * c


@consumer_router.get("/cafes", response_model=list[ConsumerCafePayload])
async def consumer_cafes(
    # Accept both the original `lat`/`lng` pair (existing consumer-app
    # client) and the spec-canonical `user_lat`/`user_lon` (PRD). When
    # both are given the canonical form wins. Either way we feed a
    # single (lat, lng) pair into the Haversine math below.
    lat: float | None = Query(default=None),
    lng: float | None = Query(default=None),
    user_lat: float | None = Query(default=None),
    user_lon: float | None = Query(default=None),
    _consumer: ConsumerSession = Depends(get_consumer_session),
    session: AsyncSession = Depends(get_session),
) -> list[ConsumerCafePayload]:
    if user_lat is not None:
        lat = user_lat
    if user_lon is not None:
        lng = user_lon
    # Pull cafes + their parent Brand in one pass so we can derive
    # `is_lcp_plus` without an N+1 follow-up query.
    rows = (
        await session.execute(
            select(Cafe, Brand)
            .join(Brand, Brand.id == Cafe.brand_id)
            .order_by(Cafe.name.asc())
        )
    ).all()

    # Live offers for every brand in the set. We fetch the raw Offer rows
    # (keeping target_cafe_ids) so we can do the per-cafe targeting filter in
    # Python — cleaner than a cross-join with array containment for a list
    # that's typically tiny (<50 live offers per brand).
    brand_ids = {cafe.brand_id for cafe, _brand in rows}
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

    # Validate lat/lng pair only if both are present and inside the legal
    # WGS-84 range. Anything outside is silently treated as "no location",
    # so a malformed query still returns cafes (just unsorted by distance).
    proximity_ok = (
        lat is not None
        and lng is not None
        and -90.0 <= lat <= 90.0
        and -180.0 <= lng <= 180.0
    )

    # Batch-compute pool balances for participating cafes. One GROUP BY
    # query keyed by cafe_id; cafes that haven't toggled the feature on
    # don't need a pool count (badge wouldn't show anyway), so we skip
    # them in the WHERE clause entirely.
    pool_balances: dict[uuid.UUID, int] = {}
    enabled_cafe_ids = [c.id for c, _b in rows if c.suspended_coffee_enabled]
    if enabled_cafe_ids:
        pool_rows = (
            await session.execute(
                select(
                    SuspendedCoffeeLedger.cafe_id,
                    func.coalesce(
                        func.sum(SuspendedCoffeeLedger.units_delta), 0
                    ).label("balance"),
                )
                .where(SuspendedCoffeeLedger.cafe_id.in_(enabled_cafe_ids))
                .group_by(SuspendedCoffeeLedger.cafe_id)
            )
        ).all()
        for row in pool_rows:
            # Defensive clamp — should never see a negative balance given
            # the FOR UPDATE serve guard, but if we do, surface 0 rather
            # than leak a negative number to the consumer-app.
            pool_balances[row.cafe_id] = max(int(row.balance), 0)

    payloads: list[ConsumerCafePayload] = []
    for cafe, brand in rows:
        distance: float | None = None
        if proximity_ok and cafe.latitude is not None and cafe.longitude is not None:
            distance = round(
                _haversine_miles(lat, lng, cafe.latitude, cafe.longitude), 2  # type: ignore[arg-type]
            )
        payloads.append(
            ConsumerCafePayload(
                id=cafe.id,
                name=cafe.name,
                address=cafe.address,
                phone=cafe.phone,
                food_hygiene_rating=cafe.food_hygiene_rating,
                amenities=list(cafe.amenities or []),
                live_offers=_offers_for_cafe(cafe),
                is_lcp_plus=(brand.scheme_type == SchemeType.GLOBAL),
                latitude=cafe.latitude,
                longitude=cafe.longitude,
                distance_miles=distance,
                # Pay It Forward / Suspended Coffee (PRD §4.5). The cafe
                # row's flag drives the Community Board badge in the
                # Explore card; the per-cafe pool balance feeds the
                # CafeDetailsModal counter. Both default to false / 0
                # for cafes that haven't enrolled.
                suspended_coffee_enabled=cafe.suspended_coffee_enabled,
                suspended_coffee_pool=pool_balances.get(cafe.id, 0),
            )
        )

    if proximity_ok:
        # Sort closest-first; cafes missing coords (distance=None) go to the
        # end. Using `float("inf")` sentinel keeps the sort key monotone
        # without needing a two-pass partition.
        payloads.sort(key=lambda p: p.distance_miles if p.distance_miles is not None else float("inf"))

    return payloads


# ─────────────────────────────────────────────────────────────────────
# Pay It Forward / Suspended Coffee — consumer-side donation (Mode 1).
# Spec: PRD §4.5.6.
# ─────────────────────────────────────────────────────────────────────


async def _resolve_last_earn_cafe(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    scope: str,
    brand_id: uuid.UUID | None,
) -> Cafe | None:
    """Return the Cafe row of the user's most recent EARN matching the
    requested scope.

    For scope='private' we filter by `brand_id` (caller required to
    pass it). For scope='global' we filter by the brand's
    `scheme_type='global'`. The query joins through cafes → brands so
    we only consider scans where the cafe's parent brand still exists
    (no orphaned cafes).

    Returns None when the user has no qualifying EARN history. The
    caller turns this into a 404 with a friendly message.
    """
    stmt = (
        select(Cafe)
        .select_from(StampLedger)
        .join(Cafe, Cafe.id == StampLedger.cafe_id)
        .join(Brand, Brand.id == Cafe.brand_id)
        .where(
            StampLedger.customer_id == user_id,
            StampLedger.event_type == LedgerEventType.EARN,
        )
        .order_by(StampLedger.created_at.desc())
        .limit(1)
    )
    if scope == "private":
        stmt = stmt.where(Cafe.brand_id == brand_id)
    else:  # 'global'
        stmt = stmt.where(Brand.scheme_type == SchemeType.GLOBAL)

    return (await session.execute(stmt)).scalars().first()


@consumer_router.post(
    "/suspended-coffee/donate-loyalty",
    response_model=SuspendedCoffeeMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def suspended_coffee_donate_loyalty(
    payload: DonateLoyaltyRequest,
    consumer: ConsumerSession = Depends(get_consumer_session),
    session: AsyncSession = Depends(get_session),
) -> SuspendedCoffeeMutationResponse:
    """Consumer donates 1 banked reward (10 stamps) to a cafe's
    Suspended Coffee pool.

    Atomic single-transaction flow:
      1. Lock the user row (`SELECT … FOR UPDATE` via the existing
         `_lock_user_and_read_scoped_balance` helper) so concurrent
         donate / scan / redeem can't race against each other.
      2. Verify scoped stamp balance >= REWARD_THRESHOLD (10) for the
         brand the destination cafe belongs to.
      3. Insert a REDEEM row (-10) into stamp_ledger to consume the
         reward. The (event_type='REDEEM' AND stamp_delta=-10) CHECK
         constraint enforces the magnitude.
      4. Insert a REDEEMED row (qty=1) into global_ledger so the
         consumer's `/me/history` shows the donation as a single
         logical event (mirrors the redeem-at-till audit shape).
      5. Insert a donate_loyalty row (+1) into suspended_coffee_ledger
         with `donor_user_id` set so the cafe operator (eventually) can
         see who donated, but the consumer-app NEVER surfaces
         donor identity per the privacy rule (PRD §4.5.3).

    Failure modes (all 4xx, never 5xx):
      - 404 if cafe_id doesn't exist (or auto-resolve found nothing)
      - 403 if cafe.suspended_coffee_enabled is False
      - 400 if scoped balance < 10 stamps (with the actual count in the
        message so the UI can surface "you have X / 10")
      - 409 if the auto-resolved last-visited cafe isn't participating
        (so the UI can prompt the user to pick a different one)
    """
    # ── Resolve destination cafe ─────────────────────────────────────
    # Priority: explicit cafe_id first; otherwise auto-route to the
    # user's most recent EARN matching the requested scope. See
    # DonateLoyaltyRequest's docstring for the call-shape contract.
    if payload.cafe_id is not None:
        cafe = await session.get(Cafe, payload.cafe_id)
        if cafe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Cafe not found."
            )
    else:
        cafe = await _resolve_last_earn_cafe(
            session,
            user_id=consumer.user_id,
            scope=payload.scope,  # type: ignore[arg-type]  — validator guarantees set
            brand_id=payload.brand_id,
        )
        if cafe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "No recent visits found to auto-route the donation. "
                    "Pick a cafe yourself."
                ),
            )

    if not cafe.suspended_coffee_enabled:
        # Different status code for the auto-routed path so the UI can
        # distinguish "you tried to donate to a non-participating cafe"
        # (user picked) vs "your last visit isn't participating" (auto).
        if payload.cafe_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Your last visit ({cafe.name}) isn't participating in "
                    "Pay It Forward. Pick another cafe."
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This cafe doesn't accept Pay It Forward donations right now. "
                "Try a participating cafe instead."
            ),
        )

    brand = await session.get(Brand, cafe.brand_id)
    if brand is None:
        # Orphan cafe (FK should make this impossible, but defensive).
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found."
        )

    # Deferred import to dodge the consumer_auth.py ↔ app.main circular
    # (main.py imports the consumer_router from this module). Same pattern
    # as the existing _scoped_balance_stmt usage in /me/balance.
    from app.main import _lock_user_and_read_scoped_balance

    user, balance = await _lock_user_and_read_scoped_balance(
        session, consumer.user_id, None, brand
    )

    if balance < REWARD_THRESHOLD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Not enough stamps to donate. You have {balance} of "
                f"{REWARD_THRESHOLD} required for one donation."
            ),
        )

    # 1. stamp_ledger REDEEM (-10) — consumes the banked reward.
    session.add(
        StampLedger(
            customer_id=user.id,
            cafe_id=cafe.id,
            event_type=LedgerEventType.REDEEM,
            stamp_delta=-10,
            note="Pay It Forward donation",
        )
    )

    # 2. global_ledger REDEEMED (qty=1) so /me/history lists it.
    session.add(
        GlobalLedger(
            consumer_id=user.till_code,
            venue_id=cafe.id,
            action_type=GlobalLedgerAction.REDEEMED,
            quantity=1,
        )
    )

    # 3. suspended_coffee_ledger +1 donation event.
    session.add(
        SuspendedCoffeeLedger(
            cafe_id=cafe.id,
            event_type="donate_loyalty",
            units_delta=1,
            donor_user_id=user.id,
            note="Loyalty-reward donation",
        )
    )

    await session.commit()

    # Read post-write pool balance so the consumer app can update its
    # CafeDetailsModal counter without a follow-up GET. SUM is fine
    # without a fresh lock because we just committed our +1 and no
    # caller can decrement (serve) without first taking the cafe lock
    # via the b2b serve handler.
    new_balance = int(
        (
            await session.execute(
                select(
                    func.coalesce(func.sum(SuspendedCoffeeLedger.units_delta), 0)
                ).where(SuspendedCoffeeLedger.cafe_id == cafe.id)
            )
        ).scalar_one()
        or 0
    )

    return SuspendedCoffeeMutationResponse(new_pool_balance=new_balance)
