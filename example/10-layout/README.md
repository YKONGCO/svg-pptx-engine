# 10-layout

布局容器：`<g layout="block|flex|grid">` + CJK measure + z-index + overflow + LaTeX/公式。

> ⚠️ **实验性特性**：当前 svg-pptx-engine 的 SVG→SIF 转换器**不消费** `layout` 属性。phase1/phase3 fixture 是布局管线的早期验证，归档在 `_legacy_from_phase3/`。

## 文件

| 文件 | 内容 |
|------|------|
| `01-block-flow.svg` | block 容器（基础/gap/padding/嵌套/文本） |
| `02-flex-row.svg` | flex row 默认/space-between/space-around/center/gap |
| `03-flex-column-wrap.svg` | flex column / align-items / flex-wrap / stretch |
| `04-grid-2x2.svg` | grid 2x2 / auto / 1fr / gap / 不等列宽 / 嵌套 dashboard |
| `05-cjk-z-overflow.svg` | CJK measure / 中日韩混排 / z-index 排序 / z-index 负值 / overflow:clip |

## 归档

| 路径 | 来源 |
|------|------|
| `_legacy_from_phase3/01-phase3-fixture.svg` | phase3 综合 fixture（6 panel） |
| `_legacy_from_phase3/02-01-block-flow.svg` | 原 布局测试/01-block-flow.svg |
| `_legacy_from_phase3/02-03-flex-row.svg` | 原 布局测试/03-flex-row.svg |
| `_legacy_from_phase3/02-04-grid-2x2.svg` | 原 布局测试/04-grid-2x2.svg |
| `_legacy_from_phase3/02-05-nested.svg` | 原 布局测试/05-nested.svg |

## 相关

- 文本相关布局（math/LaTeX/inline-mixed）归档在 `07-text/_legacy_from_phase1/`
- `src/sif/types/style/layout.ts` — SIF 布局相关类型（实验性）

## 已知问题

- `layout="flex"` / `layout="grid"` 属性当前被 SVG 解析器**忽略**（不进入 SIF）
- 修复路径需要：
  1. 扩展 SVG 解析器读取 `layout` / `flex-direction` / `gap` 等属性
  2. 在 SIF 阶段增加 LayoutContainer 抽象
  3. PPTX 端按 flex/grid 计算每个子元素的位置 + 大小
- 详见 `ROADMAP.md`
