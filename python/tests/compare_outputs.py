import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from svg_to_sif import svg_file_to_sif  # noqa: E402


def canonicalize(value):
    if isinstance(value, dict):
        return {key: canonicalize(val) for key, val in sorted(value.items())}
    if isinstance(value, list):
        return [canonicalize(item) for item in value]
    return value


def load_js_result(svg_file: Path):
    output = subprocess.check_output(
        ["node", str(ROOT / "python/tests/js_baseline.js"), str(svg_file)],
        cwd=ROOT,
        text=True,
    )
    return json.loads(output)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare Python SIF output with JS baseline.")
    parser.add_argument(
        "paths",
        nargs="*",
        help="SVG files or directories. Defaults to example/",
    )
    args = parser.parse_args()

    targets = [Path(p) for p in args.paths] if args.paths else [ROOT / "example"]
    svg_files = []
    for target in targets:
        full = target if target.is_absolute() else (ROOT / target)
        if full.is_dir():
            svg_files.extend(sorted(full.rglob("*.svg")))
        elif full.suffix.lower() == ".svg" and full.exists():
            svg_files.append(full)

    if not svg_files:
        print("No SVG files found.", file=sys.stderr)
        return 1

    mismatches = []
    for svg_file in svg_files:
        py_result = svg_file_to_sif(svg_file, base_dir=str(svg_file.parent))
        js_result = load_js_result(svg_file)
        py_json = json.dumps(canonicalize(py_result), ensure_ascii=False, separators=(",", ":"))
        js_json = json.dumps(canonicalize(js_result), ensure_ascii=False, separators=(",", ":"))
        if py_json != js_json:
            mismatches.append(str(svg_file.relative_to(ROOT)))

    if mismatches:
        print("Mismatch files:")
        for item in mismatches:
            print(item)
        return 2

    print(f"All matched: {len(svg_files)} SVG files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
