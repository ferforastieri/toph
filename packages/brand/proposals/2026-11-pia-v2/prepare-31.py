"""Prepare the confirmed 31-mascot round. Run only on completed image jobs."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
CHARACTERS = [
    ("toph-logo", "Logo original com olhos", "#FFB547"),
    ("toph-01", "Tulipa", "#FF7AB6"),
    ("toph-02", "Cogumelo", "#F08C72"),
    ("toph-03", "Borboleta", "#C7A3FF"),
    ("toph-04", "Coração", "#FDA4AF"),
    ("toph-05", "Raio", "#FFD166"),
    ("toph-06", "Cacto", "#7CE7B0"),
    ("toph-07", "Concha", "#A8DDE8"),
    ("toph-08", "Bolota", "#D7AC73"),
    ("toph-09", "Folha", "#84E0C2"),
    ("toph-10", "Chama", "#FF9866"),
    ("toph-11", "Floco de neve", "#93C5FD"),
    ("toph-12", "Quebra-cabeça", "#B9DE7A"),
    ("toph-13", "Hexágono", "#67E8F9"),
    ("toph-14", "Laço", "#D8B4FE"),
    ("toph-15", "Ampulheta", "#F7B267"),
    ("toph-16", "Avião de papel", "#8FB5F5"),
    ("toph-17", "Barco de papel", "#6EE7B7"),
    ("toph-18", "Sino", "#FCD34D"),
    ("toph-19", "Ferradura", "#C4B5FD"),
    ("toph-20", "Coroa", "#FFB547"),
    ("toph-21", "Pretzel", "#C9936B"),
    ("toph-22", "Dupla hélice", "#72D8CF"),
    ("toph-23", "Arraia", "#9CB9D9"),
    ("toph-24", "Abóbora", "#FFAA72"),
    ("toph-25", "Broto", "#8CD3B4"),
    ("toph-26", "Cristais", "#B88FEA"),
    ("toph-27", "Bumerangue", "#EF899C"),
    ("toph-28", "Bolha", "#80C6E8"),
    ("toph-29", "Leque", "#F3B7D4"),
    ("toph-30", "Espiral", "#A5D987"),
]


def normalize(name):
    path = ROOT / "originals" / f"{name}.png"
    with Image.open(path) as source:
        if source.mode == "RGB" and source.size == (1024, 1024):
            source.load()
            return source.copy()
        image = source.convert("RGBA")
    canvas = Image.new("RGBA", image.size, "white")
    canvas.alpha_composite(image)
    image = ImageOps.pad(canvas.convert("RGB"), (1024, 1024),
                         Image.Resampling.LANCZOS, color="white")
    staging = path.with_suffix(".tmp.png")
    image.save(staging, optimize=True)
    with Image.open(staging) as verified:
        assert verified.size == (1024, 1024)
        verified.verify()
    staging.replace(path)
    return image


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", nargs="+", help="Only named completed jobs, e.g. toph-logo toph-01")
    args = parser.parse_args()
    names = args.batch or [entry[0] for entry in CHARACTERS]
    selected = [entry for entry in CHARACTERS if entry[0] in names]
    assert len(selected) == len(names), "Unknown or duplicated names"
    cols = min(5, len(selected))
    rows = (len(selected) + cols - 1) // cols
    board = Image.new("RGB", (cols * 260, rows * 300 + 90), "#F4F5F7")
    draw = ImageDraw.Draw(board)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    title_font = ImageFont.truetype(font_path, 25)
    label_font = ImageFont.truetype(font_path, 16)
    draw.text((24, 24), "TOPH / LOGO + 30 PERSONAGENS", fill="#18191C", font=title_font)
    manifest = []
    for i, (name, silhouette, color) in enumerate(selected):
        image = normalize(name)
        x, y = (i % cols) * 260 + 10, (i // cols) * 300 + 80
        board.paste(image.resize((240, 240), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 120, y + 246), name, fill="#18191C", font=label_font, anchor="mt")
        draw.text((x + 120, y + 268), silhouette, fill="#626775", font=label_font, anchor="mt")
        path = ROOT / "originals" / f"{name}.png"
        data = path.read_bytes()
        manifest.append({"name": name, "silhouette": silhouette, "color": color,
                         "path": str(path.relative_to(ROOT)), "width": 1024, "height": 1024,
                         "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    suffix = f"batch-{names[0]}" if args.batch else "31-tophs"
    board.save(ROOT / f"preview-{suffix}.webp", quality=90, method=6)
    if not args.batch:
        (ROOT / "manifest-31.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        (ROOT / "paths-31.txt").write_text("\n".join(str(ROOT / entry["path"]) for entry in manifest) + "\n")
    print(f"Validated {len(selected)} PNGs, 1024×1024, opaque white background.")
    print(f"Review: {ROOT / f'preview-{suffix}.webp'}")
