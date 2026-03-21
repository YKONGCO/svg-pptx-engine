/**
 * Batch Test Script: Convert all JSON test files to PPTX
 *
 * Usage:
 *   node scripts/batch-test.js [options]
 *
 * Options:
 *   --output-dir <dir>    Output directory for PPTX files (default: output/test)
 *   --json-dir <dir>      Input JSON directory (default: example/json)
 *   --verbose             Show detailed output
 *   --summary-only        Only show summary, not individual results
 *
 * Examples:
 *   node scripts/batch-test.js
 *   node scripts/batch-test.js --output-dir output/my-tests --verbose
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  outputDir: 'output/test',
  jsonDir: 'example/json',
  verbose: false,
  summaryOnly: false
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output-dir' && args[i + 1]) {
    options.outputDir = args[i + 1];
    i++;
  } else if (args[i] === '--json-dir' && args[i + 1]) {
    options.jsonDir = args[i + 1];
    i++;
  } else if (args[i] === '--verbose') {
    options.verbose = true;
  } else if (args[i] === '--summary-only') {
    options.summaryOnly = true;
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

// Files that require network access (will be skipped with a warning)
const networkRequiredFiles = ['image.json', 'video.json', 'audio.json'];

let hasNetworkError = false;

// Handle unhandled errors (e.g., network errors from external URLs)
process.on('uncaughtException', (error) => {
  const isNetworkError = error.code === 'EAI_AGAIN' ||
                        error.code === 'ENOTFOUND' ||
                        error.message?.includes('getaddrinfo');

  if (isNetworkError) {
    hasNetworkError = true;
    // Don't exit immediately - continue to show results
    console.log('\n⚠ Network error detected (expected for external URLs)');
    console.log(`   Error: ${error.message}`);
  } else {
    console.error('\n✗ Uncaught exception:', error);
    process.exit(1);
  }
});

async function convertFile(filename) {
  const jsonPath = path.join(jsonDir, filename);
  const outputPath = path.join(outputDir, filename.replace(/\.json$/, '.pptx'));

  // Check if file exists (skip index.json and non-existent files)
  if (!fs.existsSync(jsonPath) || filename === 'index.json') {
    return { filename, success: false, skipped: true };
  }

  // Skip network-required files
  if (networkRequiredFiles.includes(filename)) {
    return { filename, success: false, skipped: true, requiresNetwork: true };
  }

  if (options.verbose) {
    console.log(`\nProcessing: ${filename}`);
  }

  try {
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

    const fileSizeKB = (pptxBuffer.length / 1024).toFixed(2);

    if (options.verbose) {
      console.log(`  ✓ Success: ${outputPath} (${fileSizeKB} KB, ${elapsed}ms)`);
    }

    return {
      filename,
      success: true,
      outputPath,
      fileSizeKB,
      elapsed,
      slideCount: JSON.parse(jsonContent).slides?.length || 0
    };
  } catch (error) {
    // Check if error is network related - these are expected in some test files
    const isNetworkError = error.code === 'EAI_AGAIN' ||
                          error.code === 'ENOTFOUND' ||
                          error.message?.includes('fetch') ||
                          error.message?.includes('network');

    if (options.verbose) {
      if (isNetworkError) {
        console.log(`  ⚠ Network error (expected): ${error.message}`);
      } else {
        console.log(`  ✗ Failed: ${error.message}`);
      }
    }

    return {
      filename,
      success: false,
      error: error.message,
      isNetworkError
    };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('PPTX Converter Batch Test');
  console.log('='.repeat(60));
  console.log(`Input directory:  ${jsonDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('');

  // Check if input directory exists
  if (!fs.existsSync(jsonDir)) {
    console.error(`Error: Input directory not found: ${jsonDir}`);
    process.exit(1);
  }

  // Run conversions
  const results = [];
  for (const filename of testFiles) {
    const result = await convertFile(filename);
    results.push(result);
  }

  // Print summary
  console.log('-'.repeat(60));

  if (!options.summaryOnly) {
    console.log('\nIndividual Results:');
    for (const result of results) {
      if (result.skipped) {
        console.log(`  [SKIP] ${result.filename}`);
      } else if (result.success) {
        console.log(`  [PASS] ${result.filename} - ${result.fileSizeKB} KB, ${result.elapsed}ms, ${result.slideCount} slides`);
      } else {
        console.log(`  [FAIL] ${result.filename} - ${result.error}`);
      }
    }
  }

  // Summary
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success && !r.skipped && !r.isNetworkError).length;
  const networkErrors = results.filter(r => r.isNetworkError).length;
  const skipped = results.filter(r => r.skipped).length;
  const totalSize = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + parseFloat(r.fileSizeKB), 0);
  const totalTime = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.elapsed, 0);

  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log(`  Passed:       ${passed}/${testFiles.length}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Network Err:  ${networkErrors} (expected for external URLs)`);
  console.log(`  Skipped:      ${skipped}`);
  console.log(`  Total size:   ${totalSize.toFixed(2)} KB`);
  console.log(`  Total time:   ${totalTime}ms`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\nFailed files:');
    results
      .filter(r => !r.success && !r.skipped && !r.isNetworkError)
      .forEach(r => console.log(`  - ${r.filename}: ${r.error}`));
    process.exit(1);
  }

  // Network errors are expected - don't fail the test run
  if (failed === 0) {
    console.log('\n✓ All tests passed!');
  }

  // If there was a network error, exit successfully (tests that don't need network worked)
  if (hasNetworkError) {
    console.log('\n⚠ Some tests skipped due to network errors');
    // Only exit with error if ALL tests failed due to network
    if (passed === 0 && failed === 0) {
      process.exit(1);
    }
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
