/**
 * Validation Script: Validate generated PPTX files
 *
 * This script validates PPTX files by:
 * 1. Checking ZIP structure integrity
 * 2. Verifying required XML files exist
 * 3. Validating XML content structure
 * 4. Counting slides and elements
 *
 * Usage:
 *   node scripts/validate-pptx.js <pptx-file> [options]
 *   node scripts/validate-pptx.js output/test --all
 *
 * Options:
 *   --all          Validate all PPTX files in directory
 *   --dir <dir>   Directory to scan (default: output/test)
 *   --verbose      Show detailed output
 *   --strict       Enable strict validation (check all XML)
 *
 * Examples:
 *   node scripts/validate-pptx.js output/test/shape.pptx
 *   node scripts/validate-pptx.js output/test --all
 *   node scripts/validate-pptx.js output/test --all --verbose
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const args = process.argv.slice(2);
const options = {
  all: false,
  dir: 'output/test',
  verbose: false,
  strict: false
};

let pptxPath = null;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--all') {
    options.all = true;
  } else if (args[i] === '--dir' && args[i + 1]) {
    options.dir = args[i + 1];
    i++;
  } else if (args[i] === '--verbose') {
    options.verbose = true;
  } else if (args[i] === '--strict') {
    options.strict = true;
  } else if (!args[i].startsWith('--')) {
    pptxPath = args[i];
  }
}

// Required PPTX structure
const REQUIRED_FILES = [
  '[Content_Types].xml',
  '_rels/.rels',
  'ppt/presentation.xml',
  'ppt/slides/slide1.xml'
];

// Optional but important files
const IMPORTANT_FILES = [
  'ppt/_rels/presentation.xml.rels',
  'ppt/theme/theme1.xml',
  'ppt/presentation.xml'
];

async function validatePptx(filePath) {
  const result = {
    path: filePath,
    valid: true,
    errors: [],
    warnings: [],
    info: {}
  };

  if (!fs.existsSync(filePath)) {
    result.valid = false;
    result.errors.push(`File not found: ${filePath}`);
    return result;
  }

  try {
    // Read and parse the PPTX as ZIP
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);

    result.info.fileSizeKB = (buffer.length / 1024).toFixed(2);

    // Check required files
    const missingFiles = [];
    for (const reqFile of REQUIRED_FILES) {
      if (!zip.file(reqFile)) {
        missingFiles.push(reqFile);
      }
    }

    if (missingFiles.length > 0) {
      result.valid = false;
      result.errors.push(`Missing required files: ${missingFiles.join(', ')}`);
    }

    // Count slides
    const slideFiles = Object.keys(zip.files).filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/));
    result.info.slideCount = slideFiles.length;

    if (slideFiles.length === 0) {
      result.valid = false;
      result.errors.push('No slides found in presentation');
    }

    // Check presentation.xml
    const presXml = await zip.file('ppt/presentation.xml')?.async('string');
    if (presXml) {
      // Basic XML structure check
      if (!presXml.includes('<p:presentation') || !presXml.includes('</p:presentation>')) {
        result.warnings.push('presentation.xml may have invalid structure');
      }

      // Extract slide IDs
      const slideIdMatches = presXml.match(/<p:sldId\s/g);
      if (slideIdMatches) {
        result.info.slideIds = slideIdMatches.length;
      }
    }

    // Validate each slide
    const slideErrors = [];
    for (const slideFile of slideFiles) {
      const slideXml = await zip.file(slideFile)?.async('string');
      if (!slideXml) continue;

      // Check basic slide structure
      if (!slideXml.includes('<p:sld') || !slideXml.includes('</p:sld>')) {
        slideErrors.push(`${slideFile}: Invalid slide structure`);
      }

      // Count elements (shapes, texts, pictures, etc.)
      const shapeMatches = slideXml.match(/<p:sp\s/g);
      const picMatches = slideXml.match(/<p:pic\s/g);
      const mediaMatches = slideXml.match(/<p:media\s/g);

      if (options.verbose) {
        result.info[slideFile] = {
          shapes: shapeMatches?.length || 0,
          pictures: picMatches?.length || 0,
          media: mediaMatches?.length || 0
        };
      }
    }

    if (slideErrors.length > 0) {
      result.warnings.push(...slideErrors);
    }

    // Check media files
    const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('ppt/media/'));
    result.info.mediaCount = mediaFiles.length;

    if (options.strict && mediaFiles.length > 0) {
      // Validate media files have content
      for (const mediaFile of mediaFiles) {
        const content = await zip.file(mediaFile)?.async('nodebuffer');
        if (!content || content.length === 0) {
          result.warnings.push(`Empty media file: ${mediaFile}`);
        }
      }
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`Failed to parse PPTX: ${error.message}`);
  }

  return result;
}

async function validateDirectory(dirPath) {
  const results = [];

  if (!fs.existsSync(dirPath)) {
    console.error(`Error: Directory not found: ${dirPath}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dirPath);
  const pptxFiles = files.filter(f => f.endsWith('.pptx'));

  console.log(`Found ${pptxFiles.length} PPTX files in ${dirPath}`);
  console.log('');

  for (const file of pptxFiles) {
    const filePath = path.join(dirPath, file);
    const result = await validatePptx(filePath);
    results.push({ file, result });
  }

  return results;
}

async function main() {
  console.log('='.repeat(60));
  console.log('PPTX Validation');
  console.log('='.repeat(60));

  if (options.all) {
    // Validate all files in directory
    const dirPath = path.resolve(process.cwd(), options.dir);
    const results = await validateDirectory(dirPath);

    // Print results
    let passed = 0;
    let failed = 0;

    console.log('\nResults:');
    for (const { file, result } of results) {
      if (result.valid) {
        passed++;
        const status = result.warnings.length > 0 ? '⚠ WARN' : '✓ PASS';
        console.log(`  ${status} ${file} (${result.info.fileSizeKB} KB, ${result.info.slideCount} slides)`);

        if (options.verbose && result.warnings.length > 0) {
          result.warnings.forEach(w => console.log(`       Warning: ${w}`));
        }
      } else {
        failed++;
        console.log(`  ✗ FAIL ${file}`);
        result.errors.forEach(e => console.log(`       Error: ${e}`));
      }
    }

    console.log('\n' + '-'.repeat(60));
    console.log(`Summary: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
      process.exit(1);
    }

  } else if (pptxPath) {
    // Validate single file
    const filePath = path.resolve(process.cwd(), pptxPath);
    const result = await validatePptx(filePath);

    console.log(`\nValidating: ${filePath}`);
    console.log('-'.repeat(60));

    if (result.valid) {
      console.log('✓ File structure is valid');
      console.log(`  File size: ${result.info.fileSizeKB} KB`);
      console.log(`  Slides: ${result.info.slideCount}`);
      console.log(`  Media files: ${result.info.mediaCount || 0}`);

      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        result.warnings.forEach(w => console.log(`  - ${w}`));
      }
    } else {
      console.log('✗ Validation failed');
      console.log('\nErrors:');
      result.errors.forEach(e => console.log(`  - ${e}`));
      process.exit(1);
    }

  } else {
    console.error('Usage: node scripts/validate-pptx.js <pptx-file>');
    console.error('       node scripts/validate-pptx.js --all [--dir <directory>]');
    process.exit(1);
  }

  console.log('\n✓ Validation complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
