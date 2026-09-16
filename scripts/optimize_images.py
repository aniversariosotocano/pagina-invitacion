import os
from PIL import Image

images = [
    ('soto-cano-pista.png', 82, False),
    ('Maule.png', 90, True),
    ('Supertucano.png', 90, True),
    ('emblema-soto-cano.png', 92, True),
    ('tucano-atardecer.jpg', 85, False),
    ('tucanos-formacion.jpg', 85, False),
    ('tucano-vuelo.jpg', 85, False),
    ('og-walter-paz.png', 86, False)
]

total_orig = 0
total_webp = 0

print("=== OPTIMIZACIÓN DE IMÁGENES A FORMATO WEBP ===")
for filename, quality, has_alpha in images:
    src_path = os.path.join('assets/images', filename)
    name_no_ext = os.path.splitext(filename)[0]
    dst_path = os.path.join('assets/images', name_no_ext + '.webp')
    
    img = Image.open(src_path)
    if has_alpha:
        img.save(dst_path, 'WEBP', quality=quality, method=6)
    else:
        img = img.convert('RGB')
        img.save(dst_path, 'WEBP', quality=quality, method=6)
        
    orig_kb = os.path.getsize(src_path) / 1024
    webp_kb = os.path.getsize(dst_path) / 1024
    saved = (1 - webp_kb / orig_kb) * 100
    total_orig += orig_kb
    total_webp += webp_kb
    print(f"{filename:25} -> {name_no_ext + '.webp':25} | {orig_kb:6.1f} KB -> {webp_kb:5.1f} KB (-{saved:4.1f}%)")

total_saved = (1 - total_webp / total_orig) * 100
print("-" * 75)
print(f"TOTAL: {total_orig:6.1f} KB -> {total_webp:6.1f} KB (Ahorro global: -{total_saved:4.1f}%)")
