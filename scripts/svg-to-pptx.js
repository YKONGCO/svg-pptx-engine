#!/usr/bin/env node

/**
 * SVG to PPTX CLI
 *
 * Usage:
 *   node scripts/svg-to-pptx.js --input <file-or-dir> [--output <file-or-dir>] [options]
 *   node scripts/svg-to-pptx.js --input-dir <dir> [--output-dir <dir>] [--verbose]
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function colorize(message, color = 'reset') {
  return `${colors[color]}${message}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

function printHelp() {
  console.log(`
SVG to PPTX CLI

Usage:
  node scripts/svg-to-pptx.js --input <file-or-dir> [--output <file-or-dir>] [options]

Options:
  --input, --input-dir <path>     SVG file or directory to convert
  --output, --output-dir <path>   Output PPTX file or directory
  --no-recursive                  Disable recursive directory scan
  --no-preserve-groups            Flatten SVG groups before rendering
  --allow-remote-assets           Allow http/https assets inside SVG
  --verbose                       Show detailed output
  --help                          Show this message

Examples:
  node scripts/svg-to-pptx.js --input example
  node scripts/svg-to-pptx.js --input example\\demo.svg --output output\\demo.pptx
  node scripts/svg-to-pptx.js --input example --output output\\pptx --verbose
`.trim());
}

function parseArgs(argv) {
  const options = {
    input: 'example',
    output: 'output/svg-to-pptx',
    recursive: true,
    preserveGroups: true,
    allowRemoteAssets: false,
    verbose: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if ((arg === '--input' || arg === '--input-dir') && argv[i + 1]) {
      options.input = argv[++i];
      continue;
    }

    if ((arg === '--output' || arg === '--output-dir') && argv[i + 1]) {
      options.output = argv[++i];
      continue;
    }

    if (arg === '--no-recursive') {
      options.recursive = false;
      continue;
    }

    if (arg === '--no-preserve-groups') {
      options.preserveGroups = false;
      continue;
    }

    if (arg === '--allow-remote-assets') {
      options.allowRemoteAssets = true;
      continue;
    }

    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function loadRuntime() {
  const projectRoot = path.resolve(__dirname, '..');
  const distEntry = path.join(projectRoot, 'dist', 'index.js');

  if (!fs.existsSync(distEntry)) {
    throw new Error('Build output not found. Run "npm run build" first.');
  }

  return require(distEntry);
}

function isSvgFile(filePath) {
  return path.extname(filePath).toLowerCase() === '.svg';
}

function collectSvgFiles(targetPath, recursive) {
  const stat = fs.statSync(targetPath);

  if (stat.isFile()) {
    if (!isSvgFile(targetPath)) {
      throw new Error(`Input file is not an SVG: ${targetPath}`);
    }
    return [targetPath];
  }

  if (!stat.isDirectory()) {
    throw new Error(`Unsupported input path: ${targetPath}`);
  }

  const results = [];
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      if (recursive) {
        results.push(...collectSvgFiles(entryPath, recursive));
      }
      continue;
    }

    if (entry.isFile() && isSvgFile(entry.name)) {
      results.push(entryPath);
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function findRemoteAssets(svgContent) {
  const matches = svgContent.match(/(?:href|xlink:href|poster)\s*=\s*["']https?:\/\/[^"']+["']/gi) || [];
  return matches.map(item => item.replace(/\s+/g, ' '));
}

function resolveOutputPath(inputPath, inputRoot, outputTarget, multipleInputs) {
  const outputLooksLikeFile = path.extname(outputTarget).toLowerCase() === '.pptx';

  if (!multipleInputs && outputLooksLikeFile) {
    return outputTarget;
  }

  const relativeSource = fs.statSync(inputRoot).isDirectory()
    ? path.relative(inputRoot, inputPath)
    : path.basename(inputPath);
  const relativePptx = relativeSource.replace(/\.svg$/i, '.pptx');

  return path.join(outputTarget, relativePptx);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const runtime = loadRuntime();
  const inputPath = path.resolve(process.cwd(), options.input);
  const outputPath = path.resolve(process.cwd(), options.output);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input path not found: ${inputPath}`);
  }

  const svgFiles = collectSvgFiles(inputPath, options.recursive);
  if (svgFiles.length === 0) {
    throw new Error(`No SVG files found in: ${inputPath}`);
  }

  console.log('');
  console.log(colorize('='.repeat(64), 'bold'));
  console.log('SVG to PPTX CLI');
  console.log(colorize('='.repeat(64), 'bold'));
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Files:  ${svgFiles.length}`);
  console.log('');

  const startedAt = Date.now();
  const results = [];

  for (const svgFile of svgFiles) {
    const targetFile = resolveOutputPath(svgFile, inputPath, outputPath, svgFiles.length > 1);
    ensureDir(path.dirname(targetFile));

    try {
      const svgContent = fs.readFileSync(svgFile, 'utf8');
      const remoteAssets = findRemoteAssets(svgContent);

      if (remoteAssets.length > 0 && !options.allowRemoteAssets) {
        results.push({
          file: svgFile,
          success: false,
          skipped: true,
          error: 'Remote assets detected. Re-run with --allow-remote-assets if network access is available.'
        });
        log(`SKIP ${path.relative(process.cwd(), svgFile)}: remote assets require network access`, 'yellow');

        if (options.verbose) {
          for (const asset of remoteAssets) {
            console.log(`  ${asset}`);
          }
        }

        continue;
      }

      const fileStartedAt = Date.now();
      const svgBaseDir = path.dirname(svgFile);
      const pptxBuffer = await runtime.svgToPptx(svgContent, {
        title: path.basename(svgFile, '.svg'),
        author: 'svg-pptx-engine',
        preserveGroups: options.preserveGroups,
        outputType: 'nodebuffer',
        baseDir: svgBaseDir
      });

      fs.writeFileSync(targetFile, Buffer.from(pptxBuffer));

      const elapsed = Date.now() - fileStartedAt;
      const sizeKB = (pptxBuffer.length / 1024).toFixed(2);

      results.push({
        file: svgFile,
        output: targetFile,
        success: true,
        elapsed,
        sizeKB
      });

      log(`PASS ${path.relative(process.cwd(), svgFile)} -> ${path.relative(process.cwd(), targetFile)} (${elapsed}ms, ${sizeKB} KB)`, 'green');

      if (options.verbose) {
        console.log(`  preserveGroups=${options.preserveGroups}`);
      }
    } catch (error) {
      results.push({
        file: svgFile,
        success: false,
        error: error.message
      });
      log(`FAIL ${path.relative(process.cwd(), svgFile)}: ${error.message}`, 'red');
    }
  }

  const passed = results.filter(result => result.success).length;
  const skipped = results.filter(result => result.skipped).length;
  const failed = results.filter(result => !result.success && !result.skipped).length;
  const totalTime = Date.now() - startedAt;

  console.log('');
  console.log('-'.repeat(64));
  console.log(`Passed: ${passed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Time:   ${totalTime}ms`);

  if (failed > 0 || skipped > 0) {
    console.log('');
    log('Non-passing files:', failed > 0 ? 'red' : 'yellow');
    for (const result of results.filter(item => !item.success)) {
      log(`  ${path.relative(process.cwd(), result.file)}: ${result.error}`, result.skipped ? 'yellow' : 'red');
    }
    process.exitCode = failed > 0 ? 1 : 0;
    return;
  }

  console.log('');
  log('All SVG files converted successfully.', 'green');
}

main().catch(error => {
  log(error.message, 'red');
  process.exit(1);
});
