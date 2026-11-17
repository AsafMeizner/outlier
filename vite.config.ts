import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const API = process.env['OUTLIER_API'] ?? 'http://127.0.0.1:8080';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    // Fonts and images stay as files: the server's CSP allows only same-origin resources.
    assetsInlineLimit: 0,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API,
        // The server rejects cross-site writes; present the dev requests as same-origin.
        configure: proxy => { proxy.on('proxyReq', req => { req.setHeader('origin', API); }); },
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
