import type { APIRoute } from 'astro';
import { loadDocs } from '../lib/docs';

/** /llms-full.txt — every root Markdown file concatenated, in README order. */
export const GET: APIRoute = () => {
  const body = loadDocs()
    .map((d) => `<!-- Source: ${d.file} -->\n\n${d.raw.trim()}\n`)
    .join('\n---\n\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
