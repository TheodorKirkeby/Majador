"""Builds every MajaDor icon from the people cut-out.

    python scripts/make-icons.py

Input:  design/source/people.png  (the two of us, background removed; kept
        out of git, see .gitignore)
Output: public/*.png

Round icons (browser tab, notifications, in-app logo) are a green circle on a
transparent square. The iPhone home-screen icon and Android's "maskable" icon
must be full-bleed squares, because the phone cuts its own shape out of them.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PRIMARY = (0x00, 0xCC, 0x32, 255)
S = 1024  # work at this size, then scale down

people = Image.open(ROOT / "design/source/people.png").convert("RGBA")
people = people.crop(people.getbbox())


def place(width: int, x: int, top: int) -> Image.Image:
    """The cut-out scaled to `width`, on a transparent S x S canvas."""
    scaled = people.resize((width, round(people.height * width / people.width)), Image.LANCZOS)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.alpha_composite(scaled, (x, top))
    return layer


def circle_mask() -> Image.Image:
    big = Image.new("L", (S * 2, S * 2), 0)
    ImageDraw.Draw(big).ellipse((0, 0, S * 2 - 1, S * 2 - 1), fill=255)
    return big.resize((S, S), Image.LANCZOS)


mask = circle_mask()

# Round logo: the photo's straight left/right edges fall outside the circle.
round_people = place(width=907, x=98, top=90)
round_logo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
disc = Image.new("RGBA", (S, S), PRIMARY)
disc.alpha_composite(round_people)
round_logo.paste(disc, (0, 0), mask)

# Square logo: edge to edge, the phone applies its own mask.
square_logo = Image.new("RGBA", (S, S), PRIMARY)
square_logo.alpha_composite(place(width=960, x=0, top=56))

# Status-bar badge: Android only uses the shape (white on transparent), so a
# photo cannot work there. A small house with a heart cut out of it instead.
def badge() -> Image.Image:
    b = S * 2
    shape = Image.new("L", (b, b), 0)
    d = ImageDraw.Draw(shape)
    u = b / 24  # draw on a 24-unit grid
    d.polygon([(12 * u, 2.5 * u), (1.5 * u, 12 * u), (22.5 * u, 12 * u)], fill=255)  # roof
    d.rounded_rectangle((4.5 * u, 10.5 * u, 19.5 * u, 21.5 * u), radius=1.5 * u, fill=255)  # walls
    # heart, cut out
    d.ellipse((8.6 * u, 11.2 * u, 12.2 * u, 14.8 * u), fill=0)
    d.ellipse((11.8 * u, 11.2 * u, 15.4 * u, 14.8 * u), fill=0)
    d.polygon([(8.75 * u, 13.7 * u), (15.25 * u, 13.7 * u), (12 * u, 18.3 * u)], fill=0)
    out = Image.new("RGBA", (b, b), (255, 255, 255, 0))
    out.putalpha(shape)
    return out.resize((S, S), Image.LANCZOS)


silhouette = badge()


def save(img: Image.Image, name: str, size: int, opaque: bool = False):
    out = img.resize((size, size), Image.LANCZOS)
    if opaque:
        out = out.convert("RGB")
    out.save(ROOT / "public" / name, optimize=True)
    print(f"{name:24} {size}x{size}")


save(round_logo, "icon-512.png", 512)
save(round_logo, "icon-192.png", 192)
save(round_logo, "favicon.png", 96)
save(square_logo, "icon-maskable-512.png", 512, opaque=True)
save(square_logo, "apple-touch-icon.png", 180, opaque=True)
save(silhouette, "badge-96.png", 96)
