# 99-defer-and-negative

DEFER / 已知不支持 / 边界 / 异常输入 / 负向测试 / spec 参考。

## 文件

| 文件 | 用途 |
|------|------|
| `01-deferred-features.svg` | 视觉对照 — SVG 期望效果 vs PPTX 实际降级行为（radialGradient / patternTransform / clipPath / per-stop colorMatrix / 多 feFlood / spreadMethod=reflect） |
| `02-edge-cases.svg` | 边界 + 异常输入（空属性/极小/零宽高/负坐标/异常颜色/重复 id/不闭合 path/空文本/完全透明/异常 transform） |
| `03-spec-compliant-example.svg` | "可转换"SVG 推荐写法参考 |
| `04-SVG-PPTX-Spec.md` | SVG→PPTX 代码规范文档（编写指南） |

## 归档

| 路径 | 来源 |
|------|------|
| `_legacy_from_phase0-2a/01-batch-a-fixture.svg` | phase0-2a 综合 fixture（10 panel：pattern/clipPath/mask/feDropShadow/feFlood/feColorMatrix/gradientTransform/radialGradient） |
| `_legacy_from_phase0-2a/02-径向渐变-reference.pptx` | 手工 PowerPoint 径向渐变 XML 参考 |

## DEFER 清单（详见 `doc/features/svg-coverage.md`）

| 项 | 原因 | 后续路径 |
|---|------|----------|
| `<radialGradient>` 真渲染 | pptxgenjs (本地 fork) 只 emit `<a:lin>` | monkey-patch / 后处理 XML |
| `<pattern>` 旋转视觉连续 | 无 SVG→PNG 栅格化器 | 接入 @resvg/resvg-js |
| `feColorMatrix` per-stop 灰度/色相 | 仅 solid fill | 等待真实 SVG |
| `feColorMatrix` `luminanceToAlpha` | PPTX 无对应概念 | 栅格化 / shader |
| `clipPath` 多形状 / 非 rect | 单 rect 实现 | 扩展交集算法 |
| `mask` 多 rect | 单 rect 实现 | 扩展 alpha 计算 |
| `spreadMethod=reflect/repeat` | 降级为 pad | 暂无 |
| SVG `audio` x/y/width/height 映射 | 部分 DEFER | 扩展 audio 转换器 |
