// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'https://modelinfo.dev',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
