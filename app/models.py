import enum
import uuid
from datetime import datetime

from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CHAR,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, ENUM as PgEnum, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LedgerEventType(str, enum.Enum):
    EARN = "EARN"
    REDEEM = "REDEEM"


class GlobalLedgerAction(str, enum.Enum):
    EARNED = "earned"
    REDEEMED = "redeemed"


class SubscriptionStatus(str, enum.Enum):
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    INCOMPLETE = "incomplete"
    # Added 2026-04-23 (migration 0013). A cafe whose admin has clicked
    # "Cancel plan" but whose current billing cycle hasn't ended yet —
    # still paying, still live on the consumer app. Only transitions to
    # CANCELED at period-end (sweeper job, TBD).
    PENDING_CANCELLATION = "pending_cancellation"


class SchemeType(str, enum.Enum):
    GLOBAL = "global"
    PRIVATE = "private"


ledger_event_type_enum = PgEnum(
    LedgerEventType,
    name="ledger_event_type",
    values_callable=lambda e: [m.value for m in e],
    create_type=False,
)

subscription_status_enum = PgEnum(
    SubscriptionStatus,
    name="subscription_status",
    values_callable=lambda e: [m.value for m in e],
    create_type=False,
)

scheme_type_enum = PgEnum(
    SchemeType,
    name="scheme_type",
    values_callable=lambda e: [m.value for m in e],
    create_type=False,
)

global_ledger_action_enum = PgEnum(
    GlobalLedgerAction,
    name="global_ledger_action",
    values_callable=lambda e: [m.value for m in e],
    create_type=False,
)


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    # Unique index enforced by migration 0014. Login routes look up the
    # brand by email; duplicates would make admin_login ambiguous.
    contact_email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    scheme_type: Mapped[SchemeType] = mapped_column(
        scheme_type_enum,
        nullable=False,
        server_default=text("'global'"),
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(Text, unique=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(Text, unique=True)
    subscription_status: Mapped[SubscriptionStatus] = mapped_column(
        subscription_status_enum,
        nullable=False,
        server_default=text("'incomplete'"),
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True)
    )
    password_hash: Mapped[str | None] = mapped_column(Text)
    # KYC / Stripe-compliance fields (migration 0009). All nullable — existing
    # rows pre-date KYC collection; the admin fills these in at their own pace
    # from Settings → Owner Details / Legal & Compliance.
    owner_first_name: Mapped[str | None] = mapped_column(Text)
    owner_last_name: Mapped[str | None] = mapped_column(Text)
    owner_phone: Mapped[str | None] = mapped_column(Text)
    company_legal_name: Mapped[str | None] = mapped_column(Text)
    company_address: Mapped[str | None] = mapped_column(Text)
    company_registration_number: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        Index("idx_brands_subscription_status", "subscription_status"),
        Index("idx_brands_scheme_type", "scheme_type"),
    )


class Cafe(Base):
    __tablename__ = "cafes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    brand_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    contact_email: Mapped[str] = mapped_column(Text, nullable=False)
    store_number: Mapped[str | None] = mapped_column(Text, unique=True)
    pin_hash: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    # UK FSA rating. "Awaiting Inspection" is the pre-audit default and is a
    # first-class value (not a sentinel). The DB CHECK constraint + the
    # pydantic Literal in schemas.py keep the two sides in sync.
    food_hygiene_rating: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'Awaiting Inspection'"),
    )
    # Stable AmenityId strings (see b2b-dashboard/src/lib/amenities.ts). The
    # valid set is enforced at the API boundary, not in the DB, so evolving
    # the catalog doesn't require a schema migration.
    amenities: Mapped[list[str]] = mapped_column(
        ARRAY(Text),
        nullable=False,
        server_default=text("'{}'::text[]"),
    )
    # WGS-84 degrees. Nullable so cafes can exist before a back-office lookup
    # geocodes them; Discover sorts cafes with missing coords to the end.
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    # IP / network lock for the till login. `last_known_ip` is the pinned
    # source the cafe is allowed to log in from; `network_locked_at` is the
    # timestamp that lock was established. A login from a different IP
    # before the 30-day cooldown elapses → 403. Both null = open (no lock,
    # accept any IP and pin on first successful login). See migration 0015.
    last_known_ip: Mapped[str | None] = mapped_column(Text)
    network_locked_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True)
    )
    # Per-cafe billing status, separate from brand-level Stripe state. The
    # super-admin Billing tab uses this to cancel a single location without
    # mutating the brand's real subscription. See migration 0012.
    billing_status: Mapped[SubscriptionStatus] = mapped_column(
        subscription_status_enum,
        nullable=False,
        server_default=text("'active'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        Index("idx_cafes_brand_id", "brand_id"),
        CheckConstraint(
            r"store_number IS NULL OR store_number ~ '^[A-Z0-9]{3,10}$'",
            name="store_number_format",
        ),
    )


class NetworkLockEvent(Base):
    """Append-only audit trail of mismatched-IP login attempts + admin
    resets, per cafe. Powers the Super Admin's Flagged Activities widget
    and the Security & Network section of the Edit Cafe modal. See
    migration 0015 for schema."""

    __tablename__ = "network_lock_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    cafe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cafes.id", ondelete="CASCADE"),
        nullable=False,
    )
    # 'mismatch' for blocked logins, 'reset' for super-admin clears.
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    attempted_ip: Mapped[str] = mapped_column(Text, nullable=False)
    expected_ip: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        Index(
            "idx_network_lock_events_cafe_id_created_at",
            "cafe_id",
            "created_at",
        ),
        CheckConstraint(
            "kind IN ('mismatch', 'reset')",
            name="network_lock_event_kind",
        ),
    )


class SuperAdmin(Base):
    """Platform-level staff account — distinct from `brands` (brand-owner
    login) and `cafes` (store-PIN login). A super admin can act across
    every tenant via the /api/admin/platform/* surface and the
    admin-dashboard. Auth is a JWT with aud="super-admin"; see
    app/tokens.py::encode_super_admin and the guard in app/auth.py.

    Seeded by scripts/seed_local_dev.py with admin@localcoffeeperks.com /
    password123 for local dev. See migration 0017."""

    __tablename__ = "super_admins"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        Index("idx_super_admins_email_lower", text("lower(email)")),
    )


class PasswordResetToken(Base):
    """Single-use bcrypt-hashed reset token for the brand-admin
    "Forgot password" flow. TTL is enforced at the endpoint layer; the
    DB just stores expiry + used_at so a token can't be replayed once
    consumed. See migration 0016."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    brand_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        Index(
            "idx_password_reset_tokens_brand_id_created_at",
            "brand_id",
            "created_at",
        ),
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    till_code: Mapped[str] = mapped_column(CHAR(6), nullable=False, unique=True)
    barcode: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(Text, unique=True)
    display_name: Mapped[str | None] = mapped_column(Text)
    first_name: Mapped[str | None] = mapped_column(Text)
    last_name: Mapped[str | None] = mapped_column(Text)
    is_suspended: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        CheckConstraint(r"till_code ~ '^[A-Z0-9]{6}$'", name="till_code_format"),
    )


class ConsumerOTP(Base):
    __tablename__ = "consumer_otps"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    code_hash: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    used_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class Barista(Base):
    __tablename__ = "baristas"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    cafe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cafes.id", ondelete="CASCADE"),
        nullable=False,
    )
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        UniqueConstraint("cafe_id", "email", name="baristas_cafe_id_email_key"),
        Index("idx_baristas_cafe_id", "cafe_id"),
    )


class StampLedger(Base):
    __tablename__ = "stamp_ledger"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    cafe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cafes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    barista_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("baristas.id", ondelete="SET NULL"),
    )
    event_type: Mapped[LedgerEventType] = mapped_column(
        ledger_event_type_enum, nullable=False
    )
    stamp_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        CheckConstraint(
            "(event_type = 'EARN' AND stamp_delta = 1) "
            "OR (event_type = 'REDEEM' AND stamp_delta = -10)",
            name="ledger_delta_matches_event",
        ),
        Index(
            "idx_ledger_customer_created",
            "customer_id",
            text("created_at DESC"),
        ),
        Index(
            "idx_ledger_cafe_created",
            "cafe_id",
            text("created_at DESC"),
        ),
    )


class GlobalLedger(Base):
    __tablename__ = "global_ledger"

    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    consumer_id: Mapped[str] = mapped_column(
        CHAR(6),
        ForeignKey("users.till_code", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    venue_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cafes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    action_type: Mapped[GlobalLedgerAction] = mapped_column(
        global_ledger_action_enum, nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        "timestamp",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        CheckConstraint("quantity >= 1", name="global_ledger_quantity_positive"),
        CheckConstraint(
            r"consumer_id ~ '^[A-Z0-9]{6}$'",
            name="global_ledger_consumer_id_format",
        ),
        Index(
            "idx_global_ledger_consumer_ts",
            "consumer_id",
            text('"timestamp" DESC'),
        ),
        Index(
            "idx_global_ledger_venue_ts",
            "venue_id",
            text('"timestamp" DESC'),
        ),
        Index("idx_global_ledger_ts", text('"timestamp" DESC')),
    )


# Valid offer_type / target values — kept in sync with the DB CHECK constraints
# in migrations/0005 and with b2b-dashboard/src/lib/offers.ts. The API layer
# (schemas.py) treats these as the authoritative allow-list.
OFFER_TYPES = ("percent", "fixed", "bogo", "double_stamps")
OFFER_TARGETS = ("any_drink", "all_pastries", "food", "merchandise", "entire_order")


class Offer(Base):
    __tablename__ = "offers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    brand_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("brands.id", ondelete="CASCADE"),
        nullable=False,
    )
    offer_type: Mapped[str] = mapped_column(Text, nullable=False)
    target: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    starts_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    ends_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    # NULL = applies to all brand cafes (default / existing behavior).
    # Non-NULL list = only those specific cafe ids see the offer.
    target_cafe_ids: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(UUID(as_uuid=True)),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        Index("idx_offers_brand_window", "brand_id", "starts_at", "ends_at"),
        Index("idx_offers_live_window", "starts_at", "ends_at"),
    )
