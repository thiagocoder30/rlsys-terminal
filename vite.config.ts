import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ==========================================
// INJEÇÃO BLINDADA (BYPASS DO TERMUX .ENV)
// ==========================================
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify('AIzaSyB2J45k42lGZfLxqsO8n9Gpf2b7w4Fx9PI'),
    'import.meta.env.VITE_GEMINI': JSON.stringify('AIzaSyB2J45k42lGZfLxqsO8n9Gpf2b7w4Fx9PI')
  }
});
