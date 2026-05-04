import "dotenv/config";
import express from "express";
import cors from "cors";
import { SessionController } from "./controllers/SessionController";

const app = express();

// Middlewares vitais
app.use(cors());
app.use(express.json()); // Essencial para o Oráculo ler os números enviados

/**
 * MAPEAMENTO DE ROTAS HFT (INTEGRAÇÃO SUPABASE)
 * Aqui conectamos os endpoints que o seu Frontend (ActiveSession.tsx) chama
 * com a lógica do novo SessionController.
 */

// 1. SETUP: Inicia uma nova banca/sessão
app.post("/api/sessions", SessionController.create);

// 2. DASHBOARD: Sincroniza os dados da mesa (Giro, VIX, Sinais)
// O frontend busca em /api/sessions/:id/dashboard
app.get("/api/sessions/:id/dashboard", SessionController.getById);

// 3. INJEÇÃO TÁTICA: Recebe o número manual e aciona o Oráculo
app.post("/api/sessions/:id/spins", SessionController.registerSpin);

// 4. FECHAMENTO: Rota para encerrar a sessão (Opcional, mas recomendada)
app.post("/api/sessions/:id/close", async (req, res) => {
  // Aqui você pode adicionar lógica para mudar o status para CLOSED no Supabase
  res.json({ success: true });
});

// CONFIGURAÇÃO DO SERVIDOR
const PORT = 3001; 
const HOST = '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`
  🚀 RL.SYS HFT - ORÁCULO ONLINE
  -----------------------------------------
  ✅ BANCO DE DADOS: Supabase Cloud
  ✅ ENDPOINT: http://${HOST}:${PORT}
  ✅ STATUS: Aguardando PaperTrading...
  -----------------------------------------
  `);
});
