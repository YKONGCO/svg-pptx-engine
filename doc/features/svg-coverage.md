# SVG → PPTX 元素覆盖度（Phase 0.2A）

本文档列出 svg-pptx-engine 当前支持的 SVG 元素 / 属性 / 滤镜原语。

> **总览**：截至 v9，Phase 0.2A 收尾 8 项；`radialGradient`（panel 4）按用户决议 defer（PowerPoint 用 `<a:path path="circle">`，本地 fork 的 pptxgenjs 不支持，需 monkey-patch 或后处理 XML）。
>
> **统一 fixture**：所有特性的最小 SVG 样例合并到 `example/phase0-2a/batch-a-fixture.svg`，每个 panel 对应本文档的一节。`output/phase0-2a/batch-a-fixture.pptx` 是评审 PPTX。

---

## 目录

- [1. `<pattern>` — panel 1, 2（图案填充）](#1-pattern--panel-1-2图案填充)
- [2. `<linearGradient>` + `gradientTransform` — panel 3（线性渐变 + 旋转）](#2-lineargradient--gradienttransform--panel-3线性渐变--旋转)
- [3. `<clipPath>` — panel 5（裁剪）](#3-clippath--panel-5裁剪)
- [4. `<mask>` — panel 6（遮罩 / 透明度叠加）](#4-mask--panel-6遮罩--透明度叠加)
- [5. `feDropShadow` — panel 7（投影）](#5-fedropshadow--panel-7投影)
- [6. `feColorMatrix` saturate=0 — panel 8（灰度）](#6-fecolormatrix-saturate0--panel-8灰度)
- [7. `feColorMatrix` hueRotate — panel 9（色相旋转）](#7-fecolormatrix-huerotate--panel-9色相旋转)
- [8. `feFlood` + 投影链 — panel 10](#8-feflood--投影链--panel-10)
- [覆盖率矩阵](#覆盖率矩阵)
- [未实现 / Defer 项](#未实现--defer-项)
- [相关文件](#相关文件)

---

## 1. `<pattern>` — panel 1, 2（图案填充）

**支持的属性**：`x`, `y`, `width`, `height`, `patternUnits`（`userSpaceOnUse` | `objectBoundingBox`），`patternTransform`（保留解析，**视觉连续性受限**，见下）

**实现策略**：把 `<pattern>` 内部的子图元按 `tileW × tileH` 网格平铺到 shape 的整个 bbox 上，每格 `translate + (可选) rotate`。每格严格裁切到 shape bbox 内以防溢出。

**局限**：
- `patternTransform="rotate(deg)"` 已实现但**视觉上不连续**（每段旋转的子图元之间有白色三角缝），因为无 SVG→PNG 栅格化器。fixture 暂时不启用旋转。
- 复杂图案（多形状嵌套）支持，但 children 必须能在 PPTX 里独立渲染（rect / circle / ellipse / line / path / polygon / polyline）。

**Panel 1 — 圆点**：`fill="url(#dotPattern)"`，pattern 是 20×20 tile，里面一个红圆 r=4。fixture 跑出 81 个红色 `<a:prstGeom prst="ellipse"/>`（10×8 网格 + 1 溢出被裁），加 1 个 stroke-only 边框。

**Panel 2 — 竖条纹**：`fill="url(#stripePattern)"`，pattern 是 14×14 tile，里面一个 7×14 青绿色矩形。fixture 跑出 154 个青绿色竖条（15×12 网格 + 溢出裁切），加 1 个 stroke-only 边框。

---

## 2. `<linearGradient>` + `gradientTransform` — panel 3（线性渐变 + 旋转）

**支持的属性**：`x1`, `y1`, `x2`, `y2`（0-1 分数或百分比），`gradientTransform`（`rotate(deg)` / `translate` / `scale` / `matrix` 任意组合），`stop-color`, `stop-opacity`, `offset`

**实现策略**：`gradientTransform` 在 SVG 层就预变换进 `x1/y1/x2/y2`，PPTX 层不感知 transform（直接读 `x1/y1/x2/y2` 算角度）。Identity transform 不写入以节省字节。

**Panel 3 — 旋转 60° 渐变**：`fill="url(#rotated)"` + `gradientTransform="rotate(60)"`，端点已被预变换，PPT 端 `ang="3600000"`（60°）。原本水平方向的紫→粉渐变倾斜成 60°。

---

## 3. `<clipPath>` — panel 5（裁剪）

**支持的属性**：`clipPathUnits`（默认 `userSpaceOnUse`），内部 `<rect>` 子图元（**只支持单 rect**，多形状 / 非 rect 子图元会 warn 跳过）

**实现策略**：在 PPTX 端把 shape 的 bbox 与 clip rect 求交集（`applyClipPathAndMask` in `src/pptx/converters/shape.ts`），交集为空时把 shape 缩到 0 隐藏。

**Panel 5 — 单矩形裁剪**：`clip-path="url(#cropBox)"`，clip rect 160×160，shape 是 240×180 紫色矩形 → 交集后变成 160×160。

> **注意**：clipPath 在 SVG 里默认 `userSpaceOnUse`，所以裁剪矩形的坐标是 SVG 用户空间。fixture 中如果裁剪矩形和被裁 shape 的位置不重叠（如 0,0 vs 280,310），交集为空，shape 会消失。

---

## 4. `<mask>` — panel 6（遮罩 / 透明度叠加）

**支持的属性**：`maskUnits`（默认 `userSpaceOnUse`），内部 `<rect>` 子图元（**只支持单 rect**），`fill`（决定 luminance 系数），`fill-opacity`（alpha 系数）

**实现策略**：mask 的有效 alpha = `luminance(fill-color) * fill-opacity`（白色 = 1，黑色 = 0，其他 = 0.5），折入 shape 的 fill transparency。白色满 alpha 是 no-op（mask 没起作用），其他组合产生半透效果。

**Panel 6 — 白色 0.4 alpha 半透**：黄色矩形被 mask 后生成 `<a:alpha val="40000"/>`（40% alpha = 60% 透明），slide 背景透出。

---

## 5. `feDropShadow` — panel 7（投影）

**支持的属性**：`dx`, `dy`, `stdDeviation`, `flood-color`, `flood-opacity`

**实现策略**：直接映射到 pptxgenjs 的 `shadow` props（`{ type: 'outer', color, blur, offset, opacity }`）。`flood-color` / `flood-opacity` 走 SVG 滤镜原语自己的属性，不从 shape 的 fill 推断。

**Panel 7 — 黑色投影**：青色矩形 + `feDropShadow dx=6 dy=6 stdDeviation=4 flood-color="rgba(0,0,0,0.55)"`，PPT 端 `<a:outerShdw>` 颜色 `#0000008c`（alpha 0.55）。

---

## 6. `feColorMatrix` saturate=0 — panel 8（灰度）

**支持的属性**：`type="saturate"`, `values="0"`（仅 0 被处理；其他值保持原色）

**实现策略**：solid fill 走 BT.601 luma 公式（`0.299*R + 0.587*G + 0.114*B`）转灰度；gradient / pattern fill 暂不支持 per-stop 灰度。

**Panel 8 — 红 → 灰**：红色 `#FF6B6B` (255, 107, 107) → 灰 `#979797`（luma = 0.299×255 + 0.587×107 + 0.114×107 ≈ 151）。

---

## 7. `feColorMatrix` hueRotate — panel 9（色相旋转）

**支持的属性**：`type="hueRotate"`, `values="<degrees>"`（任意度数，正负皆可）

**实现策略**：solid fill 走 HSL 空间色相旋转（`H' = (H + degrees) mod 360`，再转回 RGB）；gradient / pattern fill 暂不支持 per-stop 旋转。

**Panel 9 — 红 → 绿（120°）**：红色 `#FF6B6B` (255, 107, 107) → 绿 `#6BFF6B` (107, 255, 107)。HSL 色相从 H=0° 转到 H=120°，饱和度和亮度不变。

---

## 8. `feFlood` + 投影链 — panel 10

**支持的属性**：`<feFlood>` 的 `flood-color` / `flood-opacity`；`<feOffset>` 的 `dx` / `dy`；`<feGaussianBlur>` 的 `stdDeviation`

**实现策略**：`feFlood` 在 `feOffset + feGaussianBlur` 链中读取 `flood-color` 作为阴影色（替代从 shape fill 推断），产物仍是 `ShadowEffect`。

**Panel 10 — teal 色阴影**：黄色矩形 + `feFlood flood-color="#1A535C" flood-opacity="0.7"` + `feOffset dx=8 dy=8` + `feGaussianBlur stdDeviation=3`，PPT 端 `<a:outerShdw>` 颜色 `#1A535C`（来自 feFlood 而非 element fill）。

---

## 覆盖率矩阵

| 类别 | 元素 / 原语 | 状态 | 备注 |
|---|---|---|---|
| 资源 | `<pattern>` | ✅ | 按 tile 网格铺子图元，patternTransform 暂不连续 |
| 资源 | `<linearGradient>` | ✅ | gradientTransform 在 SVG 层预变换 |
| 资源 | `<radialGradient>` | ⏸ Defer | pptxgenjs 不支持 `<a:path path="circle">`；fallback 到 first-stop 纯色 |
| 资源 | `<clipPath>` | ✅ | 只支持单 rect 子图元 |
| 资源 | `<mask>` | ✅ | `luminance * fill-opacity` 折入 fill transparency |
| 资源 | `<filter>` 链 | ✅ | 投影类完整支持 |
| 滤镜 | `feGaussianBlur` | ✅ | 已支持（Phase 0 前） |
| 滤镜 | `feOffset` | ✅ | 已支持（Phase 0 前） |
| 滤镜 | `feMerge` | ✅ | 已支持（Phase 0 前） |
| 滤镜 | `feComponentTransfer` | ✅ | 已支持（Phase 0 前） |
| 滤镜 | `feDropShadow` | ✅ | 新增（Phase 0.2A） |
| 滤镜 | `feFlood` | ✅ | 在 feOffset+blur 链中读取 flood-color |
| 滤镜 | `feColorMatrix` matrix | ✅ | 解析到 SIF，但 PPTX 端不消费（保持原色） |
| 滤镜 | `feColorMatrix` saturate | ✅ | 0 → BT.601 luma 灰度 |
| 滤镜 | `feColorMatrix` hueRotate | ✅ | 任意度数 → HSL 色相旋转（solid fill only） |
| 滤镜 | `feColorMatrix` luminanceToAlpha | ⚠️ 解析 | PPTX 端不消费 |

---

## 未实现 / Defer 项

| 项 | 原因 | 后续路径 |
|---|---|---|
| `<radialGradient>` 真渲染 | pptxgenjs (本地 fork) 只 emit `<a:lin>` 线性渐变，不 emit `<a:path path="circle">` | (a) monkey-patch `genXmlColorSelection` 加 `<a:path path="circle">` 分支；(b) 后处理 XML 正则替换 `<a:lin>` → `<a:path path="circle">` |
| `<pattern>` 的 `patternTransform` 旋转视觉连续 | 无 SVG→PNG 栅格化器，旋转的子图元之间有三角缝 | (a) 接入 `@resvg/resvg-js` 把 tile 渲染为 PNG 用 picture fill；(b) shape-level `crop` 截断边缘 |
| `feColorMatrix` per-stop 灰度 / 色相（gradient / pattern） | 灰度 / 色相只对 solid fill 生效，per-stop 实现更复杂 | 等遇到真实 SVG 再补 |
| `feColorMatrix` `luminanceToAlpha` | PPTX 端无对应概念 | 需要栅格化或 shader 实现 |

---

## 相关文件

- **核心实现**：
  - `src/svg/converters/pattern.ts` — `<pattern>` → PatternTemplate
  - `src/svg/converters/clip-path.ts` — `<clipPath>` → ClipPathResource
  - `src/svg/converters/mask.ts` — `<mask>` → MaskResource
  - `src/svg/converters/filter.ts` — `<filter>` 解析（feDropShadow / feFlood / feColorMatrix / feGaussianBlur / feOffset / feMerge / feComponentTransfer）
  - `src/svg/converters/gradient.ts` — `<linearGradient>` + `<radialGradient>` + `gradientTransform` 预变换
  - `src/pptx/converters/shape.ts` — `convertFill`（radial fallback / solid colour）/ `convertEffect`（saturate / hueRotate / dropShadow）/ `applyClipPathAndMask`
  - `src/pptx/generator.ts` — `addPatternFilledShape`（per-tile 网格铺 / patternTransform 旋转 / bbox 裁切）
- **类型**：
  - `src/sif/types/style/fill.ts` — `Fill = SolidFill | GradientFill | PatternFill | NoneFill`
  - `src/sif/types/style/gradient.ts` — `LinearGradient` / `RadialGradient`（带 transform 字段）
  - `src/sif/types/style/effect.ts` — `VisualEffect`（含 `ShadowEffect` / `BlurEffect` / `GlowEffect` / `DropShadowEffect` / `OuterGlowEffect` / `ColorMatrixEffect` / `FloodEffect`）
  - `src/sif/types/document.ts` — `SlideResources`（clipPaths / masks / patterns）
- **fixture & 评审**：
  - `example/phase0-2a/batch-a-fixture.svg` — 综合 fixture（10 个 panel）
  - `output/phase0-2a/batch-a-fixture.pptx` — 对应 PPTX（v9，135KB / 257 p:sp）
  - `tests/svg/batch-a-resources.test.ts` — 11 个 jest case
  - `ROADMAP.md` 风险 6 / 7 记录了 defer 项 + 后续路径
  - `example/phase0-2a/径向渐变.pptx` — 用户手动创建的 PowerPoint 径向渐变 XML 参考
