# 02-fill-stroke

填充（fill）和描边（stroke）的所有属性：颜色表达、透明度、虚线、线帽、线接、填充规则。

## 文件

| 文件 | 内容 |
|------|------|
| `01-solid-fill.svg` | 颜色名 / hex (3/6/8) / rgb() / rgba() / fill-opacity / element opacity / 灰阶 |
| `02-stroke-styles.svg` | stroke-width / dasharray (5 种) / linecap (butt/round/square) / linejoin (miter/round) / stroke-opacity / 组合 |
| `03-fill-rule.svg` | fill-rule: nonzero vs evenodd（五角星 + 同心圆） |
| `04-none-fill.svg` | fill="none" 各种场景 + 父 g 继承 + 与 fill-opacity=0 区别 + 描边文字 |

## 转换器

- 填充：SIF `Fill = SolidFill | GradientFill | NoneFill`（`src/sif/types/style/fill.ts`）
- 描边：SIF `Stroke`（含 `dashArray` / `lineCap` / `lineJoin`）
- PPTX：`src/pptx/converters/shape.ts` `convertFill` / `convertStroke`
