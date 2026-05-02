"""Address → lat/lon resolution for cafe rows.

Wraps geopy's Nominatim (OpenStreetMap's free geocoding service) so the
cafe-create / cafe-update paths can stamp `cafes.latitude` and
`cafes.longitude` as soon as the operator types in the address. This
unlocks the consumer app's Haversine distance math (PRD §Geospatial Fix);
without it `distance_miles` falls through to a deterministic mock.

Design notes:
  - Nominatim is sync, so we wrap each lookup in `asyncio.to_thread` to
    keep the request loop responsive. Cafe create/update is a rare
    admin action — the ~1s round-trip to Nominatim is acceptable.
  - Failures (network, timeout, no result, rate-limit) NEVER raise:
    they log + return (None, None). The cafe row is more important
    than perfect coordinates; an admin can re-save the address later.
  - We honour Nominatim's usage policy: a descriptive User-Agent and
    the default 1-req/sec rate-limit (we don't batch geocode here).
  - When `geopy` isn't installed (e.g. local dev that hasn't run
    `pip install -r requirements.txt`), the helper short-circuits to
    (None, None) so the rest of the app keeps working.
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

# Nominatim's policy requires a real, contactable User-Agent.
_USER_AGENT = "LocalCoffeePerks/1.0 (geocoder; ops@localcoffeeperks.com)"


def _resolve_sync(address: str) -> tuple[float | None, float | None]:
    try:
        from geopy.geocoders import Nominatim  # type: ignore[import-untyped]
    except Exception:
        logger.warning(
            "geocode_address: geopy not installed — skipping geocode"
        )
        return None, None
    try:
        geolocator = Nominatim(user_agent=_USER_AGENT, timeout=5)
        location = geolocator.geocode(address)
    except Exception as exc:  # noqa: BLE001 — network/timeout/etc.
        logger.warning(
            "geocode_address failed for %r: %s", address[:80], exc
        )
        return None, None
    if location is None:
        return None, None
    try:
        return float(location.latitude), float(location.longitude)
    except (TypeError, ValueError):
        return None, None


async def geocode_address(
    address: str | None,
) -> tuple[float | None, float | None]:
    """Resolve `address` to (lat, lon). Both None on any failure path."""
    if not address or not address.strip():
        return None, None
    return await asyncio.to_thread(_resolve_sync, address.strip())
