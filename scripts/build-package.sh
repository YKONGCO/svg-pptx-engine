#!/bin/bash
set -e

echo "=== Building svg2pptx package ==="

# Clean previous build
rm -rf dist-npm-publish/node_modules
rm -rf dist

# Install all dependencies (including dev) for build
# Use --ignore-scripts to prevent postinstall from running build (fails on Windows without rollup in PATH)
echo "Installing dependencies..."
npm install --ignore-scripts

# Build TypeScript and pptxgenjs
echo "Building pptxgenjs..."
cd packages/pptxgenjs && npx rollup -c --bundleConfigAsCjs && cd ../..
echo "Building TypeScript..."
npx tsc

# Copy dist folder (compiled TypeScript)
cp -r dist dist-npm-publish/

# Copy bin folder
cp -r bin dist-npm-publish/

# Copy README files
cp README.md README_CLI.md dist-npm-publish/

# Now copy all node_modules at once (skipping workspace-linked packages)
# We need pptxgenjs from local workspace to include addGroup
echo "Copying node_modules..."
mkdir -p dist-npm-publish/node_modules

# Copy all dependencies from root node_modules EXCEPT pptxgenjs (we use local version)
for pkg in jszip fast-xml-parser image-size pako setimmediate lie immediate mathml2omml; do
  if [ -d "node_modules/$pkg" ]; then
    cp -r "node_modules/$pkg" dist-npm-publish/node_modules/
  fi
done

# Copy local pptxgenjs (workspace version with addGroup) - OVERWRITE npm registry version
echo "Copying local pptxgenjs..."
rm -rf dist-npm-publish/node_modules/pptxgenjs
mkdir -p dist-npm-publish/node_modules/pptxgenjs
cp -r packages/pptxgenjs/dist dist-npm-publish/node_modules/pptxgenjs/
cp packages/pptxgenjs/package.json dist-npm-publish/node_modules/pptxgenjs/
cp -r packages/pptxgenjs/types dist-npm-publish/node_modules/pptxgenjs/

# Remove any nested node_modules from copied packages
find dist-npm-publish/node_modules -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true

# Update version in package.json
node -e "const p=require('./dist-npm-publish/package.json'); p.version='1.0.1'; require('fs').writeFileSync('./dist-npm-publish/package.json', JSON.stringify(p, null, 2));"

echo "=== Build complete ==="
echo "Package: dist-npm-publish/"
ls -la dist-npm-publish/
