// @ts-check

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    // @ts-ignore
    plugins: [tailwindcss()],
    server: {
      proxy: {
        // Proxy API calls to backend
        '/api': {
          target: 'http://localhost:9999',
          changeOrigin: true,
          ws: true, // Enable WebSocket proxying for API endpoints
        },
        // Proxy WebSocket connections
        '/stream': {
          target: 'http://localhost:9999',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  },
});
