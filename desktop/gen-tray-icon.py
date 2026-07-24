#!/usr/bin/env python3
"""메뉴 바(트레이)용 템플릿 아이콘 생성 — 마스코트 실루엣.

frontend/assets/symbol.png(검정 블롭 + 흰 눈)을 소스로,
macOS 템플릿 규칙(검정 + 알파만)에 맞춰 변환한다:
  - 검정 픽셀 → 불투명 검정
  - 흰 픽셀(눈) → 투명 (메뉴바 배경이 비쳐 눈이 뚫린 실루엣)
  - 밝기에 비례해 알파를 줄여 가장자리 안티앨리어싱 보존
iconTemplate 네이밍이라 macOS가 라이트/다크 모드 색을 알아서 맞춘다.

실행: python3 gen-tray-icon.py  (요구: Pillow)
"""
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "../frontend/assets/symbol.png")


def make_template(size_w: int) -> Image.Image:
    src = Image.open(SRC).convert("RGBA")
    src = src.crop(src.getbbox())
    ratio = size_w / src.width
    img = src.resize((size_w, max(1, round(src.height * ratio))), Image.LANCZOS)

    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sp = img.load()
    op = out.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = sp[x, y]
            lum = (r + g + b) / 3 / 255  # 0=검정, 1=흰색
            alpha = round(a * (1 - lum))  # 검정일수록 불투명, 흰 눈은 투명
            op[x, y] = (0, 0, 0, alpha)
    return out


for name, w in [("iconTemplate.png", 16), ("iconTemplate@2x.png", 32)]:
    make_template(w).save(os.path.join(HERE, name))
    print(f"{name} 생성 완료")
