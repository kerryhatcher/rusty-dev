# Documentation website

An [Astro](https://astro.build) + [Starlight](https://starlight.astro.build) site
built from the Markdown files at the repository root. The root `*.md` files are
the only source of content; nothing in `web/` copies them.

```bash
cd web
bun install
bun run dev      # http://localhost:4321/rusty-dev/ (edits to ../*.md reload live)
bun run build    # static output in web/dist/
```

## How it works

- `src/lib/docs.ts` reads `../*.md`. `README.md` becomes the home page, and its
  **Contents** list sets guide order, sidebar labels, and page descriptions.
  Root `.md` files not in that list are still published, sorted after the rest.
- `src/content.config.ts` has a custom content loader. It takes each page title
  from the file's `# H1` (so the source files need no frontmatter) and rewrites
  `other-guide.md#anchor` links to site URLs.
- `src/pages/[file].ts` serves each source file unmodified, e.g. `/ci-cd.md`.
- `src/pages/llms.txt.ts` generates [`/llms.txt`](https://llmstxt.org), which
  indexes those raw Markdown files with a description of each.
- `src/pages/llms-full.txt.ts` generates `/llms-full.txt`, which contains every
  guide in one file.

## Deployment

The defaults target GitHub Pages at `https://kerryhatcher.github.io/rusty-dev/`.
To deploy somewhere else, override them at build time:

```bash
SITE_URL=https://docs.example.com BASE_PATH=/ bun run build
```
