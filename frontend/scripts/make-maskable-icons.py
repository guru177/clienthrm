"""Generate maskable PWA icons with Android safe-zone padding (~40% inset)."""
from pathlib import Path

from PIL import Image

public = Path(__file__).resolve().parents[1] / "public"
src_candidates = [
    public / "images" / "logo.png",
    public / "logo512.png",
    public / "logo192.png",
]
src = next((p for p in src_candidates if p.exists()), None)
if src is None:
    raise SystemExit("No logo source found under frontend/public")


def make_maskable(size: int, out: Path) -> None:
    # Safe zone: keep logo inside inner ~72% so adaptive icons don't crop it.
    inner = int(size * 0.72)
    logo = Image.open(src).convert("RGBA")
    pixels = logo.load()
    for y in range(logo.height):
        for x in range(logo.width):
            r, g, b, a = pixels[x, y]
            if a < 8:
                continue
            if r < 40 and g < 40 and b < 40:
                pixels[x, y] = (255, 255, 255, 255)
            else:
                pixels[x, y] = (r, g, b, 255)

    logo.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, "PNG")
    print(f"wrote {out} {canvas.size}")


make_maskable(192, public / "maskable-icon-192.png")
make_maskable(512, public / "maskable-icon-512.png")
print("done")
