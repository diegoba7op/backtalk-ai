import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

// tsup uses loader: { '.md': 'text' } to import .md files as strings.
// Vitest uses Vite under the hood and needs an equivalent transform.
const rawMdPlugin: Plugin = {
  name: 'raw-md',
  transform(code, id) {
    if (id.endsWith('.md')) {
      return `export default ${JSON.stringify(code)}`;
    }
  },
};

export default defineConfig({
  plugins: [rawMdPlugin],
});
