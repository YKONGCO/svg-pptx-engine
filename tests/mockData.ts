// Test utilities and mock data for PPTX generation tests

// ============= Mock Data Generators =============

export function createMockSlideDocument(overrides?: any): any {
  return {
    width: 1920,
    height: 1080,
    slides: [],
    meta: {
      title: 'Test Presentation',
      author: 'Test Author'
    },
    version: '1.0',
    ...overrides
  }
}

export function createMockSlide(overrides?: any): any {
  return {
    id: 'slide-1',
    elements: [],
    background: undefined,
    transition: undefined,
    ...overrides
  }
}

export function createMockSlideBackground(overrides?: any): any {
  return {
    fill: { type: 'solid', color: 'FFFFFF' },
    ...overrides
  }
}

export function createMockSolidFill(overrides?: any): any {
  return {
    type: 'solid',
    color: 'FF5733',
    opacity: 1,
    ...overrides
  }
}

export function createMockGradientFill(overrides?: any): any {
  return {
    type: 'gradient',
    gradient: {
      type: 'linear',
      angle: 0,
      stops: [
        { color: 'FF0000', offset: 0 },
        { color: '00FF00', offset: 1 }
      ]
    },
    ...overrides
  }
}

export function createMockSolidStroke(overrides?: any): any {
  return {
    type: 'solid',
    color: '000000',
    width: 2,
    ...overrides
  }
}

export function createMockGradientStroke(overrides?: any): any {
  return {
    type: 'gradient',
    width: 2,
    opacity: 0.9,
    gradient: {
      type: 'linear',
      angle: 30,
      stops: [
        { color: 'FF0000', offset: 0, opacity: 1 },
        { color: '0000FF', offset: 1, opacity: 0.5 }
      ]
    },
    ...overrides
  }
}

export function createMockShadowEffect(overrides?: any): any {
  return {
    type: 'shadow',
    color: '000000',
    offsetX: 2,
    offsetY: 2,
    blur: 4,
    opacity: 0.5,
    ...overrides
  }
}

// ============= Shape Elements =============

export function createMockRectShape(overrides?: any): any {
  return {
    type: 'shape',
    id: 'shape-1',
    shapeType: 'rect',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    fill: createMockSolidFill(),
    stroke: createMockSolidStroke(),
    visible: true,
    zIndex: 0,
    ...overrides
  }
}

export function createMockCircleShape(overrides?: any): any {
  return {
    type: 'shape',
    id: 'shape-2',
    shapeType: 'circle',
    x: 300,
    y: 200,
    width: 100,
    height: 100,
    fill: createMockSolidFill({ color: '00FF00' }),
    visible: true,
    zIndex: 1,
    ...overrides
  }
}

export function createMockEllipseShape(overrides?: any): any {
  return {
    type: 'shape',
    id: 'shape-3',
    shapeType: 'ellipse',
    x: 400,
    y: 100,
    width: 150,
    height: 80,
    fill: createMockSolidFill({ color: '0000FF' }),
    visible: true,
    zIndex: 2,
    ...overrides
  }
}

export function createMockLineShape(overrides?: any): any {
  return {
    type: 'shape',
    id: 'shape-4',
    shapeType: 'line',
    x: 500,
    y: 300,
    width: 200,
    height: 0,
    stroke: createMockSolidStroke({ color: 'FF0000', width: 3 }),
    visible: true,
    zIndex: 3,
    ...overrides
  }
}

export function createMockPolygonShape(overrides?: any): any {
  return {
    type: 'shape',
    id: 'shape-5',
    shapeType: 'polygon',
    x: 600,
    y: 400,
    width: 100,
    height: 100,
    points: [
      { x: 50, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ],
    fill: createMockSolidFill({ color: 'FFFF00' }),
    stroke: createMockSolidStroke(),
    visible: true,
    zIndex: 4,
    ...overrides
  }
}

// ============= Text Elements =============

export function createMockTextElement(overrides?: any): any {
  return {
    type: 'text',
    id: 'text-1',
    x: 150,
    y: 150,
    width: 300,
    height: 50,
    text: 'Hello World',
    fontFamily: 'Arial',
    fontSize: 24,
    fontWeight: 'normal',
    fontStyle: 'normal',
    fill: { type: 'solid', color: '000000' },
    textAlign: 'left',
    verticalAlign: 'top',
    visible: true,
    zIndex: 5,
    ...overrides
  }
}

export function createMockRichTextElement(overrides?: any): any {
  return {
    type: 'text',
    id: 'text-2',
    x: 200,
    y: 200,
    width: 400,
    height: 100,
    text: 'Rich Text',
    fontFamily: 'Times New Roman',
    fontSize: 18,
    fontWeight: 'normal',
    fontStyle: 'normal',
    fill: { type: 'solid', color: '333333' },
    textAlign: 'left',
    verticalAlign: 'top',
    runs: [
      {
        text: 'Bold ',
        fontWeight: 'bold',
        fontSize: 18,
        fill: { type: 'solid', color: 'FF0000' }
      },
      {
        text: 'and italic',
        fontStyle: 'italic',
        fontSize: 18,
        fill: { type: 'solid', color: '00FF00' }
      }
    ],
    visible: true,
    zIndex: 6,
    ...overrides
  }
}

// ============= Image Elements =============

export function createMockImageElement(overrides?: any): any {
  return {
    type: 'image',
    id: 'image-1',
    x: 250,
    y: 250,
    width: 300,
    height: 200,
    href: 'https://example.com/image.png',
    preserveAspectRatio: true,
    visible: true,
    zIndex: 7,
    ...overrides
  }
}

export function createMockBase64ImageElement(overrides?: any): any {
  return {
    type: 'image',
    id: 'image-2',
    x: 300,
    y: 300,
    width: 150,
    height: 150,
    href: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    visible: true,
    zIndex: 8,
    ...overrides
  }
}

// ============= Line Elements =============

export function createMockLineElement(overrides?: any): any {
  return {
    type: 'line',
    id: 'line-1',
    x1: 100,
    y1: 100,
    x2: 300,
    y2: 200,
    stroke: createMockSolidStroke({ color: 'FF00FF', width: 2 }),
    visible: true,
    zIndex: 9,
    ...overrides
  }
}

export function createMockArrowLineElement(overrides?: any): any {
  return {
    type: 'line',
    id: 'line-2',
    x1: 400,
    y1: 400,
    x2: 600,
    y2: 500,
    stroke: createMockSolidStroke({ color: '00FFFF', width: 3 }),
    arrowHeadEnd: { id: 'arrow-1', type: 'arrow' },
    visible: true,
    zIndex: 10,
    ...overrides
  }
}

// ============= Group Elements =============

export function createMockGroupElement(overrides?: any): any {
  return {
    type: 'group',
    id: 'group-1',
    // NOTE: Group does not have x, y, width, height - coordinates are relative to canvas
    transform: {
      translateX: 0,
      translateY: 0,
      scaleX: 1,
      scaleY: 1,
      rotate: 0
    },
    children: [
      createMockRectShape({ id: 'child-1', x: 100, y: 100 }),
      createMockTextElement({ id: 'child-2', x: 150, y: 120 })
    ],
    visible: true,
    zIndex: 11,
    ...overrides
  }
}

// ============= Video Elements =============

export function createMockVideoElement(overrides?: any): any {
  return {
    type: 'video',
    id: 'video-1',
    x: 100,
    y: 100,
    width: 640,
    height: 360,
    href: 'https://www.w3schools.com/html/mov_bbb.mp4',
    visible: true,
    zIndex: 12,
    ...overrides
  }
}

export function createMockYouTubeVideoElement(overrides?: any): any {
  return {
    type: 'video',
    id: 'video-2',
    x: 200,
    y: 200,
    width: 560,
    height: 315,
    href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    visible: true,
    zIndex: 13,
    ...overrides
  }
}

// ============= Complete Test Documents =============

export function createComplexSlideDocument(): any {
  return {
    width: 1920,
    height: 1080,
    version: '1.0',
    meta: {
      title: 'Complex Test Presentation',
      author: 'Test Suite',
      subject: 'PPTX Generation Tests'
    },
    slides: [
      {
        id: 'slide-1',
        elements: [
          createMockRectShape({ id: 'shape-1', x: 100, y: 100, width: 300, height: 200 }),
          createMockCircleShape({ id: 'shape-2', x: 500, y: 150, width: 150, height: 150 }),
          createMockTextElement({ id: 'text-1', x: 150, y: 350, text: 'Test Title' }),
          createMockTextElement({
            id: 'text-2',
            x: 150,
            y: 400,
            text: 'Subtitle text here',
            fontSize: 18,
            fontFamily: 'Georgia'
          })
        ],
        background: { fill: { type: 'solid', color: 'F0F0F0' } }
      },
      {
        id: 'slide-2',
        elements: [
          createMockImageElement({ id: 'image-1', x: 100, y: 100 }),
          createMockTextElement({ id: 'text-3', x: 100, y: 500, text: 'Image with caption' })
        ],
        background: { fill: { type: 'solid', color: 'FFFFFF' } }
      }
    ]
  }
}

export function createAllElementsSlide(): any {
  return {
    id: 'all-elements-slide',
    elements: [
      createMockRectShape(),
      createMockCircleShape(),
      createMockEllipseShape(),
      createMockLineShape(),
      createMockPolygonShape(),
      createMockTextElement(),
      createMockRichTextElement(),
      createMockImageElement(),
      createMockBase64ImageElement(),
      createMockLineElement(),
      createMockArrowLineElement(),
      createMockGroupElement(),
      createMockVideoElement()
    ],
    background: { fill: { type: 'solid', color: 'EEEEEE' } }
  }
}
