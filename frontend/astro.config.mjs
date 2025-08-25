/* @ts-check */

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Detect if we're running in development or building for production
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('dev');
const isBuild = process.argv.includes('build');

console.log(`🚀 Astro config: ${isDev ? 'Development (SSR)' : 'Production (Static)'}`);

// https://astro.build/config
export default defineConfig({
  // Use SSR for development, static for production builds
  output: isDev ? "server" : "static",
  integrations: [react()],

  // Bind Astro dev (helpful when running behind code-server / proxy)
  server: {
    host: true,       // 0.0.0.0
    port: 4321,
    strictPort: true,
  },

  vite: {
    // @ts-ignore
    plugins: [tailwindcss()],

    server: {
      host: true,            // 0.0.0.0 for external access
      port: 4321,
      strictPort: true,

      // Allow access via your proxy hostname
      allowedHosts: ["dev.deepthought.sh", "localhost", "127.0.0.1"],

      // Ensure HMR works through HTTPS reverse proxy (code-server/Caddy/etc.)
      hmr: {
        host: "dev.deepthought.sh",
        protocol: "wss",     // use "ws" if your dev URL is plain HTTP
        clientPort: 443      // 443 when accessed via HTTPS reverse proxy
      },

      // Keep your API & stream proxies
      proxy: {
        // Proxy API calls to backend
        "/api": {
          target: "http://localhost:9999",
          changeOrigin: true,
          ws: true,
        },
        // Proxy WebSocket connections
        "/stream": {
          target: "http://localhost:9999",
          changeOrigin: true,
          ws: true,
        },
      },
    },
  },
});
