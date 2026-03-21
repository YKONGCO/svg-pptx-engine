// Tests for video converter

import { convertVideo, isYouTubeVideo, convertYouTubeUrl } from '../src/pptx/converters/video'
import { createMockVideoElement, createMockYouTubeVideoElement } from './mockData'

describe('Video Converter', () => {
  describe('convertVideo', () => {
    it('should convert basic video element', () => {
      const video = createMockVideoElement()
      const result = convertVideo(video)

      expect(result.link).toBe('https://www.w3schools.com/html/mov_bbb.mp4')
      expect(result.x).toBeCloseTo(1.0417, 2)
      expect(result.y).toBeCloseTo(1.0417, 2)
      expect(result.w).toBeCloseTo(6.6667, 2)
      expect(result.h).toBeCloseTo(3.75, 2)
    })

    it('should handle local video file', () => {
      const video = createMockVideoElement({
        href: './videos/clip.mp4'
      })
      const result = convertVideo(video)

      expect(result.path).toBe('./videos/clip.mp4')
    })

    it('should handle video with poster image', () => {
      const video = createMockVideoElement({
        poster: 'https://example.com/poster.jpg'
      })
      const result = convertVideo(video)

      expect(result.cover).toBe('https://example.com/poster.jpg')
    })
  })

  describe('isYouTubeVideo', () => {
    it('should detect YouTube URLs', () => {
      const video1 = { href: 'https://www.youtube.com/watch?v=abc123' } as any
      const video2 = { href: 'https://youtu.be/abc123' } as any

      expect(isYouTubeVideo(video1)).toBe(true)
      expect(isYouTubeVideo(video2)).toBe(true)
    })

    it('should reject non-YouTube URLs', () => {
      const video1 = { href: 'https://vimeo.com/123456' } as any
      const video2 = { href: 'https://example.com/video.mp4' } as any

      expect(isYouTubeVideo(video1)).toBe(false)
      expect(isYouTubeVideo(video2)).toBe(false)
    })
  })

  describe('convertYouTubeUrl', () => {
    it('should convert watch URL to embed URL', () => {
      const result = convertYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      expect(result).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('should convert short URL to embed URL', () => {
      const result = convertYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')
      expect(result).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('should convert embed URL', () => {
      const result = convertYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')
      expect(result).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })

    it('should return original URL for non-YouTube', () => {
      const result = convertYouTubeUrl('https://example.com/video.mp4')
      expect(result).toBe('https://example.com/video.mp4')
    })
  })
})
