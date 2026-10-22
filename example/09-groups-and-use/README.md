# 09-groups-and-use

`<g>` 组、`<use>` 引用、`<symbol>` 符号、`<defs>` 资源定义、嵌套 `<svg>` viewport。

## 文件

| 文件 | 内容 |
|------|------|
| `01-basic-group.svg` | g 共享 fill/stroke/transform/opacity + 嵌套 g |
| `02-use-symbol.svg` | use 引用 path/symbol/group + 改 x/y/width/height 缩放 |
| `03-nested-svg.svg` | nested `<svg>` viewport 缩放 + transform + 深度嵌套 + overflow |
| `04-nested-svg-composition.svg` | 综合案例（来自 嵌套SVG测试/nested-svg-composition.svg） |

## SIF Group 设计原则

> **Group 是纯组合逻辑，不涉及坐标和样式**
> - 无位置属性（x, y, width, height）
> - 无视觉属性（transform, opacity, effect, clipContent 等）
> - 仅用于逻辑分组（批量操作、层级组织）

这是与 SVG `<g>` 的根本区别：SVG `<g>` 是视觉容器，SIF Group 是结构容器。

## SVG → SIF 转换规则

当 SVG 解析器遇到 `<g transform="translate(50, 50)">` 时：

1. 将 `transform` 合并到子元素的坐标中
2. Group 本身不携带任何视觉属性

## 嵌套 Group

Group 可以嵌套，但每层都不携带坐标/样式 — 子元素的坐标已是绝对值。

## 转换器

- `src/svg/converters/group.ts` — `<g>` / `<defs>` / `<use>` / `<symbol>` 解析
- `src/pptx/converters/group.ts` — SIF Group → PPTX group shape
