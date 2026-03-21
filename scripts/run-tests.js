/**
 * Combined Test Script: Convert JSON to PPTX and validate
 *
 * This script runs the full test pipeline:
 * 1. Convert all JSON test files to PPTX
 * 2. Validate each generated PPTX file
 * 3. Report results
 *
 * Usage:
 *   node scripts/run-tests.js [options]
 *
 * Options:
 *   --json-dir <dir>    Input JSON directory (default: example/json)
 *   --output-dir <dir>  Output directory for PPTX (default: output/test)
 *   --skip-validation   Skip validation step
 *   --verbose           Show detailed output
 *   --keep              Keep output files on success
 *
 * Examples:
 *   node scripts/run-tests.js
 *   node scripts/run-tests.js --verbose --output-dir output/quick-test
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');

// Parse arguments
const args = process.argv.slice(2);
const options = {
  jsonDir: 'example/json',
  outputDir: 'output/test',
  skipValidation: false,
  verbose: false,
  keep: false
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json-dir' && args[i + 1]) {
    options.jsonDir = args[i + 1];
    i++;
  } else if (args[i] === '--output-dir' && args[i + 1]) {
    options.outputDir = args[i + 1];
    i++;
  } else if (args[i] === '--skip-validation') {
    options.skipValidation = true;
  } else if (args[i] === '--verbose') {
    options.verbose = true;
  } else if (args[i] === '--keep') {
    options.keep = true;
  }
}

// Resolve paths
const jsonDir = path.resolve(process.cwd(), options.jsonDir);
const outputDir = path.resolve(process.cwd(), options.outputDir);

const testFiles = [
  'shape.json',
  'text.json',
  'image.json',
  'line.json',
  'group.json',
  'video.json',
  'audio.json'
];

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

async function convertJsonToPptx(jsonPath, outputPath) {
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  const { jsonToPptx } = require(path.join(distPath, 'index.js'));

  const startTime = Date.now();
  const pptxBuffer = await jsonToPptx(jsonContent, { outputType: 'uint8array' });
  const elapsed = Date.now() - startTime;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, Buffer.from(pptxBuffer));

  return {
    buffer: pptxBuffer,
    elapsed,
    slideCount: JSON.parse(jsonContent).slides?.length || 0
  };
}

async function validatePptxQuick(pptxPath) {
  try {
    const buffer = fs.readFileSync(pptxPath);
    const zip = await JSZip.loadAsync(buffer);

    // Check required files
    if (!zip.file('[Content_Types].xml') ||
        !zip.file('ppt/presentation.xml')) {
      return { valid: false, error: 'Missing required files' };
    }

    // Count slides
    const slideFiles = Object.keys(zip.files).filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/));

    return {
      valid: true,
      slideCount: slideFiles.length,
      fileSizeKB: (buffer.length / 1024).toFixed(2)
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

async function main() {
  console.log('\n' + colors.bold + '='.repeat(60));
  console.log('PPTX Converter - Full Test Suite');
  console.log('='.repeat(60) + colors.reset);
  console.log(`JSON directory: ${jsonDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('');

  // Check if input directory exists
  if (!fs.existsSync(jsonDir)) {
    log(`Error: Input directory not found: ${jsonDir}`, 'red');
    process.exit(1);
  }

  const results = [];

  // Phase 1: Conversion
  log('Phase 1: Converting JSON to PPTX', 'cyan');
  log('-'.repeat(60), 'cyan');

  for (const filename of testFiles) {
    const jsonPath = path.join(jsonDir, filename);
    const outputPath = path.join(outputDir, filename.replace(/\.json$/, '.pptx'));

    // Skip non-existent files
    if (!fs.existsSync(jsonPath)) {
      log(`  [SKIP] ${filename} - file not found`, 'yellow');
      results.push({ filename, status: 'skipped' });
      continue;
    }

    process.stdout.write(`  Converting ${filename}... `);

    try {
      const result = await convertJsonToPptx(jsonPath, outputPath);
      log(`✓ Done (${result.elapsed}ms, ${result.slideCount} slides)`, 'green');

      if (options.verbose) {
        console.log(`       Output: ${outputPath}`);
      }

      results.push({
        filename,
        status: 'converted',
        outputPath,
        elapsed: result.elapsed,
        slideCount: result.slideCount
      });
    } catch (error) {
      log(`✗ Failed`, 'red');
      log(`       Error: ${error.message}`, 'red');
      results.push({ filename, status: 'failed', error: error.message });
    }
  }

  // Phase 2: Validation (optional)
  if (!options.skipValidation) {
    log('\nPhase 2: Validating PPTX files', 'cyan');
    log('-'.repeat(60), 'cyan');

    for (const result of results) {
      if (result.status !== 'converted') continue;

      process.stdout.write(`  Validating ${result.filename}... `);

      try {
        const validation = await validatePptxQuick(result.outputPath);

        if (validation.valid) {
          log(`✓ Valid (${validation.slideCount} slides, ${validation.fileSizeKB} KB)`, 'green');
          result.valid = true;
        } else {
          log(`✗ Invalid: ${validation.error}`, 'red');
          result.valid = false;
          result.validationError = validation.error;
        }
      } catch (error) {
        log(`✗ Error: ${error.message}`, 'red');
        result.valid = false;
        result.validationError = error.message;
      }
    }
  }

  // Summary
  log('\n' + colors.bold + '='.repeat(60), 'bold');
  log('Summary:', 'bold');

  const converted = results.filter(r => r.status === 'converted').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  if (!options.skipValidation) {
    const valid = results.filter(r => r.valid === true).length;
    const invalid = results.filter(r => r.valid === false).length;

    log(`  Conversion: ${converted} passed, ${failed} failed, ${skipped} skipped`, 'reset');
    log(`  Validation: ${valid} passed, ${invalid} failed`, invalid > 0 ? 'red' : 'green');
  } else {
    log(`  Conversion: ${converted} passed, ${failed} failed, ${skipped} skipped`, failed > 0 ? 'red' : 'green');
  }

  // Show failed files
  const failedFiles = results.filter(r => r.status === 'failed' || r.valid === false);
  if (failedFiles.length > 0) {
    log('\nFailed files:', 'red');
    failedFiles.forEach(f => {
      const error = f.error || f.validationError;
      log(`  - ${f.filename}: ${error}`, 'red');
    });
  }

  log('='.repeat(60) + colors.reset, 'reset');

  // Cleanup on failure
  if (failed > 0 && !options.keep) {
    log('\nCleaning up output files...', 'yellow');
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  }

  if (failed > 0) {
    log('\n✗ Tests failed!', 'red');
    process.exit(1);
  }

  log('\n✓ All tests passed!', 'green');
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
