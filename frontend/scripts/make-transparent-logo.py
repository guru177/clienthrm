"""Create a clean transparent-background logo from images/logo.png (black plate removed)."""
from pathlib import Path

from PIL import Image

public = Path(__file__).resolve().parents[1] / "public"
src = public / "images" / "logo.png"
out = public / "images" / "logo-transparent.png"


def main() -> None:
    im = Image.open(src).convert("RGBA")
    pixels = im.load()
    w, h = im.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            # Near-black plate -> transparent
            if r < 45 and g < 45 and b < 45:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (r, g, b, 255)

    # Crop to visible content with a little padding
    bbox = im.getbbox()
    if bbox:
        pad = 8
        left = max(0, bbox[0] - pad)
        top = max(0, bbox[1] - pad)
        right = min(w, bbox[2] + pad)
        bottom = min(h, bbox[3] + pad)
        im = im.crop((left, top, right, bottom))

    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "PNG")
    print(f"wrote {out} {im.size}")


if __name__ == "__main__":
    main()
