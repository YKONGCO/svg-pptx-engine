# 05-filters

SVG 滤镜：feDropShadow / feGaussianBlur / feColorMatrix / feFlood / feOffset / feMerge / feComponentTransfer 各种原语及其组合。

## 文件

| 文件 | 内容 |
|------|------|
| `01-drop-shadow.svg` | feDropShadow 各种 dx/dy/blur/color/opacity（矩形/圆/路径/文字） |
| `02-gaussian-blur.svg` | feGaussianBlur stdDeviation=2/5/10 + SourceAlpha 经典 shadow + feMerge 叠加 |
| `03-color-matrix.svg` | feColorMatrix saturate=0（灰度）+ hueRotate 60/120/180/240/300/-90 |
| `04-flood-chain.svg` | feFlood + feOffset + feGaussianBlur 链（自定义阴影色） |
| `05-filter-chain.svg` | 经典软阴影配方 + 阴影 + hueRotate 链 + flood+merge + teal overlay glow |

## 转换器

- `src/svg/converters/filter.ts` — feDropShadow / feFlood / feColorMatrix / feGaussianBlur / feOffset / feMerge / feComponentTransfer
- `src/pptx/converters/shape.ts` `convertEffect` — saturate / hueRotate / dropShadow

## PPTX 映射

| SVG | PPTX |
|-----|------|
| feDropShadow | `<a:outerShdw>` |
| feGaussianBlur | `<a:blur>` |
| feColorMatrix saturate=0 | solid fill 走 BT.601 luma 转灰度 |
| feColorMatrix hueRotate | solid fill 走 HSL 空间色相旋转 |
| feFlood + feOffset + feGaussianBlur | `<a:outerShdw>`（flood-color 作为阴影色） |

## 已知问题

- `feColorMatrix` per-stop 灰度 / 色相（gradient / pattern）— 仅 solid fill 支持
- `luminanceToAlpha` — PPTX 端无对应概念（需栅格化或 shader）
