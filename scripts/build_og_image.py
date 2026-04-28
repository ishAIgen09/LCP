"""Generate the Open Graph share image for Local Coffee Perks.

The marketing site + waitlist app each ship a copy of og-waitlist.png in
their `public/` folder so Vite emits it to `dist/` at the URL the meta
tags point at. Re-run this script whenever the brand line / palette
changes — it's deterministic, no image-editor round-trip needed.

Output: 1200x630 PNG, espresso background, mint accent line, white
display text. Sized for Facebook / LinkedIn / WhatsApp / Twitter
summary_large_image (the universal 1.91:1 OG preview ratio).
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Brand palette — must stay in lockstep with /marketing/stickers/ + the
# waitlist page CSS tokens.
BG = (0x1A, 0x14, 0x12)        # Espresso
MINT = (0x00, 0xE5, 0x76)      # Mint
WHITE = (0xFF, 0xFF, 0xFF)
SUBTLE = (0xC8, 0xC4, 0xC2)    # warm light grey for the small footer line

WIDTH, HEIGHT = 1200, 630


def _load(name: str, size: int) -> ImageFont.FreeTypeFont:
    # Arial ships on Windows + most build agents; fall back to PIL's
    # default bitmap font if the host is missing TTFs so the script still
    # produces *something* rather than crashing CI.
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def _centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    y: int,
    fill: tuple[int, int, int],
) -> tuple[int, int, int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (WIDTH - text_w) // 2 - bbox[0]
    draw.text((x, y - bbox[1]), text, font=font, fill=fill)
    return (x, y, x + text_w, y + text_h)


def build(out_path: Path) -> None:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    title_font = _load("arialbd.ttf", 110)
    subtitle_font = _load("arialbd.ttf", 56)
    footer_font = _load("arial.ttf", 28)

    # Vertical layout — eyeballed for visual balance, not metric-perfect.
    title_y = 215
    rule_y = 360
    subtitle_y = 395
    footer_y = 520

    _centered_text(draw, "Local Coffee Perks", title_font, title_y, WHITE)

    # Mint divider rule — 6px tall, ~280px wide, centred.
    rule_w = 280
    rule_h = 6
    rule_x0 = (WIDTH - rule_w) // 2
    draw.rectangle(
        (rule_x0, rule_y, rule_x0 + rule_w, rule_y + rule_h),
        fill=MINT,
    )

    _centered_text(draw, "For the regulars.", subtitle_font, subtitle_y, MINT)

    _centered_text(
        draw,
        "The loyalty app for independent cafes  -  Founding 100 spots available",
        footer_font,
        footer_y,
        SUBTLE,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG", optimize=True)
    print(f"wrote {out_path} ({out_path.stat().st_size:,} bytes)")


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    targets = [
        repo / "main-website" / "public" / "og-waitlist.png",
        repo / "waitlist-page" / "public" / "og-waitlist.png",
    ]
    for target in targets:
        build(target)


if __name__ == "__main__":
    main()
