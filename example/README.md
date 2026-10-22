# svg-pptx-engine · example/

本目录是 **svg-pptx-engine** 项目的 SVG 测试样例库。每个 SVG 都是一个完整页面，**按"SVG→PPTX 转换维度"组织**——同目录下所有 fixture 验证同一类转换。

## 目录结构（按转换维度分类）

```
example/
├── _assets/                        # 共享资源（cover_bg.jpg 等）
│
├── 01-shapes/                      # 基础图形：rect/circle/ellipse/line/polygon/polyline/path
├── 02-fill-stroke/                 # 填充 + 描边（color/opacity/dash/linecap/linejoin/fill-rule/none）
├── 03-gradients/                   # 渐变（linear/radial + transform + spreadMethod + 继承）
├── 04-patterns/                    # 图案填充（dot/stripe/grid/checker + patternTransform 旋转）
├── 05-filters/                     # 滤镜（feDropShadow / feGaussianBlur / feColorMatrix / feFlood 链）
├── 06-clip-and-mask/               # 裁剪 + 遮罩
├── 07-text/                        # 文本（tspan/textPath/foreignObject/装饰/对齐）
├── 08-transforms/                  # 变换（translate/rotate/scale/skew/matrix/嵌套）
├── 09-groups-and-use/              # g / use / symbol / nested-svg
├── 10-layout/                      # 布局（block / flex / grid / CJK / z-index / overflow / latex）
├── 11-lines-and-markers/           # line / polyline / polygon / marker 箭头
├── 12-media/                       # image / video / audio / nested svg icon
├── 13-composite/                   # 综合场景（封面 / dashboard / 流程图 / 时间轴）
├── 14-charts/                      # 图表合集（33 种图表模板 + 10 张幻灯片）
└── 99-defer-and-negative/          # DEFER / 负向测试 / spec 参考
```

> 子目录内可能存在 `_legacy_from_phaseN/` —— 旧 phase N fixture 的归档位置，**保留以维持 git 历史**。

## 命名约定

每张 SVG 文件名格式：

```
NN-名字[-子名].svg
```

- `NN`：两位数字序号（01, 02, 03 ...），同目录内递增
- `名字`：简短中文/英文描述
- 文件中每个面板在左上角用小号灰色文字标号（`1) ...`, `2) ...`）

## 使用方法

### 1. 单独转换某个目录的 SVG

```bash
# 转换所有渐变测试为 PPTX
svg2pptx ./example/03-gradients -o output/gradients.pptx

# 转换单个文件
svg2pptx ./example/07-text/01-text-basics.svg -o output/text.pptx
```

### 2. 全量 fixture 评审

```bash
# 转换所有 example 到一个 PPTX（每页一个 SVG）
svg2pptx ./example -o output/all-fixtures.pptx
```

### 3. CI 回归

测试目录在 `tests/` 下，对每个 `_legacy_from_phaseN/01-batch-X-fixture.svg` 都有对应的 jest 测试 (`tests/svg/batch-X-resources.test.ts`)。新增 fixture 时建议：
- 覆盖新属性 / 新场景
- 在 `tests/svg/` 添加断言文件
- 更新 `doc/features/svg-coverage.md`

## 详见

- **INDEX.md** —— 全局索引矩阵：维度 → 文件 → 覆盖属性
- **doc/features/svg-coverage.md** —— SVG 元素 / 滤镜原语的实现状态
- **doc/sif.md** —— SIF 中间格式类型定义
- **99-defer-and-negative/04-SVG-PPTX-Spec.md** —— 编写"可转换"SVG 的代码规范
