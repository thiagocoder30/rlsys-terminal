import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// ==========================================
// CONFIGURAÇÃO RESTAURADA (COM MOTOR DE DESIGN)
// ==========================================
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ]
});
