# PPTX 组合（Group）功能文档

## 概述

组合（Group）功能允许将多个形状、文本、图片、图表和媒体组合成一个统一的对象。组合后的元素作为一个整体在幻灯片上显示。

**重要**：

- API 层面，`group.add*()` 传入的 `x/y/w/h` 仍然按当前实现使用幻灯片坐标来定义
- 生成 PPTX 时，库会先计算组的包围盒，再把每个子元素转换为**相对于 group 左上角**的坐标写入 `p:grpSp`
- 组内子元素现在尽量复用普通 slide 元素的完整 XML 生成逻辑，因此文本、图片、图表、表格、媒体等效果应与非 group 元素保持一致
- 组本身仍然没有单独暴露 `x/y/w/h` API；组的位置由子元素坐标共同决定

## 最新实现说明

当前版本对 group 的渲染逻辑做了重要调整：

1. 过去：`group` 内的子元素走一套独立的简化版 XML 序列化逻辑，导致某些效果和普通元素不一致
2. 现在：`group` 先根据子元素坐标计算包围盒，再把子元素坐标转换为 group 内局部坐标，然后复用普通 slide 元素的完整序列化逻辑

这次修改的直接结果：

- `group.addText()` 与 `slide.addText()` 的文本样式、富文本、对齐、margin/bodyPr 等行为更一致
- `group.addImage()` 与普通图片的透明度、SVG、阴影、裁剪/contain/cover 等处理更一致
- `group.addTable()`、`group.addChart()`、`group.addMedia()` 不再依赖单独的简化 group 分支
- 生成出的 `p:grpSp` 更符合“组容器 + 相对坐标子元素”的结构

当前坐标语义可以总结为：

- 编写代码时：你给 `group.add*()` 的坐标仍然是基于幻灯片的
- 写入 PPTX 时：这些坐标会被归一化为基于 group 左上角的局部坐标

## API 参考

### slide.addGroup()

在幻灯片上创建一个新的组合。

**返回值**: `Group` - 返回组合对象

**示例**:
```javascript
const group = slide.addGroup()
```

---

### group.addShape(shapeName, options)

向组合添加形状。

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `shapeName` | `SHAPE_NAME` | 是 | 形状名称，如 `'rect'`, `'ellipse'`, `'roundRect'`, `'diamond'`, `'triangle'`, `'line'` 等 |
| `options` | `ShapeProps` | 否 | 形状选项对象 |

**ShapeProps 选项**:

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `x` | `number` | 1 | X 坐标（英寸） |
| `y` | `number` | 1 | Y 坐标（英寸） |
| `w` | `number` | 1 | 宽度（英寸） |
| `h` | `number` | 1 | 高度（英寸） |
| `fill` | `ShapeFillProps` | - | 填充属性 |
| `line` | `ShapeLineProps` | - | 线条属性 |
| `shadow` | `ShadowProps` | - | 阴影属性 |
| `rotate` | `number` | 0 | 旋转角度（度） |
| `objectName` | `string` | - | 对象名称 |

**返回值**: `Group` - 支持链式调用

**示例**:
```javascript
group.addShape('rect', {
    x: 1, y: 1, w: 2, h: 1.5,
    fill: { color: '4A90D9' },
    line: { color: '2E5090', width: 2 }
})
group.addShape('ellipse', {
    x: 2, y: 1.5, w: 1, h: 1,
    fill: { color: 'F5A623' }
})
```

**支持的形状类型** (`SHAPE_NAME`): `'rect'`, `'ellipse'`, `'roundRect'`, `'diamond'`, `'triangle'`, `'line'`, `'arrow'`, `'pentagon'`, `'hexagon'`, `'octagon'`, `'star'`, `'heart'`, `'lightningBolt'` 等（完整列表参见 `pptxgen.shapes`）

---

### group.addText(text, options)

向组合添加文本。

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `text` | `string \| TextProps[]` | 是 | 文本内容或文本段落数组 |
| `options` | `TextPropsOptions` | 否 | 文本选项对象 |

**TextPropsOptions 选项**:

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `x` | `number` | 0 | X 坐标 |
| `y` | `number` | 0 | Y 坐标 |
| `w` | `number` | - | 文本框宽度 |
| `h` | `number` | - | 文本框高度 |
| `fontSize` | `number` | 12 | 字体大小（磅） |
| `fontFace` | `string` | 'Arial' | 字体名称 |
| `color` | `string` | - | 文字颜色（十六进制） |
| `bold` | `boolean` | false | 是否加粗 |
| `italic` | `boolean` | false | 是否斜体 |
| `underline` | `boolean \| object` | false | 下划线 |
| `align` | `string` | 'left' | 水平对齐：'left', 'center', 'right' |
| `valign` | `string` | 'top' | 垂直对齐：'top', 'middle', 'bottom' |
| `bullet` | `boolean \| object` | false | 项目符号 |
| `wrap` | `boolean` | true | 是否自动换行 |

**返回值**: `Group` - 支持链式调用

**示例**:
```javascript
// 简单文本
group.addText('Hello World', { x: 1, y: 1, w: 2, h: 0.5, fontSize: 14 })

// 多段落文本
group.addText([
    { text: '标题文本', options: { bold: true, fontSize: 18 } },
    { text: '\n普通文本', options: { fontSize: 12 } },
    { text: '\n加粗文本', options: { bold: true } }
], { x: 1, y: 1, w: 3, h: 2 })
```

---

### group.addImage(options)

向组合添加图片。

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `options` | `ImageProps` | 是 | 图片选项对象 |

**ImageProps 选项**:

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `x` | `number` | 0 | X 坐标 |
| `y` | `number` | 0 | Y 坐标 |
| `w` | `number` | 0 | 图片宽度 |
| `h` | `number` | 0 | 图片高度 |
| `path` | `string` | - | 图片路径（URL 或本地路径） |
| `data` | `string` | - | base64 编码的图片数据 |

**注意**: `path` 或 `data` 二者必须提供一个

**返回值**: `Group` - 支持链式调用

**示例**:
```javascript
group.addImage({
    x: 1, y: 1, w: 2, h: 2,
    path: 'https://example.com/image.png'
})
```

---

### group.addMedia(options)

向组合添加音频或视频。

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `options` | `MediaProps` | 是 | 媒体选项对象 |

**MediaProps 选项**:

| 选项 | 类型 | 必填 | 描述 |
|------|------|--------|------|
| `x` | `number` | 0 | X 坐标 |
| `y` | `number` | 0 | Y 坐标 |
| `w` | `number` | 2 | 宽度 |
| `h` | `number` | 2 | 高度 |
| `type` | `string` | 'audio' | 媒体类型：'audio', 'video', 'online' |
| `path` | `string` | - | 本地文件路径 |
| `link` | `string` | - | 在线视频链接（用于 type='online'） |
| `data` | `string` | - | base64 编码的媒体数据 |
| `cover` | `string` | - | 封面图片（base64） |

**返回值**: `Group` - 支持链式调用

**示例**:
```javascript
// 添加本地视频
group.addMedia({
    x: 1, y: 1, w: 4, h: 3,
    type: 'video',
    path: '/path/to/video.mp4'
})

// 添加在线视频
group.addMedia({
    x: 1, y: 1, w: 4, h: 3,
    type: 'online',
    link: 'https://www.youtube.com/embed/Dph6ynRVyUc'
})
```

---

### group.addChart(type, data, options)

向组合添加图表。

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `type` | `CHART_NAME \| IChartMulti[]` | 是 | 图表类型 |
| `data` | `object[]` | 是 | 图表数据 |
| `options` | `IChartOpts` | 否 | 图表选项 |

**返回值**: `Group` - 支持链式调用

**示例**:
```javascript
group.addChart('bar', [
    { name: 'Series 1', labels: ['A', 'B', 'C'], values: [25, 30, 45] }
], { x: 1, y: 1, w: 4, h: 3 })
```

---

### group.addTable(tableRows, options)

向组合添加表格。

**参数**:

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `tableRows` | `TableRow[]` | 是 | 表格行数据 |
| `options` | `TableProps` | 否 | 表格选项 |

**返回值**: `Group` - 支持链式调用

**示例**:
```javascript
group.addTable([
    [{ text: 'Header 1' }, { text: 'Header 2' }],
    [{ text: 'Cell 1' }, { text: 'Cell 2' }]
], { x: 1, y: 1, w: 4, h: 1 })
```

---

## 方法链式调用

所有 `add*` 方法都返回组合对象本身，支持链式调用：

```javascript
slide.addGroup()
    .addShape('rect', { x: 1, y: 1, w: 3, h: 2, fill: { color: '4A90D9' } })
    .addShape('ellipse', { x: 2, y: 1.5, w: 1, h: 1, fill: { color: 'F5A623' } })
    .addText('Grouped Content', { x: 1.2, y: 3.1, w: 2.5, h: 0.5, fontSize: 14 })
```

---

## 坐标系统

### 定义阶段：幻灯片坐标

当前 API 下，组内元素的 `x/y/w/h` 在定义时仍然按**幻灯片坐标**传入。这意味着：

- `group.addShape({ x, y, w, h })` 中的 `x/y` 仍然从幻灯片左上角开始计算
- 组本身没有独立的 `x/y/w/h` 公开 API
- 组的位置由所有子元素的最小/最大边界共同决定

### 导出阶段：group 局部坐标

生成 PPTX 时，库会先求出 group 的包围盒：

- `grpMinX = min(child.x)`
- `grpMinY = min(child.y)`
- `grpMaxX = max(child.x + child.w)`
- `grpMaxY = max(child.y + child.h)`

然后把每个子元素转换成 group 内局部坐标：

- `relX = childX - grpMinX`
- `relY = childY - grpMinY`

也就是说：

- 代码输入时是“幻灯片坐标”
- 最终 XML 落盘时是“group 内相对坐标”

```
幻灯片坐标 (绝对)
┌─────────────────────────────────────┐
│                                     │
│    ┌─ 组 ─────────────────┐         │
│    │  ┌─────┐            │         │
│    │  │形状A │  ← 定义时 x=2, y=3（幻灯片坐标）│
│    │  └─────┘            │         │
│    └─────────────────────┘         │
│                                     │
└─────────────────────────────────────┘
```

---

## 填充属性 (ShapeFillProps)

| 选项 | 类型 | 描述 |
|------|------|------|
| `color` | `string` | 填充颜色（十六进制或主题色） |
| `transparency` | `number` | 透明度（0-100），50 表示 50% 透明 |
| `type` | `string` | 填充类型：'solid', 'none' |

**示例**:
```javascript
// 纯色填充
fill: { color: '4A90D9' }

// 半透明填充
fill: { color: '4A90D9', transparency: 50 }

// 无填充（透明）
fill: { type: 'none' }

// 线性渐变
fill: {
    type: 'linearGradient',
    angle: 90,
    stops: [
        { position: 0, color: 'FF0000' },
        { position: 100, color: '0000FF' }
    ]
}
```

---

## 线条属性 (ShapeLineProps)

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `color` | `string` | '000000' | 线条颜色 |
| `width` | `number` | 1 | 线条宽度（磅） |
| `dashType` | `string` | 'solid' | 线型：'solid', 'dash', 'dot', 'dashDot', 'lgDash' 等 |
| `type` | `string` | 'solid' | 线条类型：'solid', 'none' |
| `beginArrowType` | `string` | - | 起点箭头类型 |
| `endArrowType` | `string` | - | 终点箭头类型 |

**示例**:
```javascript
line: { color: '333333', width: 2, dashType: 'dash' }

// 带箭头
line: { color: '000000', width: 2, beginArrowType: 'arrow', endArrowType: 'triangle' }
```

---

## 阴影属性 (ShadowProps)

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `type` | `string` | 'outer' | 阴影类型：'outer', 'inner', 'none' |
| `blur` | `number` | 0 | 模糊半径（0-100） |
| `offset` | `number` | 0 | 阴影偏移量（0-200） |
| `angle` | `number` | 0 | 阴影角度（度，0-359） |
| `color` | `string` | '000000' | 阴影颜色 |
| `opacity` | `number` | 1.0 | 透明度（0.0-1.0） |
| `rotateWithShape` | `boolean` | false | 是否随形状旋转 |

**示例**:
```javascript
shadow: {
    type: 'outer',
    blur: 3,
    offset: 2,
    angle: 45,
    color: '000000',
    opacity: 0.5
}
```

---

## 使用示例

### 基本卡片组件

```javascript
const card = slide.addGroup()
card.addShape('roundRect', {
    x: 1, y: 1, w: 3, h: 2,
    fill: { color: 'FFFFFF' },
    line: { color: 'E0E0E0', width: 1 },
    shadow: { type: 'outer', blur: 2, offset: 2, angle: 45, color: '000000' }
})
card.addShape('rect', { x: 1.2, y: 1.2, w: 0.6, h: 0.6, fill: { color: '4A90D9' } })
card.addText('Card Title', { x: 1.2, y: 2, w: 2.5, h: 0.4, fontSize: 14, bold: true })
card.addText('Description text here', { x: 1.2, y: 2.4, w: 2.5, h: 0.5, fontSize: 10 })
```

### 图标组合

```javascript
// 复选框图标
const checkIcon = slide.addGroup()
checkIcon.addShape('ellipse', { x: 0, y: 0, w: 24, h: 24, fill: { color: '27AE60' } })
checkIcon.addText('✓', { x: 0, y: 0, w: 24, h: 24, fontSize: 16, color: 'FFFFFF', align: 'center', valign: 'middle' })

// 信息图标
const infoIcon = slide.addGroup()
infoIcon.addShape('ellipse', { x: 0, y: 0, w: 24, h: 24, fill: { color: '3498DB' } })
infoIcon.addText('i', { x: 0, y: 0, w: 24, h: 24, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
```

### 进度条组合

```javascript
const progressBar = slide.addGroup()
progressBar.addShape('rect', {
    x: 1, y: 1, w: 4, h: 0.4,
    fill: { color: 'E0E0E0' },
    line: { color: 'CCCCCC', width: 1 }
})
progressBar.addShape('rect', {
    x: 1, y: 1, w: 3, h: 0.4,
    fill: { color: '27AE60' }
})
progressBar.addText('75%', {
    x: 1, y: 1, w: 4, h: 0.4,
    fontSize: 10, color: 'FFFFFF',
    align: 'center', valign: 'middle'
})
```

---

## 常见问题

### Q: 如何定位组在幻灯片上的位置？

组的位置由其所有子元素的包围盒决定。实际位置取决于：

- 最小的 `x/y`
- 最大的 `x + w`
- 最大的 `y + h`

```javascript
const group = slide.addGroup()
group.addShape('rect', { x: 2, y: 3, w: 2, h: 1 })  // 元素位于 x=2, y=3
```

### Q: 如何移动整个组？

由于 group 目前没有独立的 `group.x/group.y` API，移动整个组仍然需要遍历所有子元素并同步更新其定义坐标。

### Q: 组合支持嵌套吗？

当前实现支持将组添加到幻灯片，但不支持在组内嵌套另一个组。

---

## PPTX XML 结构

生成的组合 XML 结构如下：

```xml
<p:grpSp>
    <!-- 非可视属性 -->
    <p:nvGrpSpPr>
        <p:cNvPr id="1" name="Group"/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
    </p:nvGrpSpPr>

    <!-- 组属性定义 -->
    <p:grpSpPr>
        <a:xfrm>
            <a:off x="grpMinX" y="grpMinY"/>
            <a:ext cx="grpCx" cy="grpCy"/>
            <a:chOff x="0" y="0"/>
            <a:chExt cx="grpCx" cy="grpCy"/>
        </a:xfrm>
    </p:grpSpPr>

    <!-- 子元素（写入 group 内相对坐标） -->
    <p:sp|p:pic|p:graphicFrame|...>
        ...
        <a:xfrm|p:xfrm>
            <a:off x="relX" y="relY"/>
            <a:ext cx="w" cy="h"/>
        </a:xfrm|p:xfrm>
        ...
    </p:sp|p:pic|p:graphicFrame|...>
</p:grpSp>
```

**关键 XML 元素说明**:

| 元素 | 描述 |
|------|------|
| `p:grpSp` | 组形状的根元素 |
| `p:nvGrpSpPr` | 组的非可视属性（名称、ID） |
| `p:grpSpPr` | 组的可视属性（变换、坐标系统） |
| `a:xfrm` | 变换矩阵 |
| `a:off` | 组在幻灯片上的位置 |
| `a:ext` | 组的尺寸 |
| `a:chOff` | 子元素坐标系统的起始点（固定为 0,0） |
| `a:chExt` | 子元素坐标系统的范围 |

### 说明

- `p:grpSp` 本身仍由 group 分支生成
- 子元素不再使用一套独立的简化版渲染逻辑
- 子元素会先做坐标归一化，再复用普通对象的 XML 生成路径
- 因此 group 内元素的渲染结果应尽量与非 group 元素一致

---

## 类型定义

```typescript
// ShapeProps
interface ShapeProps extends PositionProps {
    fill?: ShapeFillProps
    line?: ShapeLineProps
    shadow?: ShadowProps
    rotate?: number
    objectName?: string
    flipH?: boolean
    flipV?: boolean
    hyperlink?: HyperlinkProps
}

// PositionProps
interface PositionProps {
    x?: number | string  // number（英寸）或 string（百分比或 EMU）
    y?: number | string
    w?: number | string
    h?: number | string
}

// ShapeFillProps
type ShapeFillProps = SolidShapeFillProps | LinearGradientShapeFillProps

interface SolidShapeFillProps {
    color?: string
    transparency?: number
    type?: 'none' | 'solid'
}

interface LinearGradientShapeFillProps {
    type: 'linearGradient'
    angle?: number
    stops: Array<{ position: number, color: string, transparency?: number }>
}

// ShapeLineProps
interface ShapeLineProps extends SolidShapeFillProps {
    width?: number
    dashType?: 'solid' | 'dash' | 'dot' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'sysDash' | 'sysDot'
    beginArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
    endArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
}

// ShadowProps
interface ShadowProps {
    type?: 'outer' | 'inner' | 'none'
    blur?: number
    offset?: number
    angle?: number
    color?: string
    opacity?: number
    rotateWithShape?: boolean
}

// TextPropsOptions
interface TextPropsOptions extends PositionProps, TextBaseProps {
    fontSize?: number
    fontFace?: string
    color?: string
    bold?: boolean
    italic?: boolean
    underline?: boolean | { style?: string, color?: string }
    align?: 'left' | 'center' | 'right' | 'justify'
    valign?: 'top' | 'middle' | 'bottom'
    bullet?: boolean | { type?: 'bullet' | 'number', characterCode?: string }
    wrap?: boolean
    lineSpacing?: number
}

// ImageProps
interface ImageProps extends PositionProps, DataOrPathProps {
    altText?: string
    flipH?: boolean
    flipV?: boolean
    hyperlink?: HyperlinkProps
    rotate?: number
    rounding?: boolean
    shadow?: ShadowProps
    sizing?: { type: 'contain' | 'cover' | 'crop', w: number, h: number, x?: number, y?: number }
    transparency?: number
}

// MediaProps
interface MediaProps extends PositionProps, DataOrPathProps {
    type: 'audio' | 'video' | 'online'
    cover?: string
    extn?: string
    link?: string
}

// TableProps
interface TableProps extends PositionProps {
    colW?: number | number[]
    rowH?: number | number[]
    border?: BorderProps | [BorderProps, BorderProps, BorderProps, BorderProps]
    fontFace?: string
    fontSize?: number
    color?: string
    fill?: ShapeFillProps
}
```
