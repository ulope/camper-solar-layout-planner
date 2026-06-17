import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the static build works when served from a GitHub Pages
  // project subpath (https://<user>.github.io/<repo>/) as well as from root.
  base: './',
  plugins: [svelte()],
  server: {
    allowedHosts: true,
  },
})
