-- 0010: add lat/lng to cafes so Discover can sort by proximity.
-- Both nullable — cafes without coords fall to the end of a sorted feed.
-- Using DOUBLE PRECISION (float8) — plenty for WGS-84 degrees, cheaper than
-- NUMERIC, and matches what postgis GEOGRAPHY(Point) would coerce anyway if
-- we later swap the Haversine python fallback for ST_Distance_Sphere.
ALTER TABLE cafes ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE cafes ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
