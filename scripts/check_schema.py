"""Diff current DB schema vs expected columns for recently-added models.

Read-only — safe to run repeatedly. Prints per-table status and exits 0 if
every expected column is present, 1 otherwise.
"""

from __future__ import annotations

import asyncio

import asyncpg

from app.database import settings


EXPECTED: dict[str, set[str]] = {
    # Columns the Consumer App + B2B Dashboard now depend on. Not exhaustive —
    # just the ones that could drift since models/schemas were updated.
    "cafes": {
        "id", "brand_id", "name", "slug", "address", "contact_email",
        "store_number", "pin_hash", "amenities", "created_at",
    },
    "offers": {
        "id", "brand_id", "offer_type", "target", "amount",
        "starts_at", "ends_at", "created_at",
    },
    "global_ledger": {
        "transaction_id", "consumer_id", "venue_id", "action_type",
        "quantity", "timestamp",
    },
    "users": {
        "id", "till_code",  # till_code is the consumer_id shown in QR / printed
    },
}


def _dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def main() -> int:
    conn = await asyncpg.connect(_dsn(settings.database_url))
    try:
        ok = True
        for table, expected in EXPECTED.items():
            rows = await conn.fetch(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1
                """,
                table,
            )
            actual = {r["column_name"] for r in rows}
            missing = expected - actual
            extra = actual - expected  # informational only
            if not actual:
                print(f"[FAIL] table '{table}' does not exist")
                ok = False
                continue
            if missing:
                print(f"[FAIL] {table}: missing {sorted(missing)}")
                ok = False
            else:
                print(f"[ OK ] {table}: all expected columns present")
            if extra:
                print(f"       {table}: extra columns (informational) = {sorted(extra)}")
        return 0 if ok else 1
    finally:
        await conn.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
