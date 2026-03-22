import { convertAudio } from '../src/pptx/converters/audio'

describe('Audio Converter', () => {
  it('should convert basic audio element with explicit bounds', () => {
    const result = convertAudio({
      type: 'audio',
      id: 'audio-1',
      x: 96,
      y: 192,
      width: 144,
      height: 48,
      href: 'https://www.w3schools.com/html/horse.mp3'
    } as any)

    expect(result.type).toBe('audio')
    expect(result.path).toBe('https://www.w3schools.com/html/horse.mp3')
    expect(result.x).toBeCloseTo(1, 4)
    expect(result.y).toBeCloseTo(2, 4)
    expect(result.w).toBeCloseTo(1.5, 4)
    expect(result.h).toBeCloseTo(0.5, 4)
    expect(result.extn).toBe('mp3')
  })

  it('should keep audio icon tiny when hideIcon is enabled', () => {
    const result = convertAudio({
      type: 'audio',
      id: 'audio-2',
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      href: 'https://www.w3schools.com/html/horse.mp3',
      hideIcon: true
    } as any)

    expect(result.w).toBeGreaterThan(0)
    expect(result.h).toBeGreaterThan(0)
    expect(result.w).toBeCloseTo(0.0001041667, 6)
    expect(result.h).toBeCloseTo(0.0001041667, 6)
  })
})
