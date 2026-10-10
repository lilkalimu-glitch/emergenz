"""Zeichnet das App-Icon (Planet mit Sonnensichel) in allen Android-Größen.

Aufruf: python3 scripts/make-icons.py   (braucht Pillow, optional numpy)
Ergebnis liegt in android-res/ und wird von scripts/patch-android.py ins Android-Projekt kopiert.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "android-res")

SS = 1024  # Zeichenauflösung (wird verkleinert)
BG = (7, 12, 26)
L = (-0.62, 0.55, 0.56)
ln = math.sqrt(sum(v * v for v in L))
L = tuple(v / ln for v in L)

# Kontinente als Kappen auf der Kugel: (Richtung, Radius in Grad)
LANDS = [
    ((-0.35, 0.55, 0.75), 24),
    ((0.25, 0.25, 0.93), 17),
    ((-0.62, -0.18, 0.76), 14),
    ((0.42, -0.45, 0.78), 19),
    ((-0.05, 0.92, 0.38), 12),
]


def norm(v):
    l = math.sqrt(sum(x * x for x in v))
    return tuple(x / l for x in v)


LANDS = [(norm(d), math.cos(math.radians(r))) for d, r in LANDS]


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def planet_layer(radius_frac=0.30, mono=False):
    """Planet auf transparentem Grund, Kantenlänge SS."""
    img = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
    px = img.load()
    cx = cy = SS / 2
    R = SS * radius_frac
    halo = R * 1.12
    for y in range(int(cy - halo) - 2, int(cy + halo) + 3):
        for x in range(int(cx - halo) - 2, int(cx + halo) + 3):
            dx = (x + 0.5 - cx) / R
            dy = (cy - (y + 0.5)) / R
            r2 = dx * dx + dy * dy
            if r2 >= 1.0:
                r = math.sqrt(r2)
                if r < halo / R and not mono:
                    # Atmosphärensaum, auf der Tagseite heller
                    ang = (dx * L[0] + dy * L[1]) / r
                    a = (1 - (r - 1) / (halo / R - 1)) ** 2 * (0.25 + 0.6 * max(0.0, ang))
                    px[x, y] = (120, 175, 255, int(255 * a * 0.8))
                continue
            dz = math.sqrt(1 - r2)
            n = (dx, dy, dz)
            d = n[0] * L[0] + n[1] * L[1] + n[2] * L[2]
            lit = smooth(-0.12, 0.62, d)
            if mono:
                a = 0.28 + 0.72 * lit
                px[x, y] = (255, 255, 255, int(255 * a))
                continue
            # Land oder Meer
            land = 0.0
            for c, cr in LANDS:
                dot = n[0] * c[0] + n[1] * c[1] + n[2] * c[2]
                wob = 0.012 * math.sin(n[0] * 23 + n[1] * 17) + 0.01 * math.sin(n[2] * 31 - n[0] * 13)
                land = max(land, smooth(cr - 0.008, cr + 0.008, dot + wob))
            sea = mix((24, 92, 150), (10, 34, 78), 1 - dz)
            ground = mix((70, 128, 70), (176, 166, 96), smooth(-0.2, 0.6, n[1] * 0.5 + n[0] * 0.4))
            base = mix(sea, ground, land)
            col = tuple(v * (0.08 + 0.92 * lit) * (0.82 + 0.18 * dz) for v in base)
            # Sonnensichel am beleuchteten Rand
            rim = (1 - dz) ** 2.6 * max(0.0, d)
            col = mix(col, (245, 198, 106), min(1.0, rim * 2.2))
            # Glanz auf dem Meer
            rv = 2 * d * dz - L[2]
            if d > 0 and land < 0.5:
                s = max(0.0, rv) ** 30 * 0.45
                col = tuple(min(255.0, v + 255 * s) for v in col)
            px[x, y] = (int(col[0]), int(col[1]), int(col[2]), 255)
    return img


def save(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path)


def main():
    fg = planet_layer(0.27)
    mono = planet_layer(0.27, mono=True)
    dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for name, f in dens.items():
        # Vordergrund für adaptive Icons (108 dp)
        save(fg, os.path.join(OUT, f"mipmap-{name}", "emergenz_icon_fg.png"), int(108 * f))
        save(mono, os.path.join(OUT, f"mipmap-{name}", "emergenz_icon_mono.png"), int(108 * f))
        # Klassische Icons (48 dp) für alte Android-Versionen
        size = int(48 * f)
        sq = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(sq)
        d.rounded_rectangle([0, 0, SS - 1, SS - 1], radius=SS * 0.22, fill=BG + (255,))
        big = planet_layer(0.36)
        sq.alpha_composite(big)
        save(sq, os.path.join(OUT, f"mipmap-{name}", "ic_launcher.png"), size)
        rnd = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
        d = ImageDraw.Draw(rnd)
        d.ellipse([0, 0, SS - 1, SS - 1], fill=BG + (255,))
        rnd.alpha_composite(big)
        save(rnd, os.path.join(OUT, f"mipmap-{name}", "ic_launcher_round.png"), size)
    # Startbild-Logo (96 dp bei xxhdpi)
    logo = planet_layer(0.42)
    save(logo, os.path.join(OUT, "drawable-xxhdpi", "emergenz_splash_logo.png"), 288)
    # Vorschau für Browser und README
    prev = Image.new("RGBA", (SS, SS), BG + (255,))
    prev.alpha_composite(planet_layer(0.36))
    save(prev, os.path.join(ROOT, "www", "icon.png"), 192)
    save(prev, os.path.join(ROOT, "docs", "icon.png"), 256)
    print("Icons geschrieben")


if __name__ == "__main__":
    main()
