/**
 * Single source of truth for the website: the Markdown files at the repository
 * root. Nothing under web/ duplicates their content.
 *
 * - README.md becomes the site home page.
 * - The README "Contents" list defines guide order, sidebar labels, and
 *   descriptions (used for page metadata and llms.txt).
 * - Any other root *.md file not in the Contents list is still published,
 *   appended after the listed guides.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/** Repository root (web/ is one level down; npm scripts run with cwd = web/). */
export const REPO_ROOT = resolve(process.env.DOCS_ROOT ?? resolve(process.cwd(), '..'));

export const REPO_URL = 'https://github.com/kerryhatcher/rusty-dev';
export const REPO_BRANCH = 'main';

/** Root files that are not documentation pages. */
const EXCLUDED = new Set(['LICENSE.md', 'CHANGELOG.md', 'AGENTS.md', 'CLAUDE.md']);

export interface DocFile {
  /** Original file name at the repo root, e.g. `ci-cd.md`. */
  file: string;
  /** Content-collection id / URL slug. README.md → `index`. */
  id: string;
  /** Page title, taken from the file's first `# ` heading. */
  title: string;
  /** Short sidebar label (README link text), falls back to title. */
  label: string;
  /** One-line description in Markdown (from the README Contents list). */
  description?: string;
  /** Absolute path on disk. */
  path: string;
  /** File contents exactly as committed. */
  raw: string;
}

export const isIndex = (doc: DocFile) => doc.id === 'index';

function titleOf(raw: string, fallback: string): string {
  const match = raw.match(/^#\s+(.+?)\s*#*\s*$/m);
  return match ? match[1].trim() : fallback;
}

/** Parse README "## Contents" bullets: `- [Label](file.md) — description`. */
function parseContents(readme: string): Map<string, { label: string; description: string }> {
  const out = new Map<string, { label: string; description: string }>();
  const section = readme.split(/^##\s+Contents\s*$/m)[1]?.split(/^##\s+/m)[0] ?? '';
  // Join wrapped continuation lines onto their bullet.
  const bullets = section
    .split(/\n(?=- )/)
    .map((b) => b.replace(/\s*\n\s*/g, ' ').trim())
    .filter((b) => b.startsWith('- '));
  for (const bullet of bullets) {
    const m = bullet.match(/^- \[([^\]]+)\]\(([^)#]+\.md)[^)]*\)\s*(?:[—–-]+\s*(.*))?$/);
    if (m) out.set(basename(m[2]), { label: m[1].trim(), description: (m[3] ?? '').trim() });
  }
  return out;
}

export function loadDocs(): DocFile[] {
  const files = readdirSync(REPO_ROOT).filter(
    (f) => f.toLowerCase().endsWith('.md') && !EXCLUDED.has(f),
  );
  const readmeFile = files.find((f) => f.toLowerCase() === 'readme.md');
  const readme = readmeFile ? readFileSync(resolve(REPO_ROOT, readmeFile), 'utf8') : '';
  const contents = parseContents(readme);
  const order = [...contents.keys()];

  const docs = files.map((file): DocFile => {
    const path = resolve(REPO_ROOT, file);
    const raw = readFileSync(path, 'utf8');
    const id = file === readmeFile ? 'index' : file.replace(/\.md$/i, '');
    const title = titleOf(raw, id);
    const entry = contents.get(file);
    return {
      file,
      id,
      title,
      label: file === readmeFile ? 'Overview' : (entry?.label ?? title),
      description:
        file === readmeFile ? firstParagraph(raw) : entry?.description || firstParagraph(raw),
      path,
      raw,
    };
  });

  const rank = (d: DocFile) => {
    if (isIndex(d)) return -1;
    const i = order.indexOf(d.file);
    return i === -1 ? order.length : i;
  };
  return docs.sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file));
}

/** First prose paragraph after the H1, flattened to one line. */
export function firstParagraph(raw: string): string {
  const body = raw.replace(/^#\s+.+$/m, '');
  const para = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !/^(#|```|[-*>|]|\d+\.)/.test(p));
  return para ? para.replace(/\s*\n\s*/g, ' ') : '';
}

/** Strip inline Markdown for plain-text contexts such as <meta> descriptions. */
export function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

/**
 * Prepare a file's Markdown for rendering on the site: drop the H1 (Starlight
 * renders the title itself) and point links to sibling `.md` files at their
 * site pages instead.
 */
export function toSiteMarkdown(doc: DocFile, docs: DocFile[], base: string): string {
  const byFile = new Map(docs.map((d) => [d.file, d]));
  const root = base.endsWith('/') ? base : `${base}/`;
  return doc.raw
    .replace(/^#\s+.+\n+/m, '')
    .replace(/\]\((?:\.\/)?([\w.-]+\.md)(#[^)\s]*)?\)/g, (match, file: string, hash = '') => {
      const target = byFile.get(file);
      if (!target) return match;
      return `](${root}${isIndex(target) ? '' : `${target.id}/`}${hash})`;
    });
}

export const editUrl = (doc: DocFile) => `${REPO_URL}/edit/${REPO_BRANCH}/${doc.file}`;
