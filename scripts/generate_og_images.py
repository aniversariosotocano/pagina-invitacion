import os
from PIL import Image, ImageDraw, ImageFont, ImageOps

def render_card(output_path, bg_path, emblem_path, guest_info):
    W, H = 1200, 630
    
    # 1. Base Image
    if bg_path and os.path.exists(bg_path):
        bg = Image.open(bg_path).convert('RGBA')
        # Cover fit
        scale = max(W / bg.width, H / bg.height)
        new_w = int(bg.width * scale)
        new_h = int(bg.height * scale)
        bg = bg.resize((new_w, new_h), Image.Resampling.LANCZOS)
        # Center crop
        crop_x = (new_w - W) // 2
        crop_y = (new_h - H) // 2
        card = bg.crop((crop_x, crop_y, crop_x + W, crop_y + H))
    else:
        card = Image.new('RGBA', (W, H), (6, 18, 34, 255))

    # 2. Dark Navy Gradient Overlay
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw_overlay = ImageDraw.Draw(overlay)
    
    for y in range(H):
        ratio = y / H
        r = int(6 * (1 - ratio) + 2 * ratio)
        g = int(17 * (1 - ratio) + 6 * ratio)
        b = int(32 * (1 - ratio) + 14 * ratio)
        a = int(215 * (1 - ratio) + 248 * ratio)
        draw_overlay.line([(0, y), (W, y)], fill=(r, g, b, a))

    card = Image.alpha_composite(card, overlay)

    # 3. Vignette
    vignette = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw_vig = ImageDraw.Draw(vignette)
    cx, cy = W // 2, H // 2
    for i in range(15):
        rad = 320 + i * 25
        alpha = int((i / 15.0)**1.5 * 130)
        draw_vig.rectangle([(cx - rad * 1.6, cy - rad), (cx + rad * 1.6, cy + rad)], fill=None, outline=(0, 0, 0, alpha), width=30)
    card = Image.alpha_composite(card, vignette)

    draw = ImageDraw.Draw(card)

    # 4. Gold Frames
    gold_main = (212, 175, 55, 230)
    gold_light = (247, 231, 169, 255)
    gold_dim = (212, 175, 55, 75)
    
    # Outer frame
    draw.rectangle([(30, 30), (1170, 600)], outline=gold_main, width=3)
    # Inner thin frame
    draw.rectangle([(42, 42), (1158, 588)], outline=gold_dim, width=1)

    # Corner brackets
    def corner(x, y, dx, dy):
        draw.line([(x, y), (x + dx * 32, y)], fill=gold_main, width=3)
        draw.line([(x, y), (x, y + dy * 32)], fill=gold_main, width=3)

    corner(30, 30, 1, 1)
    corner(1170, 30, -1, 1)
    corner(30, 600, 1, -1)
    corner(1170, 600, -1, -1)

    # 5. Emblem
    if emblem_path and os.path.exists(emblem_path):
        emblem = Image.open(emblem_path).convert('RGBA')
        emblem_size = 112
        emblem = emblem.resize((emblem_size, emblem_size), Image.Resampling.LANCZOS)
        
        # Circular mask
        mask = Image.new('L', (emblem_size, emblem_size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse([(0, 0), (emblem_size, emblem_size)], fill=255)
        
        emblem_x = (W - emblem_size) // 2
        emblem_y = 52
        card.paste(emblem, (emblem_x, emblem_y), mask)
        
        # Gold ring around emblem
        draw.ellipse([(emblem_x - 1, emblem_y - 1), (emblem_x + emblem_size + 1, emblem_y + emblem_size + 1)], outline=gold_main, width=3)

    # Fonts
    font_arial_15 = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    font_arialbd_18 = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)
    font_arialbd_19 = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 19)
    font_arial_17 = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
    font_georgiabd_40 = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 40)
    font_georgiabd_34 = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 34)
    font_georgiabd_17 = ImageFont.truetype('C:/Windows/Fonts/georgiab.ttf', 17)

    # Star ornaments (Vector geometric stars)
    import math
    def draw_star(draw_ctx, cx, cy, r_outer, r_inner, color):
        pts = []
        for i in range(10):
            r = r_outer if i % 2 == 0 else r_inner
            ang = i * math.pi / 5 - math.pi / 2
            pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
        draw_ctx.polygon(pts, fill=color)

    draw_star(draw, W // 2 - 20, 180, 8.5, 3.8, gold_light)
    draw_star(draw, W // 2 + 20, 180, 8.5, 3.8, gold_light)

    # Anniversary Title
    anni_title = f"{guest_info.get('aniversario', '38')} ANIVERSARIO"
    draw.text((W // 2, 230), anni_title, fill=gold_light, font=font_georgiabd_40, anchor="mt")

    # Divider line
    draw.line([(380, 292), (820, 292)], fill=gold_dim, width=1)

    # 7. Guest Box
    box_rect = [(170, 318), (1030, 482)]
    box_overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    box_draw = ImageDraw.Draw(box_overlay)
    box_draw.rectangle(box_rect, fill=(4, 15, 29, 200), outline=gold_dim, width=1)
    card = Image.alpha_composite(card, box_overlay)
    draw = ImageDraw.Draw(card)

    # Grado
    grado = guest_info.get('grado', '').upper()
    draw.text((W // 2, 354), grado, fill=gold_light, font=font_arialbd_19, anchor="mt")

    # Nombre
    nombre = guest_info.get('nombre', '').upper()
    draw.text((W // 2, 402), nombre, fill=(255, 255, 255, 255), font=font_georgiabd_34, anchor="mt")

    # Cargo
    cargo = guest_info.get('cargo', '')
    draw.text((W // 2, 445), cargo, fill=(201, 214, 228, 240), font=font_arial_17, anchor="mt")

    # 8. Date and Time
    fecha_hora = f"{guest_info.get('fecha', '24 DE SEPTIEMBRE 2026').upper()}  ·  {guest_info.get('hora', '10:00 AM').upper()}"
    draw.text((W // 2, 530), fecha_hora, fill=(112, 180, 224, 255), font=font_arialbd_18, anchor="mt")

    # Save
    card.convert('RGB').save(output_path, 'PNG', quality=95)
    print(f"Generated: {output_path}")

if __name__ == '__main__':
    guest = {
        'tratamiento': 'Al: Sr. Comandante General De La FAH',
        'grado': 'GENERAL DE BRIGADA',
        'nombre': 'WALTER YANUARIO PAZ LÓPEZ',
        'cargo': 'Comandante General de la Fuerza Aérea Hondureña',
        'aniversario': '38',
        'fecha': '24 DE SEPTIEMBRE 2026',
        'hora': '10:00 AM'
    }
    render_card(
        'assets/images/og-walter-paz.png',
        'assets/images/tucano-atardecer.jpg',
        'assets/images/emblema-soto-cano.png',
        guest
    )
