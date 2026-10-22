# 06-clip-and-mask

`<clipPath>` 裁剪 + `<mask>` 遮罩（透明度叠加）。

## 文件

| 文件 | 内容 |
|------|------|
| `01-clip-rect.svg` | clipPath 基础 + 偏移 + 旋转 + 多 shape 共享 + 圆形 clip（DEFER） |
| `02-mask-alpha.svg` | mask 各种 alpha（0.4/1.0/black/gray/渐变）+ 多 mask rect（DEFER） |

## 转换器

- `src/svg/converters/clip-path.ts` — `<clipPath>` → ClipPathResource
- `src/svg/converters/mask.ts` — `<mask>` → MaskResource
- `src/pptx/converters/shape.ts` `applyClipPathAndMask` — shape bbox 与 clip rect 求交集

## 实现策略

**clipPath**：在 PPTX 端把 shape 的 bbox 与 clip rect 求交集，交集为空时把 shape 缩到 0 隐藏。

**mask**：mask 的有效 alpha = `luminance(fill-color) * fill-opacity`（白色 = 1，黑色 = 0，其他 = 0.5），折入 shape 的 fill transparency。

## 已知问题

- clipPath 默认 `userSpaceOnUse` — 裁剪矩形的坐标是 SVG 用户空间。fixture 中如果裁剪矩形和被裁 shape 的位置不重叠，交集为空，shape 会消失
- clipPath 内部 `<rect>` 子图元 — **只支持单 rect**，多形状 / 非 rect 子图元会 warn 跳过
- mask 内部 `<rect>` 子图元 — **只支持单 rect**，多 mask rect 消费首 rect
