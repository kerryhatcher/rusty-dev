# Documentation website

The documentation website uses [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build). Astro reads the Markdown files in
the repository root.

## Local development

1. Change to the `web` directory.

   ```bash
   cd web
   ```

2. Install the dependencies.

   ```bash
   bun install
   ```

3. Start the development server.

   ```bash
   bun run dev
   ```

4. Open `http://localhost:4321/rusty-dev/`.

The development server reloads the page when you save changes to a root Markdown
file.

Use this command to build the static website. The command writes the files to
`web/dist/`.

```bash
bun run build
```

## How it works

- `src/lib/docs.ts` reads the root Markdown files. The website uses
  `README.md` as the home page. The **Contents** list sets the guide sequence,
  sidebar labels, and page descriptions. The website shows the other root
  Markdown files after the guides in **Contents**.
- `src/content.config.ts` uses the first heading of each file as its page
  title. This procedure makes frontmatter optional. The content loader changes
  links such as `other-guide.md#anchor` to site URLs.
- `src/pages/[file].ts` serves each source file without changes. For example,
  use `/ci-cd.md` to get `ci-cd.md`.
- `src/pages/llms.txt.ts` generates [`/llms.txt`](https://llmstxt.org).
  This index gives a link and a description for each Markdown file.
- `src/pages/llms-full.txt.ts` combines the guides in `/llms-full.txt`.

## Deployment

The default site URL is `https://kerryhatcher.github.io/rusty-dev/`.
If you deploy to a different site, change `SITE_URL` and `BASE_PATH`.
Set these values when you build the website.

```bash
SITE_URL=https://docs.example.com BASE_PATH=/ bun run build
```
