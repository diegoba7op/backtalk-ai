import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

// tsup uses loader: { '.md': 'text' } to import .md files as strings.
// Vitest uses Vite under the hood — use a load hook so Vite never tries
// to parse the .md content as JS before our plugin can intercept it.
const rawMdPlugin: Plugin = {
  name: 'raw-md',
  enforce: 'pre',
  load(id) {
    if (id.endsWith('.md')) {
      const content = readFileSync(id, 'utf-8');
      return `export default ${JSON.stringify(content)}`;
    }
  },
};

export default defineConfig({
  plugins: [rawMdPlugin],
});
