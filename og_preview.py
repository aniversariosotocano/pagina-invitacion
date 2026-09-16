"""Renderizador de imágenes Open Graph personalizadas para invitaciones."""

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent
IMAGE_DIR = ROOT / "assets" / "images"
WIDTH, HEIGHT = 1200, 630


def _font(size, bold=False):
    names = (
        [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
        ]
        if bold
        else [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
            r"C:\Windows\Fonts\arial.ttf",
        ]
    )
    for name in names:
        path = Path(name)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def _fit_text(draw, text, max_width, start_size, bold=False, minimum=24):
    size = start_size
    while size > minimum:
        font = _font(size, bold)
        if draw.textbbox((0, 0), text, font=font)[2] <= max_width:
            return font
        size -= 2
    return _font(minimum, bold)


def _text(value, fallback=""):
    return str(value or fallback).strip()


def render_preview(data):
    background_path = IMAGE_DIR / "video-poster.webp"
    if not background_path.exists():
        background_path = IMAGE_DIR / "soto-cano-pista.webp"

    background = Image.open(background_path).convert("RGB")
    canvas = ImageOps.fit(background, (WIDTH, HEIGHT), method=Image.Resampling.LANCZOS).convert("RGBA")
    shade = Image.new("RGBA", (WIDTH, HEIGHT), (3, 12, 25, 164))
    canvas = Image.alpha_composite(canvas, shade)
    draw = ImageDraw.Draw(canvas)

    gold = (221, 180, 92, 255)
    white = (247, 249, 252, 255)
    muted = (204, 216, 228, 255)
    draw.rectangle((28, 28, WIDTH - 28, HEIGHT - 28), outline=gold, width=2)
    draw.rectangle((44, 44, WIDTH - 44, HEIGHT - 44), outline=(221, 180, 92, 100), width=1)

    emblem_path = IMAGE_DIR / "emblema-soto-cano.png"
    if emblem_path.exists():
        emblem = Image.open(emblem_path).convert("RGBA")
        emblem.thumbnail((92, 92), Image.Resampling.LANCZOS)
        canvas.alpha_composite(emblem, (WIDTH - 142, 58))

    treatment = _text(data.get("tratamiento"))
    grade = _text(data.get("grado"))
    name = _text(data.get("nombre"))
    event = _text(data.get("nombre_evento"), "Aniversario de la Base Aérea Soto Cano")
    date = _text(data.get("fecha"))
    hour = _text(data.get("hora"))

    draw.text((72, 68), "FUERZA AÉREA HONDUREÑA", fill=gold, font=_font(22, True))
    draw.text((72, 104), event.replace("<br>", " "), fill=white, font=_fit_text(draw, event.replace("<br>", " "), 930, 27, True, 20))
    draw.line((72, 158, 820, 158), fill=gold, width=2)
    if treatment:
        draw.text((72, 190), treatment, fill=muted, font=_fit_text(draw, treatment, 1000, 28, False, 20))
    if grade:
        draw.text((72, 238), grade.upper(), fill=gold, font=_fit_text(draw, grade.upper(), 1000, 30, True, 22))
    if name:
        draw.text((72, 288), name.upper(), fill=white, font=_fit_text(draw, name.upper(), 1030, 52, True, 28))

    cargo = _text(data.get("cargo"))
    if cargo:
        draw.text((72, 364), cargo, fill=muted, font=_fit_text(draw, cargo, 1030, 25, False, 18))

    footer = "  ·  ".join(part for part in (date, hour) if part)
    if footer:
        draw.text((72, 510), footer, fill=gold, font=_fit_text(draw, footer, 1000, 28, True, 20))
    draw.text((72, 558), "Honor · Lealtad · Sacrificio", fill=muted, font=_font(21, False))

    output = BytesIO()
    canvas.convert("RGB").save(output, format="PNG", optimize=True)
    return output.getvalue()
