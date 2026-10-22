# 04-patterns

`<pattern>` 图案填充：圆点 / 条纹 / 网格 / 棋盘 / 蜂窝 + patternTransform 旋转。

## 文件

| 文件 | 内容 |
|------|------|
| `01-dot-pattern.svg` | 圆点 / 圆环 / 方点 / 棋盘 / 蜂窝 pattern tile |
| `02-stripe-grid.svg` | 竖纹 / 横纹 / 网格 / 斜纹 / 间隔横竖纹 |
| `03-pattern-transform.svg` | patternTransform rotate 0/15/30/45/60/90 — 视觉不连续（三角缝，DEFER 视觉） |

## 转换器

- `src/svg/converters/pattern.ts` — `<pattern>` → PatternTemplate
- `src/pptx/generator.ts` `addPatternFilledShape` — per-tile 网格铺 + patternTransform 旋转 + bbox 裁切

## 实现策略

按 `tileW × tileH` 网格平铺到 shape 的整个 bbox 上，每格 `translate + (可选) rotate`。每格严格裁切到 shape bbox 内以防溢出。

## 已知问题

- `patternTransform="rotate(deg)"` 视觉不连续 — 每段旋转的子图元之间有白色三角缝（无 SVG→PNG 栅格化器）
  - 后续路径：接入 `@resvg/resvg-js` 把 tile 渲染为 PNG 用 picture fill / shape-level `crop` 截断边缘
