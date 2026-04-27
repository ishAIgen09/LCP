# Vehicle Marketing Stickers

Source SVGs for the Local Coffee Perks car decal set, finalised 2026-04-27.

## Files

| File | Format | Use |
|---|---|---|
| `hood.svg` | 500×500 circle | Bonnet / hood centre decal |
| `driver-door.svg` | 500×300 rectangle | Driver-side door panel |
| `passenger-door.svg` | 500×300 rectangle | Passenger-side door panel |
| `bumper.svg` | 300×300 circle | Rear bumper sticker |

## Required sibling asset

Each SVG references `qr.png` via a relative `<image href="qr.png">` tag. Drop the production QR image (linking to `https://localcoffeeperks.com/waitlist`) into this directory as **`qr.png`** before opening any SVG in a browser or vector tool — otherwise the QR slot will render as a broken-image icon.

Recommended QR settings:
- Format: PNG, transparent or white background
- Resolution: at least 600×600 for the 180×180 used by the door + hood files (≥3× pixel density for sharp print)
- Error correction: H (30%) so the design survives weathering and partial occlusion

## Print prep

1. Open in Illustrator (or Inkscape).
2. **Convert text to outlines / paths** before sending to the vinyl printer — `@import` of Fraunces + Inter from Google Fonts works in browsers but is unreliable in print RIPs. Without outlining, the printer may substitute a system font.
3. Verify the QR `<image>` is embedded (not linked) when exporting if the printer's workflow expects a single self-contained file.

## Brand palette

- Background: **`#1A1412`** (espresso)
- Mint highlights: **`#00E576`**
- Text: **`#FFFFFF`** (white)

These hexes match the Brand Kit defined in `/INFRASTRUCTURE.md` Section 6 — keep them in sync if either is ever rotated.
