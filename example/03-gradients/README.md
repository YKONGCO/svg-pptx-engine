# 03-gradients

线性渐变（linearGradient）、径向渐变（radialGradient）、渐变变换（gradientTransform）、spreadMethod、stroke 渐变、xlink:href 继承。

## 文件

| 文件 | 内容 |
|------|------|
| `01-linear-basic.svg` | 4 方向（0°/90°/45°/180°）+ 部分区间 + 3 段 stop |
| `02-linear-rotation.svg` | gradientTransform rotate 0/30/60/90/120/180（验证 PPTX `ang` 正确性） |
| `03-linear-spread.svg` | spreadMethod pad / reflect / repeat — reflect/repeat 当前降级为 pad |
| `04-radial-basic.svg` | radialGradient — ⚠️ DEFER，PPTX 端降级到 first-stop 纯色 |
| `05-stroke-gradient.svg` | stroke 引用 linearGradient（边框渐变 + 双渐变组合） |
| `06-gradient-inheritance.svg` | xlink:href 继承父 stops + 改写 offset/颜色 |

## 转换器

- `src/svg/converters/gradient.ts` — `<linearGradient>` + `<radialGradient>` + `gradientTransform` 预变换
- `src/pptx/converters/shape.ts` `convertFill` — radial fallback 到 first-stop

## 已知问题

- `radialGradient` 真渲染 — `pptxgenjs` 本地 fork 不 emit `<a:path path="circle">`，只 emit `<a:lin>` 线性渐变
  - 后续路径：monkey-patch `genXmlColorSelection` 加 `<a:path path="circle">` 分支 / 后处理 XML 正则替换
- `spreadMethod=reflect` / `repeat` — PPTX 端无对应概念，降级为 pad
- `feColorMatrix` per-stop 灰度 / 色相（gradient / pattern）— 暂不支持 per-stop
