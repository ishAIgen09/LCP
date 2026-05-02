from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import (
    OFFER_TARGETS,
    OFFER_TYPES,
    SchemeType,
    SubscriptionStatus,
)


class BrandCreate(BaseModel):
    name: str = Field(min_length=1)
    slug: str = Field(min_length=1, pattern=r"^[a-z0-9-]+$")
    contact_email: str = Field(min_length=3)
    scheme_type: SchemeType = SchemeType.GLOBAL


class BrandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    contact_email: str
    scheme_type: SchemeType
    subscription_status: SubscriptionStatus
    created_at: datetime


# UK Food Hygiene Rating — the allow-list is authoritative and mirrored in:
#   migrations/0007  (CHECK constraint)
#   b2b-dashboard/src/components/AddLocationDialog  (dropdown)
#   consumer-app/src/FoodHygieneBadge  (switch-case render)
FoodHygieneRating = Literal["1", "2", "3", "4", "5", "Awaiting Inspection"]


class CafeCreate(BaseModel):
    # brand_id intentionally absent — derived from the admin session's JWT.
    # slug + contact_email are optional: if not provided the backend generates
    # them from the brand. store_number / pin are optional — set them now to
    # make the cafe immediately loginable from the POS, or leave NULL and
    # issue them later through a separate flow.
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9-]+$")
    contact_email: str | None = Field(default=None, min_length=3)
    store_number: str | None = Field(
        default=None, min_length=3, max_length=10, pattern=r"^[A-Za-z0-9]+$"
    )
    pin: str | None = Field(default=None, min_length=4, max_length=8, pattern=r"^\d+$")
    phone: str | None = Field(default=None, max_length=40)
    food_hygiene_rating: FoodHygieneRating = "Awaiting Inspection"
    # Per-cafe Pay It Forward / Suspended Coffee opt-in (PRD §4.5,
    # migration 0020). Moved 2026-05-02 from the global Settings tab
    # into the AddLocationDialog + EditLocationDialog so each cafe's
    # opt-in is set when the location itself is configured. None ==
    # "operator didn't tick the toggle" → falls through to the column
    # default of FALSE.
    suspended_coffee_enabled: bool | None = None


class CafeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    brand_id: UUID
    name: str
    slug: str
    address: str
    contact_email: str
    store_number: str | None
    phone: str | None = None
    food_hygiene_rating: FoodHygieneRating = "Awaiting Inspection"
    amenities: list[str] = Field(default_factory=list)
    created_at: datetime


class CafeUpdate(BaseModel):
    # Partial-update payload — any omitted / `None` field is ignored. Used by
    # the b2b dashboard's Edit Location dialog to change a cafe's address,
    # phone, and/or hygiene rating after creation. Amenities still go through
    # the dedicated PUT /amenities endpoint so this payload stays flat.
    address: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    food_hygiene_rating: FoodHygieneRating | None = None
    # Per-cafe Pay It Forward / Suspended Coffee opt-in (PRD §4.5,
    # migration 0020). Toggled from the b2b dashboard's Settings tab.
    # None = "not in this patch" (existing flag preserved); True/False
    # explicit values flip the cafe's enabled state.
    suspended_coffee_enabled: bool | None = None


class CafeAmenitiesUpdate(BaseModel):
    # Enforced at the API layer, not the DB (see models.py comment on
    # Cafe.amenities). Duplicate ids are collapsed on write.
    amenities: list[str] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def _strip_and_validate(self) -> "CafeAmenitiesUpdate":
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in self.amenities:
            if not isinstance(raw, str):
                continue
            value = raw.strip()
            if not value or value in seen:
                continue
            seen.add(value)
            cleaned.append(value)
        self.amenities = cleaned
        return self


class UserCreate(BaseModel):
    till_code: str | None = Field(default=None, pattern=r"^[A-Z0-9]{6}$")
    barcode: str | None = Field(default=None, min_length=1)
    email: str | None = None
    display_name: str | None = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    till_code: str
    barcode: str
    email: str | None
    display_name: str | None
    created_at: datetime


class BalanceResponse(BaseModel):
    user_id: UUID
    stamp_balance: int


class StampRequest(BaseModel):
    user_id: UUID | None = None
    till_code: str | None = Field(default=None, pattern=r"^[A-Z0-9]{6}$")
    barista_id: UUID | None = None

    @model_validator(mode="after")
    def exactly_one_identifier(self) -> "StampRequest":
        if (self.user_id is None) == (self.till_code is None):
            raise ValueError("Provide exactly one of user_id or till_code")
        return self


class StampResponse(BaseModel):
    user_id: UUID
    stamp_balance: int
    reward_earned: bool
    ledger_entry_id: UUID


class RedeemRequest(StampRequest):
    # Number of banked rewards to consume in this call. Each redemption
    # burns REWARD_THRESHOLD (10) stamps. Default 1 preserves the legacy
    # single-drink redeem callers; Mixed-Basket POS passes N to burn N
    # banked rewards atomically.
    quantity: int = Field(default=1, ge=1, le=20)


class RedeemResponse(BaseModel):
    user_id: UUID
    stamp_balance: int
    redeemed: bool
    # Number of rewards actually consumed this call (matches request.quantity
    # on success).
    quantity_redeemed: int = 1
    ledger_entry_id: UUID


class CustomerStatusResponse(BaseModel):
    # Returned by GET /api/venues/customer/{till_code} for the POS pre-scan
    # lookup. Scoped to the authenticated venue's brand (Global vs Private
    # isolation applies — same rule as _scoped_balance_stmt).
    user_id: UUID
    till_code: str
    # Derived fields: current_stamps = total_scoped_balance % 10
    #                 banked_rewards = total_scoped_balance // 10
    # Exposed explicitly so the POS doesn't have to do the modular math.
    current_stamps: int
    banked_rewards: int
    threshold: int


class CheckoutRequest(BaseModel):
    brand_id: UUID


class CheckoutResponse(BaseModel):
    checkout_url: str


class AdminLoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class AdminSetupRequest(BaseModel):
    # Onboarding wizard payload — `token` is the brand-invite JWT minted by
    # the Super Admin "Invite admin" flow (audience="brand-invite"); `password`
    # is the chosen account password. Min length matches the wizard's UX
    # threshold; the audience claim is what actually gates write access here.
    token: str = Field(min_length=8)
    password: str = Field(min_length=6)


class SuperAdminLoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class SuperAdminProfile(BaseModel):
    email: str


class SuperAdminLoginResponse(BaseModel):
    token: str
    admin: SuperAdminProfile


class SuperAdminChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=200)


class SuperAdminCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=200)


class StoreLoginRequest(BaseModel):
    store_number: str = Field(min_length=3, max_length=10, pattern=r"^[A-Za-z0-9]+$")
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


class AdminProfile(BaseModel):
    email: str


class BrandProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    contact_email: str
    scheme_type: SchemeType
    subscription_status: SubscriptionStatus
    current_period_end: datetime | None = None
    # KYC fields. Returned so the Settings form can prefill — nullable since
    # existing brands pre-date KYC collection.
    owner_first_name: str | None = None
    owner_last_name: str | None = None
    owner_phone: str | None = None
    company_legal_name: str | None = None
    company_address: str | None = None
    company_registration_number: str | None = None


class BrandUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, min_length=1, pattern=r"^[a-z0-9-]+$")
    contact_email: str | None = Field(default=None, min_length=3)
    scheme_type: SchemeType | None = None
    # KYC fields. None = "not provided in this patch, leave untouched".
    # Empty string = "clear this field" (handler coerces "" → NULL).
    owner_first_name: str | None = None
    owner_last_name: str | None = None
    owner_phone: str | None = None
    company_legal_name: str | None = None
    company_address: str | None = None
    company_registration_number: str | None = None


class AdminMeResponse(BaseModel):
    admin: "AdminProfile"
    brand: BrandProfile


class CafeScans(BaseModel):
    cafe_id: UUID
    scans_30d: int


class MetricsResponse(BaseModel):
    # Range-filtered aggregates. `range` echoes the query param back so the
    # frontend can correlate a render against the request that produced
    # it. `cafe_id` is either the literal string "all" or the UUID that
    # was filtered to — kept as a string to keep the echo shape simple.
    range: str
    cafe_id: str
    total_earned: int
    total_redeemed: int
    # EARN count in the matched prior window of the same length, used for
    # the top card's delta %. Null when range="all" (nothing to compare).
    prev_total_earned: int | None = None

    # Legacy 30d-wide brand-level fields — stay constant regardless of
    # the filter so the "Top performing branches" card keeps a stable
    # 30d backdrop even when the user narrows the top-card filter.
    total_scans_30d: int
    total_scans_prev_30d: int
    active_cafes: int
    total_cafes: int
    per_cafe_30d: list[CafeScans]
    renews_at: datetime | None = None


# Platform-wide KPIs for the Super Admin Dashboard's Overview tab. Distinct
# from MetricsResponse above (which is brand-scoped for the B2B merchant
# dashboard) — these counts span every tenant on the platform.
class AdminOverviewResponse(BaseModel):
    total_customers: int
    total_cafes: int
    total_stamps_issued: int
    total_rewards_redeemed: int


# One row of the super-admin Cafes table. Flattens the cafe+brand join so
# the frontend doesn't have to reconstruct the relationship client-side.
# `scheme_type` drives the Plan Type pill (global→LCP+, private→Private);
# `subscription_status` drives the Status pill colour.
class AdminPlatformCafeResponse(BaseModel):
    id: UUID
    name: str
    address: str
    brand_id: UUID
    brand_name: str
    scheme_type: SchemeType
    # Brand-level Stripe subscription status. Historically the only status
    # the Cafes tab showed.
    subscription_status: SubscriptionStatus
    # Cafe-level billing state (migration 0012). Separate from the brand's
    # Stripe status — this is what the super-admin flips to cancel a
    # single location. Drives the "Pending Cancellation" + "Canceled"
    # pills on the Cafes tab.
    billing_status: SubscriptionStatus
    created_at: datetime


# One row of the super-admin Transactions table. Flat shape (stamp_ledger
# joined with users + cafes + brands) so the frontend can render without
# re-joining client-side. `event_type` drives the Earn/Redeem pill colour,
# `scheme_type` drives the LCP+/Private pill.
class AdminTransactionResponse(BaseModel):
    id: UUID
    created_at: datetime
    event_type: str  # 'EARN' | 'REDEEM'  (value of LedgerEventType enum)
    stamp_delta: int
    customer_id: UUID
    customer_till_code: str
    customer_email: str | None
    cafe_id: UUID
    cafe_name: str
    brand_id: UUID
    brand_name: str
    scheme_type: SchemeType


# One row of the super-admin Customers table. `global_stamps` and
# `total_private_stamps` are net sums of stamp_ledger.stamp_delta scoped to
# brands of that scheme_type — so a REDEEM (-10) offsets ten EARNs (+1) and
# the number reads as "current balance in that scheme bucket" rather than
# lifetime throughput. Both can legitimately be 0 for a newly-signed-up
# user who hasn't been scanned yet.
class AdminCustomerResponse(BaseModel):
    id: UUID
    till_code: str
    email: str | None
    created_at: datetime
    global_stamps: int
    total_private_stamps: int
    is_suspended: bool
    # Server-derived velocity flag — true when this customer earned
    # SUSPICIOUS_STAMPS_PER_HOUR or more EARN ledger rows in the last
    # rolling hour. Surfaces a "Suspicious" pill in the Customers table
    # so admins can spot a barista (or fraudster) machine-gunning stamps
    # at a single till.
    is_suspicious: bool = False


# Mismatched-IP attempt or admin reset for a single cafe. Powers the
# Super Admin's Flagged Activities widget + the Security & Network
# section of the Edit Cafe modal.
class AdminFlaggedActivityResponse(BaseModel):
    id: UUID
    cafe_id: UUID
    cafe_name: str
    brand_id: UUID
    brand_name: str
    attempted_ip: str
    expected_ip: str | None
    attempted_at: datetime


# Per-cafe security dossier. `last_known_ip` + `network_locked_at` are
# the pinned IP + the timestamp the lock was set. `recent_attempts`
# carries the last few mismatched-IP rows so the admin can decide
# whether to reset.
class AdminCafeSecurityResponse(BaseModel):
    cafe_id: UUID
    last_known_ip: str | None
    network_locked_at: datetime | None
    recent_attempts: list[AdminFlaggedActivityResponse]


# POST body for the Super Admin's manual override modal. Both fields are
# optional — sending only one mutates that single field. `scheme_type`
# is brand-wide (mutates `brands.scheme_type` since every cafe under the
# brand shares the same plan); `billing_status` is cafe-scoped.
class AdminCafeUpdateRequest(BaseModel):
    scheme_type: SchemeType | None = None
    billing_status: SubscriptionStatus | None = None


# PATCH body for the Customers tab's Suspend toggle. Idempotent on purpose
# — the frontend always sends the *intended* new state, which means a
# double-click replays the same value instead of flipping back and forth.
class SuspendCustomerRequest(BaseModel):
    is_suspended: bool


# POST body for a manual ledger correction from the Customers tab.
#
# `amount` is signed: positive = admin crediting the user (EARNs), negative
# = admin clawing back (REDEEMs). The stamp_ledger CHECK constraint fixes
# each row at +1 (EARN) or -10 (REDEEM), so the endpoint fans out:
#   amount=+5   → five EARN rows
#   amount=-10  → one REDEEM row
#   amount=-5   → rejected (422) — REDEEM cannot be partial.
# `brand_id` is required for private-scheme adjustments; for global it's
# ignored and the server picks any global brand's cafe.
class AdjustStampsRequest(BaseModel):
    scheme_type: SchemeType
    brand_id: UUID | None = None
    amount: int


# One row of the super-admin Billing tab. Flat shape, like the other
# AdminPlatform* responses. `monthly_rate_pence` is an MVP mock driven by
# scheme_type — it doesn't reflect the real per-brand Stripe quantity
# pricing. When the real billing data catches up this field becomes
# either the invoice line total or the Stripe subscription item amount.
class AdminBillingRow(BaseModel):
    cafe_id: UUID
    cafe_name: str
    brand_id: UUID
    brand_name: str
    scheme_type: SchemeType
    billing_status: SubscriptionStatus
    monthly_rate_pence: int


# Aggregate + rows for the Billing tab in a single response. Keeping MRR
# server-computed so the frontend never has to know the rate card; the
# pricing table lives in one place (main.py) and can move to the DB
# later without an API break.
class AdminBillingResponse(BaseModel):
    total_mrr_pence: int
    active_subscription_count: int
    rows: list[AdminBillingRow]


class UpdateCafeBillingStatusRequest(BaseModel):
    status: SubscriptionStatus


# Cafe ROI dossier for the super-admin Cafes drill-down. `stamps_issued`
# and `rewards_redeemed` are raw ledger counts scoped to the requested
# date window. `net_roi_pence` is the mock monetary delta — each stamp
# proxies a paid drink, each redemption proxies a free drink. The drink
# value is a platform-wide mock constant (see ASSUMED_DRINK_PENCE in
# main.py). Swap for real per-cafe average ticket when that data lands.
class CafeStatsResponse(BaseModel):
    cafe_id: UUID
    cafe_name: str
    range: str
    range_start: datetime | None
    range_end: datetime
    stamps_issued: int
    rewards_redeemed: int
    net_roi_pence: int


# POST body for the super-admin AI chat widget. One-shot for now — no
# conversation history (the frontend can echo prior turns into `message`
# when we need context). Keeping the shape simple buys us freedom to
# swap the backend implementation (rule-based → LLM → SQL-agent) without
# touching the wire protocol.
class AiAgentRequest(BaseModel):
    message: str


class AiAgentResponse(BaseModel):
    reply: str


# POST body for manually creating a new brand from the super-admin
# dashboard. Skips the usual Stripe-Checkout-on-signup flow — brand
# lands with `subscription_status='incomplete'` and no password_hash,
# so the brand owner can't log in until the password is set via another
# path. That's intentional: this route is an admin override for
# provisioning, not a replacement for self-service onboarding.
class AdminCreateBrandRequest(BaseModel):
    name: str
    scheme_type: SchemeType
    contact_email: str
    # Admin name optionally captured by the consolidated "Add New Brand"
    # modal — split client-side into first/last words. Persisted to the
    # brand's KYC fields so the owner sees their name pre-filled when they
    # land in the dashboard. Both fields are optional; the UI may not
    # capture a name at all (e.g. for existing CSV imports).
    owner_first_name: str | None = None
    owner_last_name: str | None = None


# POST body for adding a cafe to an existing brand via the super-admin
# dashboard. `store_number` auto-generated server-side when omitted —
# six A-Z0-9 chars, unique across the cafes table (matches the existing
# `store_number_format` CHECK regex ^[A-Z0-9]{3,10}$).
class AdminCreateCafeRequest(BaseModel):
    brand_id: UUID
    name: str
    address: str
    store_number: str | None = None


class CafeProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    brand_id: UUID
    name: str
    slug: str
    address: str
    store_number: str | None = None


class AdminSession(BaseModel):
    brand_id: UUID
    email: str
    brand_name: str


class AdminLoginResponse(BaseModel):
    token: str
    admin: AdminProfile
    brand: BrandProfile


class StoreLoginResponse(BaseModel):
    token: str
    venue_api_key: str
    store_number: str
    cafe: CafeProfile
    brand: BrandProfile


# -----------------------------------------------------------------------------
# Consumer App (Phase 4) — email + 4-digit OTP passwordless auth
# -----------------------------------------------------------------------------


class ConsumerRequestOTP(BaseModel):
    # Sign-up: first_name + last_name + email. Log-in: email only.
    # If first_name / last_name are present and the email is unknown, a new
    # consumer is created on the spot. If the email already exists, the names
    # (if provided) are IGNORED — log-in wins, to avoid a signup form that
    # silently clobbers a returning consumer's name.
    email: str = Field(min_length=3, max_length=254)
    first_name: str | None = Field(default=None, min_length=1, max_length=60)
    last_name: str | None = Field(default=None, min_length=1, max_length=60)


class ConsumerRequestOTPResponse(BaseModel):
    ok: bool = True
    # Only populated when the email prints-to-terminal dev path fired,
    # so the client can display the code in a debug overlay if it chooses.
    # In production this MUST stay None — it would defeat the point of OTP.
    debug_code: str | None = None


class ConsumerVerifyOTP(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class ConsumerProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    consumer_id: str  # mirrors User.till_code
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None


class ConsumerAuthResponse(BaseModel):
    token: str
    consumer: ConsumerProfile


# Consumer-app Profile-tab Edit Name flow. Both fields optional so the
# client can send just one if the user only edits half the name. A blank
# string clears the field; anything else is trimmed + capped at 60 chars.
class ConsumerProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=60)
    last_name: str | None = Field(default=None, max_length=60)


class LatestEarnPayload(BaseModel):
    transaction_id: UUID
    # cafe_id added 2026-05-02 so the consumer-app's RewardModal can
    # render a Pay-It-Forward "Donate to Community" CTA right next to
    # Redeem when the earn happened at a cafe with the toggle on.
    # Without it, the celebration would have to round-trip through
    # /api/consumer/cafes to figure out donate eligibility.
    cafe_id: UUID
    cafe_name: str
    cafe_address: str
    suspended_coffee_enabled: bool = False
    stamps_earned: int
    free_drink_unlocked: bool
    timestamp: datetime


class WalletBalanceBlock(BaseModel):
    """One pool of stamps. Under the 2026-04-21 banking model the three
    values can always be derived from stamp_balance, but we pre-compute
    current_stamps + banked_rewards server-side so every client renders
    the same X/10 split instead of re-doing the modular math."""
    stamp_balance: int
    current_stamps: int
    banked_rewards: int


class WalletPrivateBrandBalance(WalletBalanceBlock):
    brand_id: UUID
    brand_name: str


class ConsumerWalletResponse(BaseModel):
    # Constant 10 today; promoted to a field so a future per-brand threshold
    # (e.g. "buy 8 get the 9th free") doesn't force a schema break.
    threshold: int
    # Pooled across every global-scheme brand. Always present (zero balance
    # for a fresh consumer).
    global_balance: WalletBalanceBlock
    # One entry per private-scheme brand the consumer has *any* activity at.
    # Empty list if the consumer only earns at LCP+ cafes — the mobile
    # "My Brand Cards" section renders its empty state in that case.
    private_balances: list[WalletPrivateBrandBalance] = Field(default_factory=list)
    # Same semantics as ConsumerBalanceResponse.latest_earn — last EARNED
    # global_ledger row, used by the mobile RewardModal delta detection.
    latest_earn: LatestEarnPayload | None = None


class ConsumerBalanceResponse(BaseModel):
    consumer_id: str
    # Total scoped balance (can be >= threshold — Mixed-Basket POS no longer
    # auto-rolls rewards; they bank until explicitly redeemed). Preserved as
    # a backcompat field; new clients should prefer current_stamps +
    # banked_rewards below.
    stamp_balance: int
    threshold: int
    # Derived: current_stamps = stamp_balance % threshold
    #          banked_rewards = stamp_balance // threshold
    # Computed server-side so the app doesn't have to do the modular math
    # and can't accidentally show "17/10" when balance accumulates past 10.
    current_stamps: int = 0
    banked_rewards: int = 0
    # Set to the most recent EARNED global_ledger row for this consumer, or
    # None if they've never been stamped. The mobile app diffs
    # `latest_earn.transaction_id` across polls and fires the reward modal
    # when it changes. NOTE (2026-04-21 banking pivot): `free_drink_unlocked`
    # is now false on plain stamp scans — only fires when an explicit redeem
    # happens in the same scan. A `latest_redeem` field for the new
    # celebration trigger is a follow-up.
    latest_earn: LatestEarnPayload | None = None


class ConsumerHistoryEntry(BaseModel):
    # One row per GlobalLedger transaction (not per StampLedger stamp).
    # `kind` is derived from GlobalLedgerAction at handler time so the client
    # doesn't have to know the enum's string form ("EARNED" / "REDEEMED").
    transaction_id: UUID
    kind: Literal["earn", "redeem"]
    quantity: int
    cafe_name: str
    cafe_address: str
    timestamp: datetime


# -----------------------------------------------------------------------------
# B2B Scan — Hub & Spoke POS endpoint with auto-rollover + Shadow Ledger
# -----------------------------------------------------------------------------


class B2BScanRequest(BaseModel):
    consumer_id: str = Field(pattern=r"^[A-Z0-9]{6}$")
    venue_id: UUID
    quantity: int = Field(ge=1, le=20)


class B2BScanResponse(BaseModel):
    consumer_id: str
    venue_id: UUID
    stamps_earned: int
    free_drinks_unlocked: int
    new_balance: int
    earned_transaction_id: UUID
    redeemed_transaction_id: UUID | None = None


# -----------------------------------------------------------------------------
# Offers (promotions) — brand-scoped windows, mirrored from b2b-dashboard
# -----------------------------------------------------------------------------


OfferTypeLiteral = Literal["percent", "fixed", "bogo", "double_stamps", "custom"]
OfferTargetLiteral = Literal[
    "any_drink", "all_pastries", "food", "merchandise", "entire_order"
]

# Caps the bespoke promo copy an owner can write for an offer_type='custom'
# offer. 280 mirrors a tweet-length boundary that fits cleanly on a phone
# offer card without truncation. See PRD §4.3 for the UX rationale.
CUSTOM_OFFER_TEXT_MAX = 280


def _validate_offer_payload(
    offer_type: str,
    target: str,
    amount: Decimal | None,
    starts_at: datetime,
    ends_at: datetime,
    custom_text: str | None = None,
) -> None:
    if offer_type not in OFFER_TYPES:
        raise ValueError(f"Unknown offer type '{offer_type}'.")
    if target not in OFFER_TARGETS:
        raise ValueError(f"Unknown offer target '{target}'.")

    if offer_type == "custom":
        # Free-text body is the entire content of a custom offer. The
        # target/amount fields are accepted (the frontend may send
        # placeholder values) but ignored at the persistence layer —
        # the route handler clears them before INSERT.
        text_norm = (custom_text or "").strip()
        if not text_norm:
            raise ValueError(
                "Custom offers require non-empty custom_text."
            )
        if len(text_norm) > CUSTOM_OFFER_TEXT_MAX:
            raise ValueError(
                f"custom_text is limited to {CUSTOM_OFFER_TEXT_MAX} characters."
            )
    elif offer_type in ("percent", "fixed"):
        if amount is None or amount <= 0:
            raise ValueError("This offer type requires a positive amount.")
        if offer_type == "percent" and amount > 100:
            raise ValueError("Percent offers can't exceed 100%.")
    elif amount is not None:
        raise ValueError(
            "Bogo / double_stamps offers must not carry an amount."
        )

    if ends_at <= starts_at:
        raise ValueError("ends_at must be strictly after starts_at.")


class OfferCreate(BaseModel):
    offer_type: OfferTypeLiteral
    target: OfferTargetLiteral
    amount: Decimal | None = None
    starts_at: datetime
    ends_at: datetime
    # None (or omitted) = applies to all brand cafes. A concrete list scopes
    # the offer to those cafe ids only. Empty list is normalized to None by
    # the route handler so "specific locations with none selected" can't
    # silently create an invisible offer.
    target_cafe_ids: list[UUID] | None = None
    # For offer_type='custom', this is the bespoke promo copy (required,
    # max 280 chars). For other offer types this field is ignored — the
    # route handler clears it before INSERT.
    custom_text: str | None = Field(default=None, max_length=CUSTOM_OFFER_TEXT_MAX)

    @model_validator(mode="after")
    def _check(self) -> "OfferCreate":
        _validate_offer_payload(
            self.offer_type, self.target, self.amount, self.starts_at, self.ends_at,
            custom_text=self.custom_text,
        )
        return self


class OfferUpdate(BaseModel):
    offer_type: OfferTypeLiteral
    target: OfferTargetLiteral
    amount: Decimal | None = None
    starts_at: datetime
    ends_at: datetime
    target_cafe_ids: list[UUID] | None = None
    custom_text: str | None = Field(default=None, max_length=CUSTOM_OFFER_TEXT_MAX)

    @model_validator(mode="after")
    def _check(self) -> "OfferUpdate":
        _validate_offer_payload(
            self.offer_type, self.target, self.amount, self.starts_at, self.ends_at,
            custom_text=self.custom_text,
        )
        return self


class OfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    brand_id: UUID
    offer_type: str
    target: str
    amount: Decimal | None
    starts_at: datetime
    ends_at: datetime
    target_cafe_ids: list[UUID] | None = None
    # Populated for offer_type='custom', NULL for other types.
    custom_text: str | None = None
    created_at: datetime


# -----------------------------------------------------------------------------
# Consumer Discover — cafes with amenities + currently-live offers
# -----------------------------------------------------------------------------


class ConsumerOfferPayload(BaseModel):
    id: UUID
    offer_type: str
    target: str
    amount: Decimal | None
    starts_at: datetime
    ends_at: datetime
    # Populated when offer_type='custom' (the b2b owner's free-text copy).
    # The consumer-app's DiscoverOfferRow renders this verbatim instead of
    # the structured "X% off Y" template used for non-custom offers.
    custom_text: str | None = None


class ConsumerCafePayload(BaseModel):
    id: UUID
    name: str
    address: str
    phone: str | None = None
    food_hygiene_rating: FoodHygieneRating = "Awaiting Inspection"
    amenities: list[str] = Field(default_factory=list)
    live_offers: list[ConsumerOfferPayload] = Field(default_factory=list)
    # Wallet / Discover additions. `is_lcp_plus` is derived server-side from
    # the parent brand's scheme_type ('global' → true, 'private' → false).
    # `distance_miles` is populated only when the consumer supplies lat/lng
    # to GET /api/consumer/cafes — null otherwise, and also null for cafes
    # whose coords haven't been captured yet.
    is_lcp_plus: bool = False
    latitude: float | None = None
    longitude: float | None = None
    distance_miles: float | None = None
    # Pay It Forward / Suspended Coffee participation (PRD §4.5). Populated
    # server-side from the cafe's row + a SUM over suspended_coffee_ledger.
    # `suspended_coffee_enabled` drives the "Community Board" badge on the
    # consumer-app's Explore card; `suspended_coffee_pool` is the current
    # drink-unit count surfaced inside CafeDetailsModal.
    suspended_coffee_enabled: bool = False
    suspended_coffee_pool: int = 0


# -----------------------------------------------------------------------------
# B2B Cancellation Feedback (PRD §4.2, migration 0019)
# -----------------------------------------------------------------------------


CancellationReasonLiteral = Literal[
    "free_drink_cost",
    "barista_friction",
    "price_too_high",
    "low_volume",
    "feature_gap",
    "closing_business",
    "other",
]


# Caps the free-text "tell us more" body. Modest ceiling so the survey
# stays scannable and the row stays cheap to index. Mirrors the b2b
# dashboard's CancellationFeedbackModal max-length.
CANCELLATION_DETAILS_MAX = 500


class CancellationFeedbackCreate(BaseModel):
    """Body of POST /api/b2b/cancellation-feedback. Validates that:
      - reason is one of the seven allowed values (Pydantic Literal)
      - if reason='other', details is required (non-empty after strip)
      - acknowledged is True (the user confirmed the grace-window policy)
    Brand id comes from the admin JWT, not the request body."""

    reason: CancellationReasonLiteral
    details: str | None = Field(default=None, max_length=CANCELLATION_DETAILS_MAX)
    acknowledged: bool

    @model_validator(mode="after")
    def _check(self) -> "CancellationFeedbackCreate":
        if self.reason == "other":
            details_norm = (self.details or "").strip()
            if not details_norm:
                raise ValueError(
                    "When reason='other', details must be a non-empty description."
                )
        if not self.acknowledged:
            raise ValueError(
                "You must acknowledge the cancel-at-period-end grace policy "
                "before continuing to the Stripe portal."
            )
        return self


class CancellationFeedbackResponse(BaseModel):
    """Returned by POST /api/b2b/cancellation-feedback so the b2b dashboard
    can correlate the survey row with the subsequent Stripe portal hand-off
    (the dashboard then redirects the user to the portal)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    brand_id: UUID
    reason: str
    details: str | None
    acknowledged: bool
    created_at: datetime


# -----------------------------------------------------------------------------
# B2B Product Feedback (Settings → Provide Feedback)
# -----------------------------------------------------------------------------


# Cap the free-text body so the email + log entry stay tractable. Picked
# generously — long-form ideas/bug reports fit, but a runaway paste won't
# DoS the operator inbox.
PRODUCT_FEEDBACK_MAX = 4000


class ProductFeedbackCreate(BaseModel):
    """Body of POST /api/b2b/feedback. Brand id + contact email come
    from the admin JWT — the request body only carries the message."""

    message: str = Field(min_length=1, max_length=PRODUCT_FEEDBACK_MAX)


class ProductFeedbackResponse(BaseModel):
    """Returned on success. We don't persist this in the DB (yet) — it
    fans out to email + structured log only — so the response is just an
    ack with a server-side timestamp the dashboard can show in a toast."""

    ok: bool
    received_at: datetime


# -----------------------------------------------------------------------------
# Pay It Forward / Suspended Coffee (PRD §4.5, migration 0020)
# -----------------------------------------------------------------------------


# Per-scan cap on Mode 2 (paid-at-till) donation count. Keeps the workflow
# tappable at the POS without letting an over-eager double-tap inflate the
# pool by hundreds. PRD §4.5.7.
SUSPENDED_COFFEE_TILL_PER_SCAN_MAX = 10


class CommunityPoolStatus(BaseModel):
    """Returned by GET /api/b2b/suspended-coffee/pool. The Barista POS polls
    this on mount + after every donate/serve action so the visible counter
    stays fresh.

    `pool_balance` is computed at read time as
        SUM(units_delta) WHERE cafe_id = $1
    over the suspended_coffee_ledger. NEVER persisted as a column — the
    ledger is the source of truth (PRD §4.5.3 floor rule).
    """

    cafe_id: UUID
    enabled: bool
    pool_balance: int = Field(ge=0)


class DonateLoyaltyRequest(BaseModel):
    """Body of POST /api/consumer/suspended-coffee/donate-loyalty.

    Three call shapes (in priority order — the handler picks the first
    that resolves to a valid cafe):

      1. `cafe_id` set explicitly. Used by the LCP+ "Choose another
         cafe" combobox where the user picks a destination cafe by
         hand. The cafe must be participating in Pay It Forward.

      2. `cafe_id` null + `scope='private'` + `brand_id` set. Auto-
         routes to the user's most recent EARN at that brand (the
         "last stamp" / 1-tap private donate flow). Cafe must be
         participating; if their last visit isn't, the request is
         rejected with 409 so the UI can prompt the user to pick a
         different one.

      3. `cafe_id` null + `scope='global'`. Auto-routes to the user's
         most recent EARN at any LCP+-network (scheme_type='global')
         cafe.

    The consumer must hold ≥ 1 banked reward (floor(stamps / 10) ≥ 1)
    for the SAME brand the destination cafe belongs to — the handler
    enforces this in a transaction with SELECT … FOR UPDATE on the
    user row.
    """

    cafe_id: UUID | None = None
    # 'private' or 'global'. Required when cafe_id is omitted; ignored
    # when cafe_id is supplied (the scope is implied by the cafe row).
    scope: Literal["private", "global"] | None = None
    # Required when scope='private' and cafe_id is omitted. Used to
    # filter the auto-resolve query down to the brand the consumer
    # tapped Donate from.
    brand_id: UUID | None = None

    @model_validator(mode="after")
    def _check(self) -> "DonateLoyaltyRequest":
        if self.cafe_id is None:
            if self.scope is None:
                raise ValueError(
                    "scope is required when cafe_id is omitted "
                    "('private' or 'global')."
                )
            if self.scope == "private" and self.brand_id is None:
                raise ValueError(
                    "brand_id is required when scope='private' and "
                    "cafe_id is omitted."
                )
        return self


class DonateTillRequest(BaseModel):
    """Body of POST /api/b2b/suspended-coffee/donate-till. The barista
    can record up to 10 till-paid donations per scan (single Confirm).
    Cafe id comes from the Venue-API-Key header, not the body."""

    count: int = Field(ge=1, le=SUSPENDED_COFFEE_TILL_PER_SCAN_MAX)


class SuspendedCoffeeMutationResponse(BaseModel):
    """Shared response shape for the three pool-mutation endpoints
    (donate-loyalty / donate-till / serve). Always returns the post-write
    pool balance so the client can update its UI without a follow-up GET.
    """

    ok: bool = True
    new_pool_balance: int = Field(ge=0)


# ────────────────────────────────────────────────────────────────────
# Super-Admin Stripe invoice surfacing — supports the dispute-resolution
# accordion in admin-dashboard. We thinly wrap stripe.Invoice payloads
# so the frontend doesn't need its own Stripe SDK and so we can keep
# the response shape stable across Stripe API version bumps.
# ────────────────────────────────────────────────────────────────────


class BrandInvoiceLine(BaseModel):
    """One row of `invoice.lines.data` — what the owner sees broken out
    on their invoice. `proration=True` flags the prorated charges that
    sync_subscription_quantity creates when a brand adds/removes a cafe
    mid-cycle (Batch 2 #2)."""

    description: str | None = None
    amount_pence: int
    currency: str
    proration: bool = False
    quantity: int | None = None
    period_start: datetime | None = None
    period_end: datetime | None = None


class BrandInvoice(BaseModel):
    id: str
    number: str | None = None
    # Stripe enum: paid / open / void / draft / uncollectible
    status: str
    amount_paid_pence: int
    amount_due_pence: int
    total_pence: int
    currency: str
    created_at: datetime
    period_start: datetime | None = None
    period_end: datetime | None = None
    hosted_invoice_url: str | None = None
    invoice_pdf: str | None = None
    lines: list[BrandInvoiceLine]


class BrandInvoicesResponse(BaseModel):
    brand_id: UUID
    brand_name: str
    # NULL when the brand has never gone through Stripe Checkout — the
    # frontend renders an empty-state instead of an error in that case.
    stripe_customer_id: str | None
    invoices: list[BrandInvoice]
