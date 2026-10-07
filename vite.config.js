import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const keyPath = env.HTTPS_KEY_PATH;
  const certPath = env.HTTPS_CERT_PATH;
  if (Boolean(keyPath) !== Boolean(certPath)) {
    throw new Error('Set both HTTPS_KEY_PATH and HTTPS_CERT_PATH to enable HTTPS.');
  }
  const https = keyPath ? {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  } : undefined;
  const apiTarget = `${https ? 'https' : 'http'}://localhost:${env.PORT || 8080}`;

  return {
    plugins: [react(), VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Riftbound Local Collection Manager', short_name: 'Riftbound', start_url: '/', display: 'standalone', background_color: '#d4dde2', theme_color: '#d4dde2', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }] } })],
    server: { host: '0.0.0.0', port: 5173, https, proxy: { '/api': { target: apiTarget, ...(https ? { secure: false } : {}) } } },
    build: { outDir: 'dist' }
  };
});
