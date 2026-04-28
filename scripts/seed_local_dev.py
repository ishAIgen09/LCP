"""Seed the local dev database with 3 brands + 3 cafes for UI walkthroughs.

Idempotent: skips when at least one of the seed brands already exists
(matched by contact_email — the unique key). Safe to run repeatedly.

Usage (from the host, against the docker-compose db):

    docker compose exec -T api python -m scripts.seed_local_dev

Or directly with a local DATABASE_URL set:

    python -m scripts.seed_local_dev

The 3 brands cover the two scheme types we bill differently:
  · Monmouth Coffee (global)   — £7.99/mo per location
  · Workshop Coffee (global)   — £7.99/mo per location
  · Prufrock Coffee (private)  — £5.00/mo per location

Each gets one cafe in central London with lat/lng so the consumer
app's proximity sort has something to chew on.

Login: every seed brand uses password `password123` (matches the
droplet seed). Real production DB never sees this script.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import Brand, Cafe, SchemeType, SubscriptionStatus
from app.security import hash_password


SEED_PASSWORD = "password123"


SEED_BRANDS = [
    {
        "name": "Monmouth Coffee",
        "slug": "monmouth-coffee",
        "contact_email": "owner@monmouth.test",
        "scheme_type": SchemeType.GLOBAL,
        "cafe": {
            "name": "Monmouth · Borough",
            "slug": "monmouth-borough",
            "address": "2 Park St, London SE1 9AB",
            "store_number": "MMTH01",
            "phone": "020 7232 3010",
            "food_hygiene_rating": "5",
            "latitude": 51.5054,
            "longitude": -0.0907,
        },
    },
    {
        "name": "Workshop Coffee",
        "slug": "workshop-coffee",
        "contact_email": "owner@workshop.test",
        "scheme_type": SchemeType.GLOBAL,
        "cafe": {
            "name": "Workshop · Marylebone",
            "slug": "workshop-marylebone",
            "address": "75 Wigmore St, London W1U 1QD",
            "store_number": "WSHP01",
            "phone": "020 7487 5170",
            "food_hygiene_rating": "5",
            "latitude": 51.5170,
            "longitude": -0.1490,
        },
    },
    {
        "name": "Prufrock Coffee",
        "slug": "prufrock-coffee",
        "contact_email": "owner@prufrock.test",
        "scheme_type": SchemeType.PRIVATE,
        "cafe": {
            "name": "Prufrock · Leather Lane",
            "slug": "prufrock-leather-lane",
            "address": "23-25 Leather Ln, London EC1N 7TE",
            "store_number": "PRFK01",
            "phone": "020 7242 0467",
            "food_hygiene_rating": "5",
            "latitude": 51.5197,
            "longitude": -0.1102,
        },
    },
]


async def _exists(session: AsyncSession, email: str) -> bool:
    res = await session.execute(
        select(Brand.id).where(Brand.contact_email == email)
    )
    return res.scalar_one_or_none() is not None


async def main() -> int:
    pw_hash = hash_password(SEED_PASSWORD)
    inserted_brands = 0
    inserted_cafes = 0
    async with AsyncSessionLocal() as session:
        for spec in SEED_BRANDS:
            if await _exists(session, spec["contact_email"]):
                print(f"[seed] skip {spec['name']} — already present")
                continue
            brand = Brand(
                name=spec["name"],
                slug=spec["slug"],
                contact_email=spec["contact_email"],
                scheme_type=spec["scheme_type"],
                # Mark active so the b2b dashboard's billing-gated routes
                # (POS scan, etc.) don't 402 against seed data. Real
                # signups still go through Stripe checkout.
                subscription_status=SubscriptionStatus.ACTIVE,
                password_hash=pw_hash,
            )
            session.add(brand)
            await session.flush()  # populate brand.id

            cafe_spec = spec["cafe"]
            cafe = Cafe(
                brand_id=brand.id,
                name=cafe_spec["name"],
                slug=cafe_spec["slug"],
                address=cafe_spec["address"],
                contact_email=spec["contact_email"],
                store_number=cafe_spec["store_number"],
                phone=cafe_spec.get("phone"),
                food_hygiene_rating=cafe_spec.get(
                    "food_hygiene_rating", "Awaiting Inspection"
                ),
                latitude=cafe_spec.get("latitude"),
                longitude=cafe_spec.get("longitude"),
            )
            session.add(cafe)
            inserted_brands += 1
            inserted_cafes += 1

        await session.commit()
    print(
        f"[seed] done — inserted {inserted_brands} brand(s), "
        f"{inserted_cafes} cafe(s). Login password: {SEED_PASSWORD}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
