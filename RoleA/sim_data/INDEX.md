# sim_data 目录索引
# 生成参数: TILE_SIZE=8, CLIP_LIMIT=40

| 文件前缀         | 测试场景               | 用途                    |
|-----------------|------------------------|------------------------|
| flat_gray       | 均匀灰度128            | 边界/稳定性验证          |
| dark_scene      | 低照度 0~50            | 核心增强场景             |
| high_contrast   | 明暗分区               | 裁剪逻辑验证             |
| ramp_test       | 线性渐变 0~255         | 映射单调性验证           |
| random_noise    | 随机全范围             | 压力/鲁棒性测试          |
| single_tile     | 单块 8×8              | 逐周期RTL对比           |

## 文件命名规则
- input_<name>.txt   : 原始输入像素（十六进制，每行1字节）
- output_<name>.txt  : 期望输出像素（十六进制，每行1字节）
- lut_<name>.txt     : 各Tile的256级映射表
- meta_<name>.json   : 测试参数元数据（shape, clip等）

## Testbench 使用方式
```verilog
// 读入 input 文件喂给 DUT，将 DUT 输出与 output 文件逐字节比对
$readmemh("input_dark_scene.txt", stimulus);
$readmemh("output_dark_scene.txt", golden);
```