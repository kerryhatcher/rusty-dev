import type { APIRoute } from 'astro';
import { REPO_URL, firstParagraph, isIndex, loadDocs } from '../lib/docs';

/**
 * /llms.txt — an index (https://llmstxt.org) pointing language models at the
 * raw Markdown sources, with a description of what each file covers.
 */
export const GET: APIRoute = ({ site }) => {
  const docs = loadDocs();
  const base = new URL(import.meta.env.BASE_URL.replace(/\/?$/, '/'), site);
  const url = (file: string) => new URL(file, base).href;
  const index = docs.find(isIndex);
  const guides = docs.filter((d) => !isIndex(d));

  const readme = index?.raw ?? '';
  const paragraphs = readme
    .replace(/^#\s+.+$/m, '')
    .split(/^##\s+/m)[0]
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/\s*\n\s*/g, ' '))
    .filter(Boolean);

  const lines = [
    '# Production Rust Project Setup',
    '',
    `> ${paragraphs[0] ?? firstParagraph(readme)}`,
    '',
    ...paragraphs.slice(1).flatMap((p) => [p, '']),
    'This file indexes the documentation as plain Markdown. Every link below is the',
    'raw, unmodified Markdown source of one guide, byte-for-byte identical to the file',
    `at the root of the source repository (${REPO_URL}). The guides are written as`,
    'practical, copy-pasteable patterns: each explains a control, shows the',
    'configuration or command that implements it (Cargo.toml, GitHub Actions YAML,',
    'justfile recipes, policy files), and describes the evidence it produces for',
    'maintainers, auditors, and enterprise or government adopters. Read the overview',
    'first, then the guide that matches the task at hand. Links between guides use',
    'relative `.md` paths, which resolve against the same directory as this file.',
    '',
    '## Overview',
    '',
    ...(index
      ? [
          `- [Overview (${index.file})](${url(index.file)}): Start here. Explains the goal of the guide set, lists every guide, defines the non-negotiable release baseline, and cites the source standards (NIST SSDF, ANSSI, OpenSSF, SLSA, CISA SBOM).`,
        ]
      : []),
    '',
    '## Guides',
    '',
    ...guides.map((d) => {
      const intro = firstParagraph(d.raw).replace(/:$/, '.');
      const covers = d.description ? ` Covers: ${d.description}.` : '';
      return `- [${d.label}](${url(d.file)}): ${intro}${covers}`;
    }),
    '',
    '## Optional',
    '',
    `- [Full text](${url('llms-full.txt')}): Every guide above concatenated into one Markdown file, for loading the whole set into context at once.`,
    `- [Source repository](${REPO_URL}): Git history, issues, and pull requests for these documents.`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
