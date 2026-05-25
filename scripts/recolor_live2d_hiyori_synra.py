from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TEXTURE_DIR = ROOT / "web" / "assets" / "live2d" / "synra" / "Hiyori.2048"


def blend_channel(a: int, b: int, amount: float) -> int:
    return round(a + (b - a) * amount)


def recolor(pixel: tuple[int, int, int, int], target: tuple[int, int, int], amount: float) -> tuple[int, int, int, int]:
    r, g, b, a = pixel
    if a < 16:
        return pixel
    luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    shade = 0.42 + luma * 0.92
    tr, tg, tb = target
    tinted = (
        min(255, round(tr * shade)),
        min(255, round(tg * shade)),
        min(255, round(tb * shade)),
    )
    return (
        blend_channel(r, tinted[0], amount),
        blend_channel(g, tinted[1], amount),
        blend_channel(b, tinted[2], amount),
        a,
    )


def hsv(pixel: tuple[int, int, int, int]) -> tuple[float, float, float]:
    r, g, b, _ = pixel
    return colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)


def is_hair(pixel: tuple[int, int, int, int], x: int, y: int) -> bool:
    r, g, b, a = pixel
    if a < 16:
        return False
    h, s, v = hsv(pixel)
    brown = 0.045 <= h <= 0.13 and 0.12 <= s <= 0.58 and 0.16 <= v <= 0.86
    cool_gray_hair = s <= 0.24 and 0.17 <= v <= 0.72 and (x > 520 or y < 520)
    return brown or cool_gray_hair


def is_clothing(pixel: tuple[int, int, int, int], x: int, y: int) -> bool:
    r, g, b, a = pixel
    if a < 16:
        return False
    h, s, v = hsv(pixel)
    cardigan = x < 760 and y < 1240 and 0.07 <= h <= 0.17 and 0.08 <= s <= 0.42 and v > 0.45
    skirt_or_sock = (y > 1020 or x < 760) and s <= 0.34 and 0.08 <= v <= 0.44
    return cardigan or skirt_or_sock


def recolor_texture_00(path: Path) -> None:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            pixel = pixels[x, y]
            if is_hair(pixel, x, y):
                pixels[x, y] = recolor(pixel, (41, 25, 102), 0.72)
    image.save(path)


def recolor_texture_01(path: Path) -> None:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            pixel = pixels[x, y]
            if is_clothing(pixel, x, y):
                target = (36, 92, 176) if x < 760 and y < 1180 else (18, 22, 54)
                pixels[x, y] = recolor(pixel, target, 0.68)
    image.save(path)


def main() -> None:
    recolor_texture_00(TEXTURE_DIR / "texture_00.png")
    recolor_texture_01(TEXTURE_DIR / "texture_01.png")


if __name__ == "__main__":
    main()
