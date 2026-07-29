"""Пересборка знака Noda во все нужные размеры.

Источник — векторно-чистый PNG 1254 px (`design/brand/generated/noda.png`), а не
маленький 192 px со страницы: при увеличении знака мелкий источник мылил края.

Знак кадрируется по фактическим границам (у исходника большие прозрачные поля) и
кладётся на холст так, чтобы занимать `MARK_RATIO` высоты иконки.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PC = ROOT / "pc-app"
PNG = PC / "icon.png"
ICO = PC / "icon.ico"
# Знак в высоком разрешении. Запасные варианты — на случай, если основной пропал.
MARK_SOURCES = [
    ROOT / "design" / "brand" / "generated" / "noda.png",
    ROOT / "noda-v2" / "assets" / "noda.png",
    ROOT / "noda-ios" / "assets" / "noda.png",
]
BRAND_SOURCE = ROOT / "design" / "brand" / "noda-icon.png"
BUILD_SOURCE = PC / "build" / "noda-icon-source.png"
BUILD = PC / "build"
MOBILE_ASSETS = ROOT / "assets" / "images"
PC_RENDERER_ASSETS = PC / "renderer" / "assets"

BACKGROUND_TOP = (252, 253, 255)
BACKGROUND_BOTTOM = (223, 232, 245)
# Доля высоты иконки, которую занимает знак. Было 0.58 (знак терялся в полях).
MARK_RATIO = 0.76
# У Android adaptive icon система обрезает ~1/3 холста маской, поэтому знак меньше.
ANDROID_RATIO = 0.60


def load_mark() -> Image.Image:
    for candidate in MARK_SOURCES:
        if candidate.exists():
            mark = Image.open(candidate).convert("RGBA")
            box = mark.getchannel("A").getbbox()
            return mark.crop(box) if box else mark
    raise FileNotFoundError("Не нашёл ни одного источника знака Noda: " + ", ".join(map(str, MARK_SOURCES)))


MARK = load_mark()


def gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    """Вертикальный градиент — так залиты системные иконки iOS, плоская заливка выглядит мёртвой."""
    strip = Image.new("RGB", (1, size))
    draw = ImageDraw.Draw(strip)
    for y in range(size):
        t = y / max(1, size - 1)
        draw.point((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return strip.resize((size, size), Image.Resampling.BILINEAR).convert("RGBA")


def place(size: int, ratio: float, background: Image.Image | None, shadow: bool = False) -> Image.Image:
    """Знак по центру холста; масштаб — по большей стороне знака."""
    canvas = background.copy() if background is not None else Image.new("RGBA", (size, size), (0, 0, 0, 0))
    target = round(size * ratio)
    scale = target / max(MARK.size)
    fitted = MARK.resize((max(1, round(MARK.width * scale)), max(1, round(MARK.height * scale))), Image.Resampling.LANCZOS)
    offset = ((size - fitted.width) // 2, (size - fitted.height) // 2)
    if shadow:
        # Мягкая тень под знаком даёт глубину, как у иконок Apple.
        layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        blob = Image.new("RGBA", fitted.size, (10, 20, 40, 255))
        blob.putalpha(fitted.getchannel("A").point(lambda a: int(a * 0.34)))
        layer.alpha_composite(blob, (offset[0], offset[1] + round(size * 0.014)))
        canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(size / 58)))
    canvas.alpha_composite(fitted, offset)
    return canvas


base = place(1024, MARK_RATIO, gradient(1024, BACKGROUND_TOP, BACKGROUND_BOTTOM), shadow=True)

BRAND_SOURCE.parent.mkdir(parents=True, exist_ok=True)
MOBILE_ASSETS.mkdir(parents=True, exist_ok=True)
PC_RENDERER_ASSETS.mkdir(parents=True, exist_ok=True)
BUILD.mkdir(parents=True, exist_ok=True)

base.save(BRAND_SOURCE, "PNG")
base.save(PNG, "PNG")
base.save(BUILD_SOURCE, "PNG")
base.save(ICO, format="ICO", sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)])
base.save(MOBILE_ASSETS / "icon.png", "PNG")
base.save(MOBILE_ASSETS / "app-icon-1024.png", "PNG")

foreground = place(1024, ANDROID_RATIO, None)
foreground.save(MOBILE_ASSETS / "android-icon-foreground.png", "PNG")

monochrome = Image.new("RGBA", foreground.size, (0, 0, 0, 0))
white = Image.new("RGBA", foreground.size, "#FFFFFF")
white.putalpha(foreground.getchannel("A"))
monochrome.alpha_composite(white)
monochrome.save(MOBILE_ASSETS / "android-icon-monochrome.png", "PNG")

# Фавикон и знак в интерфейсе ПК — без фона, максимально крупно.
favicon = place(256, 0.94, None)
favicon.save(MOBILE_ASSETS / "favicon.png", "PNG")
favicon.save(PC_RENDERER_ASSETS / "noda.png", "PNG")


def installer_art(size: tuple[int, int], logo_size: int, logo_xy: tuple[int, int], title_xy: tuple[int, int]) -> Image.Image:
    art = Image.new("RGB", size, "#17191d")
    logo = base.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    art.paste(logo, logo_xy, logo)
    draw = ImageDraw.Draw(art)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 28 if size[0] > 200 else 20)
    except OSError:
        font = ImageFont.load_default()
    draw.text(title_xy, "NODA", fill="#f7f8fa", font=font)
    return art


installer_art((164, 314), 116, (24, 46), (45, 184)).save(BUILD / "installerSidebar.bmp")
installer_art((164, 314), 116, (24, 46), (45, 184)).save(BUILD / "uninstallerSidebar.bmp")
installer_art((150, 57), 48, (4, 4), (59, 13)).save(BUILD / "installerHeader.bmp")
print(f"Знак Noda пересобран: доля знака {MARK_RATIO:.0%}, источник {MARK.size[0]}x{MARK.size[1]}")
