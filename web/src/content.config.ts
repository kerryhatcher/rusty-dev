import { defineCollection } from 'astro:content';
import type { Loader } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editUrl, loadDocs, plainText, toSiteMarkdown } from './lib/docs';

/**
 * Loads the Markdown files from the repository root (not src/content/docs) so
 * the root docs remain the only copy. Titles come from each file's H1, so the
 * source files need no Starlight frontmatter.
 */
function rootMarkdownLoader(): Loader {
  return {
    name: 'root-markdown',
    async load({ store, parseData, renderMarkdown, generateDigest, config, watcher, logger }) {
      const sync = async () => {
        const docs = loadDocs();
        store.clear();
        for (const doc of docs) {
          const body = toSiteMarkdown(doc, docs, config.base);
          const data = await parseData({
            id: doc.id,
            data: {
              title: doc.title,
              description: doc.description ? capitalize(plainText(doc.description)) : undefined,
              editUrl: editUrl(doc),
              sidebar: { label: doc.label },
            },
          });
          store.set({
            id: doc.id,
            data,
            body,
            filePath: relative(fileURLToPath(config.root), doc.path),
            digest: generateDigest(body),
            rendered: await renderMarkdown(body),
          });
        }
        logger.info(`Loaded ${docs.length} Markdown files from the repository root`);
      };

      await sync();

      if (watcher) {
        const root = loadDocs()[0]?.path.replace(/[^/\\]+$/, '');
        if (root) {
          watcher.add(root);
          watcher.on('all', async (_event, path) => {
            if (path.startsWith(root) && path.endsWith('.md') && !path.includes('/web/')) await sync();
          });
        }
      }
    },
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const collections = {
  docs: defineCollection({ loader: rootMarkdownLoader(), schema: docsSchema() }),
};
