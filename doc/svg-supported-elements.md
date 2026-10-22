# svg-pptx-engine — SVG 元素 / 属性支持矩阵

本文档整理当前代码（`src/svg/converter.ts` + `src/svg/converters/*`）已经走通转换管线的 SVG 元素、属性、效果和资源。文档目标：

- 让使用者能**快速判断**某个 SVG 写法是否能被本引擎正确转成 PPTX；
- 用 `file:line` 指针定位关键实现，方便维护和后续扩展。

> 状态图例
> - ✅ **已支持**：转换器、PPTX 输出都到位，视觉正确。
> - ⚠️ **部分支持 / 降级**：能转，但 PPTX 端做了近似，存在已知视觉差异。
> - ⏸ **Defer / 不支持**：解析为 defs / 占位，或直接忽略并 console.warn；后续路径见各小节。
> - 🧪 **实验性**：feature flag 仍在调整，未列入正式发布。

---

## 目录

- [1. 总览：转换入口与派发](#1-总览转换入口与派发)
- [2. 解析器与根 `<svg>`](#2-解析器与根-svg)
- [3. 基础图形元素](#3-基础图形元素)
- [4. `<path>` 命令集](#4-path-命令集)
- [5. 填充（fill / stroke）](#5-填充fill--stroke)
- [6. 渐变（`<linearGradient>` / `<radialGradient>`）](#6-渐变linearradialgradient)
- [7. 图案（`<pattern>`）](#7-图案pattern)
- [8. 滤镜（`<filter>` 及原语）](#8-滤镜filter-及原语)
- [9. 裁剪与遮罩（`<clipPath>` / `<mask>`）](#9-裁剪与遮罩clippath--mask)
- [10. 文本与富文本](#10-文本与富文本)
- [11. 变换、组、引用与嵌套](#11-变换组引用与嵌套)
- [12. 媒体（`<image>` / `<video>` / `<audio>`）](#12-媒体image--video--audio)
- [13. 动画（SMIL 快照）](#13-动画smil-快照)
- [14. 公式（LaTeX / MathML → OMML）](#14-公式latex--mathml--omml)
- [15. 布局容器（实验性）](#15-布局容器实验性)
- [16. 显式 defer / 负向 case](#16-显式-defer--负向-case)
- [17. 覆盖率总矩阵](#17-覆盖率总矩阵)
- [18. 相关文件索引](#18-相关文件索引)

---

## 1. 总览：转换入口与派发

**入口函数**（`src/svg/converter.ts`）：

| 函数 | 说明 |
| --- | --- |
| `svgToSif(svgString, options?)` | SVG 字符串 → `Element[]`（不返回 defs）。 |
| `svgToSifWithDefs(svgString, options?)` | 同时返回 `defs.{patterns,clipPaths,masks}`，供 PPTX 层消费。 |
| `svgToSlideDocument(...)` / `svgToPptx(...)` / `svgToPptxFile(...)` | 一站式走完 SIF + PPTX，封装在 `src/index.ts`。 |

**`SvgToSifOptions`（`converter.ts:41-58`）**：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `preserveGroups` | `true` | `false` 时把 `<g>` 直接摊平为子元素。 |
| `includeDefs` | `true` | 是否在 SIF 中暴露 defs 资源。 |
| `defaultFontFamily` | `DEFAULT_FONT_BRIDGE.web` | 全局默认字体（CJK-first 链）。 |
| `baseDir` | `''` | 媒体相对路径的解析基准目录。 |
| `useLayout` | `'auto'` | `'off'` 时跳过 layout pass（v1.0 行为）。 |

**主派发**（`converter.ts:272-343`）：`convertElement()` 按 `tagName` 走 switch，覆盖 18 个 case（详见各小节）。所有形状 / 文本 / 媒体元素在派发后都会经过：

1. `applyContextToNode`（`converter.ts:929-946`）—— 注入继承的 presentation 属性、内联 `style`、`defaultFontFamily`；
2. `createChildContext`（`converter.ts:912-927`）—— 累积 transform matrix、累积 opacity、传播 `filter` 引用与 `visibility`；
3. 元素级 `convert*()`；
4. `applyAnimationSnapshot`（仅对 ShapeElement / TextElement / LineElement，见 §13）；
5. `applyElementContext`（`converter.ts:760-812`）—— 落地 `opacity` / `visibility` / `clipPathId` / `maskId` / `patternFillId` / `z-index`；
6. `applyEffect`（`converter.ts:1113+`）—— 把当前 `filter` 引用解析为 `VisualEffect`。

---

## 2. 解析器与根 `<svg>`

实现：`src/svg/parser.ts`、`src/svg/converter.ts:1039-1085`。

| 维度 | 支持情况 |
| --- | --- |
| XML 解析 | `fast-xml-parser`（`preserveOrder:true` + 无序两遍）—— 同一份 SVG 解析两次，第二次拿到有序子节点（`getOrderedChildren`），第一次拿到属性 map。 |
| 根 `<svg>` | ✅ 必填；`width` / `height` / `viewBox` 全部读出，用于推断幻灯片画布尺寸（`src/index.ts:48-68`）。 |
| `viewBox` | ✅ 数值化（`parseViewBox`）后参与 `getNestedSvgViewportMatrix` 缩放。 |
| `<defs>` | ✅ 扁平化为 `Map<id, attrs+children>`，`getDefs`（`parser.ts:46-89`）同时支持数组/对象形态。 |
| `<style>` / `<link>` | ⏸ 不会内联 CSS；只信任属性 / 内联 `style=`。 |
| 命名空间 | `xlink:href` / `href` 都识别（`getUseHref` 三个分支）。 |
| 注释 / CDATA | 解析保留（`getOrderedMixedChildren` 走 `#text` / `#cdata-section` 哨兵）。 |

**属性继承**：`PRESENTATION_ATTRS`（`converter.ts:82-101`）列出了 18 个会在子节点自动继承的 presentation 属性，依次覆盖 `fill` / `fill-opacity` / `stroke` / `stroke-width` / `stroke-*` / `font-*` / `text-anchor` / `dominant-baseline` / `line-height` / `letter-spacing` / `visibility`。

---

## 3. 基础图形元素

实现：`src/svg/converters/shape.ts` + 派发 `src/svg/converter.ts:278-296`。

| 元素 | 支持 | 关键属性 | 备注 |
| --- | --- | --- | --- |
| `<rect>` | ✅ | `x` / `y` / `width` / `height` / `rx` / `ry`（任一存在即互为默认） | `convertRect`（`shape.ts:169-193`）。`rx==ry` 与 `rx>0 ry==0` 都能正确处理。 |
| `<circle>` | ✅ | `cx` / `cy` / `r` | 变换后的 `cx/cy` 与半径距离用 `applyMatrixToPoint` 重新计算（`shape.ts:195-231`）。 |
| `<ellipse>` | ✅ | `cx` / `cy` / `rx` / `ry` | 同 circle，独立保留 `rx/ry`（非均匀变换时进入 SIF 已是变换后的等效椭圆）。 |
| `<line>` | ✅ | `x1` / `y1` / `x2` / `y2` + `marker-start` / `marker-end` / `marker-mid` | 有 marker 时走 `convertMarkedLine`（`shape.ts:38-90`），输出是结构化的 `LineElement`（带 `markerStart/End/Mid`）。无 marker 时走 `convertLine`，填 `{ type:'none' }`，描边黑色 1px 兜底。 |
| `<polygon>` | ✅ | `points` | `convertPolygon`（`shape.ts:326-344`），`fill` 默认非 none。 |
| `<polyline>` | ✅ | `points` + 三个 marker 属性 | 有 marker 时走 `convertMarkedPolyline`（`shape.ts:99-156`），把首末点提为 `LineElement` 端点；`marker-mid` 仍按 vertex 渲染。 |
| `<path>` | ✅ | `d` + `fill-rule` | `fill-rule` 走 `nonzero` / `evenodd`；变换后路径数据被改写为绝对坐标（`transformPathData`，`shape.ts:728-887`）。 |

**通用 presentation 属性**（所有形状继承）：

| 属性 | 支持 | 实现位置 |
| --- | --- | --- |
| `fill`（含 `none` / `url(#id)` 渐变 / 颜色） | ✅ | `extractFill`（`shape.ts:366-400`） |
| `fill-opacity` | ✅ | 同上 |
| `stroke`（含渐变） | ✅ | `extractStroke`（`shape.ts:402-439`） |
| `stroke-width` | ✅ 默认 1 | `extractStroke` |
| `stroke-opacity` | ✅ | 同上 |
| `stroke-linecap` | `round` / `square` / `butt` | `parseLineCap`（`color.ts:146-158`） |
| `stroke-linejoin` | `round` / `bevel` / `miter` | `parseLineJoin`（`color.ts:160-175`） |
| `stroke-dasharray` / `stroke-dashoffset` | ✅ | `parseDashArray`（直接保留原字符串） |
| `opacity` | ✅ 0–1（含 0–100 自动归一） | `parseOpacity`（`color.ts:108-120`） |
| `visibility` | `hidden` / `collapse` → 隐藏 | `withBaseProps` / `applyTextMetadata` |
| `transform` | ✅（见 §11） | `parseTransformToMatrix` |

**颜色解析**（`src/svg/converters/color.ts`）：

| 输入形态 | 支持 |
| --- | --- |
| 命名色（`black` / `white` / `red` / `cyan` / `teal` / `transparent` / …，共 22 个） | ✅ → 6/8 位 hex |
| `#rgb` / `#rrggbb` / `#rrggbbaa` | ✅ |
| `rgb(r, g, b)` / `rgba(r, g, b, a)` | ✅ → `#rrggbb` / `#rrggbbaa` |
| `rgb(r%, g%, b%)` | ✅ |
| `currentColor` | ⚠️ 走 `shape.ts:401` 的字符串兜底，不向 PPTX 注入解析后的色值。 |
| `system colors` / `lab()` / `oklch()` 等 | ⏸ 直接保留原文，PPTX 不识别。 |

---

## 4. `<path>` 命令集

实现：`src/svg/utils/path-parser.ts`（用于把 `d` 拆为 `PathPoint[]`）+ `shape.ts:728-887`（变换时改写命令）。

| 命令 | 支持 | 备注 |
| --- | --- | --- |
| `M` / `m`（moveto） | ✅ | 切到下一个 `L`/`l`（`shape.ts:769-771`） |
| `L` / `l`（lineto） | ✅ | |
| `H` / `h`（horizontal lineto） | ✅ | 改写为 `L`（变换后需重新计算 y） |
| `V` / `v`（vertical lineto） | ✅ | 改写为 `L` |
| `C` / `c`（cubic bezier） | ✅ | |
| `S` / `s`（smooth cubic） | ✅ | 与 `C` 同 arity 处理 |
| `Q` / `q`（quadratic bezier） | ✅ | |
| `T` / `t`（smooth quadratic） | ✅ | 与 `L`/`M` 同 arity 处理 |
| `A` / `a`（elliptical arc） | ✅ | `shape.ts:846-858` 半径按 `decomposeMatrix` 的 `scaleX/scaleY` 缩放，旋转按 `decomposeMatrix.rotation` 复合 |
| `Z` / `z`（closepath） | ✅ | |

`PathPoint` 类型（`src/sif/types/elements/shape.ts:25-109`）输出结构化数组，PPTX 端可走 `<a:custGeom>` 直接消费，无需重新解析。

**bounding box**：`computePathBounds`（`shape.ts:483-547`）+ 弧线采样（`sampleSvgArc`，`shape.ts:574-609`）共同计算考虑了 cubic/quadratic/arc 控制点的 AABB，并加 `stroke-width / 2` 的 padding。

---

## 5. 填充（fill / stroke）

实现：`shape.ts:366-439`、`src/svg/converters/gradient.ts`、`src/svg/converters/pattern.ts`。

| 场景 | 支持 | 备注 |
| --- | --- | --- |
| `fill="solid color"` | ✅ | 走 `extractFill` → `SolidFill` |
| `fill="none"` | ✅ | → `NoneFill` |
| `fill="url(#gradId)"` 引用 `<linearGradient>` | ✅ | SIF 携带完整 `LinearGradient`（端点+stops），PPTX 端按角度展开 |
| `fill="url(#gradId)"` 引用 `<radialGradient>` | ⚠️ fallback 到第一个 stop 的纯色（`src/pptx/converters/shape.ts` `convertFill`） | 真渲染在 PPTX 用 `<a:path path="circle">`，本地 fork 暂不支持 |
| `fill="url(#patternId)"` 引用 `<pattern>` | ✅ | 走 `patternFillId` 路径，PPTX 端栅格化 tile |
| `fill="url(#gradId)"` 引用不存在的 id | ⏸ 走 `NoneFill` | |
| `stroke` 渐变 | ✅ | 走 `extractStroke` → `GradientStroke`；`stroke-width / opacity / linecap / linejoin / dasharray` 都生效 |
| `stroke="none"` | ✅ | `extractStroke` 返回 `undefined` |

---

## 6. 渐变（`<linearGradient>` / `<radialGradient>`）

实现：`src/svg/converters/gradient.ts`、`src/svg/converter.ts:193-210` 构建 gradient map。

| 元素 | 支持 | 支持的属性 | 备注 |
| --- | --- | --- | --- |
| `<linearGradient>` | ✅ | `x1` / `y1` / `x2` / `y2`（0–1 分数或百分数）/ `gradientTransform` / `href` / `xlink:href` / `spreadMethod` | `gradientTransform` 在转换时**预变换**到端点（`gradient.ts:30-33`），Identity 不写入。`spreadMethod` 仅在 `reflect` / `repeat` 时落 SIF；`pad`（默认）不落。 |
| `<radialGradient>` | ⚠️ 解析完整 + SIF 完整；**PPTX 端降级**到 first-stop 纯色 | `cx` / `cy` / `r` / `fx` / `fy` / `fr` / `gradientTransform` / `href` / `spreadMethod` | 本地 fork 的 pptxgenjs 不 emit `<a:path path="circle">`；后续路径见 `doc/features/svg-coverage.md` §“未实现 / Defer 项”。 |
| `<stop>` | ✅ | `offset` / `stop-color` / `stop-opacity` | `style="stop-color:…"` 也支持；`offset` 支持百分数和 0–1 分数；`extractGradientStops` 按 offset 排序。 |
| `href` / `xlink:href` 继承链 | ✅ | — | `resolveGradientChain`（`gradient.ts:90-130`）按 SVG 2 §13.2：child wins，父级 fills 缺口；stops 不合并，只在子级无 stops 时整体继承。 |
| `gradientUnits` | ⚠️ 解析读取但未对用户空间做缩放（PPTX 端按用户单位直接展开） | | |
| `spreadMethod="reflect"` / `"repeat"` | ⚠️ 解析正确，但 PPTX 端全部走 `pad` | | |

---

## 7. 图案（`<pattern>`）

实现：`src/svg/converters/pattern.ts`、`src/svg/converter.ts:230-242`。

| 维度 | 支持 |
| --- | --- |
| `<pattern>` def | ✅ 转成 `PatternTemplate`（`pattern.ts:74-110`），包含 `width` / `height` / `x` / `y` / `patternUnits` / `patternContentUnits` / `patternTransform` / `children: Element[]` |
| `patternUnits` | ✅ 解析（`userSpaceOnUse` / `objectBoundingBox`），落到 SIF |
| `patternContentUnits` | ✅ 同上 |
| `patternTransform` | ⚠️ 字符串保留在 SIF；PPTX 端**视觉不连续**（旋转的子图元之间存在三角缝，因为无栅格化器） |
| 子图元类型 | ✅ rect / circle / ellipse / path / line / polygon / polyline（`looksLikePattern` 限定这几种） |
| 多形状 / 嵌套 pattern | ✅ 支持（递归走 `convertElement`），但每个子图元必须能独立渲染 |
| 解析策略 | `looksLikePattern`（`pattern.ts:57-66`）用属性指纹识别（`patternUnits` / `patternContentUnits` / `width`+`height`+`rect|circle|...` 之一） |

PPTX 端按 tile 网格平铺到 shape 的 AABB，每格 `translate + (可选) rotate`，多出 bbox 的部分被裁切。

---

## 8. 滤镜（`<filter>` 及原语）

实现：`src/svg/converters/filter.ts`、`src/svg/converter.ts:212-222` 构建 filter map、`applyEffect`（`converter.ts:1113+`）落地。

`looksLikeFilter` 识别的 filter 含以下原语之一：`feGaussianBlur` / `feOffset` / `feMerge` / `feComponentTransfer` / `feDropShadow` / `feFlood` / `feColorMatrix`。

| 原语 | 状态 | 支持的属性 | 备注 |
| --- | --- | --- | --- |
| `feDropShadow` | ✅ | `dx` / `dy` / `stdDeviation` / `flood-color` / `flood-opacity` | 映射到 `ShadowEffect`。`flood-color` / `flood-opacity` 走 SVG 原语自己的属性，不从元素 fill 推断。 |
| `feOffset` + `feGaussianBlur` + `feFlood` 链 | ✅ | `dx` / `dy` / `stdDeviation` / `flood-color` / `flood-opacity` / `feFuncA slope`（作为 opacity 兜底） | 显式 drop-shadow 链，颜色从 `feFlood` 取；无 `feFlood` 时 fallback 到黑色（不取 element fill，避免浅色 card 出现 invisible halo）。 |
| `feGaussianBlur`（无 `feOffset`） | ✅ `blur` 或 `glow` | `stdDeviation` | 链里有 `feMerge` 引用 `SourceGraphic` → `GlowEffect`，否则 `BlurEffect`。链中 `feFlood` 颜色透传到 glow。 |
| `feMerge` | ✅ | — | 仅用来判断 glow / blur |
| `feComponentTransfer` | ✅ | `feFuncA slope` | 解析为 opacity 兜底 |
| `feFlood`（独立、无 offset 链） | ⚠️ 解析为 `shadowColor` / `opacity` 字段，但缺 offset/blur 链时整个 filter 返回 `undefined` | | |
| `feColorMatrix type="matrix"` | ⚠️ 解析到 SIF（20 个值），**PPTX 端不消费** | 全部 20 个值（行优先） | |
| `feColorMatrix type="saturate"` | ✅（solid fill only） | `values` 第一位 | `0` → BT.601 灰度；其他值保持原色（PPTX 端 `convertEffect` 实现 HSL 旋转） |
| `feColorMatrix type="hueRotate"` | ✅（solid fill only） | `values` 第一位（度数） | 任意正负值；HSL 空间色相旋转 |
| `feColorMatrix type="luminanceToAlpha"` | ⚠️ 解析到 SIF，**PPTX 端不消费** | | |
| `<feBlend>` / `<feComposite>` / `<feMorphology>` / `<feConvolveMatrix>` / `<feDisplacementMap>` / `<feTurbulence>` / `<feImage>` | ⏸ 不识别 | | |

**效果链组合**：shadow + color matrix 链时（如 `feOffset + feBlur + feFlood + feColorMatrix`），`convertFilterDef` 透传 `colorMatrixType/Value/Matrix` 到 SIF，PPTX 端对 solid fill 做灰度 / 色相处理后再加阴影（近似）。

---

## 9. 裁剪与遮罩（`<clipPath>` / `<mask>`）

实现：`src/svg/converters/clip-path.ts`、`src/svg/converters/mask.ts`。

### 9.1 `<clipPath>`

| 维度 | 支持 |
| --- | --- |
| `clipPathUnits` | ✅ 解析（`userSpaceOnUse` / `objectBoundingBox`） |
| 单 `<rect>` 子图元 | ✅ → `ClipPathResource {type:'rect'}`，PPTX 端用 AABB 求交集裁切 |
| 多形状 / 圆形 / 路径 / polygon / polyline | ⏸ 解析为 `looksLikeClipPath` 但 `convertClipPath` 返回 `undefined` 并 `console.warn`（`clip-path.ts:77-82`） |
| 旋转 / 缩放的内部 rect | ⚠️ 落到 PPTX 端无 axis-aligned clip，会 `console.warn` 并跳过裁剪（`converter.ts:873-878`） |
| `objectBoundingBox` 模式 | ⚠️ 解析但无 host bbox 信息，PPTX 端按用户单位直接处理（实际效果接近 `userSpaceOnUse`） |

### 9.2 `<mask>`

| 维度 | 支持 |
| --- | --- |
| `maskUnits` | ✅ |
| 单 `<rect>` 子图元 | ✅ → `MaskResource`，alpha = `luminance(fill-color) × fill-opacity`（白色 = 1，黑色 = 0，灰 ≈ 0.5） |
| 内部 rect 引用 `<linearGradient>` / `<radialGradient>` | ✅ 解析为 `MaskResource.gradient`（`mask.ts:102-129`），PPTX 端用 BT.601 luminance 沿梯度轴生成 alpha |
| 多 rect 子图元 | ⚠️ 落到 `MaskResource` 只取首 rect（`mask.ts:68-83` 显式 only first） |
| 非 rect 子图元 | ⏸ 不识别（`looksLikeMask` 限定 rect/circle/...，但 `convertMask` 只走 `collectChildren(def, 'rect')`） |
| `maskContentUnits` | ⚠️ 解析但不使用 |

### 9.3 应用方式

- `clip-path="url(#id)"` / `mask="url(#id)"` 写在元素上时，`applyElementContext`（`converter.ts:783-808`）把 id 落到 `element.clipPathId` / `element.maskId`。
- 写在 `<g>` 上时，`convertGroupElement`（`converter.ts:381-403`）先把引用 hoist 到每个子元素，**子元素自己**再走 `applyElementContext`。
- 内部矩形经过 `resolveAbsoluteClipRect`（`converter.ts:837-899`）用元素的累计 transform 矩阵换算到绝对坐标，PPTX 端再与 element 的 AABB 求交。

---

## 10. 文本与富文本

实现：`src/svg/converters/text.ts`、`src/svg/converters/foreignObject.ts`、`src/formula/*`（公式内联）、`src/sif/parse/inline-segments.ts`（内联分段）。

### 10.1 `<text>`

| 属性 | 支持 |
| --- | --- |
| `x` / `y` | ✅ 起点；受 `transform` 缩放 |
| `font-family` | ✅ 走 `resolveWebFontFamily` 解析为 CJK-first 链 |
| `font-size` | ✅ 受 `transform` 缩放 |
| `font-weight` | ✅ `normal` / `bold` / `lighter` / `bolder` / 数字 |
| `font-style` | ✅ `normal` / `italic` / `oblique` |
| `text-anchor` | ✅ `start` / `middle` / `end` |
| `dominant-baseline` | ✅ `baseline`(默认) / `middle` / `central` / `top`(`text-before-edge`/`hanging`) / `bottom`(`text-after-edge`) |
| `letter-spacing` | ✅ |
| `line-height` | ✅ |
| `text-decoration` | ✅ `underline` / `line-through` / `overline`（含颜色变体） |
| `textLength` / `lengthAdjust` | ✅ `spacing` / `spacingAndGlyphs` |
| `xml:space="preserve"` | ✅ |
| `transform`（绕基线旋转） | ✅ `textRotation` |
| `fill` / `stroke` | ✅（含渐变） |
| `opacity` / `visibility` | ✅ |
| `word-spacing` / `text-transform` / `font-variant` | ⚠️ 解析读取但 PPTX 端无对应完整落地 |

### 10.2 `<tspan>`

子节点用有序 walker 解析（`getOrderedMixedChildren`），按文档顺序处理 `#text` 和 `tspan`：

| 属性 | 支持 |
| --- | --- |
| 继承 `<text>` 全部属性 | ✅ |
| `rotate`（单值 / 多值列表） | ⚠️ 多值折叠为第一个有限数（`parseFirstRotate`，`text.ts:595-602`） |
| `baseline-shift` | ✅ `super` / `sub` 关键字、百分数、像素（解释为 em 百分比） |
| `textLength` / `lengthAdjust` | ✅ |
| `xml:space` | ✅ |
| `x` / `y` / `dx` / `dy` | ✅ `x` / `y` 触发换行；`dy` 触发换行（`startsNewTextLine`） |
| `<tspan>` 嵌套 | ✅ 递归走 `getTspanChildren` + ordered walker |

### 10.3 `<textPath>`

实现：`text.ts:136-159`、`text.ts:469-478`（`extractTextContent` 收 textPath 的文本）。

| 属性 | 支持 |
| --- | --- |
| `href` / `xlink:href` 引用 `<path>` | ✅ 从 defs 取出 `d` 并叠加 ambient transform |
| `startOffset` | ✅ 用户单位 |
| 文本内容 | ✅ 收集到 SIF `text` 字段 |
| `<tspan>` 子节点 | ✅ 收集并分配到 run |
| 直线 / 二次 / 三次 / 圆路径 | ✅ 沿路径采样分布 |
| 任意 SVG 路径命令 | ✅ 同样走 `parsePathToPoints` |
| `side="left"` / `side="right"` | ⚠️ 不解析（按默认 `left` 处理） |

### 10.4 `<foreignObject>`

实现：`src/svg/converters/foreignObject.ts`。

| 标签 | 支持 | 备注 |
| --- | --- | --- |
| `h1` / `h2` / `h3` / `h4` / `h5` / `h6` | ✅ | 字号按 `HEADING_SIZE_FACTORS` 缩放；强制 bold |
| `p` / `div` | ✅ | 块级边界追加 `\n` |
| `span` | ✅ | 无样式叠加 |
| `b` / `strong` | ✅ | → bold |
| `i` / `em` | ✅ | → italic |
| `u` | ✅ | → underline（`decoration.underline`） |
| `br` | ✅ | → `\n` |
| `a` / `ul` / `ol` / `li` / `table` / `tr` / `td` | ✅（解析为顺序 run，不带 link 颜色 / 列表编号） | |
| `style=` / `class=` | ⏸ 不会内联 CSS；只走白名单样式 |
| `position: absolute` / flex 布局 | ⏸ 走外层 `<foreignObject>` 的 `x/y/width/height` |

`x` / `y` / `width` / `height` 受 ambient `<g>` / nested `<svg>` 的 transform 缩放（`foreignObject.ts:67-77`）。

### 10.5 公式（LaTeX / MathML）

详见 §14。文本节点内 `$…$` / `\(…\)` / `$$…$$` / `\[…\]` 会被 `src/sif/parse/inline-segments.ts` 切为内联段，公式段走 OMML 输出（`src/formula/omml.ts`）。

---

## 11. 变换、组、引用与嵌套

### 11.1 `transform` 属性

实现：`src/svg/converters/group.ts`（`parseTransformToMatrix` + `commandToMatrix`）。

| 函数 | 支持 |
| --- | --- |
| `translate(tx [, ty])` | ✅ |
| `scale(sx [, sy])` | ✅ 非均匀缩放 |
| `rotate(angle)` | ✅ |
| `rotate(angle, cx, cy)` | ✅ 中心旋转（矩阵 = T·R·T⁻¹） |
| `skewX(angle)` / `skewY(angle)` | ✅ |
| `matrix(a, b, c, d, e, f)` | ✅ |
| 链式组合（任意顺序） | ✅ |
| 嵌套 `<g>` 累计 | ✅ `multiplyMatrices` |

**落地**：形状的变换不在 SIF 上以 `transform` 字符串保存，而是被矩阵化、烘到坐标 / `rotation` 字段上（`extractRotation` + `applyMatrixToShapeBounds`）。`<path>` 内部 `d` 也会被改写为绝对坐标（`transformPathData`）。例外：布局组（§15）保留 `transform` 字段。

### 11.2 `<g>`

实现：`src/svg/converters/group.ts:251-337`、`converter.ts:372-477`。

| 属性 / 行为 | 支持 |
| --- | --- |
| 嵌套 | ✅ |
| `transform` 累计 | ✅ |
| `opacity` 累计 | ✅（`parent.opacity × own.opacity`，最终落到每个非组元素） |
| `visibility` | ✅ 任一层 `hidden` / `collapse` 即整链不可见 |
| `clip-path` / `mask` | ✅ 提升到子元素 + 自身记录 id |
| `layout="block" \| "flex" \| "grid" \| "inline" \| "absolute"` | 🧪 实验性（§15） |
| `z-index` | ✅ 浮点；layout pass 据此重排 |
| `data-effect` (JSON 字符串) | ✅ → `group.effect`（PPTX 端用于 group 级 `<a:effectLst>`） |
| `fill` / `stroke` 等 presentation 属性 | ✅ 通过 `PRESENTATION_ATTRS` 继承到子节点 |
| `font-family` 继承 | ✅；缺失时使用 `defaultFontFamily` |
| `style="…"` 内联样式 | ✅ 拆分后与现有属性合并（已有属性不被内联 style 覆盖） |

### 11.3 `<use>`

实现：`converter.ts:479-624`（`convertUseElement`、`buildShapeOverrideMatrix`）。

| 目标类型 | 支持 |
| --- | --- |
| `<symbol>` | ✅ 视口化（`viewBox` × `width` / `height`） |
| `<svg>`（嵌套 viewport） | ✅ |
| `<g>` | ✅ 仅 translate |
| `<rect>` | ✅ translate + 可选非均匀缩放 |
| `<circle>` / `<ellipse>` | ✅ translate + 半径缩放 |
| `<path>` | ✅ bbox 平移到 (useX, useY)（仅当 use 显式 `x` / `y`）+ 缩放 |
| `<polygon>` / `<polyline>` | ✅ 同 path |
| `<line>` | ✅ 同 path |
| `<text>` / `<image>` / `<video>` / `<audio>` | ⏸ 解析为 `use` 但 `convertElement` 派发会再走元素 converter（symbol/svg 路径走嵌套） |
| `href` / `xlink:href` 缺省 | ⏸ 忽略 |

### 11.4 `<symbol>`

- 单独出现时**不渲染**（`converter.ts:302-304`）；
- 必须通过 `<use href="#id">` 实例化。

### 11.5 nested `<svg>`

实现：`getNestedSvgViewportMatrix`（`converter.ts:1039-1065`）。

| 属性 | 支持 |
| --- | --- |
| `viewBox` + `width` / `height` | ✅ 缩放到 use 容器 |
| 仅 `x` / `y`（无 viewBox） | ✅ 平移 |
| `width` / `height` 缺省 | ⚠️ 退回到 `viewBox.width/height` |
| 嵌套再嵌套 | ✅ 累计 |

### 11.6 `<switch>`

⚠️ 解析为 defs 不会渲染内容；不做 `requiredFeatures` / `systemLanguage` 判断（直接走首子图元等价物——但当前 `convertElement` 对 `switch` 返回 `undefined`，见 `converter.ts:308-310`）。

---

## 12. 媒体（`<image>` / `<video>` / `<audio>`）

实现：`src/svg/converters/media.ts`、`converter.ts:320-325`。

| 元素 | 支持 | 关键属性 |
| --- | --- | --- |
| `<image>` | ✅ | `x` / `y` / `width` / `height` / `href` / `xlink:href` / `preserveAspectRatio` / `opacity` / `visibility` / `transform`（含水平 / 垂直翻转） |
| `<video>` | ✅ | 同 `<image>` + `poster` / `autoplay` / `loop` / `muted` / `controls` / `volume` |
| `<audio>` | ⚠️ 部分支持 | `href` / `autoplay` / `loop` / `muted` / `volume`；`x` / `y` / `width` / `height` 解析但不渲染可视区域 |

**Href 解析**：

| 输入 | 行为 |
| --- | --- |
| `data:image/...` / `data:video/...` | ✅ 保留原文 |
| `http://` / `https://` / `file://` | ✅ 保留原文 |
| 绝对路径 | ✅ 保留原文 |
| 相对路径 | ✅ 通过 `path.resolve(baseDir, href)` 解析为绝对路径；`baseDir` 来自 `SvgToSifOptions.baseDir` |

**格式推断**：按扩展名映射（`media.ts:239-306`）：

- 图片：`png` / `jpg` / `jpeg` / `gif` / `svg` / `webp` / `bmp`
- 视频：`mp4` / `webm` / `ogg` / `mov` / `avi` / `mkv`
- 音频：`mp3` / `wav` / `ogg` / `aac` / `m4a` / `flac`

`data:` URI 通过 `data:` 后的 mime 子串推断（`getExtension`，`media.ts:280-298`）。

**变换**：`scaleX < 0` → `flipH = true`；`scaleY < 0` → `flipV = true`（`media.ts:215-223`）。旋转写入 `transform.rotate`。

---

## 13. 动画（SMIL 快照）

实现：`src/svg/converters/animation.ts`。

> 策略：PPTX 没有 SMIL 等价物。引擎采用“end-state snapshot”策略：只接受 `fill="freeze"` 的动画，把目标值烘到 SIF 上。

| 原语 | 支持的属性 | 行为 |
| --- | --- | --- |
| `<set>` / `<animate>` | `attributeName` ∈ `{x, y, width, height, cx, cy, r, rx, ry, fill, opacity}` + `to` | `fill` 走 `parseColor` → `SolidFill`；`opacity` 数字；其他属性 `parseFloat` 落到对应字段 |
| `<animateTransform>` | `type` ∈ `{translate, scale, rotate}` + `to` | 写入 `element.transform.{translateX,translateY,scaleX,scaleY,rotate}` |
| `<animateMotion>` | `path` | 提取第一个 `M/m` 命令的坐标作为 `transform.translateX/Y`（粗略） |
| `fill="remove"` / `fill` 缺省 | ⏸ 丢弃（不烘到 SIF） | 默认行为按 SMIL 规范 |
| `from` / `values` / `keyTimes` / `begin` / `dur` / `repeatCount` | ⏸ 不实现 keyframe 插值 | |
| 多个动画叠加（多 `<animate>` 同时改 `x`） | ⚠️ 串行应用，后者覆盖前者 | |
| `<animate>` 目标非自身（`xlink:href`） | ⏸ 只取自身子节点 | |

每个 ShapeElement / TextElement / LineElement 在派发后会走 `applyAnimationSnapshot`（`converter.ts:744-758`）。Group 不参与。

---

## 14. 公式（LaTeX / MathML → OMML）

实现：`src/formula/*`（LaTeX → MathML → OMML）+ `src/pptx/utils/formula.ts`（PPTX 落地）+ `src/sif/parse/inline-segments.ts`（文本内联分段）。

| 输入 | 状态 | 备注 |
| --- | --- | --- |
| `$x^2 + y^2$` | ✅ | 切到内联 formula 段 |
| `\(x^2 + y^2\)` | ✅ | 同上 |
| `$$x^2 + y^2$$` | ✅ | 块级 formula 段（`kind:'block'`） |
| `\[x^2 + y^2\]` | ✅ | 块级 |
| LaTeX 子集（`src/formula/latex.ts`） | ✅ 覆盖 `frac` / `sqrt` / `sum` / `int` / `lim` / `matrix` / `cases` / Greek 字符 / 上下标 / 重音 | 详见 `src/formula/tables.ts` |
| MathML 输入 | ✅ `mathml2omml` 包 + 自有 `mathMLToOmml` 包装 | 颜色注入（`injectMathColors`） |
| 颜色覆写 | ✅ `setFormulaColors` / `injectUniformMathColor` | |

`extractInlineFormulaSegments`（`src/formula/extract.ts`）在文本 build 阶段把 run 切成 `text` / `formula` / `block` 三种内联段（`src/sif/parse/inline-segments.ts`）。

---

## 15. 布局容器（实验性）

> 🧪 **实验性**。`<g layout="…">` 触发 `src/layout/pass.ts` 的 layout 重排；非默认行为，**不列入正式发布**。

| 值 | 状态 | 支持的子属性 |
| --- | --- | --- |
| `layout="block"` | 🧪 | `x` / `y` / `width` / `height` / `gap` / `overflow` / `align-self`（逗号分隔） |
| `layout="flex"` | 🧪 | + `flex-direction` / `justify-content` / `align-items` / `flex-wrap` |
| `layout="grid"` | 🧪 | + `grid-template-columns` / `grid-template-rows` |
| `layout="inline"` | 🧪 | — |
| `layout="absolute"` | 🧪 | 容器内子项按 `x` / `y` 绝对定位 |

落地策略：layout 容器对子元素用**重置后的 transform matrix**（`converter.ts:418-430`），layout pass 完成后父 translate 再被 `flattenToAbsolute` 重新贴回（`converter.ts:455-466`）。

`useLayout: 'off'`（`SvgToSifOptions`）可关闭整个 layout pass，回到 v1.0 行为。

---

## 16. 显式 defer / 负向 case

来源：`example/99-defer-and-negative/` + `example/INDEX.md` §99 节。

| 元素 / 特性 | 状态 | 后续路径 |
| --- | --- | --- |
| `<radialGradient>` 真渲染 | ⏸ | 改 pptxgenjs fork 让 `genXmlColorSelection` 发 `<a:path path="circle">` 分支；或后处理 XML 正则替换 `<a:lin>` |
| `<pattern>` 的 `patternTransform` 旋转视觉连续 | ⏸ 三角缝 | 接入 `@resvg/resvg-js` 把 tile 栅格化；或 shape-level `crop` 截断 |
| `feColorMatrix` per-stop 灰度 / 色相 | ⏸（仅 solid fill） | 走 gradient stop → PPTX `lumMod` / `lumOff` 链 |
| `feColorMatrix` `luminanceToAlpha` | ⏸ | 需要栅格化或 shader |
| `<clipPath>` 多形状 / 圆形 / 路径 | ⏸ | 走 PPTX `<a:spPr><a:clip/>` 自定义几何或栅格化 mask |
| `<mask>` 多 rect | ⚠️ 只取首 rect | 同上 |
| `<clipPath>` 内部 rect 含旋转 / 缩放 | ⚠️ warn + 跳过 | 同上 |
| `spreadMethod="reflect"` / `"repeat"` | ⚠️ 降级 `pad` | PPTX 端不原生支持 |
| 公式 `\[ \]` 块级在中文段落内 | 🧪 | layout 集成中 |
| 任何未识别 tag | ⏸ `convertElement` 返回 `undefined`，**静默忽略** | — |
| `system colors` / `lab()` / `oklch()` | ⏸ | — |
| `<style>` / `<link>` 全局 CSS | ⏸ | — |

---

## 17. 覆盖率总矩阵

| 类别 | 元素 / 特性 | 状态 | 关键代码 |
| --- | --- | --- | --- |
| 基础图形 | `rect` / `circle` / `ellipse` / `line` / `polygon` / `polyline` / `path` | ✅ | `src/svg/converters/shape.ts` |
| 路径命令 | `M L H V C S Q T A Z`（含相对 / 绝对） | ✅ | `shape.ts:728-887` |
| 填充 | solid / `none` / opacity / `fill-rule` | ✅ | `shape.ts:366-400` |
| 描边 | width / dash / linecap / linejoin / opacity / 渐变 | ✅ | `shape.ts:402-439` |
| 渐变 | `<linearGradient>`（含 `gradientTransform`） | ✅ | `src/svg/converters/gradient.ts` |
| 渐变 | `<radialGradient>` | ⚠️ 解析完整，PPTX 端 fallback first-stop | 同上 |
| 渐变 | `href` / `xlink:href` 继承链 | ✅ | `gradient.ts:90-130` |
| 渐变 | `spreadMethod="reflect"` / `"repeat"` | ⚠️ 降级 `pad` | `gradient.ts:164-167` |
| 图案 | `<pattern>` 基础 | ✅ | `src/svg/converters/pattern.ts` |
| 图案 | `patternTransform` rotate | ⚠️ 视觉不连续 | `pattern.ts:89` |
| 滤镜 | `feDropShadow` | ✅ | `src/svg/converters/filter.ts:22-39` |
| 滤镜 | `feOffset` + `feGaussianBlur`（带 / 不带 `feFlood`） | ✅ | `filter.ts:42-80` |
| 滤镜 | `feGaussianBlur` 单独（`blur` / `glow`） | ✅ | `filter.ts:84-114` |
| 滤镜 | `feFlood` / `feMerge` / `feComponentTransfer` | ✅ 作为影子来源 | `filter.ts:42-114` |
| 滤镜 | `feColorMatrix matrix` | ⚠️ 解析，不消费 | `filter.ts:117-163` |
| 滤镜 | `feColorMatrix saturate` | ✅ solid fill | 同上 |
| 滤镜 | `feColorMatrix hueRotate` | ✅ solid fill | 同上 |
| 滤镜 | `feColorMatrix luminanceToAlpha` | ⚠️ 解析，不消费 | 同上 |
| 裁剪 | `<clipPath>` 单 rect | ✅ | `src/svg/converters/clip-path.ts` |
| 裁剪 | `<clipPath>` 多形状 / 非 rect | ⏸ | `clip-path.ts:77-82` |
| 遮罩 | `<mask>` 单 rect | ✅ | `src/svg/converters/mask.ts` |
| 遮罩 | `<mask>` 渐变内部 rect | ✅ | `mask.ts:102-129` |
| 遮罩 | `<mask>` 多 rect | ⚠️ 取首 rect | `mask.ts:68-83` |
| 文本 | `<text>` 完整属性 | ✅ | `src/svg/converters/text.ts` |
| 文本 | `<tspan>` 完整属性 / 嵌套 / 换行 | ✅ | `text.ts:161-347` |
| 文本 | `<tspan rotate>` 多值 | ⚠️ 折叠首值 | `text.ts:595-602` |
| 文本 | `textLength` / `lengthAdjust` | ✅ | `text.ts:633-636` |
| 文本 | `xml:space` | ✅ | `text.ts:643-647` |
| 文本 | `<textPath>` | ✅ | `text.ts:136-159` |
| 文本 | `<foreignObject>` HTML 白名单 | ✅ | `src/svg/converters/foreignObject.ts` |
| 文本 | 公式（LaTeX / MathML） | ✅ | `src/formula/*` |
| 变换 | `translate` / `rotate` / `scale` / `skewX` / `skewY` / `matrix` | ✅ | `src/svg/converters/group.ts:380-422` |
| 变换 | 嵌套累计 | ✅ | `multiplyMatrices`（`group.ts:94-103`） |
| 组 | `<g>` 全部 presentation / visibility / opacity 继承 | ✅ | `converter.ts:912-927` |
| 组 | `clip-path` / `mask` hoist 到子元素 | ✅ | `converter.ts:381-403` |
| 组 | `z-index` | ✅ | `converter.ts:776-779` |
| 引用 | `<use>` → `<symbol>` / `<svg>` viewport | ✅ | `converter.ts:516-541` |
| 引用 | `<use>` → `<g>` / shape | ✅ | `converter.ts:543-558` |
| 引用 | `<symbol>` 单独出现 | ⏸ 不渲染 | `converter.ts:302-304` |
| 嵌套 | nested `<svg>` viewport | ✅ | `converter.ts:1039-1065` |
| 媒体 | `<image>` 远程 / 本地 / data URI | ✅ | `src/svg/converters/media.ts` |
| 媒体 | `<video>` / `<audio>` | ✅ | 同上 |
| 媒体 | `preserveAspectRatio` | ✅ 默认 `xMidYMid meet` | `media.ts:225-229` |
| 媒体 | 水平 / 垂直翻转 | ✅ | `media.ts:215-223` |
| 媒体 | `audio` `x` / `y` / `width` / `height` | ⚠️ 部分支持 | `media.ts:127-177` |
| 动画 | `<set>` / `<animate>` (x/y/w/h/cx/cy/r/rx/ry/fill/opacity) | ✅ freeze only | `src/svg/converters/animation.ts` |
| 动画 | `<animateTransform>` | ✅ freeze only | `animation.ts:152-166` |
| 动画 | `<animateMotion>` | ✅ freeze only | `animation.ts:168-178` |
| 动画 | `from` / `values` / `keyTimes` 插值 | ⏸ | — |
| 标记 | `<marker>` (arrow / diamond / circle / open) | ✅ | `src/svg/converters/marker.ts` |
| 标记 | `marker-start` / `marker-end` / `marker-mid` on line / polyline | ✅ | `shape.ts:38-156` |
| 布局 | `block` / `flex` / `grid` / `inline` / `absolute` | 🧪 | `src/layout/*` |
| 通用 | 颜色（命名 / hex / rgb / rgba） | ✅ | `src/svg/converters/color.ts` |
| 通用 | `currentColor` | ⚠️ 透传 | — |
| 通用 | `style="…"` 内联 | ✅ 拆分 + 合并 | `converter.ts:1087-1099` |
| 通用 | 全局 `<style>` / `<link>` | ⏸ | — |

---

## 18. 相关文件索引

- **入口 / 总线**：
  - `src/index.ts` — 公开 API
  - `src/svg/index.ts` — SVG 子模块导出
  - `src/svg/parser.ts` — XML 解析 + ordered walker
  - `src/svg/converter.ts` — 主派发 + 上下文继承 + animation/clip/mask 落地
- **形状 / 路径**：
  - `src/svg/converters/shape.ts` — rect / circle / ellipse / line / polygon / polyline / path
  - `src/svg/utils/path-parser.ts` — `d` → `PathPoint[]`
  - `src/sif/types/elements/shape.ts` — `ShapeElement` / `PathPoint` 类型
- **文本 / 富文本**：
  - `src/svg/converters/text.ts` — `<text>` / `<tspan>` / `<textPath>`
  - `src/svg/converters/foreignObject.ts` — HTML 白名单
  - `src/sif/types/elements/text.ts` — `TextElement` / `RichTextElement` / `TextRun`
- **颜色**：`src/svg/converters/color.ts`
- **渐变**：`src/svg/converters/gradient.ts`、`src/sif/types/style/gradient.ts`
- **图案**：`src/svg/converters/pattern.ts`
- **滤镜**：`src/svg/converters/filter.ts`、`src/sif/types/style/effect.ts`
- **裁剪 / 遮罩**：
  - `src/svg/converters/clip-path.ts`
  - `src/svg/converters/mask.ts`
- **媒体**：`src/svg/converters/media.ts`
- **标记**：`src/svg/converters/marker.ts`、`src/sif/types/elements/line.ts`
- **动画**：`src/svg/converters/animation.ts`
- **组 / 变换**：`src/svg/converters/group.ts`、`src/sif/types/elements/group.ts`
- **公式**：`src/formula/*`、`src/sif/parse/inline-segments.ts`
- **布局**（实验性）：`src/layout/*`、`src/sif/types/elements/group.ts`（`layout` 字段）
- **字体**：`src/utils/font.ts`
- **PPTX 输出层**（间接相关）：
  - `src/pptx/generator.ts`
  - `src/pptx/converters/{shape,text,line,group,image,video,audio,slide}.ts`
  - `src/pptx/utils/{formula,text-path,baseline,post-process,path-to-pptx}.ts`
- **示例 / fixture**：
  - `example/01-shapes` ~ `example/14-charts` — 14 类别的可运行 SVG 样例（`example/INDEX.md` 给出矩阵）
  - `example/99-defer-and-negative/` — 显式未支持项 + 边缘 case
  - `doc/features/svg-coverage.md` — Phase 0.2A 阶段的早期覆盖矩阵（已被本文档取代）
