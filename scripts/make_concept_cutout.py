#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


def distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove connected light background from Synra concept art.")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--threshold", type=int, default=30)
    parser.add_argument("--feather", type=float, default=0.8)
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    width, height = image.size
    pixels = image.load()
    bg = pixels[0, 0][:3]
    visited = bytearray(width * height)
    alpha = Image.new("L", image.size, 255)
    alpha_pixels = alpha.load()
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= width or y >= height:
            return
        index = y * width + x
        if visited[index]:
            return
        if distance(pixels[x, y][:3], bg) > args.threshold:
            return
        visited[index] = 1
        alpha_pixels[x, y] = 0
        queue.append((x, y))

    for x in range(width):
      enqueue(x, 0)
      enqueue(x, height - 1)
    for y in range(height):
      enqueue(0, y)
      enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        enqueue(x + 1, y)
        enqueue(x - 1, y)
        enqueue(x, y + 1)
        enqueue(x, y - 1)

    if args.feather > 0:
        alpha = alpha.filter(ImageFilter.GaussianBlur(args.feather))

    image.putalpha(alpha)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output)


if __name__ == "__main__":
    main()
