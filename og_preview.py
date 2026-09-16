"""Renderizador Open Graph que replica la tarjeta generada en el panel."""

from io import BytesIO
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent
IMAGE_DIR = ROOT / "assets" / "images"
WIDTH, HEIGHT = 1200, 630

THEME_IMAGES = {
    "tucano-sunset": "tucano-atardecer.webp",
    "supertucano": "Supertucano.webp",
    "maule": "Maule.webp",
    "tucanos-formacion": "tucanos-formacion.webp",
    "soto-cano-pista": "soto-cano-pista.webp",
    "tucano-vuelo": "tucano-vuelo.webp",
}


def _font(size, bold=False, serif=False):
    if serif:
        names = (
            [
                "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
                r"C:\Windows\Fonts\timesbd.ttf",
            ]
            if bold
            else [
                "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
                r"C:\Windows\Fonts\times.ttf",
            ]
        )
    else:
        names = (
            [
                "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                r"C:\Windows\Fonts\arialbd.ttf",
            ]
            if bold
            else [
                "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                r"C:\Windows\Fonts\arial.ttf",
            ]
        )
    for name in names:
        path = Path(name)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def _fit_font(draw, text, max_width, size, *, bold=False, serif=False, minimum=16):
    while size > minimum and draw.textbbox((0, 0), text, font=_font(size, bold, serif))[2] > max_width:
        size -= 1
    return _font(max(size, minimum), bold, serif)


def _value(value, fallback=""):
    return str(value or fallback).strip()


def _center(draw, text, y, font, fill):
    draw.text((WIDTH / 2, y), text, font=font, fill=fill, anchor="ma")


def _naval_background():
    image = Image.new("RGBA", (WIDTH, HEIGHT))
    pixels = image.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            distance = ((x - 600) ** 2 + ((y - 200) * 1.2) ** 2) ** 0.5 / 650
            edge = min(1.0, distance)
            pixels[x, y] = (
                int(16 - 13 * edge),
                int(42 - 34 * edge),
                int(78 - 67 * edge),
                255,
            )
    return image


def _background(data):
    theme = _value(data.get("tema"), "tucano-sunset")
    filename = THEME_IMAGES.get(theme)
    path = IMAGE_DIR / filename if filename else None
    if not path or not path.exists():
        return _naval_background()

    source = Image.open(path).convert("RGBA")
    if theme in {"supertucano", "maule"}:
        canvas = _naval_background()
        source.thumbnail((720, 320), Image.Resampling.LANCZOS)
        source.putalpha(97)
        canvas.alpha_composite(source, ((WIDTH - source.width) // 2, (HEIGHT - source.height) // 2 + 25))
        return canvas

    canvas = ImageOps.fit(source, (WIDTH, HEIGHT), method=Image.Resampling.LANCZOS)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT))
    overlay_draw = ImageDraw.Draw(overlay)
    stops = [(0, 0.84), (0.4, 0.88), (0.75, 0.93), (1, 0.97)]
    for y in range(HEIGHT):
        position = y / (HEIGHT - 1)
        for index in range(len(stops) - 1):
            if stops[index][0] <= position <= stops[index + 1][0]:
                left, right = stops[index], stops[index + 1]
                fraction = (position - left[0]) / (right[0] - left[0])
                alpha = int((left[1] + (right[1] - left[1]) * fraction) * 255)
                break
        overlay_draw.line((0, y, WIDTH, y), fill=(4, 13, 26, alpha))
    canvas = Image.alpha_composite(canvas, overlay)

    vignette = Image.new("RGBA", (WIDTH, HEIGHT))
    vignette_pixels = vignette.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            distance = ((x - 600) ** 2 + (y - 315) ** 2) ** 0.5
            alpha = int(max(0, min(0.7, (distance - 280) / 480 * 0.7)) * 255)
            vignette_pixels[x, y] = (0, 0, 0, alpha)
    return Image.alpha_composite(canvas, vignette)


def _emblem(canvas):
    path = IMAGE_DIR / "emblema-soto-cano.webp"
    if not path.exists():
        return
    emblem = Image.open(path).convert("RGBA").resize((104, 104), Image.Resampling.LANCZOS)
    mask = Image.new("L", (104, 104), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 103, 103), fill=255)
    emblem.putalpha(mask)
    canvas.alpha_composite(emblem, (548, 44))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((548, 44, 652, 148), outline=(212, 175, 55, 255), width=3)


def _title_lines(title):
    if " DE LA " in title:
        parts = title.split(" DE LA ")
        return parts[0] + " DE LA", " DE LA ".join(parts[1:])
    if " DEL " in title:
        parts = title.split(" DEL ")
        return parts[0] + " DEL", " DEL ".join(parts[1:])
    if " DE " in title:
        parts = title.split(" DE ")
        return parts[0], "DE " + " DE ".join(parts[1:])
    words = title.split()
    midpoint = (len(words) + 1) // 2
    return " ".join(words[:midpoint]), " ".join(words[midpoint:])


def _star(draw, cx, cy, outer=8.5, inner=3.8):
    points = []
    for index in range(10):
        radius = outer if index % 2 == 0 else inner
        angle = index * 3.141592653589793 / 5 - 3.141592653589793 / 2
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    draw.polygon(points, fill=(250, 230, 158, 255))


def render_preview(data):
    canvas = _background(data)
    draw = ImageDraw.Draw(canvas)
    gold = (212, 175, 55, 255)
    pale_gold = (250, 230, 158, 255)

    draw.rectangle((30, 30, 1170, 600), outline=(212, 175, 55, 115), width=4)
    draw.rectangle((42, 42, 1158, 588), outline=(212, 175, 55, 64), width=2)
    for x, y, dx, dy in ((30, 30, 1, 1), (1170, 30, -1, 1), (30, 600, 1, -1), (1170, 600, -1, -1)):
        draw.line((x + dx * 28, y, x, y, x, y + dy * 28), fill=gold, width=3)

    _emblem(canvas)
    _star(draw, 580, 180)
    _star(draw, 620, 180)

    anniversary = _value(data.get("aniversario"), "38")
    event = _value(data.get("nombre_evento"), "Aniversario de la Base Aérea “Cnel. José Enrique Soto Cano”")
    title = f"{anniversary}.º {event}".upper()
    title_font = _fit_font(draw, title, 780, 27, bold=True, serif=True, minimum=18)
    if draw.textbbox((0, 0), title, font=title_font)[2] <= 780:
        _center(draw, title, 213, title_font, pale_gold)
    else:
        line1, line2 = _title_lines(title)
        _center(draw, line1, 199, _fit_font(draw, line1, 820, 27, bold=True, serif=True, minimum=18), pale_gold)
        _center(draw, line2, 238, _fit_font(draw, line2, 820, 22, bold=True, serif=True, minimum=16), pale_gold)

    draw.line((380, 292, 820, 292), fill=(212, 175, 55, 102), width=1)
    draw.rectangle((180, 318, 1020, 482), fill=(4, 15, 29, 191), outline=(212, 175, 55, 89), width=1)

    treatment = _value(data.get("tratamiento"))
    grade = _value(data.get("grado")).upper()
    name = _value(data.get("nombre")).upper()
    cargo = _value(data.get("cargo"))
    if grade:
        _center(draw, grade, 337, _fit_font(draw, grade, 780, 20, bold=True, minimum=16), pale_gold)
    if name:
        _center(draw, name, 374, _fit_font(draw, name, 800, 36, bold=True, serif=True, minimum=24), (255, 255, 255, 255))
    if cargo:
        _center(draw, cargo, 430, _fit_font(draw, cargo, 800, 18, minimum=15), (201, 214, 228, 255))

    date = _value(data.get("fecha")).upper()
    hour = _value(data.get("hora")).upper()
    date_hour = " · ".join(part for part in (date, hour) if part)
    if date_hour:
        _center(draw, date_hour, 514, _fit_font(draw, date_hour, 800, 17, bold=True, minimum=14), (112, 180, 224, 255))

    output = BytesIO()
    canvas.convert("RGB").save(output, format="PNG", optimize=True)
    return output.getvalue()
