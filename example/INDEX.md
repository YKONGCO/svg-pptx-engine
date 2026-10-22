# Example Index

全局索引矩阵：维度 → 文件 → 覆盖 SVG 属性 / 元素 / 特性。

> ✅ 已实现 + 视觉正确 | ⚠️ 部分支持 / 有降级 | ⏸ DEFER / 不支持 | 🧪 负向测试

## 01-shapes — 基础图形

| 文件 | 覆盖 |
|------|------|
| ✅ 01-basic-shapes.svg | rect/circle/ellipse/line/polygon/polyline/path 七大基础形状 |
| ✅ 02-path-commands.svg | path d 完整命令集：M L H V C S Q T A Z |
| ✅ 03-rounded-rect.svg | rx / ry 各种组合：尖角 / 微圆角 / 大圆角 / 椭圆角 / 胶囊形 |

## 02-fill-stroke — 填充与描边

| 文件 | 覆盖 |
|------|------|
| ✅ 01-solid-fill.svg | named / 3-hex / 6-hex / 8-hex / rgb() / rgba() / fill-opacity / element opacity / transparent |
| ✅ 02-stroke-styles.svg | stroke-width / stroke-dasharray / stroke-linecap / stroke-linejoin / stroke-opacity |
| ✅ 03-fill-rule.svg | fill-rule: nonzero vs evenodd（五角星 + 同心圆） |
| ✅ 04-none-fill.svg | fill="none" / 父 g 继承 / 与 fill-opacity="0" 区别 / 描边文字 |

## 03-gradients — 渐变

| 文件 | 覆盖 |
|------|------|
| ✅ 01-linear-basic.svg | 线性渐变 4 方向（0°/90°/45°/180°）+ 部分区间 + 3 段 stop |
| ✅ 02-linear-rotation.svg | gradientTransform rotate 0/30/60/90/120/180（验证预变换到 PPTX ang） |
| ⚠️ 03-linear-spread.svg | spreadMethod: pad/reflect/repeat — reflect/repeat 降级为 pad |
| ⏸ 04-radial-basic.svg | radialGradient — DEFER（fallback to first-stop） |
| ✅ 05-stroke-gradient.svg | stroke 引用 linearGradient（边框渐变） |
| ✅ 06-gradient-inheritance.svg | xlink:href 继承 + 改写 stops/offset |

## 04-patterns — 图案填充

| 文件 | 覆盖 |
|------|------|
| ✅ 01-dot-pattern.svg | 圆点 / 圆环 / 方点 / 棋盘 / 蜂窝 pattern tile |
| ✅ 02-stripe-grid.svg | 竖纹 / 横纹 / 网格 / 斜纹 / 间隔横竖纹 |
| ⚠️ 03-pattern-transform.svg | patternTransform 旋转 0/15/30/45/60/90 — 视觉不连续（三角缝） |

## 05-filters — 滤镜

| 文件 | 覆盖 |
|------|------|
| ✅ 01-drop-shadow.svg | feDropShadow 各种 dx/dy/blur/color/opacity（矩形/圆/路径/文字） |
| ✅ 02-gaussian-blur.svg | feGaussianBlur stdDeviation=2/5/10 + SourceAlpha 经典 shadow + feMerge 叠加 |
| ✅ 03-color-matrix.svg | feColorMatrix saturate=0（灰度）+ hueRotate 60/120/180/240/300/-90 |
| ✅ 04-flood-chain.svg | feFlood + feOffset + feGaussianBlur 链（自定义阴影色） |
| ✅ 05-filter-chain.svg | 经典软阴影配方 + 阴影 + hueRotate 链 + flood+merge + teal overlay glow |

## 06-clip-and-mask — 裁剪与遮罩

| 文件 | 覆盖 |
|------|------|
| ✅ 01-clip-rect.svg | clipPath 基础 + 偏移 + 旋转 + 多 shape 共享 + 圆形 clip（DEFER） |
| ✅ 02-mask-alpha.svg | mask 各种 alpha（0.4/1.0/black/gray/渐变）+ 多 mask rect（DEFER） |

## 07-text — 文本

| 文件 | 覆盖 |
|------|------|
| ✅ 01-text-basics.svg | text-anchor / dominant-baseline / font-family / weight / style / 字号梯度 |
| ✅ 02-text-decoration.svg | underline / line-through / overline / 颜色装饰 / letter-spacing / word-spacing / text-transform |
| ✅ 03-tspan-rotate.svg | tspan rotate 单字符 / 螺旋 / 负角度 / 混合角度 / 旋转 + 颜色 |
| ✅ 04-tspan-baseline-shift.svg | baseline-shift sub/super + 显式像素 + 百分比 + footnote 引用 |
| ✅ 05-tspan-styling.svg | tspan 改色/字号/字体/字重/字形 + 复杂富文本组合 |
| ✅ 06-textLength.svg | textLength + lengthAdjust (spacing / spacingAndGlyphs) + 压缩/拉伸 |
| ✅ 07-xml-space.svg | xml:space=preserve 保留空白 |
| ✅ 08-textPath.svg | textPath 沿直线/二次曲线/三次曲线/圆 + startOffset |
| ✅ 09-foreignObject.svg | foreignObject HTML 白名单（h1-h3/p/strong/em/ul/ol/a/table） |
| ✅ 10-text-positioning.svg | **文本定位回归**：坐标系 + 文本框外贴框 + 圆心/矩形居中 + 旋转 + 边界 + 业务 |
| 🧪 _legacy_from_phase0-2b/01-batch-b-fixture.svg | 9 panel 旧 fixture |
| 🧪 _legacy_from_phase1/01-phase1-fixture.svg | 6 panel 旧 fixture（math/LaTeX） |

## 08-transforms — 变换

| 文件 | 覆盖 |
|------|------|
| ✅ 01-translate.svg | translate 各种 (单组/负向/no-op/嵌套/g 平移/平移+旋转) |
| ✅ 02-rotate-scale.svg | rotate / rotate(deg,cx,cy) / scale 均匀 / scale 非均匀 / scale(-1) 翻转 / 组合 |
| ✅ 03-matrix-skew.svg | matrix(a,b,c,d,e,f) / skewX / skewY / 复合 skew / 嵌套 g 累计变换 |

## 09-groups-and-use — 组与引用

| 文件 | 覆盖 |
|------|------|
| ✅ 01-basic-group.svg | g 共享 fill/stroke/transform/opacity + 嵌套 g |
| ✅ 02-use-symbol.svg | use 引用 path/symbol/group + 改 x/y/width/height 缩放 |
| ✅ 03-nested-svg.svg | nested <svg> viewport 缩放 + transform + 深度嵌套 + overflow |
| ✅ 04-nested-svg-composition.svg | 综合案例（来自 嵌套SVG测试/） |

## 10-layout — 布局

| 文件 | 覆盖 |
|------|------|
| ✅ 01-block-flow.svg | block 容器（基础/gap/padding/嵌套/文本） |
| ✅ 02-flex-row.svg | flex row 默认/space-between/space-around/center/gap |
| ✅ 03-flex-column-wrap.svg | flex column / align-items / flex-wrap / stretch |
| ✅ 04-grid-2x2.svg | grid 2x2 / auto / 1fr / gap / 不等列宽 / 嵌套 dashboard |
| ✅ 05-cjk-z-overflow.svg | CJK measure / 中日韩混排 / z-index 排序 / z-index 负值 / overflow:clip |
| 🧪 _legacy_from_phase3/01-phase3-fixture.svg | 6 panel 旧 fixture |

## 11-lines-and-markers — 线条与箭头

| 文件 | 覆盖 |
|------|------|
| ✅ 01-line-marker.svg | <line> + marker-start/end + 三角/圆/菱/箭头 marker + orient=auto |
| ✅ 02-polyline-polygon.svg | polyline 折线 + round join + marker 节点 + polygon + 折线图 |

## 12-media — 媒体

| 文件 | 覆盖 |
|------|------|
| ✅ 01-image-remote.svg | 远程图片 + 本地图片 + 视频 + 音频 + preserveAspectRatio + 图片滤镜 |
| ✅ 02-nested-svg-icon.svg | 嵌套 SVG icon（来自 嵌套SVG测试/nested-svg-composition.svg 副本） |
| ✅ 03-public-media-assets.svg | 公开媒体资源（图片/视频/音频 URL） |

## 13-composite — 综合场景

| 文件 | 覆盖 |
|------|------|
| ✅ 01-dashboard.svg | 数据仪表盘（KPI 卡片 + 折线图 + 进度条 + 软阴影） |
| ✅ 02-process-flow.svg | 业务流程图（5 步 + marker 箭头 + 阴影 + 配色） |
| ✅ 03-timeline.svg | 项目时间轴（渐变 stroke + 节点 + 上下交错卡片） |
| ✅ 04-P01-cover.svg | 真实业务封面（重庆 2025 报告） |

## 14-charts — 图表合集

> 来源：原 `测试通过/` 33 种图表 + 10 张幻灯片。详见 `14-charts/README.md`。

涵盖：bar / line / pie / donut / area / stacked / grouped / horizontal / heatmap / scatter / bubble / radar / box_plot / bullet / butterfly / dual_axis / dumbbell / funnel / gauge / gantt / pareto / progress / sankey / treemap / waterfall + slide_01-10 + kpi_cards / matrix_2x2 / org_chart / porter_five_forces / process_flow / swot / timeline / latex_test。

## 99-defer-and-negative — DEFER / 负向

| 文件 | 覆盖 |
|------|------|
| 🧪 01-deferred-features.svg | radialGradient / patternTransform rotate / clipPath 多形状/圆形 / per-stop colorMatrix / 多 feFlood / spreadMethod=reflect |
| 🧪 02-edge-cases.svg | 空属性 / 极小 / 零宽高 / 负坐标 / 巨大 / 异常颜色 / 重复 id / 不闭合 path / 空文本 / 完全透明 / 异常 transform / 巨长 transform 链 |
| 📖 03-spec-compliant-example.svg | 推荐写法参考（来自 SVG转PPTX规范/） |
| 📖 04-SVG-PPTX-Spec.md | SVG→PPTX 代码规范文档 |
| 🧪 _legacy_from_phase0-2a/01-batch-a-fixture.svg | 10 panel 旧 fixture |
| 🧪 _legacy_from_phase0-2a/02-径向渐变-reference.pptx | 手工 PowerPoint 径向渐变参考 |

## 总体覆盖矩阵

| 类别 | 元素 / 特性 | 状态 |
|------|------------|------|
| 基础图形 | rect/circle/ellipse/line/polygon/polyline/path | ✅ |
| 路径命令 | M L H V C S Q T A Z | ✅ |
| 填充 | solid / none / opacity / fill-rule | ✅ |
| 描边 | width / dash / linecap / linejoin / opacity | ✅ |
| 渐变 | linear (含 transform) | ✅ |
| 渐变 | radial (真渲染) | ⏸ DEFER |
| 渐变 | spreadMethod=reflect/repeat | ⚠️ 降级 pad |
| 渐变 | xlink:href 继承 | ✅ |
| 图案 | `<pattern>` 基础 | ✅ |
| 图案 | patternTransform rotate | ⚠️ 视觉不连续 |
| 滤镜 | feDropShadow | ✅ |
| 滤镜 | feGaussianBlur | ✅ |
| 滤镜 | feColorMatrix saturate=0 | ✅ |
| 滤镜 | feColorMatrix hueRotate | ✅ |
| 滤镜 | feFlood + feOffset + feGaussianBlur 链 | ✅ |
| 滤镜 | feMerge / feComponentTransfer | ✅ |
| 裁剪 | clipPath (单 rect) | ✅ |
| 裁剪 | clipPath (多形状/圆形) | ⏸ DEFER |
| 遮罩 | mask (单 rect) | ✅ |
| 遮罩 | mask (多 rect) | ⚠️ 消费首 rect |
| 文本 | tspan rotate/baseline-shift | ✅ |
| 文本 | textLength / lengthAdjust | ✅ |
| 文本 | textPath | ✅ |
| 文本 | foreignObject | ✅ |
| 变换 | translate / rotate / scale / matrix / skew | ✅ |
| 组 | g / use / symbol | ✅ |
| 嵌套 | nested `<svg>` viewport | ✅ |
| 布局 | block / flex / grid (项目实验) | 🧪 实验性，git history 保留 |
| 媒体 | image / video / audio | ✅ |
| 媒体 | nested svg icon | ✅ |
| 线条 | line / polyline / polygon | ✅ |
| 标记 | marker (三角/圆/菱/箭头) | ✅ |
| 媒体 | audio x/y/width/height 映射 | ⚠️ 部分 DEFER |
