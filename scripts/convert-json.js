/**
 * Test Script: Convert a single JSON file to PPTX
 *
 * Usage:
 *   node scripts/convert-json.js <json-file> [output-pptx]
 *
 * Examples:
 *   node scripts/convert-json.js example/json/shape.json
 *   node scripts/convert-json.js example/json/shape.json output/shape.pptx
 */

const fs = require('fs');
const path = require('path');

// Add parent directory to path for imports
const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node scripts/convert-json.js <json-file> [output-pptx]');
    console.error('');
    console.error('Arguments:');
    console.error('  json-file   Path to the input JSON file');
    console.error('  output-pptx (optional) Path for output PPTX file, default: <input-name>.pptx');
    process.exit(1);
  }

  const jsonFile = args[0];
  const outputFile = args[1] || jsonFile.replace(/\.json$/, '.pptx');

  // Resolve paths
  const jsonPath = path.resolve(process.cwd(), jsonFile);
  const outputPath = path.resolve(process.cwd(), outputFile);

  // Check if input file exists
  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: Input file not found: ${jsonPath}`);
    process.exit(1);
  }

  console.log(`Reading JSON from: ${jsonPath}`);

  // Read JSON file
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');

  // Import the converter
  const { jsonToPptx } = require(path.join(distPath, 'index.js'));

  console.log('Converting JSON to PPTX...');

  try {
    const pptxBuffer = await jsonToPptx(jsonContent, {
      outputType: 'uint8array'
    });

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write PPTX file
    fs.writeFileSync(outputPath, Buffer.from(pptxBuffer));

    console.log(`\nSuccess! PPTX file created: ${outputPath}`);
    console.log(`File size: ${(pptxBuffer.length / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('\nError during conversion:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
