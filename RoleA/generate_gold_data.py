"""
金牌对账单生成器
生成 Role B RTL 仿真所需的输入/输出激励文件（十六进制 .txt）
存放于 /sim_data/ 目录
"""

import numpy as np
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from clahe_fixed_point import clahe_fixed, TILE_SIZE, CLIP_LIMIT

SIM_DIR = os.path.join(os.path.dirname(__file__), 'sim_data')
os.makedirs(SIM_DIR, exist_ok=True)

IMG_H = 32   # 测试图像高度（4 × Tile）
IMG_W = 32   # 测试图像宽度


def save_hex_file(path: str, data: np.ndarray, description: str):
    """将像素数组保存为逐行十六进制文件"""
    flat = data.flatten().astype(np.uint8)
    with open(path, 'w') as f:
        f.write(f"// {description}\n")
        f.write(f"// Shape: {data.shape}, Total pixels: {flat.size}\n")
        f.write(f"// Format: one byte per line, hexadecimal (uppercase)\n\n")
        for v in flat:
            f.write(f"{v:02X}\n")
    print(f"  Saved: {os.path.basename(path)}  ({flat.size} bytes)")


def save_lut_file(path: str, luts: np.ndarray, description: str):
    """保存所有 Tile 的 LUT（每 Tile 256 个 8-bit 映射值）"""
    with open(path, 'w') as f:
        f.write(f"// {description}\n")
        f.write(f"// LUT shape: {luts.shape} (H_tiles, W_tiles, 256)\n\n")
        H_tiles, W_tiles, _ = luts.shape
        for ti in range(H_tiles):
            for tj in range(W_tiles):
                f.write(f"// Tile [{ti},{tj}]\n")
                for v in luts[ti, tj]:
                    f.write(f"{v:02X}\n")
    print(f"  Saved: {os.path.basename(path)}")


def generate_test_case(name: str, img: np.ndarray, description: str):
    """生成一组输入/输出对"""
    print(f"\n[{name}] {description}")
    out, luts, diag = clahe_fixed(img, tile_size=TILE_SIZE, clip_limit=CLIP_LIMIT, use_fixed=True)

    save_hex_file(os.path.join(SIM_DIR, f"input_{name}.txt"),  img, f"INPUT  | {description}")
    save_hex_file(os.path.join(SIM_DIR, f"output_{name}.txt"), out, f"OUTPUT | {description}")
    save_lut_file(os.path.join(SIM_DIR, f"lut_{name}.txt"),   luts, f"LUT    | {description}")

    # 保存元数据 JSON（供 Testbench 自动读取参数）
    meta = {
        'name': name,
        'description': description,
        'img_shape': list(img.shape),
        'out_shape': list(out.shape),
        'tile_size': TILE_SIZE,
        'clip_limit': CLIP_LIMIT,
        'min_in': int(img.min()),
        'max_in': int(img.max()),
        'min_out': int(out.min()),
        'max_out': int(out.max()),
        'lut_shape': list(luts.shape),
    }
    import json
    with open(os.path.join(SIM_DIR, f"meta_{name}.json"), 'w') as f:
        json.dump(meta, f, indent=2)
    return out, luts


def main():
    np.random.seed(42)

    print("=" * 60)
    print("金牌对账单生成器")
    print(f"参数: TILE={TILE_SIZE}x{TILE_SIZE}, CLIP={CLIP_LIMIT}, IMG={IMG_H}x{IMG_W}")
    print("=" * 60)

    # ── Case 1: 均匀灰度图（测试边界，输出应近似不变）──
    img_flat = np.full((IMG_H, IMG_W), 128, dtype=np.uint8)
    generate_test_case("flat_gray", img_flat,
                       "均匀灰度128 | 测试边界：输出应接近128")

    # ── Case 2: 低照度场景（0~50 区间，核心验证场景）──
    img_dark = np.random.randint(0, 51, (IMG_H, IMG_W), dtype=np.uint8)
    generate_test_case("dark_scene", img_dark,
                       "低照度场景 0~50 | 核心验证：增强后应扩展至0~255")

    # ── Case 3: 高对比度（明暗分区，验证裁剪逻辑）──
    img_hc = np.zeros((IMG_H, IMG_W), dtype=np.uint8)
    img_hc[:IMG_H//2, :] = 200   # 上半亮
    img_hc[IMG_H//2:, :] = 30    # 下半暗
    generate_test_case("high_contrast", img_hc,
                       "高对比度场景 | 验证裁剪逻辑：clipLimit截断分配")

    # ── Case 4: 线性渐变（测试映射线性度）──
    ramp = np.tile(np.arange(IMG_W, dtype=np.uint8), (IMG_H, 1))
    ramp = (ramp * 255 // (IMG_W - 1)).astype(np.uint8)
    generate_test_case("ramp_test", ramp,
                       "线性渐变 0~255 | 测试映射单调性与线性度")

    # ── Case 5: 随机噪声（压力测试）──
    img_noise = np.random.randint(0, 256, (IMG_H, IMG_W), dtype=np.uint8)
    generate_test_case("random_noise", img_noise,
                       "随机噪声全范围 | 压力测试：验证统计逻辑鲁棒性")

    # ── Case 6: 单 Tile 精确对账（最细粒度验证）──
    # 仅 8×8 单块，方便 Role B 逐时钟周期对比
    single_tile = np.array([
        [10, 20, 30, 40, 50, 60, 70, 80],
        [15, 25, 35, 45, 55, 65, 75, 85],
        [20, 30, 40, 50, 60, 70, 80, 90],
        [25, 35, 45, 55, 65, 75, 85, 95],
        [30, 40, 50, 60, 70, 80, 90,100],
        [35, 45, 55, 65, 75, 85, 95,105],
        [40, 50, 60, 70, 80, 90,100,110],
        [45, 55, 65, 75, 85, 95,105,115],
    ], dtype=np.uint8)
    generate_test_case("single_tile", single_tile,
                       "单Tile 8×8精确对账 | 用于RTL逐周期验证")

    # ── 生成总索引文件 ──
    index_lines = [
        "# sim_data 目录索引",
        f"# 生成参数: TILE_SIZE={TILE_SIZE}, CLIP_LIMIT={CLIP_LIMIT}",
        "",
        "| 文件前缀         | 测试场景               | 用途                    |",
        "|-----------------|------------------------|------------------------|",
        "| flat_gray       | 均匀灰度128            | 边界/稳定性验证          |",
        "| dark_scene      | 低照度 0~50            | 核心增强场景             |",
        "| high_contrast   | 明暗分区               | 裁剪逻辑验证             |",
        "| ramp_test       | 线性渐变 0~255         | 映射单调性验证           |",
        "| random_noise    | 随机全范围             | 压力/鲁棒性测试          |",
        "| single_tile     | 单块 8×8              | 逐周期RTL对比           |",
        "",
        "## 文件命名规则",
        "- input_<name>.txt   : 原始输入像素（十六进制，每行1字节）",
        "- output_<name>.txt  : 期望输出像素（十六进制，每行1字节）",
        "- lut_<name>.txt     : 各Tile的256级映射表",
        "- meta_<name>.json   : 测试参数元数据（shape, clip等）",
        "",
        "## Testbench 使用方式",
        "```verilog",
        "// 读入 input 文件喂给 DUT，将 DUT 输出与 output 文件逐字节比对",
        "$readmemh(\"input_dark_scene.txt\", stimulus);",
        "$readmemh(\"output_dark_scene.txt\", golden);",
        "```",
    ]
    with open(os.path.join(SIM_DIR, 'INDEX.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(index_lines))

    print("\n" + "=" * 60)
    print("✅ 金牌对账单生成完毕！")
    print(f"   输出目录: {SIM_DIR}")
    print(f"   文件数量: {len(os.listdir(SIM_DIR))}")
    print("=" * 60)


if __name__ == '__main__':
    main()
