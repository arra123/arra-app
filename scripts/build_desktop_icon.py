"""Build the Windows Noda icon from the existing red/blue app mark.

The source artwork has a large pale square around a small mark. Windows then
shrinks that whole square, which is why the taskbar icon looks tiny. This
script removes only the light background connected to the canvas edges,
preserves the enclosed light parts of the mark, and scales the mark to 91%.
"""

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "pc-app" / "build" / "noda-appmark-source.png"
FALLBACK_SOURCE = ROOT / "assets" / "images" / "app-icon-1024.png"
PNG_TARGET = ROOT / "pc-app" / "icon.png"
ICO_TARGET = ROOT / "pc-app" / "icon.ico"


def is_edge_background(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    if alpha < 16:
        return True
    return min(red, green, blue) >= 218 and max(red, green, blue) - min(red, green, blue) <= 34


def remove_connected_background(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    pixels = result.load()
    width, height = result.size
    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(1, height - 1):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        offset = y * width + x
        if seen[offset]:
            continue
        seen[offset] = 1
        pixel = pixels[x, y]
        if not is_edge_background(pixel):
            continue
        pixels[x, y] = (pixel[0], pixel[1], pixel[2], 0)
        if x:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))
    return result


def main() -> None:
    if not SOURCE.exists():
        SOURCE.write_bytes(FALLBACK_SOURCE.read_bytes())

    cleaned = remove_connected_background(Image.open(SOURCE))
    alpha = cleaned.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise RuntimeError("The app mark was not detected")
    mark = cleaned.crop(bounds)

    canvas_size = 1024
    target_size = round(canvas_size * 0.91)
    scale = target_size / max(mark.size)
    mark = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.alpha_composite(mark, ((canvas_size - mark.width) // 2, (canvas_size - mark.height) // 2))

    canvas.save(PNG_TARGET, optimize=True)
    canvas.save(
        ICO_TARGET,
        format="ICO",
        sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)],
    )
    print(f"Built {PNG_TARGET.relative_to(ROOT)} and {ICO_TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
