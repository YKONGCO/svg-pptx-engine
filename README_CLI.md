# svg2pptx CLI

## Usage

```bash
svg2pptx <input> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `input` | SVG file or directory containing SVG files |

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output PPTX/SIF file path |
| `--sif` | Export as SIF JSON format instead of PPTX |
| `--no-sort` | Disable natural sorting |
| `--preserve-groups` | Preserve SVG group structure (default) |
| `--no-preserve-groups` | Flatten SVG groups |
| `--allow-remote` | Allow network requests (default) |
| `--no-allow-remote` | Disable network requests |
| `-v, --verbose` | Show detailed output |
| `-h, --help` | Show help |

### Examples

```bash
# Convert all SVGs in directory (natural sorted)
svg2pptx ./slides

# Convert with custom output path
svg2pptx ./slides -o presentation.pptx

# Convert single file
svg2pptx chart.svg -o output.pptx

# Export as SIF JSON
svg2pptx ./slides -o slides.json --sif

# Verbose mode
svg2pptx ./slides -v
```
