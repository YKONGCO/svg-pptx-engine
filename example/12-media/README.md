# 12-media

`<image>` / `<video>` / `<audio>` 媒体资源 + 嵌套 SVG icon。

## 文件

| 文件 | 内容 |
|------|------|
| `01-image-remote.svg` | 远程图片 + 本地图片 + 视频 + 音频 + preserveAspectRatio + 图片滤镜 |
| `02-nested-svg-icon.svg` | 嵌套 SVG icon sprite |
| `03-public-media-assets.svg` | 公开媒体资源（w3schools 图片/视频/音频 URL） |

## 转换器

- `src/svg/converters/media.ts` — `<image>` / `<video>` / `<audio>` 解析
- `src/pptx/converters/image.ts` — ImageElement → PPTX picture
- `src/pptx/converters/video.ts` — VideoElement
- `src/pptx/converters/audio.ts` — AudioElement

## SIF 媒体类型

```typescript
interface ImageElement {
  type: 'image'
  href: string
  format?: 'png' | 'jpeg' | 'jpg' | 'gif' | 'svg' | 'webp' | 'bmp'
  preserveAspectRatio?: boolean
  crop?: CropRect
  flipH?: boolean
  flipV?: boolean
  filter?: 'none' | 'grayscale' | 'sepia' | 'blur'
}

interface VideoElement {
  type: 'video'
  href: string
  format?: 'mp4' | 'webm' | 'ogg' | 'mov' | 'avi' | 'mkv'
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  controls?: boolean
  poster?: string
  // ...
}

interface AudioElement {
  type: 'audio'
  href: string
  format?: 'mp3' | 'wav' | 'ogg' | 'aac' | 'm4a' | 'flac'
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  volume?: number
  // ...
}
```

## 已知问题

- **DEFER** — SVG `audio` 元素会进入 SIF 和 PPTX，但 `x/y/width/height` 还没有从 SVG 映射过去，所以 PPT 中音频图标的位置和大小仍是默认行为
- 远程媒体在生成 PPTX 时需要运行环境能够访问这些 URL
- `cover_bg.jpg` 等本地资产放在 `_assets/` 目录下
