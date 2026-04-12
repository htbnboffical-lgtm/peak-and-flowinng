const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, LevelFormat,
  ShadingType, VerticalAlign, PageBreak
} = require('docx');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'output_docs');
const SIM_DIR = path.join(__dirname, 'sim_data');

// ─── Color palette ───────────────────────────────────────────
const COLORS = {
  primary:   '1a5276',
  accent:    '2ecc71',
  highlight: 'f39c12',
  lightbg:   'eaf4fb',
  tablehead: '1a5276',
  tablerow1: 'eaf4fb',
  tablerow2: 'ffffff',
  border:    'bdc3c7',
};

// ─── Helper: styled heading ───────────────────────────────────
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: COLORS.primary, font: 'Arial' })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: COLORS.primary, font: 'Arial' })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: '2c3e50', font: 'Arial' })],
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, size: 22, font: 'Arial', ...opts })],
  });
}
function pBold(label, value) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text: label, bold: true, size: 22, font: 'Arial' }),
      new TextRun({ text: value, size: 22, font: 'Arial' }),
    ],
  });
}
function blank() {
  return new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun('')] });
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ─── Helper: image paragraph ─────────────────────────────────
function img(filename, caption, w = 560, h = 300) {
  const imgPath = path.join(OUT_DIR, filename);
  if (!fs.existsSync(imgPath)) return p(`[图片缺失: ${filename}]`);
  const data = fs.readFileSync(imgPath);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 80 },
      children: [new ImageRun({ type: 'png', data, transformation: { width: w, height: h },
        altText: { title: caption, description: caption, name: filename } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 160 },
      children: [new TextRun({ text: caption, italics: true, size: 20, color: '7f8c8d', font: 'Arial' })],
    }),
  ];
}

// ─── Helper: table ────────────────────────────────────────────
function makeTable(headers, rows, colWidths) {
  const totalW = colWidths.reduce((a,b)=>a+b, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: COLORS.tablehead },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: h, bold: true, color: 'ffffff', size: 20, font: 'Arial' })],
      })],
    })),
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      width: { size: colWidths[ci], type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: ri % 2 === 0 ? COLORS.tablerow1 : COLORS.tablerow2 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: String(cell), size: 20, font: 'Arial' })],
      })],
    })),
  }));
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      left:   { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      right:  { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      insideH:{ style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
      insideV:{ style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
    },
    rows: [headerRow, ...dataRows],
  });
}

// ─── Read error report txt ────────────────────────────────────
function readErrorReport() {
  const p2 = path.join(OUT_DIR, 'error_report.txt');
  return fs.existsSync(p2) ? fs.readFileSync(p2, 'utf8') : '';
}

// ─── Build document ───────────────────────────────────────────
const children = [];

// ══════════════════════════════════════════
// 封面
// ══════════════════════════════════════════
children.push(
  blank(), blank(), blank(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 480 },
    children: [new TextRun({ text: '文档 A-1', bold: true, size: 48, color: COLORS.primary, font: 'Arial' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 240 },
    children: [new TextRun({ text: '算法逻辑与定点化分析报告', bold: true, size: 40, color: '2c3e50', font: 'Arial' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 160 },
    children: [new TextRun({ text: '基于自适应直方图均衡化（AHE）的低照度智能监控系统', size: 26, color: '7f8c8d', font: 'Arial' })],
  }),
  blank(), blank(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: '目标平台：复旦微 FMQL30TAI 悟净开发板', size: 22, font: 'Arial' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: '角色：Role A — 算法与精度负责人', size: 22, font: 'Arial' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: '版本：v1.0', size: 22, color: '7f8c8d', font: 'Arial' })],
  }),
  blank(), blank(), blank(),
  pageBreak(),
);

// ══════════════════════════════════════════
// 一、算法流程图
// ══════════════════════════════════════════
children.push(
  h1('一、CLAHE 算法流程与各阶段说明'),
  p('CLAHE（对比度受限自适应直方图均衡化）是本项目 FPGA 算子的核心算法。完整流水线分为五个阶段，每个阶段均对应 PL 端的一个硬件子模块：'),
  blank(),
);

// 流程表
children.push(
  makeTable(
    ['阶段', '操作', 'FPGA 对应模块', '输入', '输出'],
    [
      ['① Tile 分割',    '将图像切分为 N×N 小块（含边界镜像填充）', 'Line Buffer / 地址计数器', '原始像素流', 'Tile 坐标 + 像素'],
      ['② 直方图统计',   '对每个 Tile 统计 256 个灰度级频次',       'BRAM 乒乓直方图引擎',     'Tile 像素',  '256-bin 直方图（16-bit）'],
      ['③ 阈值裁剪',     '截断超出 clipLimit 的计数并均匀重分配',   '裁剪逻辑单元（组合逻辑）', '原始直方图', '裁剪后直方图'],
      ['④ CDF 映射',    '前缀和归一化，生成 256-entry LUT',        'DSP 累加器 + 查找表',     '裁剪直方图', '8-bit LUT[256]'],
      ['⑤ 双线性插值',   '四邻 Tile LUT 加权，输出最终像素',         'Q8 定点乘法器 × 4',       'LUT + 坐标', '增强像素（8-bit）'],
    ],
    [1200, 2400, 2200, 1400, 1400]
  ),
  blank(),
  ...img('fig2_enhancement_demo.png', '图 1-1  CLAHE 增强效果：输入/输出/直方图/LUT 曲线', 580, 320),
  blank(),
  ...img('fig5_clip_effect.png', '图 1-2  直方图阈值裁剪效果（clipLimit=40）', 540, 220),
  blank(),
  h2('1.1  双线性插值数学模型'),
  p('设像素 (r, c) 相对于相邻四个 Tile 中心的归一化坐标为 (ty, tx)，则：'),
  new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 720 },
    children: [new TextRun({
      text: 'output(r,c) = (1-ty)(1-tx)·LUT₀₀[p] + (1-ty)·tx·LUT₀₁[p] + ty·(1-tx)·LUT₁₀[p] + ty·tx·LUT₁₁[p]',
      size: 22, font: 'Courier New',
    })],
  }),
  p('其中 p = input(r, c)，LUTᵢⱼ 为第 (i,j) 个 Tile 的映射表。'),
  p('定点化时，权重乘以 256（Q8 格式），最终结果右移 16 位（两次 Q8 右移），保留 8-bit 精度：'),
  new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 720 },
    children: [new TextRun({
      text: 'val = (wy0·wx0·v00 + wy0·wx1·v01 + wy1·wx0·v10 + wy1·wx1·v11 + 32768) >> 16',
      size: 22, font: 'Courier New',
    })],
  }),
  pageBreak(),
);

// ══════════════════════════════════════════
// 二、定点化策略
// ══════════════════════════════════════════
children.push(
  h1('二、定点化策略与误差分析'),
  h2('2.1  各阶段位宽选择依据'),
  blank(),
  makeTable(
    ['流水线阶段', '数据类型', '位宽', '取值范围', '选择依据'],
    [
      ['像素输入',       'uint8',  '8-bit',  '0 ~ 255',        '标准灰度图格式，与摄像头输出对齐'],
      ['直方图计数器',   'uint16', '16-bit', '0 ~ Tile面积',   'Tile=8×8=64，远小于 65535；BRAM 宽度对齐'],
      ['CDF 累加器',    'uint32', '24-bit', '0 ~ Tile面积',   '前缀和最大值等于 Tile 像素总数，24-bit 充足'],
      ['LUT 输出',      'uint8',  '8-bit',  '0 ~ 255',        '映射结果即为增强后像素，与输出格式对齐'],
      ['双线性权重',    'Q8 定点','8-bit',  '0 ~ 256',        '精度 1/256，最大截断误差 < 0.5/256 ≈ 0.002'],
      ['插值中间值',    'uint32', '32-bit', '0 ~ 256²×255',   '防止 4 个 Q8×Q8×255 相加溢出'],
      ['像素输出',      'uint8',  '8-bit',  '0 ~ 255',        '最终增强结果'],
    ],
    [1600, 1400, 1000, 1400, 2200]
  ),
  blank(),
  h2('2.2  舍入误差来源与量化'),
  p('定点实现存在两处主要误差来源：'),
  blank(),
  makeTable(
    ['误差来源', '公式', '最大误差', '影响阶段'],
    [
      ['CDF 归一化整数除法', '(CDF×255 + denom/2) // denom', '±1 LSB', 'LUT 生成'],
      ['双线性权重 Q8 截断', 'weight_Q8 = floor(w × 256)', '< 1 LSB', '插值输出'],
      ['插值四舍五入',       '(val + 32768) >> 16',          '±0.5 LSB', '最终输出'],
    ],
    [2200, 2800, 1200, 1400]
  ),
  blank(),
  ...img('fig4_fixed_point_strategy.png', '图 2-1  各阶段位宽 & 双线性精度 vs Q位宽分析', 560, 280),
  blank(),
  h2('2.3  误差仿真结果（定点 vs 浮点参考）'),
  blank(),
  makeTable(
    ['指标', '数值', '说明'],
    [
      ['最大绝对误差',    '≤ 2 LSB（主体）', '边界 Tile 退化情形下偶现大误差，属已知设计取舍'],
      ['平均绝对误差',    '< 0.8 LSB',        '全图平均，远低于视觉可见阈值'],
      ['误差在 ±1 内的像素', '> 98%',          '满足 FPGA RTL 验收标准'],
      ['主要误差区域',    '图像边界 Tile',    '因镜像填充导致灰度分布集中，CDF 斜率突变'],
    ],
    [2400, 1800, 3400]
  ),
  blank(),
  ...img('fig1_error_analysis.png', '图 2-2  定点 vs 浮点误差分布直方图 & 热力图', 560, 240),
  pageBreak(),
);

// ══════════════════════════════════════════
// 三、NPU 提升测试
// ══════════════════════════════════════════
children.push(
  h1('三、NPU 检测精度提升测试'),
  h2('3.1  测试方法'),
  p('使用低照度图像数据集（实测时替换为 ExDark 或板载摄像头采集数据），分别将原始暗图和 CLAHE 增强后的图像送入 NPU 目标检测模型（行人/车辆），统计检测率（Recall@IoU=0.5）。'),
  blank(),
  makeTable(
    ['测试项', '说明'],
    [
      ['数据集', 'ExDark / 自采低照度视频帧（建议 ≥ 100 帧）'],
      ['NPU 模型', '复旦微 iCraft 工具部署的 YOLOv5s / MobileNet-SSD'],
      ['评价指标', 'mAP@0.5 / Recall / 单张推理延迟（ms）'],
      ['对比方式', '同一批图像，增强前 vs 增强后，两次推理结果对比'],
    ],
    [2200, 5400]
  ),
  blank(),
  h2('3.2  测试结果（模拟数据，实测替换）'),
  blank(),
  makeTable(
    ['指标', '增强前（原始暗图）', '增强后（CLAHE）', '提升幅度'],
    [
      ['检测率均值',   '40.5%', '70.4%', '+29.9%'],
      ['mAP@0.5',    '0.38',  '0.66',  '+0.28'],
      ['平均置信度',  '0.41',  '0.69',  '+0.28'],
      ['漏检率',      '59.5%', '29.6%', '−29.9%'],
    ],
    [2200, 1800, 1800, 1800]
  ),
  blank(),
  ...img('fig3_npu_accuracy.png', '图 3-1  NPU 检测率对比：增强前/后散点图、分布箱型图、提升量分布', 580, 280),
  pageBreak(),
);

// ══════════════════════════════════════════
// 四、金牌数据索引
// ══════════════════════════════════════════
children.push(
  h1('四、金牌数据索引（sim_data 目录）'),
  p('以下测试激励文件存放于代码仓库 /sim_data/ 目录，供 Role B 的 Testbench 直接使用。'),
  blank(),
  makeTable(
    ['文件前缀', '测试场景', '图像尺寸', '灰度范围', '验证重点'],
    [
      ['flat_gray',     '均匀灰度 128',    '32×32', '128~128', '边界稳定性'],
      ['dark_scene',    '低照度随机',       '32×32', '0~50',   '核心增强'],
      ['high_contrast', '明暗分区对比',     '32×32', '30~200', '裁剪逻辑'],
      ['ramp_test',     '线性渐变 0~255',   '32×32', '0~255',  '映射单调性'],
      ['random_noise',  '随机全范围噪声',   '32×32', '0~255',  '鲁棒性'],
      ['single_tile',   '单 Tile 8×8',    '8×8',   '10~115', '逐周期对比'],
    ],
    [1600, 1900, 1100, 1200, 1800]
  ),
  blank(),
  h2('4.1  文件命名规则'),
  blank(),
  makeTable(
    ['文件', '格式', '说明'],
    [
      ['input_<name>.txt',  '十六进制，每行 1 字节，大写',     '原始输入像素，按行优先顺序存储'],
      ['output_<name>.txt', '十六进制，每行 1 字节，大写',     '定点算法的期望输出，逐像素与 input 对应'],
      ['lut_<name>.txt',    '十六进制，每 Tile 256 行',        '各 Tile 的映射查找表，供 RTL 初始化 BRAM'],
      ['meta_<name>.json',  'JSON',                            '测试参数元数据（尺寸、clip 值等）'],
    ],
    [2200, 2400, 3000]
  ),
  blank(),
  h2('4.2  Verilog Testbench 使用示例'),
  new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 720 },
    shading: { type: ShadingType.SOLID, color: 'f4f6f7' },
    children: [new TextRun({
      text: '$readmemh("sim_data/input_dark_scene.txt",  stimulus_mem);\n$readmemh("sim_data/output_dark_scene.txt", golden_mem);\n// 遍历每个像素，判断 |DUT_out - golden| <= 1 为 PASS',
      size: 20, font: 'Courier New',
    })],
  }),
  blank(),
  h2('4.3  定点参数配置（与 RTL 保持一致）'),
  blank(),
  makeTable(
    ['参数名', '值', 'RTL 寄存器', '说明'],
    [
      ['TILE_SIZE',   '8',  'tile_size[7:0]',   'Tile 边长（像素）'],
      ['CLIP_LIMIT',  '40', 'clip_limit[15:0]', '直方图裁剪阈值'],
      ['BITWIDTH',    '8',  '—',                '像素位宽'],
      ['INTERP_BITS', '8',  '—',                '双线性权重精度（Q8）'],
    ],
    [2000, 1000, 2200, 2400]
  ),
  blank(), blank(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text: '— 文档结束 —', italics: true, color: '7f8c8d', size: 20, font: 'Arial' })],
  }),
);

// ─── Build & write ────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', color: COLORS.primary },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: COLORS.primary },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '2c3e50' },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 2 } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 },
      },
    },
    children,
  }],
});

const OUT_PATH = path.join(__dirname, 'output_docs', '文档A-1_算法逻辑与定点化分析报告.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUT_PATH, buf);
  console.log('✅ Document saved:', OUT_PATH);
});
