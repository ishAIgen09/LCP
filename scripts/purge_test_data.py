"""Purge all test data EXCEPT the brand whose contact_email matches a
target address. Designed for the founder's mid-build cleanup when test
brands accumulate against the live signup flow.

Usage:
    python -m scripts.purge_test_data --keep-email hello@impactvisualbranding.co.uk
    python -m scripts.purge_test_data --keep-email hello@... --confirm

Without --confirm, prints the row counts that WOULD be deleted and
exits without touching the DB. With --confirm, runs everything inside
ONE transaction so a failure mid-way leaves the DB intact.

Order matters because several FKs are RESTRICT (stamp_ledger →
users / cafes; global_ledger → cafes / users.till_code;
suspended_coffee_ledger → cafes). Sequence:

    1. stamp_ledger              (DELETE all — wipe ledger entirely)
    2. global_ledger             (DELETE all)
    3. suspended_coffee_ledger   (DELETE all)
    4. consumer_otps             (DELETE all)
    5. users                     (DELETE all — no FK back from kept brand)
    6. brands WHERE id != target (CASCADE deletes cafes, baristas,
       offers, network_lock_events, password_reset_tokens,
       cancellation_feedback)

super_admins are deliberately untouched — they're platform staff, not
test data.

Targets the DATABASE_URL configured in app/database.py (i.e. .env on
local, /root/.env-lcp-production on the droplet). Confirm BOTH the
URL host AND the kept brand row before passing --confirm.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

import asyncpg

from app.database import settings


def _to_asyncpg_dsn(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def _run(keep_email: str, confirm: bool) -> int:
    dsn = _to_asyncpg_dsn(settings.database_url)
    conn = await asyncpg.connect(dsn)
    try:
        target = await conn.fetchrow(
            "SELECT id, name, contact_email FROM brands "
            "WHERE lower(contact_email) = lower($1)",
            keep_email,
        )
        if target is None:
            print(
                f"[purge] no brand found with contact_email={keep_email!r}. "
                "Aborting — refusing to wipe the DB without a kept anchor."
            )
            return 2

        # Pre-flight counts so the operator sees the blast radius.
        counts = {}
        for table in (
            "stamp_ledger",
            "global_ledger",
            "suspended_coffee_ledger",
            "consumer_otps",
            "users",
        ):
            counts[table] = await conn.fetchval(f"SELECT count(*) FROM {table}")
        counts["brands_to_delete"] = await conn.fetchval(
            "SELECT count(*) FROM brands WHERE id != $1",
            target["id"],
        )
        counts["cafes_to_cascade"] = await conn.fetchval(
            "SELECT count(*) FROM cafes WHERE brand_id != $1",
            target["id"],
        )
        kept_cafes = await conn.fetchval(
            "SELECT count(*) FROM cafes WHERE brand_id = $1",
            target["id"],
        )

        print(f"[purge] DB host: {dsn.split('@')[-1].split('/')[0]}")
        print(f"[purge] keeping brand: id={target['id']} name={target['name']!r} "
              f"email={target['contact_email']!r} cafes={kept_cafes}")
        print("[purge] would delete:")
        for k, v in counts.items():
            print(f"  - {k:<26}: {v}")

        if not confirm:
            print("[purge] DRY RUN — pass --confirm to execute.")
            return 0

        async with conn.transaction():
            for table in (
                "stamp_ledger",
                "global_ledger",
                "suspended_coffee_ledger",
                "consumer_otps",
                "users",
            ):
                deleted = await conn.execute(f"DELETE FROM {table}")
                print(f"[purge] {table}: {deleted}")

            deleted = await conn.execute(
                "DELETE FROM brands WHERE id != $1",
                target["id"],
            )
            print(f"[purge] brands (CASCADE → cafes/offers/etc.): {deleted}")

        # Post-purge sanity counts.
        post = {
            "brands": await conn.fetchval("SELECT count(*) FROM brands"),
            "cafes": await conn.fetchval("SELECT count(*) FROM cafes"),
            "users": await conn.fetchval("SELECT count(*) FROM users"),
            "stamp_ledger": await conn.fetchval(
                "SELECT count(*) FROM stamp_ledger"
            ),
            "global_ledger": await conn.fetchval(
                "SELECT count(*) FROM global_ledger"
            ),
        }
        print("[purge] post-purge counts:")
        for k, v in post.items():
            print(f"  - {k:<13}: {v}")
        return 0
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--keep-email",
        required=True,
        help="contact_email of the brand to retain (case-insensitive)",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="actually run the deletes (otherwise dry-run only)",
    )
    args = parser.parse_args()
    return asyncio.run(_run(args.keep_email, args.confirm))


if __name__ == "__main__":
    sys.exit(main())
