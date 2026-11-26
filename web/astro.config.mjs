// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { REPO_URL, isIndex, loadDocs } from './src/lib/docs.ts';

const docs = loadDocs();
// An empty BASE_PATH (e.g. a Pages custom domain) means the site root.
const base = (process.env.BASE_PATH ?? '/rusty-dev') || '/';

// Defaults target GitHub Pages; override with SITE_URL / BASE_PATH for other hosts.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://kerryhatcher.github.io',
  base,
  integrations: [
    starlight({
      title: 'Production Rust',
      description:
        'Production Rust project setup — tooling, CI/CD, security, testing, release, and governance patterns.',
      social: [{ icon: 'github', label: 'GitHub', href: REPO_URL }],
      editLink: { baseUrl: `${REPO_URL}/edit/main/` },
      lastUpdated: false,
      head: [
        {
          tag: 'link',
          attrs: { rel: 'alternate', type: 'text/plain', title: 'llms.txt', href: `${base.replace(/\/$/, '')}/llms.txt` },
        },
      ],
      sidebar: [
        { label: 'Overview', link: '/' },
        {
          label: 'Guides',
          items: docs.filter((d) => !isIndex(d)).map((d) => ({ slug: d.id, label: d.label })),
        },
        {
          label: 'For LLMs',
          items: [
            { label: 'llms.txt', link: '/llms.txt', attrs: { target: '_self' } },
            { label: 'llms-full.txt', link: '/llms-full.txt', attrs: { target: '_self' } },
          ],
        },
      ],
    }),
  ],
});
