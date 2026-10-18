#!/usr/bin/env python3
"""Draw the app icons (an element tile reading "Ec") into icons/. Run: python3 scripts/build_icons.py"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BG, TILE, INK = (31, 61, 140), (227, 234, 251), (27, 31, 39)


def draw(size, maskable):
    img = Image.new('RGB', (size, size), BG)
    d = ImageDraw.Draw(img)
    pad = size * (0.2 if maskable else 0.12)  # maskable icons keep content in the central safe zone
    box = [pad, pad, size - pad, size - pad]
    d.rounded_rectangle(box, radius=size * 0.08, fill=TILE)
    w = box[2] - box[0]
    d.text((box[0] + w * 0.1, box[1] + w * 0.06), '118', font=ImageFont.truetype(REG, int(w * 0.15)), fill=INK)
    d.text((box[0] + w / 2, box[1] + w * 0.56), 'Ec', font=ImageFont.truetype(BOLD, int(w * 0.46)), fill=INK, anchor='mm')
    d.text((box[0] + w / 2, box[1] + w * 0.86), 'COMBINATOR', font=ImageFont.truetype(BOLD, int(w * 0.085)), fill=INK, anchor='mm')
    return img


for size in (180, 192, 512):
    draw(size, False).save(os.path.join(ROOT, 'icons', f'icon-{size}.png'), optimize=True)
draw(512, True).save(os.path.join(ROOT, 'icons', 'icon-maskable-512.png'), optimize=True)
print('icons written')
