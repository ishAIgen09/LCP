import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CHAR,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LedgerEventType(str, enum.Enum):
    EARN = "EARN"
    REDEEM = "REDEEM"


class SubscriptionStatus(str, enum.Enum):
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    INCOMPLETE = "incomplete"


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


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    contact_email: Mapped[str] = mapped_column(Text, nullable=False)
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
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        Index("idx_cafes_brand_id", "brand_id"),
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
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    __table_args__ = (
        CheckConstraint(r"till_code ~ '^[A-Z0-9]{6}$'", name="till_code_format"),
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
