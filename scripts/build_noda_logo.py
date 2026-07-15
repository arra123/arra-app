from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PC = ROOT / "pc-app"
PNG = PC / "icon.png"
ICO = PC / "icon.ico"
APP_SOURCE = ROOT / "assets" / "images" / "noda-app-icon.png"
MARK_SOURCE = ROOT / "assets" / "images" / "noda-mark.png"
BUILD_SOURCE = PC / "build" / "noda-icon-source.png"
DESIGN_SOURCE = ROOT / "design" / "brand" / "noda-icon.png"
BUILD = PC / "build"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


if not APP_SOURCE.exists() or not MARK_SOURCE.exists():
    raise FileNotFoundError("Нет актуальных ассетов Noda в assets/images")

# Одна и та же актуальная иконка используется приложением, установщиком,
# ярлыком и удалением. Скрипт больше не может вернуть старый зелёный знак.
app_icon = Image.open(APP_SOURCE).convert("RGBA").resize((1024, 1024), Image.Resampling.LANCZOS)
mark = Image.open(MARK_SOURCE).convert("RGBA")
app_icon.save(PNG, "PNG")
app_icon.save(BUILD_SOURCE, "PNG")
app_icon.save(DESIGN_SOURCE, "PNG")
app_icon.save(
    ICO,
    format="ICO",
    sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)],
)


def ambient_background(size: tuple[int, int]) -> Image.Image:
    width, height = size
    art = Image.new("RGB", size, "#10151f")
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    radius = max(width, height)
    draw.ellipse((-radius * 0.55, -radius * 0.28, radius * 0.9, radius * 1.15), fill=(40, 105, 255, 88))
    draw.ellipse((width * 0.22, height * 0.30, width * 1.45, height * 1.22), fill=(37, 222, 142, 50))
    glow = glow.filter(ImageFilter.GaussianBlur(max(14, radius // 7)))
    return Image.alpha_composite(art.convert("RGBA"), glow)


def fit_mark(max_size: tuple[int, int]) -> Image.Image:
    logo = mark.copy()
    logo.thumbnail(max_size, Image.Resampling.LANCZOS)
    return logo


def sidebar_art() -> Image.Image:
    size = (164, 314)
    art = ambient_background(size)
    draw = ImageDraw.Draw(art)
    logo = fit_mark((92, 92))
    art.alpha_composite(logo, ((size[0] - logo.width) // 2, 52))
    draw.text((24, 176), "Noda", font=font(27, True), fill="#F7FAFF")
    draw.rounded_rectangle((24, 216, 78, 220), radius=2, fill="#4E82FF")
    draw.rounded_rectangle((82, 216, 140, 220), radius=2, fill="#38D792")
    draw.text((24, 246), "ПК · ноутбук · сервер", font=font(11), fill="#A8B4C7")
    return art.convert("RGB")


def header_art() -> Image.Image:
    size = (150, 57)
    art = Image.new("RGBA", size, "#F7F9FC")
    draw = ImageDraw.Draw(art)
    logo = fit_mark((39, 39))
    art.alpha_composite(logo, (8, (size[1] - logo.height) // 2))
    draw.text((54, 13), "Noda", font=font(20, True), fill="#121824")
    draw.rounded_rectangle((54, 40, 92, 42), radius=1, fill="#4E82FF")
    draw.rounded_rectangle((95, 40, 132, 42), radius=1, fill="#38D792")
    return art.convert("RGB")


sidebar_art().save(BUILD / "installerSidebar.bmp")
sidebar_art().save(BUILD / "uninstallerSidebar.bmp")
header_art().save(BUILD / "installerHeader.bmp")
print(f"Noda brand assets: {PNG} + {ICO} + installer artwork")
