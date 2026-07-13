from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PC = ROOT / "pc-app"
PNG = PC / "icon.png"
ICO = PC / "icon.ico"
BRAND_SOURCE = ROOT / "design" / "brand" / "noda-icon.png"
BUILD_SOURCE = PC / "build" / "noda-icon-source.png"
BUILD = PC / "build"

# Канонический знак Noda хранится в design/brand. Сборка больше не рисует
# устаревшие сине-зелёные стрелки и не может незаметно вернуть старую иконку.
if not BRAND_SOURCE.exists():
    raise FileNotFoundError(f"Нет канонического логотипа Noda: {BRAND_SOURCE}")
base = Image.open(BRAND_SOURCE).convert("RGBA")
if base.size != (1024, 1024):
    base = base.resize((1024, 1024), Image.Resampling.LANCZOS)
base.save(PNG, "PNG")
base.save(BUILD_SOURCE, "PNG")
base.save(ICO, format="ICO", sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)])


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
print(f"Noda logo: {PNG} + {ICO}")
