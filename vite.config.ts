import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ==========================================
// CONFIGURAÇÃO DE REDE PARA MOBILE (BYPASS ERROR 13)
// ==========================================
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    // Força o Vite a não tentar descobrir interfaces de rede externas
    host: '127.0.0.1', 
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
