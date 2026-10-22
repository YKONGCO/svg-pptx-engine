# 13-composite

综合场景验证：单一 SVG 中同时使用多种 SVG 特性（渐变 + 阴影 + 路径 + 文本 + 布局等），测试**多技术栈组合**在 SVG→SIF→PPTX 链路下的稳定性和视觉一致性。

## 文件

| 文件 | 内容 |
|------|------|
| `01-dashboard.svg` | 数据仪表盘（KPI 卡片 + 折线图 + 进度条 + 软阴影） |
| `02-process-flow.svg` | 业务流程图（5 步 + marker 箭头 + 阴影 + 配色） |
| `03-timeline.svg` | 项目时间轴（渐变 stroke + 节点 + 上下交错卡片） |
| `04-P01-cover.svg` | 真实业务封面（重庆 2025 报告 — 渐变 + 阴影 + CJK + KPI 卡片） |

## 验证要点

- 多重 `feGaussianBlur + feOffset + feComponentTransfer + feMerge` 滤镜链
- 多 stop 渐变（`linearGradient` 应用于 rect / stroke / text-fill）
- 嵌套 `g` + `transform` + `filter` 组合
- CJK 文本在渐变背景上的可读性
- `<marker>` 在 `<line>` 上的多端点
- `<polyline>` 折线 + 数据点（`<circle>`）+ 区域填充
- 大量子元素的渲染性能
