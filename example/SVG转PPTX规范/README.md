# SVG 转 PPTX 技术规范

本规范用于约束“输入 SVG”在进入本项目的 `svg -> sif -> pptx` 转换链路时的代码格式、可用特性和推荐写法。

目标不是覆盖完整 SVG 标准，而是定义一套**稳定、可预测、适合生成 PPTX** 的 SVG 子集。

适用对象：

- 使用 LLM / 模板程序自动生成 SVG
- 人工编写需要转换成 PPTX 的 SVG 页面
- 需要在 SVG 中嵌入图片、视频、音频、嵌套图标等内容的场景

相关样例：

- 推荐样例：[spec-compliant-example.svg](./spec-compliant-example.svg)
- 媒体样例：[../媒体素材测试/public-media-assets.svg](../媒体素材测试/public-media-assets.svg)
- 嵌套 SVG 样例：[../嵌套SVG测试/nested-svg-composition.svg](../嵌套SVG测试/nested-svg-composition.svg)

## 1. 设计原则

用于转 PPTX 的 SVG 应遵循以下原则：

1. 页面尺寸必须明确，布局必须绝对定位。
2. 尽量使用基础图形和显式属性，不依赖浏览器专属渲染能力。
3. 允许视觉保真度略低于浏览器，但必须保证结构、位置、层级和主要样式稳定。
4. 优先选择“确定能转”的写法，而不是“浏览器里能显示”的写法。

## 2. 推荐文件结构

推荐根节点固定写法：

```xml
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="1280"
  height="720"
  viewBox="0 0 1280 720">
  <defs>
    <!-- 渐变、滤镜、marker 等定义 -->
  </defs>

  <!-- 页面内容 -->
</svg>
```

要求：

- 必须提供 `xmlns`
- 必须提供明确的 `width`、`height`
- 强烈建议提供与页面一致的 `viewBox`
- 坐标系建议使用像素风格的数值坐标

不推荐：

```xml
<svg xmlns="http://www.w3.org/2000/svg">
```

原因：

- 缺少页面尺寸会导致 PPT 页尺寸和元素定位不稳定

## 3. 当前稳定支持的元素

当前转换器显式支持以下元素：

- `<rect>`
- `<circle>`
- `<ellipse>`
- `<path>`
- `<line>`
- `<polygon>`
- `<polyline>`
- `<text>`
- `<image>`
- `<video>`
- `<audio>`
- `<g>`
- `<svg>`：作为嵌套子 viewport 使用

附加支持：

- `<defs>` 中的 `linearGradient`、`radialGradient`
- `<defs>` 中的部分 `filter`
- `<line>` 的 marker 箭头
- `<text>` 中的 `<tspan>`

未显式支持或不保证稳定的能力：

- `<foreignObject>`
- `<symbol>` / `<use>`
- `<mask>`
- `<clipPath>`
- `<pattern>`
- `<style>` 标签内的复杂 CSS
- 依赖浏览器布局引擎的文本排版特性

这些能力即使浏览器能显示，也不应作为 SVG 转 PPTX 的输入规范。

## 4. 坐标与尺寸规范

### 4.1 必须使用绝对布局

推荐：

```xml
<rect x="80" y="120" width="320" height="160" />
<text x="96" y="156">Quarterly Revenue</text>
```

不推荐：

- 依赖复杂百分比布局
- 依赖 CSS 布局模型
- 依赖浏览器自动换行和自动居中

### 4.2 数值使用要求

推荐：

- 使用纯数字或小数，例如 `120`、`36.5`
- 避免单位混写，如 `12px`、`3rem`、`50vh`

说明：

- 当前链路主要按数值坐标处理，最稳定的写法是直接使用数字

### 4.3 根页面尺寸建议

常用推荐尺寸：

- `1280 x 720`
- `1920 x 1080`
- `960 x 540`

这类尺寸转换成 PPT 页面更直观，也更适合和前端 / 设计稿同步。

## 5. 分组与嵌套 SVG 规范

### 5.1 `<g>` 的使用规范

`<g>` 适合用于：

- 分组管理层级
- 批量继承 `opacity`、`visibility`、`transform`
- 组织图表局部结构

推荐：

```xml
<g transform="translate(120, 80)" opacity="0.9">
  <rect x="0" y="0" width="240" height="120" rx="16" />
  <text x="24" y="36">Card Title</text>
</g>
```

### 5.2 嵌套 `<svg>` 的使用规范

嵌套 `<svg>` 适合用于：

- 内嵌图标
- 独立小组件
- 在父页面中放一个局部子坐标系

推荐写法：

```xml
<svg x="420" y="120" width="120" height="120" viewBox="0 0 24 24">
  <rect x="0" y="0" width="24" height="24" rx="6" fill="#DBEAFE" />
  <path d="M6 12 L10 16 L18 8" fill="none" stroke="#2563EB" stroke-width="2.5" />
</svg>
```

规范要求：

- 必须同时写 `x`、`y`、`width`、`height`
- 强烈建议写 `viewBox`
- 内容应使用该子 `viewBox` 内的局部坐标

当前实现说明：

- 嵌套 `<svg>` 已支持 `x/y/width/height/viewBox`
- 嵌套 `<svg>` 自身的 `transform` 已支持
- 当前不建议依赖嵌套 `<svg>` 的 `preserveAspectRatio` 进行复杂对齐，因为这部分没有专门建模，最稳妥的方式是直接把 `viewBox` 设计成与 `width/height` 比例一致

## 6. 图形与线条规范

### 6.1 推荐优先级

在能表达同样结构的前提下，推荐优先级如下：

1. `rect` / `circle` / `ellipse`
2. `line`
3. `polygon` / `polyline`
4. `path`

原因：

- 基础图形的边界和样式更稳定
- `path` 最灵活，但也最容易因为复杂命令造成边界计算和编辑困难

### 6.2 线条写法

推荐：

```xml
<line
  x1="120" y1="240"
  x2="420" y2="240"
  stroke="#2563EB"
  stroke-width="4"
  stroke-linecap="round" />
```

支持的常见属性：

- `stroke`
- `stroke-width`
- `stroke-opacity`
- `stroke-linecap`
- `stroke-linejoin`
- `stroke-dasharray`
- `marker-start`
- `marker-end`

### 6.3 渐变线条

当前链路已支持将**线性渐变 stroke** 映射为 PPTX 渐变边框。

推荐：

```xml
<defs>
  <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#F94144" />
    <stop offset="100%" stop-color="#577590" />
  </linearGradient>
</defs>

<line
  x1="80" y1="120"
  x2="400" y2="120"
  stroke="url(#lineGrad)"
  stroke-width="6"
  stroke-linecap="round" />
```

约束：

- 建议仅对线性渐变 stroke 使用该能力
- 径向渐变 stroke 当前不应作为规范输入

## 7. 填充与颜色规范

### 7.1 颜色格式

推荐：

- `#RRGGBB`
- `rgb(r,g,b)`
- 常见命名色，如 `red`、`black`

最推荐：

```xml
fill="#0F172A"
stroke="#CBD5E1"
```

不推荐：

- 混杂多种颜色表示方式
- 过度依赖浏览器私有颜色写法

### 7.2 填充类型

当前稳定支持：

- 纯色填充
- `fill="none"`
- `linearGradient`
- `radialGradient`

推荐：

```xml
<defs>
  <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#FFFFFF" />
    <stop offset="100%" stop-color="#E2E8F0" />
  </linearGradient>
</defs>

<rect x="60" y="80" width="300" height="160" fill="url(#cardBg)" />
```

## 8. 文本规范

### 8.1 推荐写法

推荐显式声明：

- `x`
- `y`
- `font-family`
- `font-size`
- `fill`

示例：

```xml
<text
  x="80"
  y="120"
  font-family="Arial"
  font-size="28"
  font-weight="700"
  fill="#0F172A">
  Revenue Overview
</text>
```

### 8.2 文本内容约束

推荐：

- 每个文本块内容较短
- 标题、副标题、标签分开写
- 多样式文本使用 `<tspan>`

推荐多段文本：

```xml
<text x="80" y="160" font-family="Arial" font-size="16" fill="#334155">
  <tspan font-weight="700">Q1:</tspan>
  <tspan> Revenue increased by 24%</tspan>
</text>
```

### 8.3 不推荐写法

- 依赖复杂 CSS 类控制文字
- 依赖浏览器自动换行
- 超长段落直接放进一个 `<text>`
- 依赖 `textLength`、高级文本路径等浏览器排版特性

### 8.4 字体建议

推荐优先使用：

- `Arial`
- `Calibri`
- `Microsoft YaHei`
- `sans-serif`

原因：

- 这类字体在办公环境和 PowerPoint 中更容易保持一致

## 9. 样式继承与 `style` 属性规范

当前链路支持两类样式表达：

- 直接属性，例如 `fill="#fff"`
- `style` 属性中的简单键值对，例如 `style="fill:#fff;stroke:#000"`

推荐：

```xml
<rect x="0" y="0" width="100" height="40" fill="#0EA5E9" stroke="#0284C7" />
```

可接受：

```xml
<rect x="0" y="0" width="100" height="40" style="fill:#0EA5E9;stroke:#0284C7" />
```

不推荐：

```xml
<style>
  .card { fill: white; }
</style>
<rect class="card" />
```

原因：

- 当前转换器不会完整解析 CSS 选择器体系

## 10. 变换规范

当前稳定支持的变换：

- `translate(...)`
- `scale(...)`
- `rotate(...)`
- `matrix(...)`
- `skewX(...)`
- `skewY(...)`

推荐：

- 优先使用 `translate`、`rotate`
- 复杂场景可使用 `matrix`
- 如果元素很多，优先把变换收敛到局部分组或嵌套 `<svg>`

不推荐：

- 在同一元素上叠加过多复杂变换
- 依赖浏览器在复杂路径上的特殊变换行为

## 11. 媒体元素规范

当前支持：

- `<image>`
- `<video>`
- `<audio>`

### 11.1 图片

推荐：

```xml
<image
  x="80" y="120"
  width="240" height="160"
  href="https://www.w3schools.com/html/img_chania.jpg" />
```

可用属性：

- `x`
- `y`
- `width`
- `height`
- `href`
- `opacity`
- `preserveAspectRatio`

### 11.2 视频

推荐：

```xml
<video
  x="360" y="120"
  width="280" height="160"
  href="https://www.w3schools.com/html/mov_bbb.mp4"
  controls="true" />
```

可用属性：

- `x`
- `y`
- `width`
- `height`
- `href`
- `poster`
- `controls`
- `autoplay`
- `loop`
- `muted`

说明：

- 远程视频资源最终由 `pptxgenjs` 在导出 PPTX 时请求
- `poster` 建议优先使用 `data:` URI；远程 URL 不应作为强依赖

### 11.3 音频

推荐：

```xml
<audio
  x="680" y="120"
  width="120" height="36"
  href="https://www.w3schools.com/html/horse.mp3"
  controls="true" />
```

可用属性：

- `x`
- `y`
- `width`
- `height`
- `href`
- `autoplay`
- `loop`
- `muted`
- `controls`

说明：

- 音频图标的位置和尺寸会进入 PPTX
- 如果资源是远程 URL，下载发生在 PPTX 导出阶段

## 12. `defs` 使用规范

`defs` 中建议仅放转换链路明确支持的定义：

- `linearGradient`
- `radialGradient`
- `marker`
- 简单 `filter`

推荐：

```xml
<defs>
  <linearGradient id="gradA" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#38BDF8" />
    <stop offset="100%" stop-color="#2563EB" />
  </linearGradient>
</defs>
```

避免：

- 放入大量未使用定义
- 放入依赖浏览器实现的复杂特性

## 13. 滤镜规范

当前只建议使用“投影类”的简单滤镜。

推荐范围：

- `feGaussianBlur`
- `feOffset`
- `feComponentTransfer`
- `feMerge`

推荐示例：

```xml
<filter id="shadow1">
  <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
  <feOffset dx="1" dy="3"/>
  <feComponentTransfer>
    <feFuncA type="linear" slope="0.25"/>
  </feComponentTransfer>
  <feMerge>
    <feMergeNode/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
```

不推荐：

- 颜色矩阵特效
- 高级光照 / 位移 / 混合模式滤镜

## 14. 层级与顺序规范

SVG 中元素顺序会影响 PPTX 中的层级顺序。

要求：

- 背景先写
- 内容后写
- 装饰性覆盖元素最后写

推荐顺序：

1. 背景块
2. 图表主体
3. 图标和数据标签
4. 说明文字
5. 装饰高光

## 15. 推荐生成约束

如果 SVG 是由模型或程序生成，建议额外遵守以下规则：

1. 每个元素都写完整属性，不依赖隐式默认值。
2. 每个渐变和滤镜都必须有唯一 `id`。
3. 文本必须显式给出 `font-family` 和 `font-size`。
4. 所有媒体元素必须显式给出 `x/y/width/height`。
5. 嵌套 `<svg>` 必须显式给出 `x/y/width/height/viewBox`。
6. 尽量避免生成多余空分组和空定义。
7. 颜色统一使用大写 6 位十六进制色值。

## 16. 推荐样例

完整推荐样例见：

- [spec-compliant-example.svg](./spec-compliant-example.svg)

该样例覆盖了：

- 根页面尺寸
- 渐变背景
- 卡片布局
- 文本
- 渐变描边
- 图片 / 视频 / 音频
- 嵌套 `<svg>`

## 17. 最小合规模板

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="panelBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#E2E8F0" />
    </linearGradient>
  </defs>

  <rect x="40" y="40" width="1200" height="640" rx="24" fill="url(#panelBg)" />

  <text x="80" y="120" font-family="Arial" font-size="32" font-weight="700" fill="#0F172A">
    Slide Title
  </text>

  <svg x="80" y="160" width="96" height="96" viewBox="0 0 24 24">
    <rect x="0" y="0" width="24" height="24" rx="6" fill="#DBEAFE" />
    <path d="M6 12 L10 16 L18 8" fill="none" stroke="#2563EB" stroke-width="2.5" />
  </svg>

  <image x="220" y="160" width="220" height="140" href="https://example.com/example.jpg" />
</svg>
```

## 18. 不合规示例

不推荐：

```xml
<svg xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font-size: 32px; fill: #000; }
  </style>
  <foreignObject x="0" y="0" width="300" height="200">
    <div>Hello</div>
  </foreignObject>
  <use href="#iconA" />
</svg>
```

问题：

- 缺少页面尺寸
- 依赖 `<style>` 选择器
- 使用 `foreignObject`
- 使用 `<use>`
- 不符合当前转换器的稳定支持范围

## 19. 验证建议

每次新增 SVG 模板后，建议至少做以下验证：

1. `svgToSif()` 后检查元素数量、类型和关键坐标。
2. 导出 `pptx` 后解压检查 `ppt/slides/slide*.xml`。
3. 在 PowerPoint 中人工查看文字、媒体、层级和渐变是否正确。
4. 如果包含远程媒体，验证导出机器的网络环境是否允许请求这些资源。

## 20. 结论

对这个项目来说，最佳实践不是“写最标准的 SVG”，而是“写最适合转换的 SVG”。

请把输入 SVG 当成一种**面向 PPTX 导出的工程格式**来设计：

- 结构简单
- 坐标显式
- 元素明确
- 样式可预测
- 少依赖浏览器专属能力

这样生成出来的 PPTX 才会稳定、可维护、可批量生产。
