const fs = require('fs');
const path = require('path');
const { svgToSif } = require('../../dist/svg/converter.js');

const svgPath = process.argv[2];
if (!svgPath) {
  console.error('Missing SVG path');
  process.exit(1);
}

const absPath = path.resolve(svgPath);
const svg = fs.readFileSync(absPath, 'utf8');
const result = svgToSif(svg, { baseDir: path.dirname(absPath) });
process.stdout.write(JSON.stringify(result));
