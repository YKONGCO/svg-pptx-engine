#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function loadRuntime() {
  const distEntry = path.join(__dirname, '..', 'dist', 'index.js');

  if (!fs.existsSync(distEntry)) {
    throw new Error('Build output not found. Run "npm run build" first.');
  }

  return require(distEntry);
}

async function main() {
  const fixtureName = process.argv[2] || 'cover-slide';
  const outputPath = process.argv[3]
    ? path.resolve(process.cwd(), process.argv[3])
    : path.join(__dirname, '..', 'output', `${fixtureName}.pptx`);
  const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', `${fixtureName}.json`);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}`);
  }

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const { jsonToPptxFile } = loadRuntime();
  const fixtureContent = fs.readFileSync(fixturePath, 'utf8');

  await jsonToPptxFile(fixtureContent, outputPath, {
    title: fixtureName,
    author: 'svg-pptx-engine'
  });

  console.log(`Generated: ${outputPath}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
