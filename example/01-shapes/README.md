# 01-shapes

基础图形（rect / circle / ellipse / line / polygon / polyline / path）的形状定义、坐标系统和命令语法。

## 文件

| 文件 | 内容 |
|------|------|
| `01-basic-shapes.svg` | 七大基础形状最简用法（rect/circle/ellipse/line/polygon/polyline），每种一格 |
| `02-path-commands.svg` | path `d` 全部命令：M L H V C S Q T A Z，每个命令一格 |
| `03-rounded-rect.svg` | rect 的 `rx` / `ry` 各种取值（0 微 大 椭圆 胶囊） |

## 转换器

- SVG → SIF: `src/svg/converters/shape.ts`
- SIF → PPTX: `src/pptx/converters/shape.ts`

## PPTX 端映射

| SVG 元素 | PPTX `<a:prstGeom prst="...">` |
|----------|--------------------------------|
| `<rect>` | `rect` / `roundRect`（当 rx/ry） |
| `<circle>` | `ellipse`（rx = ry = r） |
| `<ellipse>` | `ellipse` |
| `<line>` | `line`（LineElement） |
| `<polygon>` | `custGeom`（闭合直线） |
| `<polyline>` | `custGeom`（开放直线） |
| `<path>` | `custGeom`（含曲线和弧） |

PPTX 原生支持 `<a:arcTo>` 元素 — SVG A 命令的弧线直接映射，无需先转贝塞尔。
