// Comprehensive tests for Group functionality

const PptxGenJS = require('../../packages/pptxgenjs/dist/pptxgen.cjs.js')
const JSZip = require('jszip')
const fs = require('fs')

// Test utilities
function createPresentation() {
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_16x9'
    return pptx
}

function runTest(name, fn) {
    try {
        fn()
        console.log(`✓ ${name}`)
        return true
    } catch (err) {
        console.error(`✗ ${name}`)
        console.error(`  Error: ${err.message}`)
        return false
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`)
    }
}

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error(`${message}`)
    }
}

function assertMatch(actual, pattern, message) {
    if (!pattern.test(actual)) {
        throw new Error(`${message}: "${actual}" does not match ${pattern}`)
    }
}

// Tests
let passed = 0
let failed = 0

console.log('Running Group Functionality Tests...\n')

// Test 1: Basic group creation
if (runTest('Basic group creation', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    assertTrue(group._slideObjects !== undefined, 'Group should have _slideObjects')
    assertTrue(Array.isArray(group._slideObjects), '_slideObjects should be array')
    assertEqual(group._slideObjects.length, 0, 'New group should be empty')
})) passed++
else failed++

// Test 2: Add shape to group
if (runTest('Add shape to group', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    group.addShape('rect', { x: 1, y: 2, w: 3, h: 4, fill: { color: 'FF0000' } })
    assertEqual(group._slideObjects.length, 1, 'Group should have 1 object')
    assertEqual(group._slideObjects[0]._type, 'text', 'Object should be shape type (internally stored as text)')
    assertEqual(group._slideObjects[0].shape, 'rect', 'Shape name should be rect')
})) passed++
else failed++

// Test 3: Add text to group
if (runTest('Add text to group', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    group.addText('Hello World', { x: 0, y: 0, w: 5, h: 1, fontSize: 24 })
    assertEqual(group._slideObjects.length, 1, 'Group should have 1 object')
    assertEqual(group._slideObjects[0]._type, 'text', 'Object should be text type')
})) passed++
else failed++

// Test 4: Add multiple items to group
if (runTest('Add multiple items to group', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    group.addShape('rect', { x: 0, y: 0, w: 2, h: 2 })
    group.addShape('ellipse', { x: 1, y: 1, w: 1, h: 1 })
    group.addText('Label', { x: 0.5, y: 0.5, w: 1, h: 0.5 })
    assertEqual(group._slideObjects.length, 3, 'Group should have 3 objects')
})) passed++
else failed++

// Test 5: Group chaining
if (runTest('Group method chaining', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    const result = group
        .addShape('rect', { x: 0, y: 0, w: 1, h: 1 })
        .addText('Test', { x: 0, y: 0, w: 1, h: 0.5 })
        .addShape('ellipse', { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })
    assertTrue(result === group, 'Methods should return group for chaining')
    assertEqual(group._slideObjects.length, 3, 'Group should have 3 objects')
})) passed++
else failed++

// Test 6: Method chaining with return value
if (runTest('Method returns correct type', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    const shapeResult = group.addShape('rect', { x: 0, y: 0, w: 1, h: 1 })
    const textResult = group.addText('Hi', { x: 0, y: 0, w: 1, h: 0.5 })
    assertTrue(shapeResult === group, 'addShape should return Group')
    assertTrue(textResult === group, 'addText should return Group')
})) passed++
else failed++

// Test 7: Various shape types in group
if (runTest('Various shape types in group', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    group.addShape('rect', { x: 0, y: 0, w: 1, h: 1 })
    group.addShape('ellipse', { x: 1, y: 0, w: 1, h: 1 })
    group.addShape('roundRect', { x: 2, y: 0, w: 1, h: 1 })
    group.addShape('diamond', { x: 0, y: 1, w: 1, h: 1 })
    assertEqual(group._slideObjects.length, 4, 'Group should have 4 shapes')
})) passed++
else failed++

// Test 8: Slide.addGroup returns group
if (runTest('slide.addGroup returns Group instance', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    assertTrue(group.constructor.name === 'Group', 'Should return Group instance')
    assertTrue(typeof group.addShape === 'function', 'Group should have addShape method')
    assertTrue(typeof group.addText === 'function', 'Group should have addText method')
    assertTrue(typeof group.addImage === 'function', 'Group should have addImage method')
    assertTrue(typeof group.addChart === 'function', 'Group should have addChart method')
    assertTrue(typeof group.addTable === 'function', 'Group should have addTable method')
})) passed++
else failed++

// Test 9: Multiple groups on same slide
if (runTest('Multiple groups on same slide', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group1 = slide.addGroup()
    group1.addShape('rect', { x: 0, y: 0, w: 1, h: 1 })
    const group2 = slide.addGroup()
    group2.addShape('rect', { x: 2, y: 2, w: 1, h: 1 })
    const group3 = slide.addGroup()
    group3.addShape('rect', { x: 4, y: 4, w: 1, h: 1 })
    assertEqual(slide._slideObjects.length, 3, 'Slide should have 3 groups')
})) passed++
else failed++

// Test 10: Group with fill and line options
if (runTest('Group shape with fill and line options', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    group.addShape('rect', {
        x: 0, y: 0, w: 2, h: 2,
        fill: { color: 'FF0000', transparency: 50 },
        line: { color: '0000FF', width: 2 }
    })
    assertEqual(group._slideObjects[0].options.fill.color, 'FF0000')
    assertEqual(group._slideObjects[0].options.line.color, '0000FF')
})) passed++
else failed++

// Test 11: Group with complex text
if (runTest('Group with complex text', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    group.addText([
        { text: 'Bold text', options: { bold: true } },
        { text: ' and normal text', options: { bold: false } }
    ], { x: 0, y: 0, w: 5, h: 1, fontSize: 14 })
    assertEqual(group._slideObjects[0].text.length, 2, 'Text should have 2 segments')
})) passed++
else failed++

// Test 12: Verify slide._slideObjects contains groups
if (runTest('Slide contains groups in _slideObjects', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    group.addShape('rect', { x: 0, y: 0, w: 1, h: 1 })
    const groupObj = slide._slideObjects.find(obj => obj._type === 'group')
    assertTrue(groupObj !== undefined, 'Slide should contain group object')
    assertEqual(groupObj.group, group, 'Group reference should be preserved')
})) passed++
else failed++

// Test 13: Generate PPTX with groups (XML verification)
if (runTest('Generate PPTX with groups and verify XML structure', async () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    group.addShape('rect', { x: 0, y: 0, w: 3, h: 2, fill: { color: 'E8E8E8' }, line: { color: 'CCCCCC' } })
    group.addText('Grouped Text', { x: 0.2, y: 0.2, w: 2.5, h: 0.5, fontSize: 16, bold: true })
    group.addShape('ellipse', { x: 1, y: 1, w: 1, h: 1, fill: { color: 'F5A623' } })

    await pptx.writeFile({ fileName: 'tests/group/test-output.pptx' })

    const zip = await JSZip.loadAsync(fs.readFileSync('tests/group/test-output.pptx'))
    const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')

    assertMatch(slideXml, /<p:grpSp>/, 'Should contain group element')
    assertMatch(slideXml, /<a:chOff x="0" y="0"/, 'Child offset should be 0,0')
    assertMatch(slideXml, /<p:txBody>/, 'Should contain text body')
    assertMatch(slideXml, /prst="rect"/, 'Should contain rect shape')
    assertMatch(slideXml, /prst="ellipse"/, 'Should contain ellipse shape')

    fs.unlinkSync('tests/group/test-output.pptx')
})) passed++
else failed++

// Test 14: Nested group-like structure (multiple groups in sequence)
if (runTest('Multiple groups with different positions', async () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()

    const group1 = slide.addGroup()
    group1.addShape('rect', { x: 0, y: 0, w: 1, h: 1, fill: { color: 'FF0000' } })

    const group2 = slide.addGroup()
    group2.addShape('rect', { x: 2, y: 0, w: 1, h: 1, fill: { color: '00FF00' } })

    const group3 = slide.addGroup()
    group3.addShape('rect', { x: 4, y: 0, w: 1, h: 1, fill: { color: '0000FF' } })

    assertEqual(slide._slideObjects.length, 3, 'Slide should have 3 groups')
    assertEqual(group1._slideObjects[0].options.fill.color, 'FF0000')
    assertEqual(group2._slideObjects[0].options.fill.color, '00FF00')
    assertEqual(group3._slideObjects[0].options.fill.color, '0000FF')
})) passed++
else failed++

// Test 15: Group text with formatting
if (runTest('Group text with formatting options', () => {
    const pptx = createPresentation()
    const slide = pptx.addSlide()
    const group = slide.addGroup()
    group.addText('Formatted Text', {
        x: 0, y: 0, w: 3, h: 1,
        fontSize: 24,
        bold: true,
        italic: true,
        color: 'FF0000',
        align: 'center',
        valign: 'middle'
    })
    const textObj = group._slideObjects[0]
    assertEqual(textObj.text[0].options.fontSize, 24)
    assertEqual(textObj.text[0].options.bold, true)
    assertEqual(textObj.text[0].options.color, 'FF0000')
})) passed++
else failed++

// Summary
console.log(`\n========================================`)
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`)
console.log(`========================================`)

if (failed > 0) {
    process.exit(1)
}
