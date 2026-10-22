# 11-lines-and-markers

`<line>` / `<polyline>` / `<polygon>` + `<marker>` 箭头 / 圆 / 菱 / 自定义标记。

## 文件

| 文件 | 内容 |
|------|------|
| `01-line-marker.svg` | `<line>` 基础 + marker-start/end + 三角/圆/菱/箭头 marker + orient=auto |
| `02-polyline-polygon.svg` | polyline 折线 + round join + marker 节点 + polygon + 折线图 |

## 转换器

- `src/svg/converters/marker.ts` — `<marker>` → ArrowMarker
- `src/svg/converters/shape.ts` — `<line>` / `<polyline>` / `<polygon>` 解析
- `src/pptx/converters/line.ts` — LineElement + marker
- `src/pptx/converters/shape.ts` — polyline/polygon custGeom

## SIF LineElement

```typescript
interface LineElement {
  type: 'line'
  x1: number; y1: number
  x2: number; y2: number
  stroke: Stroke
  markerStart?: string  // marker ID
  markerEnd?: string    // marker ID
}
```

## ArrowMarker

```typescript
type ArrowHeadType = 'arrow' | 'diamond' | 'circle' | 'open' | 'none'

interface ArrowMarker {
  id: string
  type: ArrowHeadType
  width?: number
  height?: number
  fill?: boolean
  color?: string
}
```

## 边界框

LineElement 特殊情况 — 边界框需要根据 x1/y1/x2/y2 计算：

```typescript
const minX = Math.min(x1, x2)
const minY = Math.min(y1, y2)
const maxX = Math.max(x1, x2)
const maxY = Math.max(y1, y2)
```
