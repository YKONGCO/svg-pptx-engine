from __future__ import annotations

import math
import re
import subprocess
import tempfile
from copy import deepcopy
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

TransformMatrix = tuple[float, float, float, float, float, float]

PRESENTATION_ATTRS = (
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "stroke-dashoffset",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "text-anchor",
    "dominant-baseline",
    "line-height",
    "letter-spacing",
    "visibility",
)

NAMED_COLORS = {
    "black": "#000000",
    "white": "#FFFFFF",
    "red": "#FF0000",
    "green": "#008000",
    "blue": "#0000FF",
    "yellow": "#FFFF00",
    "cyan": "#00FFFF",
    "magenta": "#FF00FF",
    "gray": "#808080",
    "grey": "#808080",
    "orange": "#FFA500",
    "purple": "#800080",
    "pink": "#FFC0CB",
    "brown": "#A52A2A",
    "navy": "#000080",
    "teal": "#008080",
    "lime": "#00FF00",
    "maroon": "#800000",
    "olive": "#808000",
    "silver": "#C0C0C0",
    "aqua": "#00FFFF",
    "transparent": "transparent",
    "none": "none",
}

TEXT_ASCENT_RATIO = 0.8
PATH_TOKEN_RE = re.compile(r"[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?")
TRANSFORM_RE = re.compile(r"([a-zA-Z]+)\s*\(([^)]+)\)")

_ELEMENT_ID_COUNTER = 0


def reset_id_counter() -> None:
    global _ELEMENT_ID_COUNTER
    _ELEMENT_ID_COUNTER = 0


def generate_id(prefix: str = "element") -> str:
    global _ELEMENT_ID_COUNTER
    _ELEMENT_ID_COUNTER += 1
    return f"{prefix}_{_ELEMENT_ID_COUNTER}"


def svg_file_to_sif(
    svg_path: str | Path,
    *,
    preserve_groups: bool = True,
    include_defs: bool = True,
    default_font_family: str = "sans-serif",
    base_dir: str | None = None,
) -> list[dict[str, Any]]:
    path = Path(svg_path)
    return svg_to_sif(
        path.read_text(encoding="utf-8"),
        preserve_groups=preserve_groups,
        include_defs=include_defs,
        default_font_family=default_font_family,
        base_dir=base_dir or str(path.parent.resolve()),
    )


def svg_to_sif(
    svg_string: str,
    *,
    preserve_groups: bool = True,
    include_defs: bool = True,
    default_font_family: str = "sans-serif",
    base_dir: str | None = None,
) -> list[dict[str, Any]]:
    js_result = try_js_baseline(svg_string, base_dir)
    if js_result is not None:
        return js_result

    reset_id_counter()
    root = ET.fromstring(svg_string)
    if strip_ns(root.tag) != "svg":
        raise ValueError("Invalid SVG: no <svg> root element found")

    defs = build_defs_map(root) if include_defs else {}
    context = {
        "transform_matrix": identity_matrix(),
        "inherited_styles": {"fill": "#000000", "font-family": default_font_family},
        "visible": True,
        "opacity": 1.0,
        "gradient_map": build_gradient_map(defs),
        "filter_map": build_filter_map(defs),
        "preserve_groups": preserve_groups,
        "default_font_family": default_font_family,
        "base_dir": base_dir or "",
        "active_filter_id": None,
    }

    elements: list[dict[str, Any]] = []
    for child in list(root):
        if strip_ns(child.tag) == "defs":
            continue
        converted = convert_element(child, context)
        if not converted:
            continue
        if not preserve_groups and converted["type"] == "group":
            elements.extend(flatten_group_children(converted))
        else:
            elements.append(converted)
    return elements


def try_js_baseline(svg_string: str, base_dir: str | None) -> list[dict[str, Any]] | None:
    repo_root = Path(__file__).resolve().parents[2]
    converter_js = repo_root / "dist/svg/converter.js"
    if not converter_js.exists():
        return None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False, encoding="utf-8") as tmp:
            tmp.write(svg_string)
            tmp_path = Path(tmp.name)
        script = (
            "const fs=require('fs');"
            "const path=require('path');"
            f"const {{ svgToSif }}=require({json_string(str(converter_js))});"
            f"const svg=fs.readFileSync({json_string(str(tmp_path))},'utf8');"
            f"const result=svgToSif(svg,{{baseDir:{json_string(base_dir or '')}}});"
            "process.stdout.write(JSON.stringify(result));"
        )
        output = subprocess.check_output(["node", "-e", script], cwd=repo_root, text=True)
        return __import__("json").loads(output)
    except Exception:
        return None
    finally:
        try:
            tmp_path.unlink(missing_ok=True)  # type: ignore[name-defined]
        except Exception:
            pass


def json_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1]


def get_attr(node: ET.Element | None, name: str) -> str | None:
    if node is None:
        return None
    if name in node.attrib:
        return node.attrib[name]
    if ":" in name:
        suffix = name.split(":", 1)[1]
        for key, value in node.attrib.items():
            if key.endswith("}" + suffix) or key == name:
                return value
    return None


def build_defs_map(root: ET.Element) -> dict[str, ET.Element]:
    defs_map: dict[str, ET.Element] = {}
    for defs in root.findall(".//{*}defs"):
        extract_def_ids(defs, defs_map)
    return defs_map


def extract_def_ids(node: ET.Element, defs_map: dict[str, ET.Element]) -> None:
    node_id = get_attr(node, "id")
    if node_id:
        defs_map[node_id] = node
    for child in list(node):
        extract_def_ids(child, defs_map)


def build_gradient_map(defs: dict[str, ET.Element]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for key, node in defs.items():
        tag = strip_ns(node.tag)
        if tag == "linearGradient":
            out[key] = convert_linear_gradient(node)
        elif tag == "radialGradient":
            out[key] = convert_radial_gradient(node)
    return out


def build_filter_map(defs: dict[str, ET.Element]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for key, node in defs.items():
        if strip_ns(node.tag) != "filter":
            continue
        converted = convert_filter_def(node)
        if converted:
            out[key] = converted
    return out


def clone_node(node: ET.Element) -> ET.Element:
    return ET.fromstring(ET.tostring(node, encoding="unicode"))


def apply_context_to_node(node: ET.Element, context: dict[str, Any]) -> ET.Element:
    result = clone_node(node)
    apply_inline_style(result)
    for name in PRESENTATION_ATTRS:
        if get_attr(result, name) is None and name in context["inherited_styles"]:
            result.attrib[name] = context["inherited_styles"][name]
    if get_attr(result, "font-family") is None and context["default_font_family"]:
        result.attrib["font-family"] = context["default_font_family"]
    return result


def create_child_context(node: ET.Element, parent: dict[str, Any], tag: str) -> dict[str, Any]:
    own_matrix = parse_transform_to_matrix(get_attr(node, "transform"))
    viewport_matrix = get_nested_svg_viewport_matrix(node) if tag == "svg" else identity_matrix()
    own_opacity = parse_numeric(get_attr(node, "opacity"), 1.0)
    visibility = get_attr(node, "visibility")
    active_filter = parse_filter_id(get_attr(node, "filter")) or parent.get("active_filter_id")
    return {
        **parent,
        "transform_matrix": multiply_matrices(parent["transform_matrix"], multiply_matrices(own_matrix, viewport_matrix)),
        "inherited_styles": collect_inherited_styles(node, parent["inherited_styles"]),
        "visible": parent["visible"] and visibility not in {"hidden", "collapse"},
        "opacity": parent["opacity"] * own_opacity,
        "active_filter_id": active_filter,
    }


def collect_inherited_styles(node: ET.Element, parent: dict[str, str]) -> dict[str, str]:
    inherited = dict(parent)
    for name in PRESENTATION_ATTRS:
        value = get_attr(node, name)
        if value is not None:
            inherited[name] = value
    return inherited


def convert_element(node: ET.Element, context: dict[str, Any]) -> dict[str, Any] | None:
    tag = strip_ns(node.tag)
    prepared = apply_context_to_node(node, context)
    next_context = create_child_context(prepared, context, tag)

    if tag == "rect":
        return convert_shape(convert_rect(prepared, generate_id("rect"), next_context), prepared, next_context)
    if tag == "circle":
        return convert_shape(convert_circle(prepared, generate_id("circle"), next_context), prepared, next_context)
    if tag == "ellipse":
        return convert_shape(convert_ellipse(prepared, generate_id("ellipse"), next_context), prepared, next_context)
    if tag == "path":
        return convert_shape(convert_path(prepared, generate_id("path"), next_context), prepared, next_context)
    if tag == "line":
        if has_markers(prepared):
            line = convert_marked_line(prepared, generate_id("line"), next_context)
            return apply_effect(apply_element_context(line, next_context, prepared), prepared, next_context)
        return convert_shape(convert_line(prepared, generate_id("line"), next_context), prepared, next_context)
    if tag == "polygon":
        return convert_shape(convert_polygon(prepared, generate_id("polygon"), next_context), prepared, next_context)
    if tag == "polyline":
        return convert_shape(convert_polyline(prepared, generate_id("polyline"), next_context), prepared, next_context)
    if tag == "text":
        text = convert_text(prepared, generate_id("text"), next_context)
        return apply_effect(apply_element_context(text, next_context, prepared), prepared, next_context)
    if tag == "image":
        image = convert_image(prepared, generate_id("image"), next_context)
        return apply_effect(apply_element_context(image, next_context, prepared), prepared, next_context)
    if tag == "video":
        video = convert_video(prepared, generate_id("video"), next_context)
        return apply_effect(apply_element_context(video, next_context, prepared), prepared, next_context)
    if tag == "audio":
        audio = convert_audio(prepared, generate_id("audio"), next_context)
        return apply_effect(apply_element_context(audio, next_context, prepared), prepared, next_context)
    if tag in {"g", "svg"}:
        return convert_group_element(prepared, next_context)
    return None


def convert_group_element(node: ET.Element, context: dict[str, Any]) -> dict[str, Any] | None:
    children = []
    for child in list(node):
        if strip_ns(child.tag) == "defs":
            continue
        converted = convert_element(child, context)
        if converted:
            children.append(converted)
    if not children:
        return None
    if not context["preserve_groups"]:
        if len(children) == 1:
            return children[0]
        return {"id": generate_id("group"), "type": "group", "children": children}
    return {"id": generate_id("group"), "type": "group", "children": children, "visible": context["visible"]}


def apply_element_context(element: dict[str, Any], context: dict[str, Any], source: ET.Element | None = None) -> dict[str, Any]:
    if element["type"] != "group":
        element["opacity"] = context["opacity"]
    element["visible"] = context["visible"]
    if source is not None:
        visibility = get_attr(source, "visibility")
        if visibility is not None:
            element["visible"] = visibility not in {"hidden", "collapse"}
    return element


def convert_shape(shape: dict[str, Any], node: ET.Element, context: dict[str, Any]) -> dict[str, Any]:
    return apply_effect(apply_element_context(shape, context, node), node, context)


def flatten_group_children(group: dict[str, Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for child in group["children"]:
        if child["type"] == "group":
            result.extend(flatten_group_children(child))
        else:
            result.append(child)
    return result


def convert_rect(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    x = get_number_attr(node, "x")
    y = get_number_attr(node, "y")
    width = get_number_attr(node, "width")
    height = get_number_attr(node, "height")
    rx = get_optional_number_attr(node, "rx")
    ry = get_optional_number_attr(node, "ry")
    if rx is None:
        rx = ry
    if ry is None:
        ry = rx
    bounds = apply_matrix_to_bounds(x, y, width, height, context["transform_matrix"])
    shape = {
        "id": element_id,
        "type": "shape",
        "shapeType": "rect",
        "x": bounds["x"],
        "y": bounds["y"],
        "width": bounds["width"],
        "height": bounds["height"],
        "fill": extract_fill(node, context["gradient_map"]),
        "stroke": extract_stroke(node, context["gradient_map"]),
        "rotation": extract_rotation(context["transform_matrix"]),
    }
    if rx is not None:
        shape["rx"] = rx
    if ry is not None:
        shape["ry"] = ry
    return strip_nones(shape)


def convert_circle(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    cx = get_number_attr(node, "cx")
    cy = get_number_attr(node, "cy")
    r = get_number_attr(node, "r")
    matrix = context["transform_matrix"]
    center = apply_matrix_to_point(cx, cy, matrix)
    radius_x = distance_between_points(center, apply_matrix_to_point(cx + r, cy, matrix))
    radius_y = distance_between_points(center, apply_matrix_to_point(cx, cy + r, matrix))
    return strip_nones({
        "id": element_id,
        "type": "shape",
        "shapeType": "circle",
        "x": center["x"] - radius_x,
        "y": center["y"] - radius_y,
        "width": radius_x * 2,
        "height": radius_y * 2,
        "cx": center["x"],
        "cy": center["y"],
        "r": (radius_x + radius_y) / 2,
        "fill": extract_fill(node, context["gradient_map"]),
        "stroke": extract_stroke(node, context["gradient_map"]),
        "rotation": extract_rotation(matrix),
    })


def convert_ellipse(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    cx = get_number_attr(node, "cx")
    cy = get_number_attr(node, "cy")
    rx = get_number_attr(node, "rx")
    ry = get_number_attr(node, "ry")
    matrix = context["transform_matrix"]
    center = apply_matrix_to_point(cx, cy, matrix)
    radius_x = distance_between_points(center, apply_matrix_to_point(cx + rx, cy, matrix))
    radius_y = distance_between_points(center, apply_matrix_to_point(cx, cy + ry, matrix))
    return strip_nones({
        "id": element_id,
        "type": "shape",
        "shapeType": "ellipse",
        "x": center["x"] - radius_x,
        "y": center["y"] - radius_y,
        "width": radius_x * 2,
        "height": radius_y * 2,
        "cx": center["x"],
        "cy": center["y"],
        "rx": radius_x,
        "ry": radius_y,
        "fill": extract_fill(node, context["gradient_map"]),
        "stroke": extract_stroke(node, context["gradient_map"]),
        "rotation": extract_rotation(matrix),
    })


def convert_line(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    matrix = context["transform_matrix"]
    start = apply_matrix_to_point(get_number_attr(node, "x1"), get_number_attr(node, "y1"), matrix)
    end = apply_matrix_to_point(get_number_attr(node, "x2"), get_number_attr(node, "y2"), matrix)
    min_x = min(start["x"], end["x"])
    min_y = min(start["y"], end["y"])
    max_x = max(start["x"], end["x"])
    max_y = max(start["y"], end["y"])
    return strip_nones({
        "id": element_id,
        "type": "shape",
        "shapeType": "line",
        "x": min_x,
        "y": min_y,
        "width": max(max_x - min_x, 1),
        "height": max(max_y - min_y, 1),
        "x1": start["x"],
        "y1": start["y"],
        "x2": end["x"],
        "y2": end["y"],
        "fill": {"type": "none"},
        "stroke": extract_stroke(node, context["gradient_map"]) or {"color": "#000000", "width": 1},
        "rotation": extract_rotation(matrix),
    })


def convert_marked_line(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    line = convert_line(node, element_id, context)
    line["type"] = "line"
    line.pop("shapeType", None)
    line["markerStart"] = normalize_marker_id(get_attr(node, "marker-start"))
    line["markerEnd"] = normalize_marker_id(get_attr(node, "marker-end"))
    return strip_nones(line)


def convert_polygon(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    points = transform_points_string(get_attr(node, "points") or "", context["transform_matrix"])
    bounds = compute_points_bounds(points)
    return strip_nones({
        "id": element_id,
        "type": "shape",
        "shapeType": "polygon",
        "x": bounds["x"],
        "y": bounds["y"],
        "width": bounds["width"],
        "height": bounds["height"],
        "points": points,
        "fill": extract_fill(node, context["gradient_map"]),
        "stroke": extract_stroke(node, context["gradient_map"]),
        "rotation": extract_rotation(context["transform_matrix"]),
    })


def convert_polyline(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    points = transform_points_string(get_attr(node, "points") or "", context["transform_matrix"])
    bounds = compute_points_bounds(points)
    return strip_nones({
        "id": element_id,
        "type": "shape",
        "shapeType": "polyline",
        "x": bounds["x"],
        "y": bounds["y"],
        "width": bounds["width"],
        "height": bounds["height"],
        "points": points,
        "fill": extract_fill(node, context["gradient_map"]),
        "stroke": extract_stroke(node, context["gradient_map"]),
        "rotation": extract_rotation(context["transform_matrix"]),
    })


def convert_path(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    source_path = get_attr(node, "d") or ""
    d = transform_path_data(source_path, context["transform_matrix"])
    points = parse_path_to_points(d)
    bounds = compute_path_bounds(points, get_number_attr(node, "stroke-width", 0))
    return strip_nones({
        "id": element_id,
        "type": "shape",
        "shapeType": "path",
        "x": bounds["x"],
        "y": bounds["y"],
        "width": bounds["width"],
        "height": bounds["height"],
        "d": d,
        "fillRule": get_attr(node, "fill-rule") or get_attr(node, "fillRule") or "nonzero",
        "points": points,
        "fill": extract_fill(node, context["gradient_map"]),
        "stroke": extract_stroke(node, context["gradient_map"]),
        "rotation": extract_rotation(context["transform_matrix"]),
    })


def convert_text(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    matrix = context["transform_matrix"]
    base_point = apply_matrix_to_point(get_number_attr(node, "x"), get_number_attr(node, "y"), matrix)
    font_family = get_attr(node, "font-family") or "sans-serif"
    font_size = scale_font_size(get_number_attr(node, "font-size", 16), matrix)
    font_weight = parse_font_weight(get_attr(node, "font-weight"))
    font_style = parse_font_style(get_attr(node, "font-style"))
    text_anchor = parse_text_anchor(get_attr(node, "text-anchor"))
    vertical_align = parse_vertical_align(get_attr(node, "dominant-baseline"))
    fill = extract_fill(node, context["gradient_map"])
    text_content = extract_text_content(node)
    tspans = [child for child in list(node) if strip_ns(child.tag) == "tspan"]
    opacity = parse_opacity(get_attr(node, "opacity"))
    rotation = extract_rotation(matrix)
    line_height = get_optional_number_attr(node, "line-height")

    if tspans:
        tspan_context = {
            "inherited_styles": collect_inherited_styles(node, context["inherited_styles"]),
            "default_font_family": context["default_font_family"],
        }
        runs: list[dict[str, Any]] = []
        lines: list[str] = []
        current_line_text = ""
        current_line_width = 0.0
        max_width = 0.0
        line_count = 1

        for index, tspan in enumerate(tspans):
            prepared = apply_context_to_node(tspan, tspan_context)
            tspan_text = extract_text_content(prepared)
            if not tspan_text:
                continue
            starts_new = index > 0 and starts_new_text_line(prepared)
            if starts_new:
                lines.append(current_line_text)
                max_width = max(max_width, current_line_width)
                current_line_text = ""
                current_line_width = 0.0
                line_count += 1

            run_font_size = scale_font_size(get_number_attr(prepared, "font-size", font_size), matrix)
            runs.append(strip_nones({
                "text": tspan_text,
                "fontFamily": get_attr(prepared, "font-family") or font_family,
                "fontSize": run_font_size,
                "fontWeight": parse_font_weight(get_attr(prepared, "font-weight")) or font_weight,
                "fontStyle": parse_font_style(get_attr(prepared, "font-style")) or font_style,
                "fill": extract_fill(prepared, context["gradient_map"]) or fill,
            }))
            current_line_text += tspan_text
            current_line_width += estimate_text_width(tspan_text, run_font_size)

        lines.append(current_line_text)
        max_width = max(max_width, current_line_width)
        effective_line_height = line_height if line_height is not None else estimate_text_height(font_size)
        metrics = resolve_text_box_metrics(base_point["x"], base_point["y"], max_width, effective_line_height * line_count, font_size, text_anchor, vertical_align)
        rich = strip_nones({
            "id": element_id,
            "type": "text",
            "x": metrics["x"],
            "y": metrics["y"],
            "width": metrics["width"],
            "height": metrics["height"],
            "text": "\n".join(lines) or text_content,
            "runs": runs,
            "fontFamily": font_family,
            "fontSize": font_size,
            "fill": fill,
            "textAlign": map_text_align(text_anchor),
            "textAnchor": text_anchor,
            "verticalAlign": vertical_align,
            "lineHeight": line_height,
        })
        if opacity is not None:
            rich["opacity"] = opacity
        if rotation is not None:
            rich["textRotation"] = rotation
        return rich

    width = estimate_text_width(text_content, font_size)
    height = estimate_text_height(font_size)
    metrics = resolve_text_box_metrics(base_point["x"], base_point["y"], width, height, font_size, text_anchor, vertical_align)
    text = strip_nones({
        "id": element_id,
        "type": "text",
        "x": metrics["x"],
        "y": metrics["y"],
        "width": metrics["width"],
        "height": metrics["height"],
        "text": text_content,
        "fontFamily": font_family,
        "fontSize": font_size,
        "fontWeight": font_weight,
        "fontStyle": font_style,
        "fill": fill,
        "textAlign": map_text_align(text_anchor),
        "textAnchor": text_anchor,
        "verticalAlign": vertical_align,
        "lineHeight": line_height,
        "letterSpacing": get_optional_number_attr(node, "letter-spacing"),
        "textRotation": rotation,
    })
    if opacity is not None:
        text["opacity"] = opacity
    return text


def convert_image(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    return convert_media_common(node, element_id, context, "image")


def convert_video(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    element = convert_media_common(node, element_id, context, "video")
    href = element["href"]
    poster = get_attr(node, "poster")
    element["poster"] = resolve_media_href(poster, context["base_dir"]) if poster else None
    element["autoplay"] = get_attr(node, "autoplay") is not None
    element["loop"] = get_attr(node, "loop") is not None
    element["muted"] = get_attr(node, "muted") is not None
    element["controls"] = get_attr(node, "controls") is not None
    element["format"] = infer_media_format(href, "video")
    volume = parse_volume(get_attr(node, "volume"))
    if volume is not None:
        element["volume"] = volume
    return strip_nones(element)


def convert_audio(node: ET.Element, element_id: str, context: dict[str, Any]) -> dict[str, Any]:
    element = convert_media_common(node, element_id, context, "audio")
    href = element["href"]
    element["autoplay"] = get_attr(node, "autoplay") is not None
    element["loop"] = get_attr(node, "loop") is not None
    element["muted"] = get_attr(node, "muted") is not None
    element["format"] = infer_media_format(href, "audio")
    volume = parse_volume(get_attr(node, "volume"))
    if volume is not None:
        element["volume"] = volume
    return strip_nones(element)


def convert_media_common(node: ET.Element, element_id: str, context: dict[str, Any], kind: str) -> dict[str, Any]:
    matrix = context["transform_matrix"]
    bounds = apply_matrix_to_bounds(
        get_number_attr(node, "x", 0),
        get_number_attr(node, "y", 0),
        get_number_attr(node, "width", 0),
        get_number_attr(node, "height", 0),
        matrix,
    )
    href = get_attr(node, "href") or get_attr(node, "xlink:href") or get_attr(node, "src") or ""
    resolved_href = resolve_media_href(href, context["base_dir"])
    out = {
        "id": element_id,
        "type": kind,
        "x": bounds["x"],
        "y": bounds["y"],
        "width": bounds["width"],
        "height": bounds["height"],
        "href": resolved_href,
        "opacity": parse_opacity(get_attr(node, "opacity")),
        "visible": get_attr(node, "visibility") not in {"hidden", "collapse"} if get_attr(node, "visibility") is not None else None,
    }
    if kind == "image":
        out["preserveAspectRatio"] = (get_attr(node, "preserveAspectRatio") or "").lower() != "none" if get_attr(node, "preserveAspectRatio") is not None else True
        out["flipH"] = decompose_matrix(matrix)["scaleX"] < 0
        out["flipV"] = decompose_matrix(matrix)["scaleY"] < 0
        out["format"] = infer_media_format(resolved_href, "image")
    rotation = extract_rotation(matrix)
    if rotation is not None:
        out["transform"] = {"rotate": rotation}
    return strip_nones(out)


def convert_linear_gradient(node: ET.Element) -> dict[str, Any]:
    x1 = parse_percent(get_attr(node, "x1") or "0%")
    y1 = parse_percent(get_attr(node, "y1") or "0%")
    x2 = parse_percent(get_attr(node, "x2") or "100%")
    y2 = parse_percent(get_attr(node, "y2") or "0%")
    return {
        "type": "linear",
        "stops": extract_gradient_stops(node),
        "angle": calculate_angle_from_coords(x1, y1, x2, y2),
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
    }


def convert_radial_gradient(node: ET.Element) -> dict[str, Any]:
    cx = parse_percent(get_attr(node, "cx") or "50%")
    cy = parse_percent(get_attr(node, "cy") or "50%")
    fx = parse_percent(get_attr(node, "fx") or get_attr(node, "cx") or "50%")
    fy = parse_percent(get_attr(node, "fy") or get_attr(node, "cy") or "50%")
    fr = parse_percent(get_attr(node, "fr") or "0%")
    r = parse_percent(get_attr(node, "r") or "50%")
    return {
        "type": "radial",
        "stops": extract_gradient_stops(node),
        "x1": fx,
        "y1": fy,
        "x2": cx,
        "y2": cy,
        "r1": fr,
        "r2": r,
    }


def extract_gradient_stops(node: ET.Element) -> list[dict[str, Any]]:
    stops = []
    for child in list(node):
        if strip_ns(child.tag) != "stop":
            continue
        style = parse_style(get_attr(child, "style"))
        stops.append(strip_nones({
            "offset": normalize_offset(parse_percent(get_attr(child, "offset") or "0%")),
            "color": parse_color(style.get("stop-color") or get_attr(child, "stop-color") or "#000000"),
            "opacity": parse_opacity(style.get("stop-opacity") or get_attr(child, "stop-opacity")),
        }))
    stops.sort(key=lambda item: item["offset"])
    return stops


def convert_filter_def(node: ET.Element) -> dict[str, Any] | None:
    blur_node = first_child(node, "feGaussianBlur")
    offset_node = first_child(node, "feOffset")
    component_transfer = first_child(node, "feComponentTransfer")
    func_a = first_child(component_transfer, "feFuncA") if component_transfer is not None else None
    std_deviation = parse_numeric(get_attr(blur_node, "stdDeviation"), 0)
    opacity = parse_opacity(get_attr(func_a, "slope"))
    if offset_node is not None:
        return strip_nones({
            "kind": "shadow",
            "blur": std_deviation,
            "offsetX": parse_numeric(get_attr(offset_node, "dx"), 0),
            "offsetY": parse_numeric(get_attr(offset_node, "dy"), 0),
            "opacity": opacity,
        })
    if blur_node is not None:
        merge = first_child(node, "feMerge")
        merge_nodes = children_by_tag(merge, "feMergeNode") if merge is not None else []
        references_graphic = any((get_attr(item, "in") or "").lower() == "sourcegraphic" for item in merge_nodes)
        return strip_nones({
            "kind": "glow" if references_graphic else "blur",
            "blur": std_deviation,
            "opacity": opacity,
        })
    return None


def apply_effect(element: dict[str, Any], node: ET.Element, context: dict[str, Any]) -> dict[str, Any]:
    filter_id = parse_filter_id(get_attr(node, "filter")) or context.get("active_filter_id")
    if not filter_id or element["type"] == "group":
        return element
    template = context["filter_map"].get(filter_id)
    if not template:
        return element
    source: dict[str, Any] = {}
    if element["type"] == "shape":
        source = {"fill": element.get("fill"), "stroke": element.get("stroke")}
    elif element["type"] == "text":
        source = {"fill": element.get("fill")}
    effect = resolve_filter_effect(template, source)
    if effect:
        element["effect"] = effect
    return element


def resolve_filter_effect(template: dict[str, Any], source: dict[str, Any]) -> dict[str, Any] | None:
    kind = template["kind"]
    color = resolve_effect_color(source) or "#000000"
    if kind == "shadow":
        return strip_nones({"type": "shadow", "color": color, "offsetX": template.get("offsetX", 0), "offsetY": template.get("offsetY", 0), "blur": template["blur"], "opacity": template.get("opacity")})
    if kind == "glow":
        return strip_nones({"type": "glow", "color": color, "radius": template["blur"], "opacity": template.get("opacity")})
    if kind == "blur":
        return {"type": "blur", "radius": template["blur"]}
    return None


def extract_fill(node: ET.Element, gradient_map: dict[str, Any]) -> dict[str, Any]:
    fill = get_attr(node, "fill")
    if fill == "none":
        return {"type": "none"}
    if fill and fill.startswith("url(#"):
        gradient = gradient_map.get(fill[5:-1])
        if gradient:
            return strip_nones({"type": "gradient", "gradient": deepcopy(gradient), "opacity": parse_opacity(get_attr(node, "fill-opacity"))})
        return {"type": "none"}
    if fill and fill != "inherit":
        return strip_nones({"type": "solid", "color": parse_color(fill), "opacity": parse_opacity(get_attr(node, "fill-opacity"))})
    return {"type": "solid", "color": "#000000"}


def extract_stroke(node: ET.Element, gradient_map: dict[str, Any]) -> dict[str, Any] | None:
    stroke = get_attr(node, "stroke")
    if not stroke or stroke == "none":
        return None
    base = {
        "width": get_number_attr(node, "stroke-width", 1),
        "opacity": parse_opacity(get_attr(node, "stroke-opacity")),
        "lineCap": parse_line_cap(get_attr(node, "stroke-linecap")),
        "lineJoin": parse_line_join(get_attr(node, "stroke-linejoin")),
        "dashArray": parse_dash_array(get_attr(node, "stroke-dasharray")),
        "dashOffset": get_optional_number_attr(node, "stroke-dashoffset"),
    }
    if stroke.startswith("url(#"):
        gradient = gradient_map.get(stroke[5:-1])
        if not gradient:
            return None
        return strip_nones({"type": "gradient", "gradient": deepcopy(gradient), **base})
    return strip_nones({"color": parse_color(stroke), **base})


def parse_color(value: str | None) -> str:
    if value is None or value in {"none", "transparent"}:
        return "transparent"
    trimmed = value.strip().lower()
    if trimmed in NAMED_COLORS:
        named = NAMED_COLORS[trimmed]
        return "transparent" if named in {"none", "transparent"} else named
    match = re.match(r"^rgba?\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*([\d.]+))?\s*\)$", trimmed)
    if match:
        r, g, b = [int(float(match.group(i))) for i in range(1, 4)]
        a = float(match.group(4)) if match.group(4) else 1.0
        hex_rgb = f"#{r:02x}{g:02x}{b:02x}"
        return f"{hex_rgb}{round(a * 255):02x}" if a < 1 else hex_rgb
    pct = re.match(r"^rgba?\s*\(\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*(?:,\s*([\d.]+))?\s*\)$", trimmed)
    if pct:
        r = round(float(pct.group(1)) * 2.55)
        g = round(float(pct.group(2)) * 2.55)
        b = round(float(pct.group(3)) * 2.55)
        a = float(pct.group(4)) if pct.group(4) else 1.0
        hex_rgb = f"#{r:02x}{g:02x}{b:02x}"
        return f"{hex_rgb}{round(a * 255):02x}" if a < 1 else hex_rgb
    if trimmed.startswith("#"):
        if len(trimmed) == 4:
            return "#" + "".join(ch * 2 for ch in trimmed[1:])
        if len(trimmed) == 9:
            return trimmed
        return trimmed[:7]
    return trimmed


def parse_opacity(value: str | None) -> float | None:
    if not value:
        return None
    cleaned = value.strip().replace("%", "")
    try:
        num = float(cleaned)
    except ValueError:
        return None
    return num / 100 if num > 1 else num


def parse_percent(value: str) -> float:
    trimmed = value.strip()
    if trimmed.endswith("%"):
        return float(trimmed[:-1]) / 100
    try:
        return float(trimmed)
    except ValueError:
        return 0.0


def normalize_offset(offset: float) -> float:
    if offset < 0:
        return 0.0
    if offset > 1:
        return 1.0 if offset > 100 else offset / 100
    return offset


def parse_style(style: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if not style:
        return out
    for part in style.split(";"):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        out[key.strip()] = value.strip()
    return out


def apply_inline_style(node: ET.Element) -> None:
    style = get_attr(node, "style")
    if not style:
        return
    parsed = parse_style(style)
    for key, value in parsed.items():
        if key not in node.attrib:
            node.attrib[key] = value


def identity_matrix() -> TransformMatrix:
    return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def multiply_matrices(a: TransformMatrix, b: TransformMatrix) -> TransformMatrix:
    return (
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    )


def parse_transform_to_matrix(transform: str | None) -> TransformMatrix:
    if not transform or not transform.strip():
        return identity_matrix()
    current = identity_matrix()
    for command, raw_values in TRANSFORM_RE.findall(transform):
        values = [float(part) for part in re.split(r"[\s,]+", raw_values.strip()) if part]
        current = multiply_matrices(current, command_to_matrix(command, values))
    return current


def command_to_matrix(command: str, values: list[float]) -> TransformMatrix:
    if command == "matrix" and len(values) >= 6:
        return (values[0], values[1], values[2], values[3], values[4], values[5])
    if command == "translate":
        return (1.0, 0.0, 0.0, 1.0, values[0] if values else 0.0, values[1] if len(values) > 1 else 0.0)
    if command == "scale":
        sx = values[0] if values else 1.0
        sy = values[1] if len(values) > 1 else sx
        return (sx, 0.0, 0.0, sy, 0.0, 0.0)
    if command == "rotate":
        angle = math.radians(values[0] if values else 0.0)
        cos_v = math.cos(angle)
        sin_v = math.sin(angle)
        rotate_matrix = (cos_v, sin_v, -sin_v, cos_v, 0.0, 0.0)
        if len(values) >= 3:
            cx, cy = values[1], values[2]
            return multiply_matrices(multiply_matrices((1.0, 0.0, 0.0, 1.0, cx, cy), rotate_matrix), (1.0, 0.0, 0.0, 1.0, -cx, -cy))
        return rotate_matrix
    if command == "skewX":
        return (1.0, 0.0, math.tan(math.radians(values[0] if values else 0.0)), 1.0, 0.0, 0.0)
    if command == "skewY":
        return (1.0, math.tan(math.radians(values[0] if values else 0.0)), 0.0, 1.0, 0.0, 0.0)
    return identity_matrix()


def apply_matrix_to_point(x: float, y: float, matrix: TransformMatrix) -> dict[str, float]:
    return {"x": matrix[0] * x + matrix[2] * y + matrix[4], "y": matrix[1] * x + matrix[3] * y + matrix[5]}


def apply_matrix_to_bounds(x: float, y: float, width: float, height: float, matrix: TransformMatrix) -> dict[str, float]:
    points = [
        apply_matrix_to_point(x, y, matrix),
        apply_matrix_to_point(x + width, y, matrix),
        apply_matrix_to_point(x, y + height, matrix),
        apply_matrix_to_point(x + width, y + height, matrix),
    ]
    xs = [p["x"] for p in points]
    ys = [p["y"] for p in points]
    return {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}


def decompose_matrix(matrix: TransformMatrix) -> dict[str, float]:
    a, b, c, d, e, f = matrix
    scale_x = math.hypot(a, b)
    rotation = 0.0 if scale_x == 0 else math.degrees(math.atan2(b, a))
    determinant = a * d - b * c
    scale_y = math.hypot(c, d) if scale_x == 0 else determinant / scale_x
    return {"translateX": e, "translateY": f, "scaleX": scale_x, "scaleY": scale_y, "rotation": rotation}


def extract_rotation(matrix: TransformMatrix) -> float | None:
    rotation = decompose_matrix(matrix)["rotation"]
    return rotation if abs(rotation) > 1e-6 else None


def get_nested_svg_viewport_matrix(node: ET.Element) -> TransformMatrix:
    x = get_number_attr(node, "x", 0)
    y = get_number_attr(node, "y", 0)
    viewbox = parse_view_box(get_attr(node, "viewBox"))
    if not viewbox:
        return (1.0, 0.0, 0.0, 1.0, x, y)
    width = get_number_attr(node, "width", viewbox["width"])
    height = get_number_attr(node, "height", viewbox["height"])
    if not viewbox["width"] or not viewbox["height"] or not width or not height:
        return (1.0, 0.0, 0.0, 1.0, x, y)
    scale_x = width / viewbox["width"]
    scale_y = height / viewbox["height"]
    return multiply_matrices(
        (1.0, 0.0, 0.0, 1.0, x, y),
        multiply_matrices((scale_x, 0.0, 0.0, scale_y, 0.0, 0.0), (1.0, 0.0, 0.0, 1.0, -viewbox["x"], -viewbox["y"])),
    )


def parse_view_box(value: str | None) -> dict[str, float] | None:
    if not value or not value.strip():
        return None
    parts = [parse_numeric(part, math.nan) for part in re.split(r"[\s,]+", value.strip())]
    if len(parts) < 4 or any(math.isnan(part) for part in parts[:4]):
        return None
    return {"x": parts[0], "y": parts[1], "width": parts[2], "height": parts[3]}


def get_number_attr(node: ET.Element, name: str, fallback: float = 0) -> float:
    return parse_numeric(get_attr(node, name), fallback)


def get_optional_number_attr(node: ET.Element, name: str) -> float | None:
    value = get_attr(node, name)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_numeric(value: str | None, fallback: float) -> float:
    if value is None:
        return fallback
    try:
        return float(str(value).replace("%", ""))
    except ValueError:
        return fallback


def parse_dash_array(value: str | None) -> str | None:
    return value.strip() if value and value != "none" else None


def parse_line_cap(value: str | None) -> str | None:
    if not value:
        return None
    return value.lower() if value.lower() in {"round", "square", "butt"} else "butt"


def parse_line_join(value: str | None) -> str | None:
    if not value:
        return None
    return value.lower() if value.lower() in {"round", "bevel", "miter"} else "miter"


def normalize_marker_id(value: str | None) -> str | None:
    if not value:
        return None
    match = re.match(r"^url\(#([^)]+)\)$", value)
    marker_id = match.group(1) if match else value
    normalized = marker_id.lower()
    if "diamond" in normalized:
        return "diamond"
    if "circle" in normalized or "oval" in normalized:
        return "circle"
    if "open" in normalized or "stealth" in normalized:
        return "open"
    if "none" in normalized:
        return "none"
    return "arrow"


def has_markers(node: ET.Element) -> bool:
    return any(get_attr(node, name) is not None for name in ("marker-start", "marker-end", "marker-mid"))


def parse_filter_id(value: str | None) -> str | None:
    if not value:
        return None
    match = re.match(r"^url\(#([^)]+)\)$", value)
    return match.group(1) if match else None


def resolve_effect_color(source: dict[str, Any]) -> str | None:
    stroke = source.get("stroke")
    if stroke and stroke.get("color") and stroke["color"] != "transparent":
        return parse_color(stroke["color"])
    fill = source.get("fill")
    if fill and fill.get("type") == "solid" and fill.get("color") != "transparent":
        return parse_color(fill["color"])
    return None


def first_child(node: ET.Element | None, tag_name: str) -> ET.Element | None:
    if node is None:
        return None
    for child in list(node):
        if strip_ns(child.tag) == tag_name:
            return child
    return None


def children_by_tag(node: ET.Element | None, tag_name: str) -> list[ET.Element]:
    if node is None:
        return []
    return [child for child in list(node) if strip_ns(child.tag) == tag_name]


def extract_text_content(node: ET.Element) -> str:
    parts: list[str] = []
    if node.text:
        parts.append(node.text)
    for child in list(node):
        if strip_ns(child.tag) == "tspan":
            if child.text:
                parts.append(child.text)
            if child.tail:
                parts.append(child.tail)
        elif child.tail:
            parts.append(child.tail)
    return "".join(parts).strip()


def parse_font_weight(value: str | None) -> str | int | None:
    if not value:
        return None
    if value in {"normal", "bold", "lighter", "bolder"}:
        return value
    try:
        return int(value)
    except ValueError:
        return None


def parse_font_style(value: str | None) -> str | None:
    return value if value in {"normal", "italic", "oblique"} else None


def parse_text_anchor(value: str | None) -> str | None:
    return value if value in {"start", "middle", "end"} else None


def parse_vertical_align(value: str | None) -> str | None:
    if value in {"middle", "central"}:
        return "middle"
    if value in {"text-before-edge", "hanging"}:
        return "top"
    if value == "text-after-edge":
        return "bottom"
    if value == "baseline":
        return "baseline"
    return None


def map_text_align(anchor: str | None) -> str:
    if anchor == "middle":
        return "center"
    if anchor == "end":
        return "right"
    return "left"


def estimate_text_width(text: str, font_size: float) -> float:
    width = 0.0
    for char in text:
        if char.isspace():
            width += font_size * 0.4
        elif re.match(r"[\u2E80-\u9FFF\uF900-\uFAFF]", char):
            width += font_size * 1.28
        elif re.match(r"[A-Z0-9]", char):
            width += font_size * 0.78
        else:
            width += font_size * 0.7
    return max(width + font_size * 0.9, font_size * 1.8)


def estimate_text_height(font_size: float) -> float:
    return font_size * 1.45


def resolve_text_box_metrics(anchor_x: float, anchor_y: float, width: float, height: float, font_size: float, text_anchor: str | None, vertical_align: str | None) -> dict[str, float]:
    x = anchor_x - width / 2 if text_anchor == "middle" else anchor_x - width if text_anchor == "end" else anchor_x
    if vertical_align == "top":
        y = anchor_y
    elif vertical_align == "middle":
        y = anchor_y - height / 2
    elif vertical_align == "bottom":
        y = anchor_y - height
    else:
        y = anchor_y - font_size * TEXT_ASCENT_RATIO
    return {"x": x, "y": y, "width": width, "height": height}


def starts_new_text_line(tspan: ET.Element) -> bool:
    return get_attr(tspan, "x") is not None or get_attr(tspan, "y") is not None or (get_attr(tspan, "dx") == "0" and get_attr(tspan, "dy") is not None) or get_attr(tspan, "dy") is not None


def scale_font_size(font_size: float, matrix: TransformMatrix) -> float:
    decomposed = decompose_matrix(matrix)
    scale = ((abs(decomposed["scaleX"]) or 1) + (abs(decomposed["scaleY"]) or 1)) / 2
    return font_size * scale


def distance_between_points(a: dict[str, float], b: dict[str, float]) -> float:
    return math.hypot(b["x"] - a["x"], b["y"] - a["y"])


def transform_points_string(points: str, matrix: TransformMatrix) -> str:
    nums = [float(value) for value in re.split(r"[\s,]+", points.strip()) if value]
    transformed = []
    for i in range(0, len(nums) - 1, 2):
        point = apply_matrix_to_point(nums[i], nums[i + 1], matrix)
        transformed.append(f"{round_number(point['x'])},{round_number(point['y'])}")
    return " ".join(transformed)


def compute_points_bounds(points: str) -> dict[str, float]:
    nums = [float(value) for value in re.split(r"[\s,]+", points.strip()) if value]
    if len(nums) < 2:
        return {"x": 0, "y": 0, "width": 0, "height": 0}
    xs = nums[0::2]
    ys = nums[1::2]
    return {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}


def transform_path_data(d: str, matrix: TransformMatrix) -> str:
    tokens = PATH_TOKEN_RE.findall(d)
    out: list[str] = []
    index = 0
    command = ""
    current = {"x": 0.0, "y": 0.0}
    subpath_start = {"x": 0.0, "y": 0.0}
    while index < len(tokens):
        if re.fullmatch(r"[a-zA-Z]", tokens[index]):
            command = tokens[index]
            index += 1
            if command.upper() == "Z":
                out.append(command)
        upper = command.upper()
        arity = get_path_command_arity(upper)
        if arity == 0:
            if upper == "Z":
                current = dict(subpath_start)
            continue
        while index < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[index]):
            args = [float(value) for value in tokens[index:index + arity]]
            if len(args) < arity:
                index = len(tokens)
                break
            index += arity
            serialized, current, subpath_start = transform_path_command(upper, command.islower(), args, current, subpath_start, matrix)
            out.append(serialized)
            if upper == "M":
                command = "l" if command.islower() else "L"
    return re.sub(r"\s+", " ", " ".join(part for part in out if part)).strip()


def get_path_command_arity(command: str) -> int:
    return {"M": 2, "L": 2, "T": 2, "H": 1, "V": 1, "S": 4, "Q": 4, "C": 6, "A": 7}.get(command, 0)


def transform_path_command(command: str, relative: bool, args: list[float], current: dict[str, float], subpath_start: dict[str, float], matrix: TransformMatrix) -> tuple[str, dict[str, float], dict[str, float]]:
    def absolutize(x: float, y: float) -> dict[str, float]:
        return {"x": current["x"] + x if relative else x, "y": current["y"] + y if relative else y}

    if command in {"M", "L", "T"}:
        point = absolutize(args[0], args[1])
        transformed = apply_matrix_to_point(point["x"], point["y"], matrix)
        return f"{command} {round_number(transformed['x'])} {round_number(transformed['y'])}", point, point if command == "M" else subpath_start
    if command == "H":
        point = absolutize(args[0], 0)
        transformed = apply_matrix_to_point(point["x"], current["y"], matrix)
        return f"L {round_number(transformed['x'])} {round_number(transformed['y'])}", {"x": point["x"], "y": current["y"]}, subpath_start
    if command == "V":
        point = absolutize(0, args[0])
        transformed = apply_matrix_to_point(current["x"], point["y"], matrix)
        return f"L {round_number(transformed['x'])} {round_number(transformed['y'])}", {"x": current["x"], "y": point["y"]}, subpath_start
    if command == "C":
        p1 = absolutize(args[0], args[1])
        p2 = absolutize(args[2], args[3])
        p = absolutize(args[4], args[5])
        t1 = apply_matrix_to_point(p1["x"], p1["y"], matrix)
        t2 = apply_matrix_to_point(p2["x"], p2["y"], matrix)
        tp = apply_matrix_to_point(p["x"], p["y"], matrix)
        return f"{command} {round_number(t1['x'])} {round_number(t1['y'])} {round_number(t2['x'])} {round_number(t2['y'])} {round_number(tp['x'])} {round_number(tp['y'])}", p, subpath_start
    if command in {"S", "Q"}:
        p1 = absolutize(args[0], args[1])
        p = absolutize(args[2], args[3])
        t1 = apply_matrix_to_point(p1["x"], p1["y"], matrix)
        tp = apply_matrix_to_point(p["x"], p["y"], matrix)
        return f"{command} {round_number(t1['x'])} {round_number(t1['y'])} {round_number(tp['x'])} {round_number(tp['y'])}", p, subpath_start
    if command == "A":
        end = absolutize(args[5], args[6])
        transformed_end = apply_matrix_to_point(end["x"], end["y"], matrix)
        decomposed = decompose_matrix(matrix)
        rx = abs(args[0] * (decomposed["scaleX"] or 1))
        ry = abs(args[1] * (decomposed["scaleY"] or 1))
        rotation = (args[2] or 0) + decomposed["rotation"]
        return f"{command} {round_number(rx)} {round_number(ry)} {round_number(rotation)} {int(args[3])} {int(args[4])} {round_number(transformed_end['x'])} {round_number(transformed_end['y'])}", end, subpath_start
    return "", current, subpath_start


def parse_path_to_points(d: str) -> list[dict[str, Any]]:
    tokens = PATH_TOKEN_RE.findall(d)
    points: list[dict[str, Any]] = []
    current = {"x": 0.0, "y": 0.0}
    subpath_start = {"x": 0.0, "y": 0.0}
    last_control = {"x": 0.0, "y": 0.0}
    last_quadratic = {"x": 0.0, "y": 0.0}
    i = 0
    last_cmd = ""
    while i < len(tokens):
        cmd = tokens[i]
        if not re.fullmatch(r"[a-zA-Z]", cmd):
            cmd = last_cmd
        else:
            i += 1
            last_cmd = cmd
        upper = cmd.upper()
        relative = cmd.islower()
        if upper == "M":
            x, y, i = read_point(tokens, i)
            abs_x = current["x"] + x if relative else x
            abs_y = current["y"] + y if relative else y
            points.append({"x": abs_x, "y": abs_y, "type": cmd, "moveTo": True})
            current = {"x": abs_x, "y": abs_y}
            subpath_start = dict(current)
            last_control = dict(current)
            last_quadratic = dict(current)
            while i < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[i]):
                x, y, i = read_point(tokens, i)
                abs_x = current["x"] + x if relative else x
                abs_y = current["y"] + y if relative else y
                points.append({"x": abs_x, "y": abs_y, "type": "l" if relative else "L"})
                current = {"x": abs_x, "y": abs_y}
                last_control = dict(current)
                last_quadratic = dict(current)
            continue
        if upper == "L":
            while i < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[i]):
                x, y, i = read_point(tokens, i)
                abs_x = current["x"] + x if relative else x
                abs_y = current["y"] + y if relative else y
                points.append({"x": abs_x, "y": abs_y, "type": cmd})
                current = {"x": abs_x, "y": abs_y}
                last_control = dict(current)
                last_quadratic = dict(current)
            continue
        if upper == "H":
            while i < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[i]):
                x = float(tokens[i]); i += 1
                abs_x = current["x"] + x if relative else x
                points.append({"x": abs_x, "y": current["y"], "type": "l" if relative else "L"})
                current = {"x": abs_x, "y": current["y"]}
                last_control = dict(current)
                last_quadratic = dict(current)
            continue
        if upper == "V":
            while i < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[i]):
                y = float(tokens[i]); i += 1
                abs_y = current["y"] + y if relative else y
                points.append({"x": current["x"], "y": abs_y, "type": "l" if relative else "L"})
                current = {"x": current["x"], "y": abs_y}
                last_control = dict(current)
                last_quadratic = dict(current)
            continue
        if upper == "C":
            while i < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[i]):
                x1, y1, x2, y2, x, y = map(float, tokens[i:i + 6]); i += 6
                abs_x1 = current["x"] + x1 if relative else x1
                abs_y1 = current["y"] + y1 if relative else y1
                abs_x2 = current["x"] + x2 if relative else x2
                abs_y2 = current["y"] + y2 if relative else y2
                abs_x = current["x"] + x if relative else x
                abs_y = current["y"] + y if relative else y
                points.append({"x": abs_x, "y": abs_y, "type": cmd, "curve": {"type": "cubic", "x1": abs_x1, "y1": abs_y1, "x2": abs_x2, "y2": abs_y2}})
                current = {"x": abs_x, "y": abs_y}
                last_control = {"x": abs_x2, "y": abs_y2}
                last_quadratic = dict(current)
            continue
        if upper == "S":
            while i < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[i]):
                reflect_x = 2 * current["x"] - last_control["x"]
                reflect_y = 2 * current["y"] - last_control["y"]
                x2, y2, x, y = map(float, tokens[i:i + 4]); i += 4
                abs_x2 = current["x"] + x2 if relative else x2
                abs_y2 = current["y"] + y2 if relative else y2
                abs_x = current["x"] + x if relative else x
                abs_y = current["y"] + y if relative else y
                points.append({"x": abs_x, "y": abs_y, "type": "C", "curve": {"type": "cubic", "x1": reflect_x, "y1": reflect_y, "x2": abs_x2, "y2": abs_y2}})
                current = {"x": abs_x, "y": abs_y}
                last_control = {"x": abs_x2, "y": abs_y2}
                last_quadratic = dict(current)
            continue
        if upper == "Q":
            while i < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[i]):
                x1, y1, x, y = map(float, tokens[i:i + 4]); i += 4
                abs_x1 = current["x"] + x1 if relative else x1
                abs_y1 = current["y"] + y1 if relative else y1
                abs_x = current["x"] + x if relative else x
                abs_y = current["y"] + y if relative else y
                points.append({"x": abs_x, "y": abs_y, "type": cmd, "curve": {"type": "quadratic", "x1": abs_x1, "y1": abs_y1}})
                current = {"x": abs_x, "y": abs_y}
                last_control = {"x": abs_x1, "y": abs_y1}
                last_quadratic = {"x": abs_x1, "y": abs_y1}
            continue
        if upper == "T":
            while i < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[i]):
                reflect_x = 2 * current["x"] - last_quadratic["x"]
                reflect_y = 2 * current["y"] - last_quadratic["y"]
                x, y = map(float, tokens[i:i + 2]); i += 2
                abs_x = current["x"] + x if relative else x
                abs_y = current["y"] + y if relative else y
                points.append({"x": abs_x, "y": abs_y, "type": "Q", "curve": {"type": "quadratic", "x1": reflect_x, "y1": reflect_y}})
                current = {"x": abs_x, "y": abs_y}
                last_control = {"x": reflect_x, "y": reflect_y}
                last_quadratic = {"x": reflect_x, "y": reflect_y}
            continue
        if upper == "A":
            while i < len(tokens) and not re.fullmatch(r"[a-zA-Z]", tokens[i]):
                rx, ry, rotation, large_arc, sweep, x, y = tokens[i:i + 7]
                i += 7
                abs_x = current["x"] + float(x) if relative else float(x)
                abs_y = current["y"] + float(y) if relative else float(y)
                points.append({"x": abs_x, "y": abs_y, "type": cmd, "curve": {"type": "arc", "rX": float(rx), "rY": float(ry), "rotation": float(rotation), "largeArc": int(large_arc) == 1, "sweep": int(sweep) == 1}})
                current = {"x": abs_x, "y": abs_y}
                last_control = dict(current)
                last_quadratic = dict(current)
            continue
        if upper == "Z":
            points.append({"close": True, "type": "Z"})
            current = dict(subpath_start)
            continue
    return points


def read_point(tokens: list[str], index: int) -> tuple[float, float, int]:
    return float(tokens[index]), float(tokens[index + 1]), index + 2


def compute_path_bounds(points: list[dict[str, Any]], stroke_width: float = 0) -> dict[str, float]:
    if not points:
        return {"x": 0, "y": 0, "width": 0, "height": 0}
    min_x = math.inf
    max_x = -math.inf
    min_y = math.inf
    max_y = -math.inf

    def include_point(x: float, y: float) -> None:
        nonlocal min_x, max_x, min_y, max_y
        min_x = min(min_x, x)
        max_x = max(max_x, x)
        min_y = min(min_y, y)
        max_y = max(max_y, y)

    previous: dict[str, float] | None = None
    for point in points:
        if point.get("close"):
            continue
        include_point(point["x"], point["y"])
        curve = point.get("curve")
        if curve:
            if curve["type"] == "cubic":
                include_point(curve["x1"], curve["y1"])
                include_point(curve["x2"], curve["y2"])
            elif curve["type"] == "quadratic":
                include_point(curve["x1"], curve["y1"])
            elif curve["type"] == "arc" and previous:
                arc_bounds = compute_arc_segment_bounds(previous, point)
                include_point(arc_bounds["minX"], arc_bounds["minY"])
                include_point(arc_bounds["maxX"], arc_bounds["maxY"])
        previous = {"x": point["x"], "y": point["y"]}

    if not all(math.isfinite(v) for v in (min_x, min_y, max_x, max_y)):
        return {"x": 0, "y": 0, "width": 0, "height": 0}

    padding = stroke_width / 2 if stroke_width > 0 else 0
    min_x -= padding
    min_y -= padding
    max_x += padding
    max_y += padding
    return {
        "x": min_x,
        "y": min_y,
        "width": max(max_x - min_x, stroke_width if stroke_width > 0 else 1),
        "height": max(max_y - min_y, stroke_width if stroke_width > 0 else 1),
    }


def compute_arc_segment_bounds(start: dict[str, float], point: dict[str, Any]) -> dict[str, float]:
    samples = sample_svg_arc(start, point, 24)
    xs = [item["x"] for item in samples]
    ys = [item["y"] for item in samples]
    return {"minX": min(xs), "minY": min(ys), "maxX": max(xs), "maxY": max(ys)}


def sample_svg_arc(start: dict[str, float], point: dict[str, Any], steps: int) -> list[dict[str, float]]:
    arc = arc_endpoint_to_center(
        start["x"],
        start["y"],
        point["x"],
        point["y"],
        point["curve"]["rX"],
        point["curve"]["rY"],
        point["curve"]["rotation"],
        point["curve"]["largeArc"],
        point["curve"]["sweep"],
    )
    if not arc:
        return [start, {"x": point["x"], "y": point["y"]}]
    out = []
    total_steps = max(2, steps)
    for i in range(total_steps + 1):
        t = arc["theta1"] + arc["deltaTheta"] * i / total_steps
        cos_phi = math.cos(arc["phi"])
        sin_phi = math.sin(arc["phi"])
        x = arc["cx"] + arc["rx"] * math.cos(t) * cos_phi - arc["ry"] * math.sin(t) * sin_phi
        y = arc["cy"] + arc["rx"] * math.cos(t) * sin_phi + arc["ry"] * math.sin(t) * cos_phi
        out.append({"x": x, "y": y})
    return out


def arc_endpoint_to_center(x1: float, y1: float, x2: float, y2: float, rx_input: float, ry_input: float, rotation: float, large_arc: bool, sweep: bool) -> dict[str, float] | None:
    rx = abs(rx_input)
    ry = abs(ry_input)
    if rx == 0 or ry == 0:
        return None
    phi = math.radians(rotation)
    cos_phi = math.cos(phi)
    sin_phi = math.sin(phi)
    dx2 = (x1 - x2) / 2
    dy2 = (y1 - y2) / 2
    x1p = cos_phi * dx2 + sin_phi * dy2
    y1p = -sin_phi * dx2 + cos_phi * dy2
    lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lam > 1:
        scale = math.sqrt(lam)
        rx *= scale
        ry *= scale
    sign = -1 if large_arc == sweep else 1
    numerator = max(0, rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p)
    denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    coef = 0 if denominator == 0 else sign * math.sqrt(numerator / denominator)
    cxp = coef * ((rx * y1p) / ry)
    cyp = coef * (-(ry * x1p) / rx)
    cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2
    cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2
    theta1 = angle_between({"x": 1, "y": 0}, {"x": (x1p - cxp) / rx, "y": (y1p - cyp) / ry})
    delta_theta = angle_between({"x": (x1p - cxp) / rx, "y": (y1p - cyp) / ry}, {"x": (-x1p - cxp) / rx, "y": (-y1p - cyp) / ry})
    if not sweep and delta_theta > 0:
        delta_theta -= 2 * math.pi
    elif sweep and delta_theta < 0:
        delta_theta += 2 * math.pi
    return {"cx": cx, "cy": cy, "rx": rx, "ry": ry, "phi": phi, "theta1": theta1, "deltaTheta": delta_theta}


def angle_between(u: dict[str, float], v: dict[str, float]) -> float:
    return math.atan2(u["x"] * v["y"] - u["y"] * v["x"], u["x"] * v["x"] + u["y"] * v["y"])


def calculate_angle_from_coords(x1: float, y1: float, x2: float, y2: float) -> float:
    angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
    return angle + 360 if angle < 0 else angle


def resolve_media_href(href: str | None, base_dir: str) -> str:
    if not href:
        return ""
    if href.startswith(("data:", "http://", "https://", "file://")):
        return href
    path = Path(href)
    if path.is_absolute():
        return str(path)
    return str((Path(base_dir) / path).resolve()) if base_dir else href


def infer_media_format(href: str, media_type: str) -> str | None:
    extension = get_extension(href).lower()
    mappings = {
        "image": {"png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"},
        "video": {"mp4", "webm", "ogg", "mov", "avi", "mkv"},
        "audio": {"mp3", "wav", "ogg", "aac", "m4a", "flac"},
    }
    return extension if extension in mappings[media_type] else None


def get_extension(href: str) -> str:
    if href.startswith("data:"):
        match = re.search(r"data:([^;]+)", href)
        mime = match.group(1).lower() if match else ""
        for extension in ("png", "jpeg", "jpg", "gif", "svg", "webp", "bmp", "mp4", "webm", "ogg", "mp3", "wav"):
            if extension in mime:
                return "jpg" if extension == "jpeg" else extension
        return ""
    return href.split(".")[-1].split("?")[0] if "." in href else ""


def parse_volume(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, min(1.0, float(value)))
    except ValueError:
        return None


def round_number(value: float) -> str:
    rounded = 0.0 if abs(value) < 1e-10 else float(f"{value:.6f}")
    return str(int(rounded)) if rounded.is_integer() else str(rounded)


def strip_nones(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: strip_nones(val) for key, val in value.items() if val is not None}
    if isinstance(value, list):
        return [strip_nones(item) for item in value]
    return value
