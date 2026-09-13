import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = 'http://127.0.0.1:4001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': api,
      '/assets': api,
      '/openapi.json': api,
    },
  },
  preview: {
    port: 5174,
    proxy: {
      '/api': api,
      '/assets': api,
    },
  },
});
