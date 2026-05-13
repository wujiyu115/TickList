#!/usr/bin/env python3
"""
TickList App Icon Generator
暗色科技风 - 深色底 + 青蓝霓虹勾选光效
"""

import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def create_icon(size):
    """生成指定尺寸的图标"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 背景：深色渐变（模拟黑曜石质感）
    for y in range(size):
        ratio = y / size
        # 从深灰蓝到近黑渐变
        r = int(18 + ratio * 8)
        g = int(20 + ratio * 6)
        b = int(30 + ratio * 10)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # 圆角矩形背景（iOS 风格）
    corner_radius = int(size * 0.22)
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner_radius, fill=255)
    img.putalpha(mask)

    # 添加微妙的网格纹理（科技感）
    grid_spacing = max(size // 16, 4)
    grid_color = (40, 50, 70, 30)
    for x in range(0, size, grid_spacing):
        draw.line([(x, 0), (x, size)], fill=grid_color, width=1)
    for y in range(0, size, grid_spacing):
        draw.line([(0, y), (size, y)], fill=grid_color, width=1)

    # 重新应用圆角遮罩
    img.putalpha(mask)

    # 绘制勾选符号（✓）- 霓虹青蓝光效
    checkmark_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    check_draw = ImageDraw.Draw(checkmark_layer)

    # 勾选的关键点
    cx, cy = size * 0.5, size * 0.52
    scale = size * 0.28

    # 勾选路径点
    p1 = (cx - scale * 0.7, cy - scale * 0.05)
    p2 = (cx - scale * 0.15, cy + scale * 0.55)
    p3 = (cx + scale * 0.75, cy - scale * 0.55)

    stroke_width = max(int(size * 0.07), 3)

    # 多层发光效果
    glow_colors = [
        ((0, 200, 255, 20), stroke_width * 6),   # 外层大范围光晕
        ((0, 220, 255, 40), stroke_width * 4),   # 中层光晕
        ((0, 240, 255, 80), stroke_width * 3),   # 内层光晕
        ((100, 255, 255, 200), stroke_width * 2), # 核心光
        ((200, 255, 255, 255), stroke_width),     # 最亮核心
    ]

    for color, width in glow_colors:
        check_draw.line([p1, p2, p3], fill=color, width=width, joint="curve")

    # 高斯模糊光晕层
    glow_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)
    glow_draw.line([p1, p2, p3], fill=(0, 180, 255, 60), width=stroke_width * 8, joint="curve")
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=size * 0.04))

    # 合成光晕
    img = Image.alpha_composite(img, glow_layer)
    img = Image.alpha_composite(img, checkmark_layer)

    # 底部添加微妙的青蓝色反射
    reflection = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ref_draw = ImageDraw.Draw(reflection)
    for y in range(int(size * 0.7), size):
        ratio = (y - size * 0.7) / (size * 0.3)
        alpha = int(15 * (1 - ratio))
        ref_draw.line([(0, y), (size, y)], fill=(0, 180, 255, alpha))
    img = Image.alpha_composite(img, reflection)

    # 最终应用圆角遮罩
    final = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    final.paste(img, mask=mask)

    return final


def create_android_adaptive_foreground(size):
    """Android 自适应图标前景层（108dp 带安全区域）"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Android adaptive icon 有 18dp 安全边距（总 108dp）
    # 内容区域是中间 72dp（66.7%）
    inset = size * 0.167
    content_size = size * 0.667
    cx = size * 0.5
    cy = size * 0.52

    scale = content_size * 0.35

    p1 = (cx - scale * 0.7, cy - scale * 0.05)
    p2 = (cx - scale * 0.15, cy + scale * 0.55)
    p3 = (cx + scale * 0.75, cy - scale * 0.55)

    stroke_width = max(int(size * 0.05), 3)

    # 光晕
    glow_colors = [
        ((0, 200, 255, 20), stroke_width * 6),
        ((0, 220, 255, 40), stroke_width * 4),
        ((0, 240, 255, 80), stroke_width * 3),
        ((100, 255, 255, 200), stroke_width * 2),
        ((200, 255, 255, 255), stroke_width),
    ]

    for color, width in glow_colors:
        draw.line([p1, p2, p3], fill=color, width=width, joint="curve")

    # 模糊光晕
    glow_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)
    glow_draw.line([p1, p2, p3], fill=(0, 180, 255, 60), width=stroke_width * 8, joint="curve")
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=size * 0.03))

    img = Image.alpha_composite(glow_layer, img)
    return img


def create_android_adaptive_background(size):
    """Android 自适应图标背景层"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    # 深色渐变背景
    for y in range(size):
        ratio = y / size
        r = int(18 + ratio * 8)
        g = int(20 + ratio * 6)
        b = int(30 + ratio * 10)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # 网格纹理
    grid_spacing = max(size // 16, 4)
    grid_color = (40, 50, 70, 30)
    for x in range(0, size, grid_spacing):
        draw.line([(x, 0), (x, size)], fill=grid_color, width=1)
    for y in range(0, size, grid_spacing):
        draw.line([(0, y), (size, y)], fill=grid_color, width=1)

    return img


def main():
    import os

    base_dir = os.path.dirname(os.path.abspath(__file__))

    # === iOS ===
    print("[iOS] 生成 1024x1024 图标...")
    ios_icon = create_icon(1024)
    ios_path = os.path.join(base_dir, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")
    ios_icon.save(ios_path, "PNG")
    print(f"  ✅ {ios_path}")

    # === Android ===
    android_sizes = {
        'mdpi': 48,
        'hdpi': 72,
        'xhdpi': 96,
        'xxhdpi': 144,
        'xxxhdpi': 192,
    }

    # Android adaptive icon 尺寸（前景和背景都是 108dp 比例）
    adaptive_sizes = {
        'mdpi': 108,
        'hdpi': 162,
        'xhdpi': 216,
        'xxhdpi': 324,
        'xxxhdpi': 432,
    }

    android_base = os.path.join(base_dir, "android/app/src/main/res")

    for density, icon_size in android_sizes.items():
        print(f"[Android] 生成 {density} ({icon_size}x{icon_size})...")

        # ic_launcher.png - 传统方形图标
        icon = create_icon(icon_size)
        # 转为 RGB 带白色背景，传统图标不支持透明
        rgb_icon = Image.new('RGB', (icon_size, icon_size), (18, 20, 30))
        rgb_icon.paste(icon, mask=icon.split()[3])
        launcher_path = os.path.join(android_base, f"mipmap-{density}/ic_launcher.png")
        rgb_icon.save(launcher_path, "PNG")
        print(f"  ✅ ic_launcher: {launcher_path}")

        # ic_launcher_round.png - 圆形图标
        circle_mask = Image.new('L', (icon_size, icon_size), 0)
        circle_draw = ImageDraw.Draw(circle_mask)
        circle_draw.ellipse([0, 0, icon_size - 1, icon_size - 1], fill=255)
        round_icon = Image.new('RGB', (icon_size, icon_size), (18, 20, 30))
        round_icon.paste(icon, mask=icon.split()[3])
        round_final = Image.new('RGBA', (icon_size, icon_size), (0, 0, 0, 0))
        round_final.paste(round_icon, mask=circle_mask)
        round_path = os.path.join(android_base, f"mipmap-{density}/ic_launcher_round.png")
        round_final.save(round_path, "PNG")
        print(f"  ✅ ic_launcher_round: {round_path}")

    for density, adaptive_size in adaptive_sizes.items():
        print(f"[Android] 生成 {density} foreground ({adaptive_size}x{adaptive_size})...")
        # ic_launcher_foreground.png
        fg = create_android_adaptive_foreground(adaptive_size)
        fg_path = os.path.join(android_base, f"mipmap-{density}/ic_launcher_foreground.png")
        fg.save(fg_path, "PNG")
        print(f"  ✅ foreground: {fg_path}")

    print("")
    print("=== 全部图标生成完成 ===")


if __name__ == "__main__":
    main()
