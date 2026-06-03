#!/usr/bin/env node

/**
 * svg2pptx CLI - Combine multiple SVG files into a single PPTX presentation
 *
 * Usage:
 *   svg2pptx <input> [options]
 *   svg2pptx ./slides              # Directory of SVG files
 *   svg2pptx ./slide1.svg          # Single SVG file
 *   svg2pptx ./slides -o output.pptx
 *   svg2pptx ./slides -o output.json --sif  # Export as SIF JSON
 *
 *   svg2pptx --json slides.json    # Convert SVG strings from JSON file
 *   svg2pptx --stdin               # Read SVG strings from stdin
 *
 * Input formats:
 *   --json <file>     JSON array of SVG strings or objects with 'svg' field
 *   --stdin           Read from stdin, one SVG per line or JSON array
 *
 * Options:
 *   -o, --output <path>      Output PPTX/SIF file path
 *   --sif                    Export as SIF JSON format instead of PPTX
 *   --no-sort                Disable numeric sorting of files
 *   --preserve-groups        Preserve SVG group structure
 *   --no-allow-remote        Disable network requests for remote assets
 *   -v, --verbose            Show detailed output
 *   -h, --help               Show this message
 *
 * Examples:
 *   svg2pptx ./slides                    # Convert all SVGs in directory
 *   svg2pptx ./slides -o presentation.pptx
 *   svg2pptx ./chart1.svg -o single.pptx
 *   svg2pptx ./slides -o slides.json --sif  # Export as SIF JSON
 *
 *   # JSON input (file: slides.json)
 *   # ["<svg>...</svg>", "<svg>...</svg>"]
 *   # or [{"svg": "<svg>...</svg>", "name": "slide1"}, ...]
 *   svg2pptx --json slides.json -o output.pptx
 *
 *   # Stdin input (one SVG per line)
 *   echo -e "<svg>...</svg>\n<svg>...</svg>" | svg2pptx --stdin -o output.pptx
 *
 *   # Stdin input (JSON array)
 *   echo '["<svg>...</svg>", "<svg>...</svg>"]' | svg2pptx --stdin -o output.pptx
 */

const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function colorize(message, color = 'reset') {
  return `${colors[color]}${message}${colors.reset}`;
}

function log(message, color = 'reset') {
  console.log(colorize(message, color));
}

function verbose(message) {
  if (options.verbose) {
    console.log(colorize(message, 'dim'));
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const opts = {
    input: null,
    output: null,
    sif: false,
    sort: true,
    preserveGroups: true,
    allowRemote: true, // Network requests allowed by default
    verbose: false,
    help: false,
    json: null,      // JSON file path containing SVG array
    stdin: false     // Read from stdin
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg.startsWith('-')) {
      if (!opts.input) {
        opts.input = arg;
      } else if (!opts.output) {
        opts.output = arg;
      }
      continue;
    }

    switch (arg) {
      case '-o':
      case '--output':
        opts.output = argv[++i];
        break;
      case '--sif':
        opts.sif = true;
        break;
      case '--no-sort':
        opts.sort = false;
        break;
      case '--preserve-groups':
        opts.preserveGroups = true;
        break;
      case '--no-preserve-groups':
        opts.preserveGroups = false;
        break;
      case '--allow-remote':
        opts.allowRemote = true;
        break;
      case '--no-allow-remote':
        opts.allowRemote = false;
        break;
      case '-v':
      case '--verbose':
        opts.verbose = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--json':
        opts.json = argv[++i];
        break;
      case '--stdin':
        opts.stdin = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

/**
 * Parse SVG input from JSON file
 * Format: ["<svg>...</svg>", ...] or [{"svg": "<svg>...</svg>", "name": "slide1"}, ...]
 */
function parseJsonInput(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON file not found: ${jsonPath}`);
  }

  const content = fs.readFileSync(jsonPath, 'utf8');
  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('JSON root must be an array');
  }

  return parsed.map((item, index) => {
    if (typeof item === 'string') {
      return { svg: item, name: `slide${index + 1}` };
    } else if (typeof item === 'object' && item !== null) {
      return {
        svg: item.svg || item.xml || item.content || '',
        name: item.name || item.title || `slide${index + 1}`
      };
    }
    throw new Error(`Invalid item at index ${index}: must be string or object with 'svg' field`);
  }).filter(item => item.svg.trim().length > 0);
}

/**
 * Parse SVG input from stdin
 * Supports: JSON array, or one SVG per line (separated by newlines)
 */
function parseStdinInput() {
  return new Promise((resolve, reject) => {
    let body = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('readable', () => {
      const chunk = process.stdin.read();
      if (chunk !== null) {
        body += chunk;
      }
    });
    process.stdin.on('end', () => {
      try {
        // Try JSON array first
        if (body.trim().startsWith('[')) {
          const parsed = JSON.parse(body);
          if (Array.isArray(parsed)) {
            resolve(parseJsonInputContent(parsed));
            return;
          }
        }

        // One SVG per line (first char is not [)
        const lines = body.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          resolve(parseJsonInputContent(lines.map((svg, index) => ({
            svg: line.trim(),
            name: `slide${index + 1}`
          }))));
          return;
        }

        resolve([]);
      } catch (e) {
        reject(new Error(`Failed to parse stdin: ${e.message}`));
      }
    });
    process.stdin.on('error', reject);
  });
}

function parseJsonInputContent(items) {
  return items.map((item, index) => {
    if (typeof item === 'string') {
      return { svg: item, name: `slide${index + 1}` };
    } else if (typeof item === 'object' && item !== null) {
      return {
        svg: item.svg || item.xml || item.content || '',
        name: item.name || item.title || `slide${index + 1}`
      };
    }
    throw new Error(`Invalid item at index ${index}`);
  }).filter(item => item.svg.trim().length > 0);
}

/**
 * Extract numbers from filename for natural sorting
 * e.g., "slide1.svg" -> 1, "slide10.svg" -> 10, "a10b20c.svg" -> [10, 20]
 */
function extractNumber(filename) {
  const basename = path.basename(filename, path.extname(filename));
  const numbers = basename.match(/\d+/g);
  if (!numbers) return [0];
  return numbers.map(n => parseInt(n, 10));
}

/**
 * Natural sort comparator - sorts by numbers embedded in strings
 */
function naturalSort(a, b) {
  const numsA = extractNumber(a);
  const numsB = extractNumber(b);

  for (let i = 0; i < Math.max(numsA.length, numsB.length); i++) {
    const numA = numsA[i] ?? 0;
    const numB = numsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }

  return a.localeCompare(b);
}

/**
 * Check if path is an SVG file
 */
function isSvgFile(filePath) {
  return path.extname(filePath).toLowerCase() === '.svg';
}

/**
 * Recursively collect SVG files from a directory
 */
function collectSvgFiles(dirPath, recursive = true) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Path not found: ${dirPath}`);
  }

  const stat = fs.statSync(dirPath);

  if (stat.isFile()) {
    if (!isSvgFile(dirPath)) {
      throw new Error(`Not an SVG file: ${dirPath}`);
    }
    return [dirPath];
  }

  if (!stat.isDirectory()) {
    throw new Error(`Unsupported path type: ${dirPath}`);
  }

  const files = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      files.push(...collectSvgFiles(entryPath, recursive));
    } else if (entry.isFile() && isSvgFile(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Find remote assets in SVG content
 */
function findRemoteAssets(svgContent) {
  const matches = svgContent.match(/(?:href|xlink:href|poster)\s*=\s*["']https?:\/\/[^"']+["']/gi) || [];
  return matches.map(item => item.replace(/\s+/g, ' '));
}

/**
 * Load the runtime module (compiled TypeScript)
 * Handles both local development and global npm installation paths
 */
function loadRuntime() {
  // Find package root (works for both local dev and global npm install)
  const binDir = path.resolve(__dirname);
  let projectRoot = path.resolve(binDir, '..');

  // For global npm install, bin/ might be in a different location
  // Check if dist exists at expected location
  let distEntry = path.join(projectRoot, 'dist', 'index.js');

  // If not found, try to find package root via require.resolve
  if (!fs.existsSync(distEntry)) {
    try {
      // Try to resolve the package from node_modules
      const pkgPath = require.resolve('svg-pptx-engine', { paths: [binDir] });
      projectRoot = path.dirname(path.dirname(pkgPath));
      distEntry = path.join(projectRoot, 'dist', 'index.js');
    } catch (e) {
      // Fall back to looking in ../.. from bin for global installs
      projectRoot = path.resolve(binDir, '..', '..', 'lib', 'node_modules', 'svg-pptx-engine');
      distEntry = path.join(projectRoot, 'dist', 'index.js');
    }
  }

  if (!fs.existsSync(distEntry)) {
    throw new Error('Build output not found. Please run "npm run build" first.');
  }

  return require(distEntry);
}

/**
 * Get SVG dimensions
 */
function getSvgDimensions(runtime, svgContent) {
  const parsed = runtime.parseSVG(svgContent);
  const svgRoot = runtime.getSvgRoot(parsed);

  if (!svgRoot) {
    throw new Error('Invalid SVG: no <svg> root element found');
  }

  const viewBox = runtime.getAttr(svgRoot, 'viewBox');
  const widthAttr = runtime.getAttr(svgRoot, 'width');
  const heightAttr = runtime.getAttr(svgRoot, 'height');

  const parseDimension = (val) => {
    if (!val) return undefined;
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const viewBoxParts = viewBox?.trim().split(/[\s,]+/).map(p => parseFloat(p));

  return {
    width: parseDimension(widthAttr) ?? (viewBoxParts && viewBoxParts.length >= 4 ? viewBoxParts[2] : 960),
    height: parseDimension(heightAttr) ?? (viewBoxParts && viewBoxParts.length >= 4 ? viewBoxParts[3] : 540)
  };
}

/**
 * Convert a single SVG to a SIF slide document
 */
function svgToSlideDocument(runtime, svgContent, options = {}) {
  const elements = runtime.svgToSif(svgContent, options);
  const { width, height } = getSvgDimensions(runtime, svgContent);

  return {
    version: runtime.PROTOCOL_VERSION,
    width,
    height,
    slides: [
      {
        id: options.slideId ?? 'slide1',
        elements
      }
    ],
    meta: {
      title: options.title ?? 'SVG Conversion',
      author: options.author ?? 'svg2pptx',
      subject: options.subject
    }
  };
}

/**
 * Merge multiple SVG slide documents into a single document
 */
function mergeSlideDocuments(documents, meta = {}) {
  if (documents.length === 0) {
    throw new Error('No documents to merge');
  }

  if (documents.length === 1) {
    return {
      ...documents[0],
      meta: {
        ...documents[0].meta,
        ...meta
      }
    };
  }

  // Use dimensions from the first document
  const { width, height, version } = documents[0];

  // Merge all slides
  const allSlides = [];
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    for (const slide of doc.slides) {
      allSlides.push({
        ...slide,
        id: `slide${allSlides.length + 1}`
      });
    }
  }

  return {
    version,
    width,
    height,
    slides: allSlides,
    meta: {
      title: meta.title ?? 'Combined Presentation',
      author: meta.author ?? 'svg2pptx',
      subject: meta.subject
    }
  };
}

/**
 * Convert SVG items (from JSON/stdin) to slide documents
 */
function convertSvgItems(runtime, svgItems, options) {
  const documents = [];

  for (let i = 0; i < svgItems.length; i++) {
    const { svg, name } = svgItems[i];

    verbose(`Processing ${i + 1}/${svgItems.length}: ${name}`);

    // Check for remote assets
    const remoteAssets = findRemoteAssets(svg);
    if (remoteAssets.length > 0 && !options.allowRemote) {
      log(`SKIP ${name}: contains remote assets`, 'yellow');
      continue;
    }

    const slideDoc = svgToSlideDocument(runtime, svg, {
      slideId: `slide${documents.length + 1}`,
      title: name,
      preserveGroups: options.preserveGroups,
      baseDir: ''
    });

    documents.push(slideDoc);
  }

  return documents;
}

/**
 * Main CLI execution
 */
async function main() {
  try {
    options = parseArgs(process.argv.slice(2));

    if (options.help) {
      console.log(`
svg2pptx - Combine SVG files into a PPTX presentation or SIF JSON

Usage:
  svg2pptx <input> [options]

Arguments:
  input                     SVG file or directory containing SVG files

Options:
  -o, --output <path>       Output PPTX/SIF file path
  --sif                     Export as SIF JSON format instead of PPTX
  --no-sort                 Disable numeric sorting of files
  --preserve-groups        Preserve SVG group structure (default: true)
  --no-preserve-groups      Flatten SVG groups
  --allow-remote            Allow network requests (default: true)
  --no-allow-remote         Disable network requests
  --json <file>             Convert SVG array from JSON file
  --stdin                   Read SVG input from stdin
  -v, --verbose             Show detailed output
  -h, --help                Show this message

Examples:
  svg2pptx ./slides                    Convert all SVGs in directory
  svg2pptx ./slides -o presentation.pptx
  svg2pptx ./chart1.svg -o single.pptx
  svg2pptx ./slides -o slides.json --sif  # Export as SIF JSON

  # JSON input (file: slides.json)
  svg2pptx --json slides.json -o output.pptx
  # [{"svg": "<svg>...</svg>", "name": "slide1"}, ...]

  # Stdin input (JSON array)
  echo '["<svg>...</svg>", "<svg>...</svg>"]' | svg2pptx --stdin -o output.pptx

  # Stdin input (one SVG per line)
  echo -e "<svg>...</svg>\n<svg>...</svg>" | svg2pptx --stdin -o output.pptx
`.trim());
      return;
    }

    if (!options.input && !options.stdin && !options.json) {
      log('Error: No input specified', 'red');
      console.log('Run "svg2pptx --help" for usage information');
      process.exit(1);
    }

    const outputPath = options.output
      ? path.resolve(process.cwd(), options.output)
      : path.resolve(process.cwd(), 'output.pptx');

    // Load runtime
    const runtime = loadRuntime();
    let documents = [];

    // Handle stdin input
    if (options.stdin) {
      log('Reading SVG input from stdin...', 'cyan');
      const svgItems = await parseStdinInput();
      if (svgItems.length === 0) {
        throw new Error('No SVG content found in stdin');
      }
      documents = convertSvgItems(runtime, svgItems, options);
      console.log(`Input:   stdin`);
      console.log(`Files:   ${svgItems.length}`);
    }
    // Handle JSON file input
    else if (options.json) {
      const jsonPath = path.resolve(process.cwd(), options.json);
      log(`Reading SVG input from JSON: ${jsonPath}`, 'cyan');
      const svgItems = parseJsonInput(jsonPath);
      if (svgItems.length === 0) {
        throw new Error('No SVG content found in JSON file');
      }
      documents = convertSvgItems(runtime, svgItems, options);
      console.log(`Input:   ${options.json}`);
      console.log(`Files:   ${svgItems.length}`);
    }
    // Handle file/directory input
    else {
      const inputPath = path.resolve(process.cwd(), options.input);
      const svgFiles = collectSvgFiles(inputPath);

      if (svgFiles.length === 0) {
        throw new Error(`No SVG files found in: ${inputPath}`);
      }

      // Sort files if enabled
      if (options.sort) {
        svgFiles.sort(naturalSort);
        verbose(`Files sorted by numeric order`);
      }

      log('='.repeat(60), 'bold');
      log('svg2pptx - SVG to PPTX Converter', 'bold');
      log('='.repeat(60), 'bold');
      console.log(`Input:   ${inputPath}`);
      console.log(`Files:   ${svgFiles.length}`);
      console.log(`Output:  ${outputPath}`);
      console.log(`Sort:    ${options.sort ? 'enabled' : 'disabled'}`);
      console.log(`Remote:  ${options.allowRemote ? 'allowed' : 'disabled'}`);
      console.log('');

      // Process each SVG file
      let skipped = 0;

      for (let i = 0; i < svgFiles.length; i++) {
        const svgFile = svgFiles[i];
        const svgContent = fs.readFileSync(svgFile, 'utf8');
        const filename = path.basename(svgFile);

        verbose(`Processing ${i + 1}/${svgFiles.length}: ${filename}`);

        // Check for remote assets
        const remoteAssets = findRemoteAssets(svgContent);
        if (remoteAssets.length > 0 && !options.allowRemote) {
          log(`SKIP ${filename}: contains remote assets`, 'yellow');
          skipped++;
          continue;
        }

        // Convert SVG to slide document
        const slideDoc = svgToSlideDocument(runtime, svgContent, {
          slideId: `slide${documents.length + 1}`,
          title: path.basename(svgFile, '.svg'),
          preserveGroups: options.preserveGroups,
          baseDir: path.dirname(svgFile)
        });

        documents.push(slideDoc);
      }

      if (documents.length === 0) {
        throw new Error('No valid SVG files to convert');
      }

      console.log(`Valid:   ${documents.length} file(s)`);
      if (skipped > 0) console.log(`Skipped: ${skipped} file(s) (use --allow-remote to include)`);
    }

    console.log(`Output:  ${outputPath}`);
    console.log('');

    // Merge all slide documents
    verbose('Merging slides into single presentation...');
    const combinedDoc = mergeSlideDocuments(documents, {
      title: outputPath ? path.basename(outputPath, options.sif ? '.json' : '.pptx') : 'Combined Presentation'
    });

    // Export as SIF JSON or generate PPTX
    if (options.sif) {
      verbose('Exporting as SIF JSON...');
      const sifJson = JSON.stringify(combinedDoc, null, 2);

      if (outputPath) {
        ensureDir(path.dirname(outputPath));
        fs.writeFileSync(outputPath, sifJson, 'utf8');
        const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(2);
        log(`Output: ${outputPath} (${sizeKB} KB)`, 'green');
      } else {
        console.log(sifJson);
      }
    } else {
      verbose('Generating PPTX...');
      const generator = runtime.createPptxGenerator(combinedDoc);
      generator.generate();

      ensureDir(path.dirname(outputPath));
      await generator.writeFile({ fileName: outputPath });
      const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(2);
      log(`Output: ${outputPath} (${sizeKB} KB)`, 'green');
    }

    log('Done!', 'green');

  } catch (error) {
    log(`Error: ${error.message}`, 'red');
    if (options?.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

let options;

main();