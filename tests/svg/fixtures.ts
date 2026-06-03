// Shared test fixtures for SVG-input end-to-end tests.
//
// Discovers every .svg file under the project `example/` directory and
// loads its content as a UTF-8 string. Tests then call the public SVG →
// SIF entry point on each fixture and assert the pipeline does not throw
// and emits a non-empty element list.
//
// File-system reads are cached per process so repeated lookups during a
// single Jest run don't re-read the disk.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const PROJECT_ROOT = join(__dirname, '..', '..')
const EXAMPLE_ROOT = join(PROJECT_ROOT, 'example')

interface SvgFixture {
  /** Relative path from project root, e.g. `测试通过/latex_test.svg`. */
  relPath: string
  /** Absolute path on disk. */
  absPath: string
  /** SVG file size in bytes. */
  size: number
  /** UTF-8 SVG source. */
  content: string
}

const cache = new Map<string, SvgFixture>()

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, out)
    } else if (stat.isFile() && entry.toLowerCase().endsWith('.svg')) {
      out.push(full)
    }
  }
}

function loadFixture(absPath: string): SvgFixture {
  const cached = cache.get(absPath)
  if (cached) return cached

  const content = readFileSync(absPath, 'utf8')
  const fixture: SvgFixture = {
    relPath: relative(PROJECT_ROOT, absPath),
    absPath,
    size: content.length,
    content
  }
  cache.set(absPath, fixture)
  return fixture
}

/** Return every SVG fixture under `example/`, sorted by relative path. */
export function loadAllSvgFixtures(): SvgFixture[] {
  const paths: string[] = []
  walk(EXAMPLE_ROOT, paths)
  return paths
    .map(loadFixture)
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
}

/** Return the fixture at a project-relative path (e.g. `测试通过/latex_test.svg`). */
export function loadSvgFixture(relPath: string): SvgFixture {
  return loadFixture(join(PROJECT_ROOT, relPath))
}
