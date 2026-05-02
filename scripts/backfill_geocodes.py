"""Backfill latitude / longitude on legacy cafe rows.

Cafes created before the geopy/Nominatim wiring (commit feat: Phase 2
Geospatial routing, 2026-05-02) sit in Postgres with `latitude IS NULL`
and `longitude IS NULL`. The consumer Discover view falls back to a
deterministic mock distance for those rows, which is what the founder
saw as "0.8 mi away" placeholders during E2E testing.

This script walks every cafe with NULL coordinates and resolves the
`address` string through `app.geocoding.geocode_address`, the same
helper the live create/update path uses. Failed lookups are skipped
loudly (a row stays NULL, app keeps mocking) so we can re-run after
manually fixing the address.

Nominatim's free tier is rate-limited to ~1 request per second AND
asks every caller to respect a contactable User-Agent (handled inside
`app/geocoding.py`). We sleep 1.5 s between calls to stay well under
the threshold even if a future Nominatim retry burns one extra request.

Usage:

    python -m scripts.backfill_geocodes

Or against the docker-compose db:

    docker compose exec -T api python -m scripts.backfill_geocodes

Idempotent: re-running is harmless because we only ever touch rows that
still have NULL coords.
"""

from __future__ import annotations

import asyncio
import sys
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.geocoding import geocode_address


# Nominatim's documented usage policy is "no more than 1 absolute
# requests per second". A 1.5s buffer keeps us safe against clock
# skew + retries inside geopy itself.
_RATE_LIMIT_SECONDS = 1.5


# Raw SQL deliberately — using the ORM Cafe model would 500 on databases
# that haven't applied every migration up to HEAD (e.g. a dev box where
# 0015 added cafes.last_known_ip but the operator hasn't run it). The
# only columns this backfill cares about (`id`, `name`, `address`,
# `latitude`, `longitude`) have been on the table since migration 0010.
async def _missing_coord_cafes(
    session: AsyncSession,
) -> list[tuple[uuid.UUID, str, str]]:
    rows = (
        await session.execute(
            text(
                "SELECT id, name, address FROM cafes "
                "WHERE latitude IS NULL ORDER BY created_at ASC"
            )
        )
    ).all()
    return [(row[0], row[1] or "", row[2] or "") for row in rows]


async def _save_coords(
    session: AsyncSession, cafe_id: uuid.UUID, lat: float, lon: float
) -> None:
    await session.execute(
        text(
            "UPDATE cafes SET latitude = :lat, longitude = :lon "
            "WHERE id = :id"
        ),
        {"lat": lat, "lon": lon, "id": cafe_id},
    )
    await session.commit()


async def main() -> int:
    async with AsyncSessionLocal() as session:
        cafes = await _missing_coord_cafes(session)
        if not cafes:
            print("[backfill] All cafes already have coordinates — nothing to do.")
            return 0

        print(f"[backfill] {len(cafes)} cafe(s) missing coordinates. Starting…")
        succeeded = 0
        failed = 0
        for i, (cafe_id, name, address) in enumerate(cafes, start=1):
            print(
                f"[backfill] ({i}/{len(cafes)}) {name!r} → {address!r}"
            )
            lat, lon = await geocode_address(address)
            if lat is None or lon is None:
                print(
                    f"[backfill]   ⚠️  Nominatim returned no result. "
                    "Row left untouched — review the address and re-run."
                )
                failed += 1
            else:
                await _save_coords(session, cafe_id, lat, lon)
                print(f"[backfill]   ✅  Saved ({lat:.6f}, {lon:.6f})")
                succeeded += 1

            # Honour Nominatim's 1 req/sec rate limit — only sleep
            # between calls, not after the last one.
            if i < len(cafes):
                await asyncio.sleep(_RATE_LIMIT_SECONDS)

        print(
            f"[backfill] Done. Succeeded: {succeeded}  Failed: {failed}"
        )
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
