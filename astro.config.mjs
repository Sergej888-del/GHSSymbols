// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://ghssymbols.com',
  output: 'static',
  // Временно: обход EPERM на dist/ при запущенном preview (убрать после отладки)
  build: { outDir: 'dist-tmp-debug' },
  adapter: cloudflare(),

  integrations: [react(), mdx(), sitemap()],

  vite: {
    plugins: [tailwindcss()]
  }
});