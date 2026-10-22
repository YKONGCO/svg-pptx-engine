# 07-text

文本相关所有 SVG 元素和属性：text / tspan / textPath / foreignObject / 装饰 / 对齐 / 富文本。

## 文件

| 文件 | 内容 |
|------|------|
| `01-text-basics.svg` | text-anchor / dominant-baseline / font-family / weight / style / 字号梯度 |
| `02-text-decoration.svg` | underline / line-through / overline / 颜色装饰 / letter-spacing / word-spacing / text-transform |
| `03-tspan-rotate.svg` | tspan rotate 单字符 / 螺旋 / 负角度 / 混合角度 / 旋转 + 颜色 |
| `04-tspan-baseline-shift.svg` | baseline-shift sub/super + 显式像素 + 百分比 + footnote 引用 |
| `05-tspan-styling.svg` | tspan 改色/字号/字体/字重/字形 + 复杂富文本组合 |
| `06-textLength.svg` | textLength + lengthAdjust (spacing / spacingAndGlyphs) + 压缩/拉伸 |
| `07-xml-space.svg` | xml:space=preserve 保留空白 |
| `08-textPath.svg` | textPath 沿直线/二次曲线/三次曲线/圆 + startOffset |
| `09-foreignObject.svg` | foreignObject HTML 白名单（h1-h3/p/strong/em/ul/ol/a/table） |
| `10-text-positioning.svg` | **文本定位回归**：绝对坐标系 + 网格 + 文本框外贴框 + 圆心/矩形居中 + 旋转 + 边界 + 实际业务 |

## 归档

| 路径 | 来源 |
|------|------|
| `_legacy_from_phase0-2b/01-batch-b-fixture.svg` | phase0-2b 综合 fixture（9 panel） |
| `_legacy_from_phase1/01-phase1-fixture.svg` | phase1 fixture（6 panel，math/LaTeX） |
| `_legacy_from_phase1/02-02-inline-mixed.svg` | 原 布局测试/02-inline-mixed.svg |
| `_legacy_from_phase1/02-06-latex-rich.svg` | 原 布局测试/06-latex-rich.svg |

## 转换器

- `src/svg/converters/text.ts` — `<text>` / `<tspan>` / `<textPath>` 解析
- `src/svg/converters/foreignObject.ts` — `<foreignObject>` HTML 白名单
- `src/pptx/converters/text.ts` — SIF TextElement → PPTX 文本框

## 文本框语义

SIF 中的文本元素统一使用**文本框语义**（参见 `doc/sif.md`）：

```typescript
interface TextElement {
  x: number       // 文本框左上角
  y: number       // 文本框左上角
  width: number   // 文本框宽度
  height: number  // 文本框高度
}
```

当 SVG 输入为 `<text x="100" y="100" text-anchor="middle">`，转换器必须先估算文本边界框，再写入 SIF。下游渲染器不得再次把 `y` 当作基线坐标处理。
