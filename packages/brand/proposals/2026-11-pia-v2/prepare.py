"""Normalize completed generated images and build review sheets (Pillow required)."""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent
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
SHAPES = {
    "vendas": "Mascote aprovado",
    "marketing": "Megafone arredondado",
    "growth": "Broto com folhas e caule",
    "conteudo": "Livro arredondado",
    "seo": "Lente de aumento com anel e cabo",
    "financeiro": "Moeda cilíndrica",
    "juridico": "Balança",
    "compliance": "Escudo",
    "privacidade": "Cadeado",
    "recrutamento": "Crachá",
    "customer-success": "Balão de fala com coração",
    "ecommerce": "Sacola de compras",
    "pagamentos": "Cartão com chip",
    "mobile": "Celular arredondado",
    "cloud": "Nuvem",
    "sre": "Pilha de servidores",
    "performance": "Raio",
    "acessibilidade": "Figura de acessibilidade",
    "arquitetura": "Casa",
    "machine-learning": "Cérebro/chip",
}


def font(size):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)


def normalize(name, dimensions, background="white"):
    path = ROOT / "originals" / f"{name}.png"
    with Image.open(path) as original:
        if name == "toph-vendas":
            assert original.size == dimensions
            return original.convert("RGB")
        image = original.convert("RGBA")
    if name == "brand-logo-mono-white" and image.getchannel("A").getextrema()[0] < 255:
        image = ImageOps.pad(image, dimensions, Image.Resampling.LANCZOS, color=(0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", image.size, background)
        canvas.alpha_composite(image)
        image = ImageOps.pad(canvas.convert("RGB"), dimensions,
                             Image.Resampling.LANCZOS, color=background)
    image.save(path, optimize=True)
    with Image.open(path) as check:
        assert check.size == dimensions
        check.verify()
    return image


def metadata(name, image):
    path = ROOT / "originals" / f"{name}.png"
    data = path.read_bytes()
    return {"name": name, "path": str(path.relative_to(ROOT)),
            "width": image.width, "height": image.height, "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}


if __name__ == "__main__":
    # Only run after all image generation completion notifications have arrived.
    parser = argparse.ArgumentParser()
    parser.add_argument("--brand-only", action="store_true", help="Prepare only the nine brand pieces")
    args = parser.parse_args()
    manifest = {"style": "Original Toph glossy 3D mascot family", "avatars": [], "brand": []}
    board = Image.new("RGB", (1500, 1400), "#F4F5F7")
    draw = ImageDraw.Draw(board)
    draw.text((36, 26), "TOPH / EQUIPE V2", font=font(30), fill="#18191C")
    draw.text((36, 72), "20 especialidades · família original de mascotes 3D", font=font(19), fill="#626775")
    for index, (handle, role, color) in enumerate([] if args.brand_only else AVATARS):
        name = f"toph-{handle}"
        image = normalize(name, (1024, 1024))
        entry = metadata(name, image)
        entry.update(handle=handle, role=role, color=color, silhouette=SHAPES[handle])
        manifest["avatars"].append(entry)
        x, y = 20 + index % 5 * 300, 130 + index // 5 * 310
        board.paste(image.resize((260, 260), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 130, y + 270), role, anchor="mt", font=font(18), fill="#18191C")
    if not args.brand_only:
        board.save(ROOT / "preview-tophs.webp", quality=88, method=6)
        board.save(ROOT / "preview-tophs.png", optimize=True)

    brand_board = Image.new("RGB", (1500, 1200), "#F4F5F7")
    draw = ImageDraw.Draw(brand_board)
    draw.text((36, 26), "TOPH / MARCA V2", font=font(30), fill="#18191C")
    for index, (name, dimensions) in enumerate(BRANDS.items()):
        background = "#14161B" if name == "brand-logo-mono-white" else "white"
        image = normalize(name, dimensions, background)
        manifest["brand"].append(metadata(name, image))
        x, y = 20 + index % 3 * 500, 100 + index // 3 * 360
        display = Image.new("RGBA", image.size, background)
        display.alpha_composite(image.convert("RGBA"))
        tile = ImageOps.pad(display.convert("RGB"), (460, 290), Image.Resampling.LANCZOS, color=background)
        brand_board.paste(tile, (x, y))
        draw.text((x + 230, y + 306), name, anchor="mt", font=font(17), fill="#18191C")
    brand_board.save(ROOT / "preview-brand.webp", quality=90, method=6)
    brand_board.save(ROOT / "preview-brand.png", optimize=True)
    manifest_name = "brand-manifest.json" if args.brand_only else "manifest.json"
    paths_name = "brand-paths.txt" if args.brand_only else "paths.txt"
    (ROOT / manifest_name).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (ROOT / paths_name).write_text("\n".join(
        str(ROOT / entry["path"]) for group in ("avatars", "brand") for entry in manifest[group]
    ) + "\n")
    print(f"Validated: {len(manifest['avatars'])} avatars and {len(manifest['brand'])} brand pieces.")
    print(f"Manifest, full path list and visual review sheets: {ROOT}")
