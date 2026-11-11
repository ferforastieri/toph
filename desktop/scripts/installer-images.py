#!/usr/bin/env python3
"""Generate the Windows installer bitmaps from the Toph brand assets.

Tauri reads fixed-size 24-bit BMP files for the NSIS header/sidebar and the
WiX banner/dialog. Rendering at 4x and downsampling keeps the wordmark and the
mascot crisp at the small sizes Windows uses.

Run from the repository root:

    python3 desktop/scripts/installer-images.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "packages" / "brand" / "assets"
OUT = ROOT / "desktop" / "src-tauri" / "installer"

MARK = BRAND / "generated" / "toph-mark.png"
WORDMARK = BRAND / "logo" / "toph-wordmark.png"

SCALE = 4
BACKGROUND = (5, 5, 5)
TEXT = (245, 245, 245)
MUTED = (150, 150, 150)
ACCENT = (255, 181, 71)
ACCENT_DEEP = (255, 157, 10)

FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def spaced_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    fill: tuple[int, int, int],
    size: int,
    spacing: int,
    bold: bool = False,
) -> int:
    """Draw letter-spaced text and return its width."""
    face = font(FONT_BOLD if bold else FONT_REGULAR, size)
    x, y = xy
    start = x
    for character in text:
        draw.text((x, y), character, font=face, fill=fill)
        x += face.getlength(character) + spacing
    return x - start - spacing


def background(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), BACKGROUND)
    pixels = image.load()
    glow_x = width * 0.5
    glow_y = height * 0.18
    glow_radius = max(width, height) * 0.85
    for y in range(height):
        for x in range(width):
            distance = math.hypot(x - glow_x, y - glow_y) / glow_radius
            glow = max(0.0, 1.0 - distance) ** 2.4
            base = 5 + int(4 * (y / max(1, height - 1)))
            pixels[x, y] = (
                min(255, base + int(48 * glow)),
                min(255, base + int(30 * glow)),
                min(255, base + int(10 * glow)),
            )
    return image


def trim_alpha(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox) if bbox else image


def paste_scaled(image: Image.Image, art: Image.Image, width: int, center_x: int, top: int) -> int:
    height = round(art.height * width / art.width)
    art = art.resize((width, height), Image.LANCZOS)
    image.paste(art, (round(center_x - width / 2), top), art)
    return top + height


def paste_mark(image: Image.Image, width: int, center_x: int, top: int) -> int:
    return paste_scaled(image, trim_alpha(MARK), width, center_x, top)


def paste_wordmark(image: Image.Image, width: int, center_x: int, top: int) -> int:
    return paste_scaled(image, trim_alpha(WORDMARK), width, center_x, top)


def amber_line(draw: ImageDraw.ImageDraw, x0: int, y: int, x1: int, width: int = 2 * SCALE) -> None:
    draw.rounded_rectangle((x0, y, x1, y + width), radius=width // 2, fill=ACCENT)


def render(width: int, height: int, draw_fn) -> Image.Image:
    big = background(width * SCALE, height * SCALE)
    draw = ImageDraw.Draw(big)
    draw_fn(big, draw, width * SCALE, height * SCALE)
    return big.resize((width, height), Image.LANCZOS)


def save(name: str, image: Image.Image) -> None:
    target = OUT / name
    # BMP has no alpha; 24-bit BI_RGB is what NSIS and WiX expect.
    image.convert("RGB").save(target, format="BMP")
    print(f"wrote {target.relative_to(ROOT)} ({image.width}x{image.height})")


def nsis_header(big, draw, w, h) -> None:
    mark_size = int(h * 0.62)
    paste_mark(big, mark_size, int(w * 0.16), int(h * 0.19))
    paste_wordmark(big, int(w * 0.44), int(w * 0.58), int(h * 0.30))
    amber_line(draw, 0, h - 3 * SCALE, w, 3 * SCALE)


def nsis_sidebar(big, draw, w, h) -> None:
    mark_size = int(w * 0.56)
    bottom = paste_mark(big, mark_size, w // 2, int(h * 0.115))
    paste_wordmark(big, int(w * 0.63), w // 2, bottom + int(h * 0.035))
    line_y = int(h * 0.685)
    amber_line(draw, int(w * 0.34), line_y, int(w * 0.66), 2 * SCALE)
    spaced_text(draw, (int(w * 0.185), line_y + 12 * SCALE), "SELF-HOSTED", MUTED, 9 * SCALE, 1.6 * SCALE, True)
    spaced_text(draw, (int(w * 0.215), line_y + 28 * SCALE), "WORKBENCH", ACCENT, 10 * SCALE, 1.8 * SCALE, True)
    spaced_text(draw, (int(w * 0.155), int(h * 0.905)), "CÓDIGO · DADOS · IA", (110, 110, 110), 7 * SCALE, 1.1 * SCALE, True)


def wix_banner(big, draw, w, h) -> None:
    mark_size = int(h * 0.66)
    paste_mark(big, mark_size, int(w * 0.055), int(h * 0.17))
    paste_wordmark(big, int(w * 0.142), int(w * 0.185), int(h * 0.285))
    spaced_text(
        draw,
        (int(w * 0.58), int(h * 0.36)),
        "SEU WORKBENCH SELF-HOSTED",
        MUTED,
        9 * SCALE,
        1.4 * SCALE,
        True,
    )
    amber_line(draw, 0, h - 3 * SCALE, w, 3 * SCALE)


def wix_dialog(big, draw, w, h) -> None:
    mark_size = int(w * 0.24)
    bottom = paste_mark(big, mark_size, w // 2, int(h * 0.075))
    bottom = paste_wordmark(big, int(w * 0.33), w // 2, bottom + int(h * 0.025))
    line_y = bottom + int(h * 0.055)
    amber_line(draw, int(w * 0.40), line_y, int(w * 0.60), 2 * SCALE)
    spaced_text(draw, (int(w * 0.345), line_y + 13 * SCALE), "SELF-HOSTED", MUTED, 10 * SCALE, 1.9 * SCALE, True)
    spaced_text(draw, (int(w * 0.362), line_y + 33 * SCALE), "WORKBENCH", ACCENT, 11 * SCALE, 2.1 * SCALE, True)


def main() -> int:
    for path in (MARK, WORDMARK):
        if not path.exists():
            print(f"missing brand asset: {path}", file=sys.stderr)
            return 1
    OUT.mkdir(parents=True, exist_ok=True)
    save("nsis-header.bmp", render(150, 57, nsis_header))
    save("nsis-uninstaller-header.bmp", render(150, 57, nsis_header))
    save("nsis-sidebar.bmp", render(164, 314, nsis_sidebar))
    save("wix-banner.bmp", render(493, 58, wix_banner))
    save("wix-dialog.bmp", render(493, 312, wix_dialog))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
