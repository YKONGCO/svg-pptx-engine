# SIF -> 本地 `packages/pptxgenjs` 转换设计稿

本文档用于评审 `doc/sif.md` 到当前仓库内 `packages/pptxgenjs` 的转换逻辑设计。  
重点不是“理论上能不能转”，而是“基于你当前 fork 的 `pptxgenjs`，应该如何落地”。

## 1. 结论先行

基于当前本地 `packages/pptxgenjs`，SIF 到 PPTX 的实现策略建议如下：

- `rect/circle/ellipse/line/text/image/video/audio` 继续走现有原生 API。
- `group` 直接使用你新增的 `slide.addGroup()` / `group.add*()`，但要把 SIF 的嵌套 group 扁平化后再喂给同一个 pptx group。
- `path/polygon/polyline` 不应再降级成 `rect/pentagon`，应优先走你新增/开放的 `custGeom`。
- `fill.gradient.type === 'linear'` 直接映射到 `pptxgenjs` 的 `fill.type = 'linearGradient'`。
- `fill.gradient.type === 'radial'` 当前库里没有对应能力，必须定义降级策略。
- SIF 的 `points: PathPoint[]` 是最关键的数据资产，凡是能拿到结构化路径，优先用它，不要回退到字符串级别处理。

## 2. 我确认过的本地能力

### 2.1 Group

本地 `packages/pptxgenjs` 已支持：

- `slide.addGroup()`
- `group.addShape()`
- `group.addText()`
- `group.addImage()`
- `group.addMedia()`
- `group.addTable()`
- `group.addChart()`

且 group 在导出 XML 时：

- 先计算包围盒
- 再把子元素坐标转为相对 group 左上角
- 再复用普通 slide 元素的完整序列化逻辑

这意味着 SIF 的 `GroupElement` 可以稳定落到 PPTX group，不需要自己拼 XML。

但当前 `pptxgenjs` group 仍然没有“组中再嵌套组”的公开能力，所以：

- SIF 多层 group 结构应在转换层拍平
- 拍平后子元素继续保留画布绝对坐标
- 最后统一塞进一个 pptx group，让 `pptxgenjs` 自己算包围盒

### 2.2 线性渐变

本地 `packages/pptxgenjs` 已支持 `fill.type = 'linearGradient'`，核心字段为：

- `stops: { position: 0-100, color, transparency? }[]`
- `angle?: number`
- `scaled?: boolean`
- `rotWithShape?: boolean`
- `tileRect?`
- `flip?`

因此 SIF 的 `LinearGradient` 可以直接映射，不需要自己输出 OOXML。

### 2.3 自定义几何 `custGeom`

本地 `packages/pptxgenjs` 已支持 shape = `custGeom`，并支持 `options.points`：

- `moveTo`
- `lnTo`
- `cubic`
- `quadratic`
- `arc`
- `close`

对应到 XML 就是：

- `<a:moveTo>`
- `<a:lnTo>`
- `<a:cubicBezTo>`
- `<a:quadBezTo>`
- `<a:arcTo>`
- `<a:close />`

这意味着：

- `path`
- `polygon`
- `polyline`
- 以及带弧线/贝塞尔的复杂图形

都应该优先转成 `custGeom`，而不是用预设形状硬凑。

## 3. 总体转换原则

### 3.1 单位

SIF 统一用 `px`，`pptxgenjs` 位置尺寸用 `inch`，线宽/字号多用 `pt`。

建议统一规则：

- `x/y/width/height` -> `px / 96`
- `fontSize` -> `px * 72 / 96`
- `stroke.width` -> `px * 72 / 96`

### 3.2 透明度

SIF 用 `opacity: 0-1`，`pptxgenjs` 用 `transparency: 0-100`。

统一公式：

`transparency = (1 - opacity) * 100`

若颜色本身带 alpha，再与元素级透明度做合成，而不是互相覆盖。

### 3.3 坐标语义

SIF 的普通元素坐标是画布绝对坐标。  
SIF 的 group 也是结构容器，不自带视觉坐标。

因此：

- 普通元素直接按绝对坐标转换
- group 内子元素继续使用绝对坐标
- 嵌套 group 在转换层拍平
- 最终由 `pptxgenjs` group 序列化时完成相对化

### 3.4 转换优先级

对于形状类元素建议统一优先级：

1. 能保持几何语义时，优先输出 `custGeom`
2. 只有在几何和视觉都可等价表达时，才用预设 shape
3. 不能等价表达时，做明确降级，不做“看起来差不多”的隐式替换

## 4. 元素映射设计

## 4.1 ShapeElement

### `rect`

映射：

- 无圆角：`shapeName = 'rect'`
- 有 `rx/ry`：`shapeName = 'roundRect'`，并设置 `rectRadius`

说明：

- `rectRadius` 建议按较小半径归一化后写入
- 若 `rx != ry`，PPTX 的圆角能力不能完全等价，只能取较保守值

### `circle`

映射：

- `shapeName = 'ellipse'`
- 使用边界框 `x/y/width/height`

说明：

- 只要 `width === height`，PowerPoint 会显示为圆

### `ellipse`

映射：

- `shapeName = 'ellipse'`

### `line`（ShapeElement 里的 line）

映射：

- `shapeName = 'line'`
- 用 `x1/y1/x2/y2` 计算包围盒
- `stroke` -> `line`

### `path`

建议：

- 如果有 `points`，统一映射为 `shapeName = 'custGeom'`
- 如果只有 `d`，优先尝试解析 `d -> points`
- 只有在解析失败时，才进入降级分支

理由：

- 当前本地 `pptxgenjs` 已经能承接曲线、二次贝塞尔、圆弧
- 再把 path 降级成 rect，已经不符合当前 fork 的能力边界

`points` 映射规则：

- `MoveToPoint` -> `{ x, y, moveTo: true }`
- `LineToPoint` -> `{ x, y }`
- `CurvePoint.cubic` -> `{ x, y, curve: { type: 'cubic', x1, y1, x2, y2 } }`
- `CurvePoint.quadratic` -> `{ x, y, curve: { type: 'quadratic', x1, y1 } }`
- `ArcPoint` -> 先转为 pptx 需要的 `{ hR, wR, stAng, swAng }`
- `ClosePoint` -> `{ close: true }`

### `polygon`

建议：

- 不再映射到 `pentagon`
- 统一转 `custGeom`

规则：

- `points: "x1,y1 x2,y2 ..."` 先解析为点序列
- 第一段写 `moveTo`
- 后续写 `lnTo`
- 末尾补 `close`

### `polyline`

建议：

- 统一转 `custGeom`

规则：

- 与 polygon 一样解析点
- 区别只是不补 `close`

## 4.2 TextElement / RichTextElement

映射目标：

- `slide.addText(...)`
- 或 `group.addText(...)`

基础字段映射：

- `fontFamily` -> `fontFace`
- `fontSize(px)` -> `fontSize(pt)`
- `fontWeight` -> `bold`
- `fontStyle` -> `italic`
- `textAlign` / `textAnchor` -> `align`
- `verticalAlign` -> `valign`
- `x/y/width/height` -> `x/y/w/h`

补充规则：

- `marginLeft/marginRight` -> `margin`
- `lineHeight` -> `lineSpacingMultiple`
- `letterSpacing` -> `charSpacing`
- `textRotation = 90/270` 时优先用 `vert/vert270`
- 其他角度用 `rotate`

富文本：

- SIF `runs[]` 直接映射到 `pptxgenjs` 的富文本数组
- run 级别缺省样式从父文本继承

限制：

- 文本填充目前仍建议只支持纯色
- 即使 `pptxgenjs` 文档中提到文本渐变，现阶段本项目可以先不承诺
- 若 SIF 文本 fill 为 gradient，建议评审阶段先定义为“取首个 stop 颜色”或“后续专项支持”

## 4.3 LineElement

映射：

- `slide.addShape('line', options)` 或 `group.addShape('line', options)`

规则：

- 用 `x1/y1/x2/y2` 算包围盒
- `stroke.color/width/dashArray` -> `line.color/width/dashType`
- `markerStart/markerEnd` -> `beginArrowType/endArrowType`

限制：

- `lineCap` 当前库层面未见直接映射
- `lineJoin` 当前库层面未见直接映射
- `gradient stroke` 当前建议降级为首个 stop 的纯色描边

## 4.4 ImageElement

映射：

- `addImage({ path | data, x, y, w, h, ... })`

规则：

- `href` 为 data URI -> `data`
- `href` 为 URL / 本地路径 -> `path`
- `preserveAspectRatio` + `crop` -> `sizing`
- `flipH/flipV/rotate` 直接映射

限制：

- SIF `filter` 目前不建议承诺完整支持

## 4.5 VideoElement / AudioElement

映射：

- `addMedia(...)`

建议：

- 只先支持最核心的 `href/path/data/type`
- 其他播放控制语义在 PowerPoint 下不完全等价，先标为尽力映射

## 4.6 GroupElement

SIF 设计里 group 是纯结构容器，这与本地 `pptxgenjs` 的 group 能力是兼容的。

建议实现：

1. `slide.addGroup()`
2. 递归拍平 SIF group
3. 非 group 子元素按“全局绝对坐标”直接 `group.add*()`

关键点：

- 不要提前把坐标手动改成相对 group
- 因为当前 `pptxgenjs` group API 录入时仍是“幻灯片坐标”
- 序列化阶段库内部会再统一归一化

## 5. Fill / Stroke / Effect 映射

## 5.1 Fill

### `solid`

直接映射：

- `color`
- `opacity` -> `transparency`

### `none`

直接映射：

- `{ type: 'none' }`

### `gradient.linear`

直接映射：

```ts
fill: {
  type: 'linearGradient',
  angle,
  stops: [
    { position: 0..100, color, transparency? }
  ]
}
```

规则：

- `offset: 0-1` -> `position: 0-100`
- stop 的 `opacity` -> stop `transparency`
- `GradientFill.opacity` 若存在，需要与 stop alpha 再做一次合成

### `gradient.radial`

当前建议定义为“不原生支持”。

降级策略候选：

1. 退化为首个或末个 stop 的纯色
2. 退化为近似线性渐变
3. 明确报 warning，并输出纯色

建议采用：

- 第一版统一退化为纯色
- 默认取视觉更接近外观的“最后一个 stop”
- 并记录 warning

原因：

- 当前本地 `pptxgenjs` 没有径向渐变 fill 接口
- 硬近似成线性渐变，结果通常比纯色更不稳定

## 5.2 Stroke

建议映射：

- `color`
- `width`
- `opacity`
- `dashArray` -> `dashType`
- `markerStart/markerEnd` -> 箭头

降级：

- `stroke.type = gradient` -> 首 stop 纯色
- `lineCap/lineJoin` -> 当前忽略

## 5.3 Effect

当前较适合先支持：

- `ShadowEffect`
- `DropShadowEffect`

建议先不承诺：

- `BlurEffect`
- `GlowEffect`
- `OuterGlowEffect`

原因：

- `pptxgenjs` 目前可稳定映射的是 shadow
- 其他视觉效果在库层无明确等价接口，贸然支持会制造假语义

## 6. 自定义几何的具体策略

这是这次设计里最重要的一段。

### 6.1 何时使用 `custGeom`

建议条件：

- `shapeType === 'path'`
- `shapeType === 'polygon'`
- `shapeType === 'polyline'`
- 或未来遇到无法被预设 shape 等价表达的图形

### 6.2 坐标空间

`custGeom` 的 `points` 坐标应使用元素自身边界框内的局部坐标，而不是整张画布绝对坐标。

也就是说：

- 元素 `options.x/y/w/h` 定义 shape 的外部包围盒
- `options.points` 里的点应落在该 shape 的局部坐标系内

建议统一规则：

- 若 SIF `points` 已经是局部坐标，直接使用
- 若 SIF `points` 是绝对坐标，先减去元素 `x/y`

这一点需要结合你当前 SIF 产物实际数据再确认。  
如果不确认这一点，`custGeom` 很容易“位置对、形状错”。

### 6.3 Path 的推荐处理

建议：

- 一旦 `PathShape.points` 存在，优先使用 `points`
- `d` 仅作为补救输入，不作为主路径

原因：

- `d` 是字符串语法
- `points` 是已经结构化并且和 PPTX `custGeom` 更接近的语义层

### 6.4 SVG Arc -> PPTX arcTo

你当前仓库已经有一版弧线转换工具，但这部分属于高风险几何算法。

评审建议：

- 第一版先支持 `arcTo`
- 但把“弧线角度与方向是否和 SVG 完全一致”列为专项验证项

原因：

- SVG arc 是端点参数化
- PPTX arcTo 是中心参数化
- 两者转换不是简单字段重命名

## 7. 建议修改的项目文件

如果按这份设计落实现有代码，优先改这些文件：

- `src/pptx/converters/shape.ts`
- `src/pptx/converters/group.ts`
- `src/pptx/converters/text.ts`
- `src/pptx/utils/path-to-pptx.ts`
- `src/pptx/utils.ts`
- `src/pptx/generator.ts`

### 7.1 `src/pptx/converters/shape.ts`

应修改点：

- 取消 `path -> rect`
- 取消 `polygon/polyline -> pentagon`
- `path/polygon/polyline` 优先走 `custGeom`
- 线性渐变按本地 `linearGradient` 原生输出
- 径向渐变明确降级

### 7.2 `src/pptx/converters/group.ts`

应保留并强化：

- 递归拍平嵌套 group
- 不改动子元素绝对坐标

### 7.3 `src/pptx/converters/text.ts`

应明确：

- 文本 fill 第一版只承诺纯色
- gradient text 先定义降级策略

### 7.4 `src/pptx/utils/path-to-pptx.ts`

应强化：

- polygon/polyline 的点串转 `custGeom` points
- arc 转换的测试样例
- 绝对坐标/局部坐标归一化策略

## 8. 建议的降级矩阵

| SIF 能力 | 本地 pptxgenjs 能力 | 处理建议 |
|---|---|---|
| `group` | 支持 | 原生映射 |
| `linear gradient fill` | 支持 | 原生映射 |
| `radial gradient fill` | 不支持 | 降级纯色并告警 |
| `path points -> custGeom` | 支持 | 原生映射 |
| `polygon/polyline` | 通过 `custGeom` 支持 | 原生映射 |
| `gradient stroke` | 不完整 | 降级首 stop 纯色 |
| `lineCap/lineJoin` | 不完整 | 暂忽略 |
| `blur/glow` | 不完整 | 暂不支持 |
| `text gradient` | 暂不承诺 | 降级首 stop 或纯色 |

## 9. 必须补的验证用例

建议在实现前后补这些用例：

- `path` 仅直线段
- `path` 包含 cubic
- `path` 包含 quadratic
- `path` 包含 arc
- `polygon`
- `polyline`
- group 内含 `custGeom`
- group 内含渐变形状
- group 内含文本、图片、媒体混排
- SIF 嵌套 group 拍平后位置是否正确
- `linearGradient` 角度 0 / 90 / 180 / 270 的实际显示方向

## 10. 评审期建议先定的两件事

### A. `custGeom.points` 使用局部坐标还是绝对坐标

这是第一优先级。  
如果这个前提没定，后续所有 path/polygon/polyline 都可能错。

### B. 线性渐变角度语义是否需要归一化

当前本地 `pptxgenjs` 是把 `angle` 直接写入 OOXML。  
但 `doc/sif.md` 中的角度描述，与 demo 里的文案未必是同一套方向语义。

所以建议：

- 第一版先做“数值直传”
- 用 0/90/180/270 的截图或生成样例做一次视觉确认
- 若发现方向不一致，再补一个 `normalizeLinearGradientAngle()` 辅助函数

## 11. 最终建议

这次实现不应该再按“旧版 pptxgenjs 能力”设计。  
基于你当前 fork，真正值得升级的有三件事：

1. 把 `group` 作为一等输出能力使用起来
2. 把 `linearGradient` 从降级逻辑提升为原生逻辑
3. 把 `path/polygon/polyline` 全部收口到 `custGeom`

如果你认可这份设计，下一步我建议直接按这份文档去改 converter，并同时补一组最小可验证样例。
