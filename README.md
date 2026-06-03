# svg2pptx

Convert SVG files to PPTX presentations.

## Installation

### Global Install (Recommended)

```bash
npm install -g ./dist-npm-publish
```

### Standalone Distribution

```bash
# Download and extract
tar -xzf svg2pptx-standalone.tar.gz
# or
unzip svg2pptx-standalone.zip

# Install globally
npm install -g --force ./package
```

## Quick Start

```bash
svg2pptx ./slides
```

## CLI Usage

```bash
svg2pptx <input> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output PPTX file path |
| `--no-sort` | Disable natural sorting |
| `--preserve-groups` | Preserve SVG group structure |
| `--no-preserve-groups` | Flatten SVG groups |
| `--allow-remote` | Allow network requests (default: enabled) |
| `--no-allow-remote` | Disable network requests |
| `-v, --verbose` | Show detailed output |
| `-h, --help` | Show help |

### Examples

```bash
# Convert all SVGs in directory
svg2pptx ./slides

# Output to specific file
svg2pptx ./slides -o presentation.pptx

# Convert single file
svg2pptx chart.svg -o output.pptx

# Verbose output
svg2pptx ./slides -v
```

## Requirements

- Node.js >= 16.0.0

## Build & Package

```bash
# Build TypeScript and workspace packages
npm run build

# Package for distribution
npm run package

# Output:
#   dist-npm-publish/     - npm installable package
#   svg2pptx-standalone.tar.gz
#   svg2pptx-standalone.zip
```

### Package Structure

```
dist-npm-publish/
├── bin/
│   └── svg2pptx.js       # CLI entry
├── dist/                  # Compiled runtime
├── node_modules/          # Bundled dependencies
├── package.json
└── README.md
```

### Publishing

```bash
# Local install test
npm install -g ./dist-npm-publish

# Publish to npm (requires npm login)
npm publish ./dist-npm-publish --access public
```
