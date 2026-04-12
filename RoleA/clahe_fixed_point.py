"""
CLAHE 定点化仿真 - Role A 核心算法

"""

import numpy as np
import os
import json

# ============================================================
# 全局参数（与 FPGA RTL 保持一致）
# ============================================================
BITWIDTH     = 8          # 像素位宽
TILE_SIZE    = 8          # Tile 尺寸（行 × 列）
CLIP_LIMIT   = 40         # 直方图裁剪阈值
INTERP_BITS  = 8          # 双线性插值定点精度（Q8，即 1/256）
USE_FIXED    = True       # True = 定点模式，False = 浮点参考


# ============================================================
# 阶段 0：工具函数
# ============================================================
def img_to_gray(img):
    """确保输入为 uint8 灰度图"""
    if img.ndim == 3:
        # 加权灰度化
        gray = (0.299 * img[:,:,0] + 0.587 * img[:,:,1] + 0.114 * img[:,:,2]).astype(np.uint8)
    else:
        gray = img.astype(np.uint8)
    return gray


def pad_image(img, tile_h, tile_w):
    """
    将图像尺寸填充为 Tile 尺寸整数倍（镜像填充）
    FPGA 边界 Tile 处理与此保持一致
    """
    H, W = img.shape
    pad_h = (-H) % tile_h
    pad_w = (-W) % tile_w
    img_pad = np.pad(img, ((0, pad_h), (0, pad_w)), mode='reflect')
    return img_pad, H, W


# ============================================================
# 阶段 1：直方图统计（定点 16-bit 计数）
# ============================================================
def compute_histogram_fixed(tile: np.ndarray) -> np.ndarray:
    """
    统计 Tile 内 256 个灰度级的频次
    定点：每个 bin 使用 16-bit 无符号整数（uint16）
    对应 FPGA BRAM 宽度 16-bit
    """
    hist = np.zeros(256, dtype=np.uint16)
    flat = tile.flatten()
    for v in flat:
        hist[v] += 1
    return hist


def compute_histogram_ref(tile: np.ndarray) -> np.ndarray:
    """浮点参考版本（使用 np.bincount）"""
    hist = np.bincount(tile.flatten(), minlength=256).astype(np.float64)
    return hist


# ============================================================
# 阶段 2：阈值裁剪（Clip Limit）
# ============================================================
def clip_histogram_fixed(hist: np.ndarray, clip_limit: int) -> np.ndarray:
    """
    定点裁剪：
    1. 将超出 clip_limit 的部分截断
    2. 把截断总量均匀重分配给所有 bin
    3. 余数从 bin 0 开始逐一加 1（整数处理，无浮点）
    注意：clip_limit 单位为像素个数，与 FPGA 寄存器设置一致
    """
    hist = hist.copy().astype(np.int32)
    excess = 0
    for i in range(256):
        if hist[i] > clip_limit:
            excess += hist[i] - clip_limit
            hist[i] = clip_limit

    # 均匀分配
    increment = excess // 256       # 每个 bin 增加量（整数除法）
    remainder = excess % 256        # 余数（从 bin 0 开始逐一加 1）

    hist += increment
    for i in range(remainder):
        hist[i] += 1

    return hist.astype(np.uint16)


def clip_histogram_ref(hist: np.ndarray, clip_limit: int) -> np.ndarray:
    """浮点参考版本（结果应与定点一致，用于对比验证）"""
    hist = hist.copy()
    excess = np.sum(np.maximum(hist - clip_limit, 0))
    hist = np.minimum(hist, clip_limit)
    hist += excess / 256.0
    return hist


# ============================================================
# 阶段 3：累积分布函数（CDF）映射表
# ============================================================
def build_lut_fixed(hist: np.ndarray) -> np.ndarray:
    """
    定点 CDF 归一化，生成 256 个 8-bit 查找表
    公式：lut[v] = round((CDF[v] - CDF_min) * 255 / (total - CDF_min))
    FPGA 实现：分母用查找表预计算，避免除法
    精度：输出 8-bit，误差 ≤ ±1 LSB
    """
    cdf = np.cumsum(hist).astype(np.int32)
    total = int(cdf[-1])
    cdf_min = int(cdf[cdf > 0][0]) if np.any(cdf > 0) else 1

    denom = total - cdf_min
    if denom == 0:
        return np.arange(256, dtype=np.uint8)

    lut = np.zeros(256, dtype=np.uint8)
    for v in range(256):
        # 定点：先乘 255，再整数除法（等效于 FPGA 移位 + 查表）
        val = ((int(cdf[v]) - cdf_min) * 255 + denom // 2) // denom
        lut[v] = np.clip(val, 0, 255)

    return lut


def build_lut_ref(hist: np.ndarray) -> np.ndarray:
    """浮点参考版本"""
    cdf = np.cumsum(hist)
    cdf_min = cdf[cdf > 0][0] if np.any(cdf > 0) else 1
    denom = cdf[-1] - cdf_min
    if denom == 0:
        return np.arange(256, dtype=np.uint8)
    lut = np.round((cdf - cdf_min) / denom * 255).astype(np.uint8)
    return np.clip(lut, 0, 255)


# ============================================================
# 阶段 4：双线性插值（定点 Q8 权重）
# ============================================================
def bilinear_interpolate_fixed(r, c, H_tiles, W_tiles, luts, img_pad, tile_h, tile_w):
    """
    对像素 (r, c) 做四个相邻 Tile LUT 的双线性插值
    权重用 Q8 定点（精度 1/256），最终右移 16 位（2×Q8）
    误差来源：Q8 截断误差 ≤ ±1 LSB
    """
    # 像素所在 Tile 坐标（浮点用于权重计算）
    ty = (r + 0.5) / tile_h - 0.5
    tx = (c + 0.5) / tile_w - 0.5

    ty0 = int(np.floor(ty))
    tx0 = int(np.floor(tx))
    ty1 = ty0 + 1
    tx1 = tx0 + 1

    # Q8 权重（乘以 256 取整）
    wy1_fixed = int((ty - ty0) * 256)   # 小数部分 × 256
    wx1_fixed = int((tx - tx0) * 256)
    wy0_fixed = 256 - wy1_fixed
    wx0_fixed = 256 - wx1_fixed

    # 边界夹紧
    ty0c = np.clip(ty0, 0, H_tiles - 1)
    ty1c = np.clip(ty1, 0, H_tiles - 1)
    tx0c = np.clip(tx0, 0, W_tiles - 1)
    tx1c = np.clip(tx1, 0, W_tiles - 1)

    pix = int(img_pad[r, c])

    v00 = int(luts[ty0c, tx0c][pix])
    v01 = int(luts[ty0c, tx1c][pix])
    v10 = int(luts[ty1c, tx0c][pix])
    v11 = int(luts[ty1c, tx1c][pix])

    # 定点双线性插值：先行方向，再列方向，右移 16 位
    val = (wy0_fixed * wx0_fixed * v00 +
           wy0_fixed * wx1_fixed * v01 +
           wy1_fixed * wx0_fixed * v10 +
           wy1_fixed * wx1_fixed * v11)

    result = (val + (1 << 15)) >> 16   # 四舍五入右移
    return np.clip(result, 0, 255)


# ============================================================
# 主函数：完整 CLAHE 流水线
# ============================================================
def clahe_fixed(img: np.ndarray,
                tile_size: int = TILE_SIZE,
                clip_limit: int = CLIP_LIMIT,
                use_fixed: bool = USE_FIXED) -> tuple:
    """
    完整 CLAHE 定点仿真
    返回: (output_img, luts, diagnostics)
    luts: 每个 Tile 的 256 级映射表，供 Testbench 使用
    diagnostics: 每阶段中间数据，用于文档报告
    """
    gray = img_to_gray(img)
    img_pad, orig_H, orig_W = pad_image(gray, tile_size, tile_size)
    H_pad, W_pad = img_pad.shape

    H_tiles = H_pad // tile_size
    W_tiles = W_pad // tile_size

    # 存储每个 Tile 的 LUT
    luts = np.zeros((H_tiles, W_tiles, 256), dtype=np.uint8)
    diagnostics = {
        'tile_size': tile_size,
        'clip_limit': clip_limit,
        'H_tiles': H_tiles,
        'W_tiles': W_tiles,
        'sample_hist': None,       # 示例直方图（Tile 0,0）
        'sample_clipped': None,
        'sample_lut': None,
        'use_fixed': use_fixed,
    }

    for ti in range(H_tiles):
        for tj in range(W_tiles):
            r0 = ti * tile_size
            c0 = tj * tile_size
            tile = img_pad[r0:r0+tile_size, c0:c0+tile_size]

            if use_fixed:
                hist    = compute_histogram_fixed(tile)
                clipped = clip_histogram_fixed(hist, clip_limit)
                lut     = build_lut_fixed(clipped)
            else:
                hist    = compute_histogram_ref(tile)
                clipped = clip_histogram_ref(hist, clip_limit)
                lut     = build_lut_ref(clipped)

            luts[ti, tj] = lut

            # 保存 Tile(0,0) 的中间数据用于文档
            if ti == 0 and tj == 0:
                diagnostics['sample_hist']    = hist.copy()
                diagnostics['sample_clipped'] = clipped.copy()
                diagnostics['sample_lut']     = lut.copy()

    # 逐像素双线性插值
    output = np.zeros((orig_H, orig_W), dtype=np.uint8)
    for r in range(orig_H):
        for c in range(orig_W):
            if use_fixed:
                output[r, c] = bilinear_interpolate_fixed(
                    r, c, H_tiles, W_tiles, luts, img_pad, tile_size, tile_size)
            else:
                # 浮点版本（参考）
                ty = (r + 0.5) / tile_size - 0.5
                tx = (c + 0.5) / tile_size - 0.5
                ty0 = int(np.floor(ty)); ty1 = ty0 + 1
                tx0 = int(np.floor(tx)); tx1 = tx0 + 1
                wy1 = ty - ty0; wx1 = tx - tx0
                wy0 = 1 - wy1; wx0 = 1 - wx1
                ty0c = np.clip(ty0, 0, H_tiles-1)
                ty1c = np.clip(ty1, 0, H_tiles-1)
                tx0c = np.clip(tx0, 0, W_tiles-1)
                tx1c = np.clip(tx1, 0, W_tiles-1)
                pix = int(img_pad[r, c])
                val = (wy0*wx0*luts[ty0c,tx0c][pix] + wy0*wx1*luts[ty0c,tx1c][pix] +
                       wy1*wx0*luts[ty1c,tx0c][pix] + wy1*wx1*luts[ty1c,tx1c][pix])
                output[r, c] = np.clip(round(val), 0, 255)

    return output, luts, diagnostics


# ============================================================
# 误差分析：定点 vs 浮点
# ============================================================
def error_analysis(img: np.ndarray) -> dict:
    """对比定点与浮点输出，统计误差分布"""
    out_fixed, _, _ = clahe_fixed(img, use_fixed=True)
    out_ref,   _, _ = clahe_fixed(img, use_fixed=False)

    diff = out_fixed.astype(np.int16) - out_ref.astype(np.int16)
    return {
        'max_abs_error': int(np.max(np.abs(diff))),
        'mean_abs_error': float(np.mean(np.abs(diff))),
        'pixels_within_1': int(np.sum(np.abs(diff) <= 1)),
        'total_pixels': int(diff.size),
        'pct_within_1': float(np.sum(np.abs(diff) <= 1) / diff.size * 100),
        'diff_array': diff,
    }
