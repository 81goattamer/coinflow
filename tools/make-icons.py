# アプリアイコン（PNG）を描いて作る: python tools/make-icons.py
# 紺地に金のコイン（¥）と、そのまわりを流れる矢印
import math
from pathlib import Path

from PIL import Image, ImageDraw

ICONS = Path(__file__).resolve().parent.parent / 'icons'
S = 1024
BG = (22, 26, 48)
GOLD = (240, 185, 60)
GOLD_DARK = (196, 136, 22)
GOLD_LIGHT = (255, 214, 120)
FLOW = (142, 152, 255)


def draw(size=S, inset=0.0):
    img = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(img)
    k = 1 - inset  # maskable 用に絵を縮める
    c = S / 2
    R = 300 * k
    # 流れる矢印（コインのまわりの弧2本）
    w = int(46 * k)
    rr = 410 * k
    box = [c - rr, c - rr, c + rr, c + rr]
    for start in (200, 20):
        d.arc(box, start=start, end=start + 120, fill=FLOW, width=w)
        a = math.radians(start + 120)
        tip = (c + rr * math.cos(a), c + rr * math.sin(a))
        # 矢じり（弧の進む向き）
        tx, ty = -math.sin(a), math.cos(a)
        nx, ny = math.cos(a), math.sin(a)
        L = 70 * k
        p1 = (tip[0] + tx * L, tip[1] + ty * L)
        p2 = (tip[0] - tx * 10 * k + nx * L * .75, tip[1] - ty * 10 * k + ny * L * .75)
        p3 = (tip[0] - tx * 10 * k - nx * L * .75, tip[1] - ty * 10 * k - ny * L * .75)
        d.polygon([p1, p2, p3], fill=FLOW)
    # コイン
    d.ellipse([c - R, c - R, c + R, c + R], fill=GOLD_DARK)
    d.ellipse([c - R + 14 * k, c - R + 8 * k, c + R - 14 * k, c + R - 20 * k], fill=GOLD)
    ri = R - 52 * k
    d.ellipse([c - ri, c - ri - 6 * k, c + ri, c + ri - 6 * k], outline=GOLD_DARK, width=int(14 * k))
    # ¥
    lw = int(40 * k)
    cy = c - 6 * k
    top = cy - 130 * k
    mid = cy - 10 * k
    bot = cy + 150 * k
    d.line([(c - 110 * k, top), (c, mid)], fill=GOLD_DARK, width=lw)
    d.line([(c + 110 * k, top), (c, mid)], fill=GOLD_DARK, width=lw)
    d.line([(c, mid), (c, bot)], fill=GOLD_DARK, width=lw)
    for y in (mid + 30 * k, mid + 95 * k):
        d.line([(c - 95 * k, y), (c + 95 * k, y)], fill=GOLD_DARK, width=int(30 * k))
    # つや
    d.arc([c - R + 40 * k, c - R + 34 * k, c + R - 40 * k, c + R - 46 * k], start=200, end=250, fill=GOLD_LIGHT, width=int(16 * k))
    return img.resize((size, size), Image.LANCZOS)


ICONS.mkdir(exist_ok=True)
for name, size in [('icon-180.png', 180), ('icon-192.png', 192), ('icon-512.png', 512), ('favicon.png', 96)]:
    draw(size).save(ICONS / name, optimize=True)
draw(512, inset=0.2).save(ICONS / 'icon-maskable-512.png', optimize=True)
print('ok')
