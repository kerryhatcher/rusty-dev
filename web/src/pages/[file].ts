import type { APIRoute, GetStaticPaths } from 'astro';
import { loadDocs } from '../lib/docs';

/** Serves each root Markdown file unmodified, e.g. /ci-cd.md and /README.md. */
export const getStaticPaths = (() =>
  loadDocs().map((doc) => ({ params: { file: doc.file }, props: { raw: doc.raw } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(props.raw as string, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
