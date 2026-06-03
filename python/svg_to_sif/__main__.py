import argparse
import json
from pathlib import Path

from .converter import svg_file_to_sif


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert SVG to SIF JSON.")
    parser.add_argument("svg", help="Input SVG file path")
    parser.add_argument("--base-dir", dest="base_dir", help="Base directory for relative media paths")
    parser.add_argument("--flatten-groups", action="store_true", help="Flatten SVG groups")
    parser.add_argument("--indent", type=int, default=2, help="JSON indent")
    args = parser.parse_args()

    svg_path = Path(args.svg).resolve()
    elements = svg_file_to_sif(
        svg_path,
        preserve_groups=not args.flatten_groups,
        base_dir=args.base_dir or str(svg_path.parent),
    )
    print(json.dumps(elements, ensure_ascii=False, indent=args.indent))


if __name__ == "__main__":
    main()
