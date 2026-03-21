# Gradient Fill Support

基于 [PptxGenJS PR #1295](https://github.com/gitbrent/PptxGenJS/pull/1295) 实现的渐变填充支持。

## 概述

本模块为 PptxGenJS 添加了线性渐变（Linear Gradient）填充功能，支持形状、文本、图表和表格的渐变效果。

## 新增接口

### GradientStop

渐变停止点定义。

```typescript
interface GradientStop {
  /** 位置 (百分比) - 范围: 0-100 */
  position: number
  /** 渐变颜色 - HexColor 或 ThemeColor */
  color: Color
  /** 透明度 (百分比) - 范围: 0-100 */
  transparency?: number
}
```

### LinearGradientShapeFillProps

线性渐变填充属性。

```typescript
interface LinearGradientShapeFillProps {
  /** 渐变停止点列表 */
  stops: GradientStop[]
  /** 是否随形状旋转 */
  rotWithShape?: boolean
  /** 平铺矩形 */
  tileRect?: { t?: number; r?: number; b?: number; l?: number }
  /** 翻转方向 */
  flip?: 'none' | 'x' | 'xy' | 'y'
  /** 渐变角度 (度) - 范围: 0-359 */
  angle?: number
  /** 是否随对象缩放 */
  scaled?: boolean
  /** 填充类型 */
  type: 'linearGradient'
}
```

### SolidShapeFillProps

纯色填充属性（原有填充的标准化命名）。

```typescript
interface SolidShapeFillProps {
  /** 填充颜色 */
  color?: Color
  /** 透明度 */
  transparency?: number
  /** 填充类型 */
  type?: 'none' | 'solid'
  /** 透明度（已废弃） */
  alpha?: number
}
```

## 使用示例

### 形状渐变

```javascript
const pptx = new PptxGenJS()
const slide = pptx.addSlide()

slide.addShape(pptx.shapes.RECTANGLE, {
  x: 5.1,
  y: 6,
  w: 3.0,
  h: 1,
  fill: {
    type: "linearGradient",
    stops: [
      { position: 0, color: 'FF0000', transparency: 10 },
      { position: 100, color: '0000FF', transparency: 50 },
    ],
    angle: 45,
    scaled: 1,
  },
})
```

### 文本渐变

```javascript
slide.addText("LINEAR GRADIENT", {
  shape: pptx.shapes.RECTANGLE,
  align: "center",
  x: 5.1,
  y: 6,
  w: 3.0,
  h: 1,
  fill: {
    type: "linearGradient",
    stops: [
      { position: 0, color: '000000', transparency: 10 },
      { position: 100, color: '333333', transparency: 50 },
    ],
    angle: 45,
    scaled: 1,
  },
})
```

### 表格单元格渐变

```javascript
const rows = [
  [
    { text: 'Cell 1', fill: { type: 'linearGradient', stops: [...], angle: 90 } },
    { text: 'Cell 2' }
  ]
]
slide.addTable(rows)
```

## 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | `'linearGradient'` | - | 填充类型 |
| `stops` | `GradientStop[]` | - | 渐变停止点数组，至少需要2个点 |
| `angle` | `number` | 0 | 渐变角度 (0-359度) |
| `scaled` | `boolean` | false | 是否随对象缩放 |
| `rotWithShape` | `boolean` | true | 是否随形状旋转 |
| `flip` | `'none' \| 'x' \| 'xy' \| 'y'` | 'none' | 渐变翻转方向 |
| `tileRect` | `{t, r, b, l}` | - | 平铺矩形边距 |

## 渐变停止点 (GradientStop)

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `position` | `number` | 是 | 位置 (0-100%) |
| `color` | `Color` | 是 | 颜色值 |
| `transparency` | `number` | 否 | 透明度 (0-100%) |

## XML 输出

渐变填充会生成以下 XML 结构：

```xml
<a:gradFill rotWithShape="1" flip="none">
  <a:gsLst>
    <a:gs pos="0">
      <a:srgbClr val="FF0000">
        <a:alpha val="90000"/>
      </a:srgbClr>
    </a:gs>
    <a:gs pos="100000">
      <a:srgbClr val="0000FF">
        <a:alpha val="50000"/>
      </a:srgbClr>
    </a:gs>
  </a:gsLst>
  <a:lin ang="2700000" scaled="0"/>
</a:gradFill>
```

## 修改文件清单

- `src/core-interfaces.ts` - 新增渐变接口定义
- `src/gen-utils.ts` - 修改 genXmlColorSelection 函数支持渐变 XML 生成
- `src/gen-charts.ts` - 修改图表填充判断逻辑
- `src/gen-objects.ts` - 修改表格处理逻辑
- `types/core-interfaces.d.ts` - TypeScript 类型声明
