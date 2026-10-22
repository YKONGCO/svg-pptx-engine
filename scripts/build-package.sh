#!/bin/bash
set -e

echo "=== Building svg2pptx package ==="

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PUBLISH_DIR="dist-npm-publish"
PACKAGE_NAME="svg2pptx"

# Clean previous build artifacts
echo "Cleaning previous build..."
rm -rf "$PUBLISH_DIR"
rm -rf dist

# Install dependencies. --ignore-scripts skips the root postinstall hook
# (which would try to rebuild on Windows where rollup may not be in PATH).
echo "Installing dependencies..."
npm install --ignore-scripts

# Build the local pptxgenjs workspace (this version contains the addGroup patch)
echo "Building pptxgenjs..."
npm run build:pptxgen

# Compile TypeScript to dist/
echo "Building TypeScript..."
npx tsc

# Prepare publish directory
mkdir -p "$PUBLISH_DIR"

# Copy build artifacts
echo "Copying build artifacts..."
[ -d dist ] && cp -r dist "$PUBLISH_DIR/"
[ -d bin ] && cp -r bin "$PUBLISH_DIR/"
[ -f README.md ] && cp README.md "$PUBLISH_DIR/"
[ -f README_CLI.md ] && cp README_CLI.md "$PUBLISH_DIR/"

# Copy runtime dependencies to bundled node_modules.
# Includes direct deps + pptxgenjs transitive deps so the local pptxgenjs
# build can resolve them when installed.
echo "Copying runtime dependencies..."
mkdir -p "$PUBLISH_DIR/node_modules"

RUNTIME_DEPS=(
  "jszip"
  "fast-xml-parser"
  "mathml2omml"
  "image-size"
  "pako"
  "setimmediate"
  "lie"
  "immediate"
)

for pkg in "${RUNTIME_DEPS[@]}"; do
  if [ -d "node_modules/$pkg" ]; then
    cp -r "node_modules/$pkg" "$PUBLISH_DIR/node_modules/"
  else
    echo "  WARNING: missing $pkg in node_modules"
  fi
done

# Replace the registry pptxgenjs with the local workspace build (has addGroup)
echo "Replacing pptxgenjs with local build..."
rm -rf "$PUBLISH_DIR/node_modules/pptxgenjs"
mkdir -p "$PUBLISH_DIR/node_modules/pptxgenjs"
[ -d packages/pptxgenjs/dist ] && cp -r packages/pptxgenjs/dist "$PUBLISH_DIR/node_modules/pptxgenjs/"
[ -f packages/pptxgenjs/package.json ] && cp packages/pptxgenjs/package.json "$PUBLISH_DIR/node_modules/pptxgenjs/"
[ -d packages/pptxgenjs/types ] && cp -r packages/pptxgenjs/types "$PUBLISH_DIR/node_modules/pptxgenjs/"

# Remove nested node_modules from any copied packages.
# -mindepth 1 is required so the find start path itself is not matched/deleted.
echo "Pruning nested node_modules..."
find "$PUBLISH_DIR/node_modules" -mindepth 1 -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true

# Generate a clean publish package.json (no private, workspaces, scripts, devDeps)
echo "Generating publish package.json..."
node <<'NODEEOF'
const fs = require('fs');
const src = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const pub = {
  name: 'svg2pptx',
  version: src.version,
  description: 'Convert SVG files to PPTX presentations',
  main: 'dist/index.js',
  types: 'dist/index.d.ts',
  bin: { svg2pptx: './bin/svg2pptx.js' },
  files: [
    'bin/',
    'dist/',
    'node_modules/',
    'README.md',
    'README_CLI.md',
    'package.json'
  ],
  keywords: src.keywords || ['svg', 'pptx', 'converter', 'slides'],
  license: src.license || 'MIT',
  dependencies: {
    'fast-xml-parser': src.dependencies['fast-xml-parser'],
    'jszip': src.dependencies['jszip'],
    'mathml2omml': src.dependencies['mathml2omml'],
    'pptxgenjs': '4.0.1'
  },
  bundledDependencies: [
    'pptxgenjs',
    'mathml2omml',
    'jszip',
    'fast-xml-parser',
    'image-size',
    'pako',
    'setimmediate',
    'lie',
    'immediate'
  ]
};
fs.writeFileSync('dist-npm-publish/package.json', JSON.stringify(pub, null, 2) + '\n');
console.log('  name:    ' + pub.name);
console.log('  version: ' + pub.version);
NODEEOF

# Pack the tarball (npm pack honors files + bundledDependencies)
echo "Creating tarball..."
cd "$PUBLISH_DIR"
npm pack --silent
cd "$ROOT_DIR"

TARBALL="${PUBLISH_DIR}/${PACKAGE_NAME}-$(node -p "require('./${PUBLISH_DIR}/package.json').version").tgz"

echo ""
echo "=== Build complete ==="
echo "Tarball: $TARBALL"
ls -la "$PUBLISH_DIR"/*.tgz
echo ""
echo "Install with: npm install -g $TARBALL"
