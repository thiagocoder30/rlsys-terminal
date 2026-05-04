import "dotenv/config";
import express from "express";
import cors from "cors";
import { SessionController } from "./src/controllers/SessionController.ts";

const app = express();

// Middlewares essenciais
app.use(cors());
app.use(express.json()); 

/**
 * ROTAS DE OPERAÇÃO - RL.SYS HFT
 * Conecta o Frontend ao novo banco Supabase
 */

// Inicia nova sessão de PaperTrading
app.post("/api/sessions", SessionController.create);

// Sincroniza dados da mesa (Giros, Heatmap e Sinais do Oráculo)
app.get("/api/sessions/:id/dashboard", SessionController.getById);

// Recebe giro manual e dispara a análise do Oráculo
app.post("/api/sessions/:id/spins", SessionController.registerSpin);

// Finalização de sessão
app.post("/api/sessions/:id/close", async (req, res) => {
  res.json({ success: true, message: "Sessão encerrada." });
});

const PORT = 3001; 
const HOST = '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`
  🚀 SISTEMA HFT ONLINE
  -----------------------------------------
  ✅ ENDPOINT: http://${HOST}:${PORT}
  ✅ DATABASE: Supabase Cloud
  ✅ ESTRUTURA: src/controllers/ detectada
  -----------------------------------------
  `);
});
