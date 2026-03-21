/**
 * SVG to PPTX Batch Converter
 *
 * Converts all SVG files to PPTX using the SVG -> SIF -> PPTX pipeline
 *
 * Usage:
 *   node scripts/svg-to-pptx.js [options]
 *
 * Options:
 *   --input-dir <dir>    Input SVG directory (default: example)
 *   --output-dir <dir>   Output PPTX directory (default: output/svg-to-pptx)
 *   --verbose            Show detailed output
 *
 * Examples:
 *   node scripts/svg-to-pptx.js
 *   node scripts/svg-to-pptx.js --input-dir example --output-dir output/my-pptx --verbose
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');

// Import converters
const { svgToSif } = require(path.join(distPath, 'svg', 'converter'));
const { createDocument, createSlide } = require(path.join(distPath, 'sif', 'index'));
const { PptxGenerator } = require(path.join(distPath, 'pptx', 'generator'));

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  inputDir: 'example',
  outputDir: 'output/svg-to-pptx',
  verbose: false
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input-dir' && args[i + 1]) {
    options.inputDir = args[i + 1];
    i++;
  } else if (args[i] === '--output-dir' && args[i + 1]) {
    options.outputDir = args[i + 1];
    i++;
  } else if (args[i] === '--verbose') {
    options.verbose = true;
  }
}

// Resolve paths
const inputDir = path.resolve(process.cwd(), options.inputDir);
const outputDir = path.resolve(process.cwd(), options.outputDir);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Extract width and height from parsed SVG
 */
function getSvgDimensions(parsed) {
  const svgRoot = parsed.svg;
  if (!svgRoot) return { width: 960, height: 540 };

  const width = svgRoot['@_width'] || svgRoot['@_viewBox']?.split(' ')[2] || 960;
  const height = svgRoot['@_height'] || svgRoot['@_viewBox']?.split(' ')[3] || 540;

  // Handle percentage values (will use default)
  const w = parseFloat(width) || 960;
  const h = parseFloat(height) || 540;

  return { width: w, height: h };
}

/**
 * Convert SVG string to PPTX buffer
 */
async function svgToPptx(svgContent, options = {}) {
  // Step 1: SVG -> SIF elements
  const elements = svgToSif(svgContent,{preserveGroups: true});

  // Step 2: Parse dimensions from SVG
  const { parseSVG, getSvgRoot } = require(path.join(distPath, 'svg', 'parser'));
  const parsed = parseSVG(svgContent);
  const svgRoot = getSvgRoot(parsed);
  const width = parseFloat(svgRoot?.['@_width']) || 960;
  const height = parseFloat(svgRoot?.['@_height']) || 540;

  // Step 3: Create SIF document with one slide
  const slide = createSlide('slide1');
  slide.elements = elements;

  const document = createDocument(width, height);
  document.slides = [slide];
  document.meta = {
    title: options.title || 'SVG Conversion',
    author: options.author || 'SVG-PPTX Engine'
  };

  // Step 4: Generate PPTX
  const generator = new PptxGenerator(document, {
    title: options.title || 'SVG Conversion',
    author: options.author || 'SVG-PPTX Engine'
  });

  generator.generate();

  const buffer = await generator.writeBuffer({ outputType: 'nodebuffer' });
  return buffer;
}

/**
 * Convert a single SVG file to PPTX
 */
async function convertFile(svgPath, outputPath) {
  const svgContent = fs.readFileSync(svgPath, 'utf-8');
  const basename = path.basename(svgPath, '.svg');

  const startTime = Date.now();
  const buffer = await svgToPptx(svgContent, { title: basename });
  const elapsed = Date.now() - startTime;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, buffer);

  return {
    basename,
    outputPath,
    sizeKB: (buffer.length / 1024).toFixed(2),
    elapsed
  };
}

/**
 * Get all SVG files from a directory
 */
function getSvgFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.svg'))
    .map(f => path.join(dir, f));

  // Also check subdirectory 'charts'
  const chartsDir = path.join(dir, 'charts');
  if (fs.existsSync(chartsDir)) {
    const chartFiles = fs.readdirSync(chartsDir)
      .filter(f => f.endsWith('.svg'))
      .map(f => path.join(chartsDir, f));
    files.push(...chartFiles);
  }

  return files;
}

async function main() {
  console.log('\n' + colors.bold + '='.repeat(60));
  console.log('SVG to PPTX Batch Converter');
  console.log('='.repeat(60) + colors.reset);
  console.log(`Input directory:  ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('');

  // Get SVG files
  const svgFiles = getSvgFiles(inputDir);

  if (svgFiles.length === 0) {
    log('Error: No SVG files found in input directory', 'red');
    process.exit(1);
  }

  log(`Found ${svgFiles.length} SVG file(s)`, 'cyan');
  console.log('');

  const results = [];

  // Process each file
  for (const svgPath of svgFiles) {
    const basename = path.basename(svgPath, '.svg');
    const outputPath = path.join(outputDir, `${basename}.pptx`);

    process.stdout.write(`  Converting ${basename}... `);

    try {
      const result = await convertFile(svgPath, outputPath);
      log(`✓ Done (${result.elapsed}ms, ${result.sizeKB} KB)`, 'green');

      if (options.verbose) {
        console.log(`       SVG: ${svgPath}`);
        console.log(`       PPTX: ${outputPath}`);
      }

      results.push({
        basename,
        success: true,
        outputPath,
        sizeKB: result.sizeKB,
        elapsed: result.elapsed
      });
    } catch (error) {
      log(`✗ Failed`, 'red');
      console.log(`       Error: ${error.message}`);

      results.push({
        basename,
        success: false,
        error: error.message
      });
    }
  }

  // Summary
  console.log('');
  log('-'.repeat(60));
  log('Summary:', 'bold');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalSize = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + parseFloat(r.sizeKB), 0);
  const totalTime = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.elapsed, 0);

  log(`  Total files:  ${svgFiles.length}`, 'reset');
  log(`  Passed:       ${passed}`, passed > 0 ? 'green' : 'reset');
  log(`  Failed:       ${failed}`, failed > 0 ? 'red' : 'reset');
  log(`  Total size:   ${totalSize.toFixed(2)} KB`, 'reset');
  log(`  Total time:   ${totalTime}ms`, 'reset');
  console.log('');

  // Show failed files
  if (failed > 0) {
    log('Failed files:', 'red');
    results.filter(r => !r.success).forEach(r => {
      log(`  - ${r.basename}: ${r.error}`, 'red');
    });
    console.log('');
  }

  log('='.repeat(60), 'reset');

  if (failed > 0) {
    log('\n✗ Some conversions failed!', 'red');
    process.exit(1);
  }

  log('\n✓ All conversions completed successfully!', 'green');
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});