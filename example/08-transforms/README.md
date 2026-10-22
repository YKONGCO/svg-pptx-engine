# 08-transforms

SVG `transform` 属性所有形式：translate / rotate / scale / skew / matrix / 嵌套。

## 文件

| 文件 | 内容 |
|------|------|
| `01-translate.svg` | translate 各种（单组/负向/no-op/嵌套/g 平移/平移+旋转组合） |
| `02-rotate-scale.svg` | rotate(deg) / rotate(deg,cx,cy) / scale 均匀 / scale 非均匀 / scale(-1) 翻转 / 负角度 / 组合 |
| `03-matrix-skew.svg` | matrix(a,b,c,d,e,f) / skewX / skewY / 复合 skew / 嵌套 g 多次变换 |

## SIF Transform 类型

```typescript
interface Transform {
  translateX?: number
  translateY?: number
  scaleX?: number
  scaleY?: number
  rotate?: number         // 0-360
  rotateX?: number        // 3D
  rotateY?: number        // 3D
  rotateZ?: number        // 3D
  matrix?: [a, b, c, d, e, f]
}
```

## 约束

- `rotate` 仅支持绕元素**左上角**旋转（等价于 SVG `rotate(angle)` 而非 `rotate(angle, cx, cy)`）
- 不支持绕任意点旋转 — 如需绕中心旋转请自行计算偏移量

## 转换器

- `src/svg/converters/group.ts` — 解析 SVG `transform` 字符串为 SIF Transform 对象
- `src/pptx/converters/shape.ts` — 将 transform 转换为 PPTX `xfrm` 元素
