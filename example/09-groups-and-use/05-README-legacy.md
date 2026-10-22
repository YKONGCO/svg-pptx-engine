# 嵌套 SVG 测试

这个目录用于验证以下场景：

- 根 `<svg>` 中直接嵌套子 `<svg>`
- 子 `<svg>` 通过 `x/y/width/height/viewBox` 建立独立 viewport
- 子 `<svg>` 自身带 `transform`
- 子 `<svg>` 内再嵌套一个小图标 `<svg>`

主样例文件：

- `nested-svg-composition.svg`

对应的导出脚本：

- `tests/demos/svg-nested-svg.js`

输出文件：

- `tests/output/svg-nested-svg-demo.pptx`
