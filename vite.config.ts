import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ==========================================
// CONFIGURAÇÃO RESTAURADA (COM MOTOR DE DESIGN E PROXY ENTERPRISE)
// ==========================================
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    // Intercepta requisições e envia para o servidor local
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
