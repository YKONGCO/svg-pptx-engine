import argparse
import json
from pathlib import Path
from typing import Any


def load_sif(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def summarize_element(element: dict[str, Any], lines: list[str], prefix: str = "") -> None:
    element_type = element.get("type", "unknown")
    element_id = element.get("id", "")
    label = element_type

    if element_type == "shape" and element.get("shapeType") == "rect":
        label = "shape-rect"
    elif element_type == "shape" and element.get("shapeType"):
        label = f"shape-{element['shapeType']}"

    summary_parts = [f"{prefix}element:{label}", f"id:{element_id}"]

    if element_type == "text":
        text = " ".join(str(element.get("text", "")).split())
        summary_parts.append(f"content:{text}")
    elif element_type in {"image", "video", "audio"} and element.get("href"):
        summary_parts.append(f"content:{element['href']}")

    lines.append(" ".join(summary_parts))

    for child in element.get("children", []):
        summarize_element(child, lines, prefix=prefix + "  ")


def summarize_sif(data: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    slides = data.get("slides")
    if isinstance(slides, list):
        for slide_index, slide in enumerate(slides, start=1):
            lines.append(f"slide:{slide_index} id:{slide.get('id', '')}")
            for element in slide.get("elements", []):
                summarize_element(element, lines, prefix="  ")
        return lines

    elements = data.get("elements", [])
    for element in elements:
        summarize_element(element, lines)
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize SIF element ids for LLM inspection.")
    parser.add_argument("sif", help="Path to SIF JSON file")
    args = parser.parse_args()

    sif_path = Path(args.sif).resolve()
    data = load_sif(sif_path)
    for line in summarize_sif(data):
        print(line)


if __name__ == "__main__":
    main()
