# 媒体素材 SVG 测试

这个目录用于验证 `SVG -> SIF -> PPTX` 链路对公开媒体资源的处理。

包含文件：

- `public-media-assets.svg`：单页媒体测试 SVG，包含远程图片、视频、音频 URL

公开资源来源：

- 图片：`https://www.w3schools.com/html/img_chania.jpg`
- 视频：`https://www.w3schools.com/html/mov_bbb.mp4`
- 音频：`https://www.w3schools.com/html/horse.mp3`

注意：

- 当前实现中，SVG `audio` 元素会进入 SIF 和 PPTX，但 `x/y/width/height` 还没有从 SVG 映射过去，所以 PPT 中音频图标的位置和大小仍是默认行为。
- 远程媒体在生成 PPTX 时需要运行环境能够访问这些 URL。
