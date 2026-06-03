# SIF 协议文档

本文档描述了 SIF (SVG Integration Format) 的完整规范，包括基础系统、元素属性及与 SVG 的对应关系。

---

## 目录

- [基础系统](#基础系统)
  - [坐标系统](#坐标系统)
  - [颜色系统](#颜色系统)
  - [单位系统](#单位系统)
  - [角度与百分比](#角度与百分比)
  - [属性对应原则](#属性对应原则)
- [公共类型](#公共类型)
  - [Fill（填充样式）](#fill填充样式)
  - [Stroke（描边样式）](#stroke描边样式)
  - [Gradient（渐变）](#gradient渐变)
  - [VisualEffect（视觉效果）](#visualeffect视觉效果)
  - [Hyperlink（超链接）](#hyperlink超链接)
  - [Transform（变换）](#transform变换)
- [Element（元素）](#element元素)
- [ShapeElement](#shapeelement)
- [TextElement](#textelement)
- [RichTextElement](#richtextelement)
- [LineElement](#lineelement)
- [ImageElement](#imageelement)
- [VideoElement](#videoelement)
- [AudioElement](#audioelement)
- [GroupElement](#groupelement)
- [SlideDocument](#slidedocument)
- [SVG 属性对照表](#svg-属性对照表)

---

## 基础系统

### 坐标系统

SIF 使用**笛卡尔坐标系**，原点在画布左上角，X轴向右为正，Y轴向下为正。

```
┌─────────────────→ X
│  (0,0)
│    │
│    │
│    ↓
│    Y
│
└──────────────────
```

#### 坐标系参数

| 属性 | 类型 | 说明 |
|------|------|------|
| `x` | `number` | 元素左上角 X 坐标（像素） |
| `y` | `number` | 元素左上角 Y 坐标（像素） |
| `width` | `number` | 元素宽度（像素） |
| `height` | `number` | 元素高度（像素） |

#### 边界框计算

对于大多数元素，`x`, `y`, `width`, `height` 定义了元素的边界框。

**TextElement / RichTextElement 约束**：
- `x`, `y`, `width`, `height` 表示文本框（bounding box），不是 SVG 文本基线点
- 如果上游来源是 SVG `<text x y>`，则转换器必须先把 `text-anchor` / `dominant-baseline` 解析为文本框，再写入 SIF
- `textAnchor` 与 `verticalAlign` 表示文本在该文本框中的对齐语义，不改变 `x` / `y` 的"左上角"含义

**LineElement 特殊情况**：
```typescript
// 线条的边界框需要根据 x1, y1, x2, y2 计算
const minX = Math.min(x1, x2)
const minY = Math.min(y1, y2)
const maxX = Math.max(x1, x2)
const maxY = Math.max(y1, y2)
```

---

### 颜色系统

SIF 支持多种颜色表示方式，支持透明度。

#### Color

统一颜色类型，支持多种格式：

| 格式 | 示例 | 说明 |
|------|------|------|
| 3位 RGB | `#F00` | 相当于 `#FF0000` |
| 6位 RGB | `#FF0000` | 标准 6 位十六进制 |
| 8位 RGBA | `#FF000080` | 带透明度 (80 = 50%) |
| Named color | `red`, `blue`, `transparent` | CSS 命名颜色 |
| rgb()/rgba() | `rgb(255,0,0)`, `rgba(255,0,0,0.5)` | 函数式表示 |

> **注意**: 8位 hex 格式中透明度取值 00-FF（0-255），而非 0-1。

#### 渐变色 (Gradient)

SIF 支持两种渐变类型：

##### LinearGradient（线性渐变）

```typescript
interface LinearGradient {
  type: 'linear'
  stops: GradientStop[]
  angle?: Angle          // 0-360，渐变角度
  x1?: Percentage        // 0-1，起始点 X（覆盖 angle）
  y1?: Percentage        // 0-1，起始点 Y
  x2?: Percentage        // 0-1，结束点 X
  y2?: Percentage        // 0-1，结束点 Y
}
```

**angle 与 x1/y1/x2/y2 的关系**：
- 当指定 `angle` 时，根据角度计算起点和终点
- 当指定 `x1/y1/x2/y2` 时，忽略 `angle`
- 默认角度为 `0`（从左到右）

**渐变角度对照**：

| angle | 方向 | 说明 |
|-------|------|------|
| `0` | → | 从左到右 |
| `90` | ↓ | 从上到下 |
| `180` | ← | 从右到左 |
| `270` | ↑ | 从下到上 |
| `45` | ↘ | 左上到右下 |

##### RadialGradient（径向渐变）

```typescript
interface RadialGradient {
  type: 'radial'
  stops: GradientStop[]
  x1?: Percentage        // 0-1，圆心 X
  y1?: Percentage        // 0-1，圆心 Y
  x2?: Percentage        // 0-1，外圆 X
  y2?: Percentage        // 0-1，外圆 Y
  r1?: Percentage        // 内半径
  r2?: Percentage        // 0-1，外半径
}
```

##### GradientStop（渐变断点）

```typescript
interface GradientStop {
  offset: Percentage     // 0-1，断点位置
  color: Color
  opacity?: Opacity      // 0-1，断点透明度
}
```

**示例**：

```typescript
// 红色到蓝色线性渐变
const redToBlue: LinearGradient = {
  type: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: '#FF0000' },
    { offset: 1, color: '#0000FF' }
  ]
}

// 带透明度的径向渐变
const radialWithOpacity: RadialGradient = {
  type: 'radial',
  x1: 0.5, y1: 0.5,
  r2: 0.5,
  stops: [
    { offset: 0, color: '#FFFFFF', opacity: 1 },
    { offset: 1, color: '#000000', opacity: 0 }
  ]
}
```

---

### 单位系统

SIF 统一使用**像素 (px)** 作为长度单位。

```typescript
type PxLength = number  // 单位固定为 px
```

> **上游转换职责**: 上游解析器（如 SVG 解析器）负责将其他单位（pt, em, %, cm, mm, in）转换为 px 后存入 SIF。

#### 单位使用场景

所有长度属性单位均为 px：

| 属性 | 说明 |
|------|------|
| `x`, `y`, `width`, `height` | 元素尺寸和位置 |
| `fontSize` | 字体大小 |
| `stroke.width` | 描边宽度 |
| `lineHeight` | 行高 |
| `letterSpacing` | 字间距 |
| `BlurEffect.radius` | 模糊半径 |
| `ShadowEffect.blur` | 阴影模糊半径 |

---

### 角度与百分比

#### Angle

```typescript
type Angle = number  // 0-360 度
```

**正值表示顺时针**：
- `0` = 0°
- `90` = 90° 顺时针
- `180` = 180°
- `270` = 270° 顺时针
- `360` = 360°（等于 0°）

#### Percentage

```typescript
type Percentage = number  // 0-1 或 0-100
```

**使用约定**：
- 渐变偏移 `GradientStop.offset`：0-1
- 透明度 `Opacity`：0-1

> **注意**: 具体范围取决于使用场景，文档中会明确标注。

#### Opacity

```typescript
type Opacity = number  // 0-1
```

| 值 | 效果 |
|------|------|
| `0` | 完全透明 |
| `0.5` | 50% 透明度 |
| `1` | 完全不透明（默认） |

---

## 属性对应原则

1. **直接对应**: SIF 属性与 SVG 属性同名同义（如 `x`, `y`, `width`, `height`）
2. **语义映射**: 概念相同但名称不同（如 `visible` → `visibility`）
3. **复合属性**: SIF 使用对象结构，SVG 使用字符串格式（如 `transform`）
4. **扩展属性**: SIF 扩展的非SVG标准属性以 `camelCase` 命名

---

## 公共类型

公共类型是被多个元素共用的类型定义。

### Fill（填充样式）

```typescript
type Fill = SolidFill | GradientFill | NoneFill
```

| 类型 | SVG对应 | 说明 |
|------|---------|------|
| `SolidFill` | `fill: #color` | 纯色填充 |
| `GradientFill` | `fill: url(#gradient)` | 渐变填充 |
| `NoneFill` | `fill: none` | 无填充（透明） |

#### SolidFill（纯色填充）

```typescript
interface SolidFill {
  type: 'solid'
  color: Color
  opacity?: Opacity   // 0-1
}
```

#### GradientFill（渐变填充）

```typescript
interface GradientFill {
  type: 'gradient'
  gradient: Gradient   // LinearGradient 或 RadialGradient
  opacity?: Opacity    // 整体透明度
}
```

#### NoneFill（无填充）

```typescript
interface NoneFill {
  type: 'none'
}
```

---

### Stroke（描边样式）

```typescript
interface Stroke {
  color?: Color
  type?: 'solid' | 'gradient'
  gradient?: Gradient
  width: number           // 描边宽度（像素）
  opacity?: Opacity
  lineCap?: LineCap       // 'round' | 'square' | 'butt'
  lineJoin?: LineJoin     // 'round' | 'bevel' | 'miter'
  dashArray?: DashArray   // 虚线图案，如 "5,5"
  dashOffset?: number     // 虚线偏移
}
```

**LineCap 对照**：

| 值 | SVG | 效果 |
|----|-----|------|
| `'round'` | `round` | 圆形线帽 |
| `'square'` | `square` | 方形线帽 |
| `'butt'` | `butt` | 平直线帽 |

**LineJoin 对照**：

| 值 | SVG | 效果 |
|----|-----|------|
| `'round'` | `round` | 圆角连接 |
| `'bevel'` | `bevel` | 斜角连接 |
| `'miter'` | `miter` | 尖角连接 |

### DashArray（虚线图案）

```typescript
type DashArray = string  // e.g., "5,5" 或 "5,5,2,2"
```

| 示例 | 图案 | 说明 |
|------|------|------|
| `"5,5"` | ▭ ▭ ▭ | 5像素实线，5像素空白 |
| `"10,3,3,3"` | ▭▭▭ ▭▭ ▭▭▭ | 10实，3空，3实，3空 |
| `"0,10"` | ········ | 点线 |

---

### Gradient（渐变）

```typescript
type Gradient = LinearGradient | RadialGradient
```

见上文 [渐变色 (Gradient)](#渐变色-gradient)

---

### VisualEffect（视觉效果）

```typescript
type VisualEffect = ShadowEffect | BlurEffect | GlowEffect | DropShadowEffect | OuterGlowEffect
```

| 类型 | SVG对应 | 说明 |
|------|---------|------|
| `ShadowEffect` | `filter: drop-shadow(...)` | 自定义阴影 |
| `BlurEffect` | `filter: blur(...)` | 高斯模糊 |
| `GlowEffect` | `filter: drop-shadow(...)` | 发光效果 |
| `DropShadowEffect` | `filter: drop-shadow(...)` | 预设阴影（subtle/moderate/intense） |
| `OuterGlowEffect` | `filter: drop-shadow(...)` | 预设外发光（subtle/moderate/intense） |

#### ShadowEffect

```typescript
interface ShadowEffect {
  type: 'shadow'
  color: Color
  offsetX: number         // X偏移（像素）
  offsetY: number         // Y偏移（像素）
  blur: number            // 模糊半径（像素）
  opacity?: Opacity       // 阴影透明度
  spread?: number         // 扩展半径（像素）
}
```

#### BlurEffect

```typescript
interface BlurEffect {
  type: 'blur'
  radius: number          // 模糊半径（像素）
}
```

#### GlowEffect

```typescript
interface GlowEffect {
  type: 'glow'
  color: Color
  radius: number          // 发光半径（像素）
  opacity?: Opacity       // 发光透明度
}
```

#### DropShadowEffect

```typescript
interface DropShadowEffect {
  type: 'dropShadow'
  preset: 'subtle' | 'moderate' | 'intense'
}
```

#### OuterGlowEffect

```typescript
interface OuterGlowEffect {
  type: 'outerGlow'
  preset: 'subtle' | 'moderate' | 'intense'
}
```

---

### Hyperlink（超链接）

```typescript
interface Hyperlink {
  href: string                              // 链接地址
  target?: '_self' | '_blank' | '_parent' | '_top'  // 打开方式
  tooltip?: string                          // 提示文本
  action?: 'navigate' | 'jump' | 'showMessage' | 'runMacro' | 'custom' // 动作类型
  slideId?: string                          // 跳转目标幻灯片ID
  customActionId?: string                   // 自定义动作ID
}
```

| target | 说明 |
|--------|------|
| `_self` | 当前窗口（默认） |
| `_blank` | 新窗口 |
| `_parent` | 父框架 |
| `_top` | 顶层窗口 |

---

### Transform（变换）

```typescript
interface Transform {
  translateX?: number   // X方向平移（像素）
  translateY?: number  // Y方向平移（像素）
  scaleX?: number      // X方向缩放（1 = 100%）
  scaleY?: number      // Y方向缩放（1 = 100%）
  rotate?: number      // 旋转角度（度）
  rotateX?: number     // 绕X轴旋转（3D）
  rotateY?: number     // 绕Y轴旋转（3D）
  rotateZ?: number     // 绕Z轴旋转
  matrix?: [number, number, number, number, number, number] // 3x2变换矩阵: a,b,c,d,e,f
}
```

对应 SVG `transform` 属性：
- `translate(tx, ty)` = translateX + translateY
- `scale(sx, sy)` = scaleX + scaleY
- `rotate(deg)` = rotate
- `matrix(a,b,c,d,e,f)` = matrix

> **rotate 语义约束**：
> - `rotate` 仅支持绕元素**左上角**旋转（等价于 SVG `rotate(angle)` 而非 `rotate(angle, cx, cy)`）
> - 不支持绕任意点旋转，如需绕中心旋转请自行计算偏移量

---

## Element（元素）

所有元素的联合类型：

```typescript
type Element = ShapeElement | TextElement | ImageElement | LineElement | GroupElement | VideoElement | AudioElement

type ElementType = 'shape' | 'text' | 'image' | 'line' | 'group' | 'video' | 'audio' | 'icon'
```

---

## BaseElement

所有元素的基类，提供通用属性。

### 属性

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `id` | `ElementId` | 是 | `id` | 元素的唯一标识符 |
| `type` | `ElementType` | 是 | - | 元素类型 |
| `x` | `number` | 是 | `x` | 元素左上角 X 坐标（像素） |
| `y` | `number` | 是 | `y` | 元素左上角 Y 坐标（像素） |
| `width` | `number` | 是 | `width` | 元素宽度（像素） |
| `height` | `number` | 是 | `height` | 元素高度（像素） |
| `transform` | `Transform` | 否 | `transform` | 变换属性 |
| `visible` | `boolean` | 否 | `visibility` | 元素是否可见，默认 true |
| `opacity` | `number` | 否 | `opacity` | 元素透明度，范围 0-1 |
| `zIndex` | `number` | 否 | - | 层级顺序，数值越大越靠上 |
| `hyperlink` | `Hyperlink` | 否 | - | 超链接配置 |
| `meta` | `ElementMeta` | 否 | - | 元素元数据 |
| `effect` | `VisualEffect` | 否 | `filter` | 视觉效果（阴影、模糊、发光等） |

### ElementMeta

```typescript
interface ElementMeta {
  createdAt?: number    // 创建时间戳（毫秒）
  updatedAt?: number    // 更新时间戳（毫秒）
  source?: string      // 来源文件
  description?: string  // 描述
  tags?: string[]      // 标签
}
```

---

## ShapeElement

形状元素，封装各种 SVG 形状。

### 公共属性（BaseShape）

继承自 BaseElement，额外包含：

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `type` | `'shape'` | 是 | - | 元素类型标识 |
| `shapeType` | `ShapeType` | 是 | - | 形状类型 |
| `fill` | `Fill` | 是 | `fill` | 填充样式（solid/gradient/none） |
| `stroke` | `Stroke` | 否 | `stroke` | 描边样式 |
| `rotation` | `number` | 否 | `transform: rotate()` | 旋转角度（度） |

`ShapeType = 'rect' | 'circle' | 'ellipse' | 'path' | 'line' | 'polygon' | 'polyline'`

### 子类型

#### RectShape（矩形）

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `shapeType` | `'rect'` | 是 | `<rect>` | 矩形类型标识 |
| `rx` | `number` | 否 | `rx` | 圆角 X 半径 |
| `ry` | `number` | 否 | `ry` | 圆角 Y 半径 |

**SVG 映射**: `<rect x="..." y="..." width="..." height="..." rx="..." ry="..." />`

#### CircleShape（圆形）

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `shapeType` | `'circle'` | 是 | `<circle>` | 圆形类型标识 |
| `cx` | `number` | 否 | `cx` | 圆心 X 坐标（未指定时从 x/width 计算） |
| `cy` | `number` | 否 | `cy` | 圆心 Y 坐标 |
| `r` | `number` | 否 | `r` | 圆半径 |

**SVG 映射**: `<circle cx="..." cy="..." r="..." />`

#### EllipseShape（椭圆）

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `shapeType` | `'ellipse'` | 是 | `<ellipse>` | 椭圆类型标识 |
| `cx` | `number` | 否 | `cx` | 圆心 X 坐标 |
| `cy` | `number` | 否 | `cy` | 圆心 Y 坐标 |
| `rx` | `number` | 否 | `rx` | X半径 |
| `ry` | `number` | 否 | `ry` | Y半径 |

**SVG 映射**: `<ellipse cx="..." cy="..." rx="..." ry="..." />`

#### PathShape（路径）

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `shapeType` | `'path'` | 是 | `<path>` | 路径类型标识 |
| `d` | `string` | 是 | `d` | SVG路径数据 |
| `fillRule` | `'nonzero' \| 'evenodd'` | 否 | `fill-rule` | 填充规则 |
| `points` | `PathPoint[]` | 否 | - | 结构化路径点（用于 CUSTOM_GEOMETRY） |

**SVG 映射**: `<path d="..." fill-rule="..." />`

> **路径命令支持**：
> - `d` 属性支持 **M/L/Z/C/Q/A** 命令子集（moveto/lineto/closepath/curveto/quadratic/arc）
> - **完整支持**：M (moveto)、L (lineto)、Z (closepath)、C (curveto)、Q (quadratic)、A (arc)
> - **平滑命令**：S (smooth cubic)、T (smooth quadratic) 会自动转换为 C/Q
> - **轴对齐命令**：H (horizontal)、V (vertical) 会自动转换为 L

### PathPoint（路径点）

结构化路径点用于 PPTX CUSTOM_GEOMETRY，直接映射到 `<a:moveTo>`、`<a:lnTo>`、`<a:cubicBezTo>`、`<a:quadBezTo>`、`<a:arcTo>`、`<a:close />`。

```typescript
type PathPoint = MoveToPoint | LineToPoint | CurvePoint | ArcPoint | ClosePoint

interface MoveToPoint {
  x: number
  y: number
  type: 'M' | 'm'
  moveTo: true
}

interface LineToPoint {
  x: number
  y: number
  type: 'L' | 'l'
}

interface CurvePoint {
  x: number
  y: number
  type: 'C' | 'c' | 'Q' | 'q'
  curve: CubicCurve | QuadraticCurve
}

interface CubicCurve {
  type: 'cubic'
  x1: number  // control point 1 X
  y1: number  // control point 1 Y
  x2: number  // control point 2 X
  y2: number  // control point 2 Y
}

interface QuadraticCurve {
  type: 'quadratic'
  x1: number  // control point X
  y1: number  // control point Y
}

interface ArcPoint {
  x: number
  y: number
  type: 'A' | 'a'
  curve: ArcCurve
}

interface ArcCurve {
  type: 'arc'
  rX: number   // X radius (wR in PPTX)
  rY: number   // Y radius (hR in PPTX)
  rotation: number  // X-axis rotation in degrees
  largeArc: boolean  // large arc flag
  sweep: boolean    // sweep direction flag
}

interface ClosePoint {
  close: true
  type: 'Z' | 'z'
}
```

**SVG Arc → PPTX arcTo 转换**：

| SVG Arc 参数 | PPTX arcTo 属性 | 说明 |
|-------------|-----------------|------|
| rx | wR | X 半径 |
| ry | hR | Y 半径 |
| xAxisRotation | (通过 rotation) | X 轴旋转角度 |
| largeArcFlag | largeArc | 大弧标志 |
| sweepFlag | sweep | 扫掠方向 |

> **重要**：PPTX 原生支持 `<a:arcTo>` 元素，无需将圆弧转换为贝塞尔曲线！

#### LineShape（线条）

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `shapeType` | `'line'` | 是 | `<line>` | 线条类型标识 |
| `x1` | `number` | 是 | `x1` | 起点 X 坐标 |
| `y1` | `number` | 是 | `y1` | 起点 Y 坐标 |
| `x2` | `number` | 是 | `x2` | 终点 X 坐标 |
| `y2` | `number` | 是 | `y2` | 终点 Y 坐标 |

**SVG 映射**: `<line x1="..." y1="..." x2="..." y2="..." />`

#### PolygonShape（多边形）

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `shapeType` | `'polygon'` | 是 | `<polygon>` | 多边形类型标识 |
| `points` | `string` | 是 | `points` | 点坐标字符串，格式："x1,y1 x2,y2 ..." |

**SVG 映射**: `<polygon points="..." />`

#### PolylineShape（折线）

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `shapeType` | `'polyline'` | 是 | `<polyline>` | 折线类型标识 |
| `points` | `string` | 是 | `points` | 点坐标字符串，格式："x1,y1 x2,y2 ..." |

**SVG 映射**: `<polyline points="..." />`

---

## TextElement

文本元素，用于显示文本内容。

### 属性

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `type` | `'text'` | 是 | - | 元素类型标识 |
| `text` | `string` | 是 | Text content | 文本内容 |
| `fontFamily` | `string` | 是 | `font-family` | 字体名称 |
| `fontSize` | `number` | 是 | `font-size` | 字体大小（像素） |
| `fontWeight` | `FontWeight` | 否 | `font-weight` | 字重：'normal' \| 'bold' \| 'lighter' \| 'bolder' \| number |
| `fontStyle` | `FontStyle` | 否 | `font-style` | 字形：'normal' \| 'italic' \| 'oblique' |
| `fontVariant` | `'normal' \| 'small-caps'` | 否 | `font-variant` | 字形变体 |
| `fill` | `Fill` | 是 | `fill` | 文本颜色 |
| `textAlign` | `TextAlign` | 否 | `text-anchor` (部分) | 水平对齐：'left' \| 'center' \| 'right' \| 'justify' |
| `textAnchor` | `TextAnchor` | 否 | `text-anchor` | 文本在文本框内的水平锚点：'start' \| 'middle' \| 'end' |
| `verticalAlign` | `VerticalAlign` | 否 | `dominant-baseline` | 文本在文本框内的垂直锚点：'top' \| 'middle' \| 'bottom' \| 'baseline' |
| `lineHeight` | `number` | 否 | `line-height` | 行高（像素） |
| `letterSpacing` | `number` | 否 | `letter-spacing` | 字间距（像素） |
| `decoration` | `TextDecorationStyle` | 否 | `text-decoration` | 文本装饰 |
| `indent` | `number` | 否 | `text-indent` | 首行缩进（像素） |
| `marginLeft` | `number` | 否 | - | 左边距（像素） |
| `marginRight` | `number` | 否 | - | 右边距（像素） |
| `textRotation` | `number` | 否 | `transform: rotate()` | 文本旋转角度（度） |

### 类型定义

```typescript
type FontWeight = 'normal' | 'bold' | 'lighter' | 'bolder' | number
type FontStyle = 'normal' | 'italic' | 'oblique'
type TextAlign = 'left' | 'center' | 'right' | 'justify'
type TextAnchor = 'start' | 'middle' | 'end'
type TextDecoration = 'none' | 'underline' | 'line-through' | 'overline'
type VerticalAlign = 'top' | 'middle' | 'bottom' | 'baseline'

interface TextDecorationStyle {
  underline?: boolean
  lineThrough?: boolean
  overline?: boolean
  underlineColor?: string
  lineThroughColor?: string
  overlineColor?: string
}
```

### 文本框语义

SIF 中的文本元素统一使用**文本框语义**：

```typescript
interface TextElement {
  x: number       // 文本框左上角
  y: number       // 文本框左上角
  width: number   // 文本框宽度
  height: number  // 文本框高度
}
```

当 SVG 输入为：

```svg
<text x="100" y="100" text-anchor="middle" dominant-baseline="baseline">
  Hello
</text>
```

SVG 的 `x=100, y=100` 表示文本锚点，不是文本框左上角。转换到 SIF 时必须先估算文本边界框，例如：

```json
{
  "type": "text",
  "x": 76,
  "y": 87,
  "width": 48,
  "height": 19,
  "text": "Hello",
  "textAlign": "center",
  "textAnchor": "middle",
  "verticalAlign": "baseline"
}
```

其中：
- `x`, `y` 已是文本框左上角
- `textAnchor`, `verticalAlign` 保留对齐语义
- 下游渲染器不得再次把 `y` 当作基线坐标处理

---

## RichTextElement

富文本元素，支持多段不同格式的文本。

### 属性

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `type` | `'text'` | 是 | - | 元素类型标识 |
| `text` | `string` | 是 | Text content | 纯文本回退内容 |
| `runs` | `TextRun[]` | 是 | `<tspan>` | 格式化文本片段数组 |
| `fontFamily` | `string` | 是 | `font-family` | 默认字体 |
| `fontSize` | `number` | 是 | `font-size` | 默认字号 |
| `fill` | `Fill` | 是 | `fill` | 默认颜色 |
| `textAlign` | `TextAlign` | 否 | `text-anchor` | 水平对齐 |
| `textAnchor` | `TextAnchor` | 否 | `text-anchor` | 文本框内水平锚点 |
| `verticalAlign` | `VerticalAlign` | 否 | `dominant-baseline` | 文本框内垂直锚点 |
| `lineHeight` | `number` | 否 | `line-height` | 行高（像素） |

### TextRun 详解

```typescript
interface TextRun {
  text: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: FontWeight
  fontStyle?: FontStyle
  fill?: Fill
  decoration?: TextDecorationStyle
}
```

### SVG 映射示例

```svg
<text font-family="Arial" font-size="14" fill="#333">
  <tspan font-weight="bold">Bold text</tspan>
  <tspan fill="red">Colored text</tspan>
  Normal text
</text>
```

---

## LineElement

简单线条元素（独立于 ShapeElement 的线条）。

### 属性

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `type` | `'line'` | 是 | - | 元素类型标识 |
| `x1` | `number` | 是 | `x1` | 起点 X 坐标 |
| `y1` | `number` | 是 | `y1` | 起点 Y 坐标 |
| `x2` | `number` | 是 | `x2` | 终点 X 坐标 |
| `y2` | `number` | 是 | `y2` | 终点 Y 坐标 |
| `stroke` | `Stroke` | 是 | `stroke` | 线条样式 |
| `markerStart` | `string` | 否 | `marker-start` | 起点标记 ID |
| `markerEnd` | `string` | 否 | `marker-end` | 终点标记 ID |

### ArrowMarker

```typescript
type ArrowHeadType = 'arrow' | 'diamond' | 'circle' | 'open' | 'none'

interface ArrowMarker {
  id: string
  type: ArrowHeadType
  width?: number      // in EMUs
  height?: number     // in EMUs
  fill?: boolean      // whether to fill the marker
  color?: string      // marker color (defaults to stroke color)
}
```

### SVG 映射

```svg
<line x1="10" y1="10" x2="100" y2="100" stroke="#000" stroke-width="2" marker-end="url(#arrow)" />
```

---

## ImageElement

图像元素，用于嵌入图片。

### 属性

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `type` | `'image'` | 是 | - | 元素类型标识 |
| `href` | `string` | 是 | `href` / `xlink:href` | 图片源（URL、数据URI或文件路径） |
| `format` | `ImageFormat` | 否 | - | 图片格式：'png' \| 'jpeg' \| 'jpg' \| 'gif' \| 'svg' \| 'webp' \| 'bmp' |
| `preserveAspectRatio` | `boolean` | 否 | `preserveAspectRatio` | 是否保持宽高比，默认 true |
| `crop` | `CropRect` | 否 | `clip-path` | 裁剪区域（百分比 0-1） |
| `flipH` | `boolean` | 否 | `transform: scale(-1,1)` | 水平翻转 |
| `flipV` | `boolean` | 否 | `transform: scale(1,-1)` | 垂直翻转 |
| `filter` | `'none' \| 'grayscale' \| 'sepia' \| 'blur'` | 否 | `filter` | 图片滤镜效果 |

### CropRect

```typescript
interface CropRect {
  left?: number    // 左侧裁剪百分比 (0-1)
  right?: number   // 右侧裁剪百分比 (0-1)
  top?: number     // 顶部裁剪百分比 (0-1)
  bottom?: number  // 底部裁剪百分比 (0-1)
}
```

### ImageSrc

```typescript
interface ImageSrc {
  url?: string           // Remote URL
  dataUri?: string      // Base64 encoded data URI
  path?: string         // Local file path
}
```

> **注意**: `base64` 属性已废弃，请使用 `href` 配合 data URI。

### SVG 映射

```svg
<image href="image.png" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
```

---

## VideoElement

视频元素，用于嵌入视频。

### 属性

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `type` | `'video'` | 是 | - | 元素类型标识 |
| `href` | `string` | 是 | `href` | 视频源（URL或数据URI） |
| `format` | `VideoFormat` | 否 | - | 视频格式：'mp4' \| 'webm' \| 'ogg' \| 'mov' \| 'avi' \| 'mkv' |
| `autoplay` | `boolean` | 否 | `autoplay` | 自动播放 |
| `loop` | `boolean` | 否 | `loop` | 循环播放 |
| `muted` | `boolean` | 否 | `muted` | 静音 |
| `controls` | `boolean` | 否 | `controls` | 显示控制条 |
| `poster` | `string` | 否 | `poster` | 预览图片 |
| `fit` | `VideoFit` | 否 | - | 填充模式：'cover' \| 'contain' \| 'fill' \| 'none' |
| `preserveAspectRatio` | `boolean` | 否 | `preserveAspectRatio` | 保持宽高比，默认 true |
| `startTime` | `number` | 否 | `clipBegin` (SMIL) | 开始时间（秒） |
| `endTime` | `number` | 否 | `clipEnd` (SMIL) | 结束时间（秒） |
| `volume` | `number` | 否 | `volume` | 音量（0-1） |
| `playbackRate` | `number` | 否 | `playbackRate` | 播放速率（如 1.0, 1.5, 2.0） |

### SVG 映射

VideoElement 映射到 HTML5 `<video>` 元素或 SVG `<foreignObject>` 中的视频。

```html
<video
  src="video.mp4"
  width="320"
  height="240"
  autoplay
  loop
  muted
  controls
  poster="poster.jpg"
>
</video>
```

---

## AudioElement

音频元素，用于嵌入音频。

### 属性

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `type` | `'audio'` | 是 | - | 元素类型标识 |
| `href` | `string` | 是 | `href` | 音频源（URL、数据URI或文件路径） |
| `format` | `AudioFormat` | 否 | - | 音频格式：'mp3' \| 'wav' \| 'ogg' \| 'aac' \| 'm4a' \| 'flac' |
| `autoplay` | `boolean` | 否 | `autoplay` | 自动播放 |
| `loop` | `boolean` | 否 | `loop` | 循环播放 |
| `muted` | `boolean` | 否 | `muted` | 静音 |
| `volume` | `number` | 否 | `volume` | 音量（0-1） |
| `playbackMode` | `AudioPlaybackMode` | 否 | - | 播放模式：'auto' \| 'click' \| 'hover' \| 'timed' |
| `startTime` | `number` | 否 | `clipBegin` (SMIL) | 开始时间（秒） |
| `endTime` | `number` | 否 | `clipEnd` (SMIL) | 结束时间（秒） |
| `hideIcon` | `boolean` | 否 | - | 隐藏音频图标（背景音乐用） |
| `iconSize` | `number` | 否 | - | 图标大小（像素），默认 32 |
| `playOnSlideEntry` | `boolean` | 否 | - | 幻灯片显示时播放 |
| `stopOnSlideExit` | `boolean` | 否 | - | 离开幻灯片时停止 |
| `title` | `string` | 否 | `title` | 音频标题（无障碍） |
| `description` | `string` | 否 | `desc` | 音频描述（无障碍） |

### SVG 映射

AudioElement 映射到 HTML5 `<audio>` 元素或 SVG `<foreignObject>` 中的音频。

```html
<audio
  src="audio.mp3"
  autoplay
  loop
  volume="0.5"
  title="Background Music"
>
</audio>
```

---

## GroupElement

组元素，用于**组织和分组**多个子元素。

### 设计原则

> **Group 是纯组合逻辑，不涉及坐标和样式**

> - 无位置属性（x, y, width, height）
> - 无视觉属性（transform, opacity, effect, clipContent 等）
> - 仅用于逻辑分组（批量操作、层级组织）

> 这是与 SVG `<g>` 的根本区别：SVG `<g>` 是视觉容器，SIF Group 是结构容器

### 属性

| 属性 | 类型 | 必需 | SVG对应 | 说明 |
|------|------|------|---------|------|
| `id` | `ElementId` | 是 | `id` | 组唯一标识 |
| `type` | `'group'` | 是 | `<g>` | 元素类型标识 |
| `children` | `Element[]` | 是 | 子元素 | 组内子元素数组 |
| `visible` | `boolean` | 否 | `visibility` | 组是否可见 |
| `zIndex` | `number` | 否 | - | 层级顺序 |
| `hyperlink` | `Hyperlink` | 否 | - | 超链接 |
| `meta` | `ElementMeta` | 否 | - | 元数据 |

### SVG → SIF 转换规则

当 SVG 解析器遇到 `<g transform="...">` 时：

```svg
<!-- SVG 输入 -->
<g transform="translate(50, 50)">
  <rect x="10" y="10" width="30" height="30" fill="red" />
</g>
```

**转换规则**：
1. 将 `transform` 合并到子元素的坐标中
2. Group 本身不携带任何视觉属性

```json
<!-- SIF 输出 -->
{
  "type": "group",
  "id": "g1",
  "children": [
    {
      "type": "shape",
      "shapeType": "rect",
      "x": 60,   // 10 + 50 = 60，已合并 transform
      "y": 60,   // 10 + 50 = 60，已合并 transform
      "width": 30,
      "height": 30,
      "fill": { "type": "solid", "color": "red" }
    }
  ]
}
```

### 嵌套 Group

Group 可以嵌套，但每层都不携带坐标/样式：

```json
{
  "type": "group",
  "id": "outer",
  "children": [
    { "type": "shape", "x": 10, "y": 10, ... },
    {
      "type": "group",
      "id": "inner",
      "children": [
        { "type": "shape", "x": 20, "y": 20, ... }  // 坐标已是绝对值
      ]
    }
  ]
}
```

---

## SlideDocument

文档根类型，包含所有幻灯片。

### SlideBackground

```typescript
interface SlideBackground {
  fill: Fill
  image?: {
    href: string
    fit?: 'cover' | 'contain' | 'fill' | 'tile'
    position?: { x: number; y: number }
  }
}
```

### SlideTransition

```typescript
interface SlideTransition {
  type: 'none' | 'fade' | 'push' | 'wipe' | 'split' | 'zoom' | 'reveal'
  direction?: 'left' | 'right' | 'up' | 'down'
  duration?: number   // milliseconds
}
```

### Slide

```typescript
interface Slide {
  id: string
  elements: Element[]
  background?: SlideBackground
  transition?: SlideTransition
  name?: string
  notes?: string
  metadata?: Record<string, unknown>
}
```

### DocumentMeta

```typescript
interface DocumentMeta {
  title?: string
  author?: string
  subject?: string
  keywords?: string[]
  created?: string
  modified?: string
  description?: string
}
```

### SlideDocument

```typescript
interface SlideDocument {
  version: string
  width: number      // 文档宽度（像素，假设 96 DPI）
  height: number     // 文档高度（像素）
  slides: Slide[]
  meta?: DocumentMeta
  master?: {
    id: string
    background?: SlideBackground
    elements: Element[]
  }
  colorScheme?: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
}
```

---

## SVG 属性对照表

### 通用属性

| SIF 属性 | SVG 属性 | 说明 |
|----------|----------|------|
| `id` | `id` | 元素标识 |
| `x` | `x` | X坐标 |
| `y` | `y` | Y坐标 |
| `width` | `width` | 宽度 |
| `height` | `height` | 高度 |
| `transform` | `transform` | 变换 |
| `opacity` | `opacity` | 透明度 |
| `visible` | `visibility` | 可见性 |
| `effect` | `filter` | 滤镜效果 |

### 样式属性

| SIF 属性 | SVG 属性 | 说明 |
|----------|----------|------|
| `fill` | `fill` | 填充 |
| `stroke` | `stroke` | 描边 |
| `fill.type='none'` | `fill="none"` | 无填充 |
| `stroke.lineCap` | `stroke-linecap` | 线帽 |
| `stroke.lineJoin` | `stroke-linejoin` | 线接 |
| `stroke.dashArray` | `stroke-dasharray` | 虚线 |
| `stroke.dashOffset` | `stroke-dashoffset` | 虚线偏移 |

### 文本属性

| SIF 属性 | SVG 属性 | 说明 |
|----------|----------|------|
| `fontFamily` | `font-family` | 字体 |
| `fontSize` | `font-size` | 字号 |
| `fontWeight` | `font-weight` | 字重 |
| `fontStyle` | `font-style` | 字形 |
| `textAlign` | `text-anchor` | 文本锚点 |
| `textRotation` | `transform: rotate()` | 旋转 |
| `decoration.underline` | `text-decoration: underline` | 下划线 |
| `decoration.lineThrough` | `text-decoration: line-through` | 删除线 |

### 媒体属性

| SIF 属性 | SVG/HTML 属性 | 说明 |
|----------|---------------|------|
| `href` | `href` / `xlink:href` | 资源链接 |
| `autoplay` | `autoplay` | 自动播放 |
| `loop` | `loop` | 循环 |
| `muted` | `muted` | 静音 |
| `controls` | `controls` | 控制条 |
| `poster` | `poster` | 预览图 |
| `volume` | `volume` | 音量 |
| `startTime` | `clipBegin` (SMIL) | 开始时间 |
| `endTime` | `clipEnd` (SMIL) | 结束时间 |

---

## SVG 元素 → SIF 类型映射表

### 元素映射

| SVG 元素 | SIF 类型 | 说明 |
|----------|----------|------|
| `<rect>` | `ShapeElement` + `shapeType: 'rect'` | 矩形 |
| `<circle>` | `ShapeElement` + `shapeType: 'circle'` | 圆形 |
| `<ellipse>` | `ShapeElement` + `shapeType: 'ellipse'` | 椭圆 |
| `<path>` | `ShapeElement` + `shapeType: 'path'` | 路径 |
| `<line>` | `ShapeElement` + `shapeType: 'line'` 或 `LineElement` | 线条 |
| `<polygon>` | `ShapeElement` + `shapeType: 'polygon'` | 多边形 |
| `<polyline>` | `ShapeElement` + `shapeType: 'polyline'` | 折线 |
| `<text>` | `TextElement` 或 `RichTextElement` | 文本 |
| `<tspan>` | `TextRun[]` | 富文本片段 |
| `<image>` | `ImageElement` | 图像 |
| `<video>` | `VideoElement` | 视频 |
| `<audio>` | `AudioElement` | 音频 |
| `<g>` | `GroupElement` | 组（需转换坐标） |
| `<foreignObject>` | 对应元素类型 | 嵌入式外部内容 |
| `<defs>` | 资源定义 | 渐变、滤镜等（内联到 SIF） |
| `<marker>` | `ArrowMarker` | 箭头标记 |

### 完整 SVG → SIF 转换示例

#### 矩形

```svg
<rect x="10" y="10" width="100" height="50" rx="5" ry="5" fill="#FF0000" stroke="#000" stroke-width="2" />
```

```json
{
  "type": "shape",
  "shapeType": "rect",
  "x": 10,
  "y": 10,
  "width": 100,
  "height": 50,
  "rx": 5,
  "ry": 5,
  "fill": { "type": "solid", "color": "#FF0000" },
  "stroke": { "color": "#000", "width": 2 }
}
```

#### 圆形

```svg
<circle cx="50" cy="50" r="30" fill="#00FF00" />
```

```json
{
  "type": "shape",
  "shapeType": "circle",
  "x": 20,
  "y": 20,
  "width": 60,
  "height": 60,
  "cx": 50,
  "cy": 50,
  "r": 30,
  "fill": { "type": "solid", "color": "#00FF00" }
}
```

> **坐标计算**：当 SVG 只有 `cx/cy/r` 时，SIF 转换需计算边界框：
> - `x = cx - r`, `y = cy - r`, `width = 2*r`, `height = 2*r`

#### 路径

```svg
<path d="M 10 10 L 50 50 Q 80 20 100 50 Z" fill="#0000FF" />
```

```json
{
  "type": "shape",
  "shapeType": "path",
  "x": 10,
  "y": 10,
  "width": 90,
  "height": 40,
  "d": "M 10 10 L 50 50 Q 80 20 100 50 Z",
  "fill": { "type": "solid", "color": "#0000FF" }
}
```

#### 线条

```svg
<line x1="10" y1="10" x2="100" y2="100" stroke="#000" stroke-width="2" marker-end="url(#arrow)" />
```

```json
{
  "type": "line",
  "x": 10,
  "y": 10,
  "width": 90,
  "height": 90,
  "x1": 10,
  "y1": 10,
  "x2": 100,
  "y2": 100,
  "stroke": { "color": "#000", "width": 2 },
  "markerEnd": "arrow"
}
```

#### 文本

```svg
<text x="100" y="100" font-family="Arial" font-size="16" fill="#333" text-anchor="middle">Hello</text>
```

```json
{
  "type": "text",
  "x": 88,
  "y": 88,
  "width": 24,
  "height": 19,
  "text": "Hello",
  "fontFamily": "Arial",
  "fontSize": 16,
  "fill": { "type": "solid", "color": "#333" },
  "textAnchor": "middle",
  "verticalAlign": "baseline"
}
```

> **转换说明**：SVG 的 `x/y` 是文本锚点，SIF 需要估算文本框边界并转换为左上角坐标。

#### 图像

```svg
<image href="image.png" width="100" height="100" preserveAspectRatio="xMidYMid meet" />
```

```json
{
  "type": "image",
  "x": 0,
  "y": 0,
  "width": 100,
  "height": 100,
  "href": "image.png",
  "preserveAspectRatio": true
}
```

#### 组（SVG → SIF 转换规则）

```svg
<g transform="translate(50, 50)">
  <rect x="10" y="10" width="30" height="30" fill="red" />
</g>
```

```json
{
  "type": "group",
  "id": "g1",
  "children": [
    {
      "type": "shape",
      "shapeType": "rect",
      "x": 60,
      "y": 60,
      "width": 30,
      "height": 30,
      "fill": { "type": "solid", "color": "red" }
    }
  ]
}
```

> **转换规则**：将 `transform` 合并到子元素坐标，Group 本身不携带 transform。

### SVG 渐变 → SIF 映射

#### 线性渐变

```svg
<linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
  <stop offset="0%" stop-color="#FF0000" />
  <stop offset="100%" stop-color="#0000FF" />
</linearGradient>
```

```json
{
  "type": "linear",
  "stops": [
    { "offset": 0, "color": "#FF0000" },
    { "offset": 1, "color": "#0000FF" }
  ],
  "x1": 0,
  "y1": 0,
  "x2": 1,
  "y2": 0
}
```

#### 径向渐变

```svg
<radialGradient id="grad2" cx="50%" cy="50%" r="50%">
  <stop offset="0%" stop-color="#FFFFFF" stop-opacity="1" />
  <stop offset="100%" stop-color="#000000" stop-opacity="0" />
</radialGradient>
```

```json
{
  "type": "radial",
  "stops": [
    { "offset": 0, "color": "#FFFFFF", "opacity": 1 },
    { "offset": 1, "color": "#000000", "opacity": 0 }
  ],
  "x1": 0.5,
  "y1": 0.5,
  "r2": 0.5
}
```

### SVG 滤镜 → SIF VisualEffect 映射

| SVG 滤镜 | SIF VisualEffect | 说明 |
|----------|------------------|------|
| `filter: drop-shadow(2px 2px 2px #000)` | `ShadowEffect` | 自定义阴影 |
| `filter: blur(5px)` | `BlurEffect` | 高斯模糊 |
| `filter: drop-shadow(0 0 5px #00FF00)` | `GlowEffect` | 发光效果 |
| 预设阴影 | `DropShadowEffect` / `OuterGlowEffect` | PPTX 预设阴影 |

```svg
<!-- SVG 阴影滤镜 -->
<rect filter="drop-shadow(3px 3px 5px rgba(0,0,0,0.5))" />
```

```json
{
  "effect": {
    "type": "shadow",
    "color": "#000000",
    "offsetX": 3,
    "offsetY": 3,
    "blur": 5,
    "opacity": 0.5
  }
}
```

### SVG transform → SIF Transform 映射

| SVG transform | SIF Transform |
|--------------|--------------|
| `translate(tx, ty)` | `translateX: tx, translateY: ty` |
| `scale(sx, sy)` | `scaleX: sx, scaleY: sy` |
| `rotate(angle)` | `rotate: angle` |
| `rotate(angle, cx, cy)` | `rotate: angle` + 需手动计算偏移 |
| `matrix(a,b,c,d,e,f)` | `matrix: [a,b,c,d,e,f]` |
| `skewX(angle)` | 不支持（需手动转换为 matrix） |
| `skewY(angle)` | 不支持（需手动转换为 matrix） |

### 坐标系统转换

| SVG 概念 | SIF 处理方式 |
|----------|-------------|
| `viewBox` | 存储在 SlideDocument 级别 |
| `cx/cy`（圆心） | 计算为边界框 x/y + width/height |
| 文本锚点 (`text-anchor`) | 转换为文本框对齐 + `textAnchor` |
| 基线 (`dominant-baseline`) | 转换为 `verticalAlign` |
| 百分比单位 (`%`) | 转换为绝对像素值（相对于父元素或画布）|
