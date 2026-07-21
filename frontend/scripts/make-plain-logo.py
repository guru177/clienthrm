"""Replace near-black logo backgrounds with white for splash / PWA icons."""
from pathlib import Path

from PIL import Image

public = Path(__file__).resolve().parents[1] / "public"
src = public / "images" / "logo.png"
if not src.exists():
    src = public / "logo512.png"


def strip_black_to_white(src_path: Path, out_path: Path, size: int | None = None) -> None:
    im = Image.open(src_path).convert("RGBA")
    if size:
        # Fit logo into size on a white canvas (keep aspect)
        im.thumbnail((size, size), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        x = (size - im.width) // 2
        y = (size - im.height) // 2
        # First whitify source pixels
        pixels = im.load()
        for yy in range(im.height):
            for xx in range(im.width):
                r, g, b, a = pixels[xx, yy]
                if r < 40 and g < 40 and b < 40:
                    pixels[xx, yy] = (255, 255, 255, 255)
                else:
                    pixels[xx, yy] = (r, g, b, 255)
        canvas.paste(im, (x, y), im)
        im = canvas
    else:
        pixels = im.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]
                if r < 40 and g < 40 and b < 40:
                    pixels[x, y] = (255, 255, 255, 255)
                else:
                    pixels[x, y] = (r, g, b, 255)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    im.save(out_path, "PNG")
    print(f"wrote {out_path} {im.size}")


# Splash / in-app plain logo
strip_black_to_white(src, public / "images" / "logo-plain.png")

# Overwrite PWA icons with white-background versions of the monogram
icon_src = public / "logo192.png"
if icon_src.exists():
    # Read original before overwrite — keep a backup first
    backup = public / "logo192-dark.png"
    if not backup.exists():
        Image.open(icon_src).save(backup)
    strip_black_to_white(backup, public / "logo192.png", 192)
    backup512 = public / "logo512-dark.png"
    src512 = public / "logo512.png"
    if src512.exists() and not backup512.exists():
        Image.open(src512).save(backup512)
    strip_black_to_white(backup512 if backup512.exists() else backup, public / "logo512.png", 512)
else:
    strip_black_to_white(src, public / "logo192.png", 192)
    strip_black_to_white(src, public / "logo512.png", 512)

print("done")
