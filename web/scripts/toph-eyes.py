#!/usr/bin/env python3
"""Generate the animated eye sprites for the Toph avatars.

Every avatar ships as a pair:

  toph-X.png           the full art, eyes included (still fallback)
  toph-X-eyeless.png   the same art without the eyes

This script diffs the pair to find the two eyes, fills the highlight inside
each eye, and writes toph-X-eyes.png: a transparent 256x256 sprite that holds
only the eye pixels. The UI draws that sprite above the eyeless body, so the
eyes can follow the pointer without dragging a ring of skin around.

Usage: python3 web/scripts/toph-eyes.py
"""

from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / "public" / "tophs"
DARK = 90
MIN_EYE_PIXELS = 40


def is_dark(px: tuple[int, int, int, int]) -> bool:
    return px[0] < DARK and px[1] < DARK and px[2] < DARK and px[3] > 160


def eye_components(points: set[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    components: list[list[tuple[int, int]]] = []
    while points:
        seed = points.pop()
        queue = deque([seed])
        component = [seed]
        while queue:
            x, y = queue.popleft()
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    neighbour = (x + dx, y + dy)
                    if neighbour in points:
                        points.remove(neighbour)
                        queue.append(neighbour)
                        component.append(neighbour)
        if len(component) > MIN_EYE_PIXELS:
            components.append(component)
    components.sort(key=lambda component: min(p[0] for p in component))
    return components


def eye_alpha(size: tuple[int, int], component: list[tuple[int, int]]) -> Image.Image:
    """Alpha = the eye body plus the enclosed highlight (the white spark)."""
    alpha = Image.new("L", size, 0)
    target = alpha.load()
    xs = [p[0] for p in component]
    ys = [p[1] for p in component]
    x0, y0 = min(xs) - 2, min(ys) - 2
    x1, y1 = max(xs) + 3, max(ys) + 3
    body = set(component)
    outside: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if (x, y) in body or (x, y) in outside:
            return
        if not (0 <= x < size[0] and 0 <= y < size[1]):
            return
        outside.add((x, y))
        queue.append((x, y))

    for x in range(x0, x1):
        seed(x, y0)
        seed(x, y1 - 1)
    for y in range(y0, y1):
        seed(x0, y)
        seed(x1 - 1, y)
    while queue:
        x, y = queue.popleft()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if not (x0 <= nx < x1 and y0 <= ny < y1):
                    continue
                if (nx, ny) in body or (nx, ny) in outside:
                    continue
                outside.add((nx, ny))
                queue.append((nx, ny))
    for y in range(y0, y1):
        for x in range(x0, x1):
            if (x, y) not in outside:
                target[x, y] = 255
    return alpha


def build(name: str) -> None:
    full = Image.open(ROOT / f"{name}.png").convert("RGBA")
    eyeless = Image.open(ROOT / f"{name}-eyeless.png").convert("RGBA")
    fp, ep = full.load(), eyeless.load()
    diff = {
        (x, y)
        for y in range(full.height)
        for x in range(full.width)
        if is_dark(fp[x, y]) and not is_dark(ep[x, y])
    }
    components = eye_components(diff)
    if len(components) != 2:
        raise SystemExit(f"{name}: expected 2 eyes, found {len(components)}")
    alpha = Image.new("L", full.size, 0)
    for component in components:
        alpha = ImageChops.lighter(alpha, eye_alpha(full.size, component))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))
    sprite = full.copy()
    sprite.putalpha(alpha)
    pixels = sprite.load()
    for y in range(sprite.height):
        for x in range(sprite.width):
            if pixels[x, y][3] == 0:
                pixels[x, y] = (0, 0, 0, 0)
    sprite.save(ROOT / f"{name}-eyes.png", optimize=True)


def main() -> None:
    names = sorted(
        path.name[: -len("-eyeless.png")]
        for path in ROOT.glob("*-eyeless.png")
        if (ROOT / path.name[: -len("-eyeless.png")]).with_suffix(".png").exists()
    )
    for name in names:
        build(name)
    print(f"wrote {len(names)} eye sprites")


if __name__ == "__main__":
    main()
