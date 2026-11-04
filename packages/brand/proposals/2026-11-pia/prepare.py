"""Prepare generated artwork for review. Requires Pillow; run from any directory."""
from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
BG = "#14161B"
AVATARS = [
    ("vendas", "Vendas", "#FFB547"),
    ("marketing", "Marketing", "#FF7AB6"),
    ("growth", "Growth", "#7CE7B0"),
    ("conteudo", "Conteúdo", "#C7A3FF"),
    ("seo", "SEO", "#84E0C2"),
    ("financeiro", "Financeiro", "#B9DE7A"),
    ("juridico", "Jurídico", "#FCD34D"),
    ("compliance", "Compliance", "#93C5FD"),
    ("privacidade", "Privacidade", "#A8DDE8"),
    ("recrutamento", "Recrutamento", "#FDA4AF"),
    ("customer-success", "Customer Success", "#8FB5F5"),
    ("ecommerce", "E-commerce", "#F08C72"),
    ("pagamentos", "Pagamentos", "#F7B267"),
    ("mobile", "Mobile", "#6EE7B7"),
    ("cloud", "Cloud", "#8CD3B4"),
    ("sre", "SRE", "#FFD166"),
    ("performance", "Performance", "#FF9EC4"),
    ("acessibilidade", "Acessibilidade", "#D8B4FE"),
    ("arquitetura", "Arquitetura", "#C4B5FD"),
    ("machine-learning", "Machine Learning", "#67E8F9"),
]
BRANDS = {
    "brand-logo-mark": (1024, 1024),
    "brand-logo-horizontal": (1536, 512),
    "brand-logo-vertical": (1024, 1024),
    "brand-logo-mono-white": (1536, 512),
    "brand-logo-mono-black": (1536, 512),
    "brand-favicon": (512, 512),
    "brand-app-icon": (1024, 1024),
    "brand-banner": (1600, 600),
    "brand-social-share": (1200, 630),
}


def source(name):
    with Image.open(ROOT / "originals" / f"{name}.png") as image:
        return image.convert("RGB")


def save(image, relative):
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".webp":
        image.save(path, lossless=True, method=6)
    else:
        image.save(path, optimize=True)
    return str(relative)


def mask(image):
    # Remove model-generated grain and color drift before antialiased resizing.
    return image.convert("L").point(lambda value: 255 if value > 80 else 0)


def flat_symbol(image, color, size=1024, coverage=0.72):
    alpha = mask(image)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Empty generated symbol")
    alpha = ImageOps.contain(alpha.crop(bounds), (round(size * coverage),) * 2,
                             Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), BG)
    canvas.paste(Image.new("RGB", alpha.size, color),
                 ((size - alpha.width) // 2, (size - alpha.height) // 2), alpha)
    return canvas


def font(size):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)


manifest = {"status": "proposal-awaiting-approval", "background": BG,
            "avatars": [], "brand": [], "files": []}
sheet = Image.new("RGB", (1500, 1360), BG)
draw = ImageDraw.Draw(sheet)
draw.text((36, 24), "TOPH / NOVA EQUIPE", font=font(28), fill="#F5F5F7")
draw.text((36, 64), "20 especialidades · proposta geométrica plana", font=font(18), fill="#AAB0BD")

for i, (handle, role, color) in enumerate(AVATARS):
    name = f"toph-{handle}"
    master = flat_symbol(source(name), color)
    save(master, f"masters/{name}.png")
    variants = {}
    for size in (64, 128, 256):
        resized = master.resize((size, size), Image.Resampling.LANCZOS)
        variants[str(size)] = save(resized, f"avatars/{name}-{size}.webp")
        if size == 256:
            save(resized, f"avatars/{name}.png")
    manifest["avatars"].append({"handle": handle, "role": role, "color": color,
                                "png": f"avatars/{name}.png", "webp": variants,
                                "master": f"masters/{name}.png",
                                "original": f"originals/{name}.png"})
    x, y = (i % 5) * 300, 110 + (i // 5) * 310
    sheet.paste(master.resize((240, 240), Image.Resampling.LANCZOS), (x + 30, y))
    draw.text((x + 150, y + 248), role, anchor="mt", font=font(18), fill="#F5F5F7")
    draw.text((x + 150, y + 274), color, anchor="mt", font=font(14), fill=color)

save(sheet, "preview-tophs.webp")
save(sheet, "preview-tophs.png")

mark = flat_symbol(source("brand-logo-mark"), "#FFB547", coverage=0.64)
horizontal = source("brand-logo-horizontal")
for name, size in BRANDS.items():
    if name in ("brand-logo-mark", "brand-app-icon"):
        image = mark.copy()
    elif name == "brand-favicon":
        image = flat_symbol(source("brand-logo-mark"), "#FFB547", coverage=0.78)
    elif name.startswith("brand-logo-mono"):
        # Derive both monochrome exports from one lockup to guarantee identical geometry.
        alpha = mask(horizontal)
        white = name.endswith("white")
        image = Image.new("RGBA", horizontal.size, (255, 255, 255, 0) if white else (0, 0, 0, 0))
        image.putalpha(alpha)
    else:
        image = source(name)
        palette = Image.new("P", (1, 1))
        colors = [BG, "#FFB547", "#F5F5F7", "#7CE7B0", "#C7A3FF", "#242830"]
        rgb = [tuple(bytes.fromhex(color[1:])) for color in colors]
        palette.putpalette([channel for color in rgb for channel in color] + [0] * (768 - len(rgb) * 3))
        image = image.quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
    # Preserve artwork proportions if the generator returned a different aspect ratio.
    fill = (0, 0, 0, 0) if image.mode == "RGBA" else BG
    image = ImageOps.pad(image, size, Image.Resampling.LANCZOS, color=fill)
    png = save(image, f"brand/{name}.png")
    webp = save(image, f"brand/{name}.webp")
    manifest["brand"].append({"name": name, "width": size[0], "height": size[1],
                              "png": png, "webp": webp, "original": f"originals/{name}.png"})

favicon = Image.open(ROOT / "brand/brand-favicon.png")
for size in (16, 32, 48, 64, 128, 180, 192, 256):
    save(favicon.resize((size, size), Image.Resampling.LANCZOS), f"brand/favicon-{size}.png")
favicon.save(ROOT / "brand/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

board = Image.new("RGB", (1600, 1300), BG)
board.paste(Image.open(ROOT / "brand/brand-banner.png"), (0, 0))
board.paste(Image.open(ROOT / "brand/brand-social-share.png").resize((960, 504)), (0, 650))
board.paste(Image.open(ROOT / "brand/brand-app-icon.png").resize((400, 400)), (1100, 660))
ImageDraw.Draw(board).text((40, 1230), "TOPH / MARCA · proposta para aprovação", font=font(26), fill="#F5F5F7")
save(board, "preview-brand.webp")
save(board, "preview-brand.png")

for folder in ("avatars", "brand", "masters", "originals"):
    for path in sorted((ROOT / folder).iterdir()):
        with Image.open(path) as image:
            image.verify()
        data = path.read_bytes()
        manifest["files"].append({"path": str(path.relative_to(ROOT)), "bytes": len(data),
                                  "sha256": hashlib.sha256(data).hexdigest()})
(ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
avatar_bytes = sum((ROOT / entry["webp"]["256"]).stat().st_size for entry in manifest["avatars"])
print(f"Validated: {len(AVATARS)} avatars, {len(BRANDS)} brand pieces")
print(f"20 avatars WebP 256px: {avatar_bytes:,} bytes total")
print(f"All asset paths and hashes: {ROOT / 'manifest.json'}")
