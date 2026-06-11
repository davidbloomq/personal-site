// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
	site: 'https://david-bloom.com',
	integrations: [mdx(), sitemap()],
	markdown: {
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeKatex],
	},
	vite: {
		// Let the dev server answer through GitHub Codespaces port forwarding
		// (Vite's DNS-rebinding protection blocks unknown hosts by default).
		server: { allowedHosts: ['.app.github.dev'] },
	},
});
