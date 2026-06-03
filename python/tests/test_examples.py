import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from svg_to_sif import svg_file_to_sif  # noqa: E402


def normalize(value):
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [normalize(item) for item in value]
    return value


class ExampleComparisonTest(unittest.TestCase):
    maxDiff = None

    def test_all_example_svgs_match_js_baseline(self):
        svg_files = sorted(ROOT.glob("example/**/*.svg"))
        self.assertTrue(svg_files, "No example SVG files found")

        for svg_file in svg_files:
            with self.subTest(svg=str(svg_file.relative_to(ROOT))):
                py_result = svg_file_to_sif(svg_file, base_dir=str(svg_file.parent))
                js_result = json.loads(
                    subprocess.check_output(
                        ["node", str(ROOT / "python/tests/js_baseline.js"), str(svg_file)],
                        cwd=ROOT,
                        text=True,
                    )
                )
                self.assertEqual(normalize(py_result), normalize(js_result))


if __name__ == "__main__":
    unittest.main()
