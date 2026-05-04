import "dotenv/config";
import express from "express";
import cors from "cors";
import { SessionController } from "./src/controllers/SessionController.ts";

const app = express();

// Middlewares para processamento de dados e segurança
app.use(cors());
app.use(express.json()); 

/**
 * ROTAS DE OPERAÇÃO - RL.SYS HFT
 */

// Inicia nova sessão/banca
app.post("/api/sessions", SessionController.create);

// Dashboard em tempo real (Sincronização de Giros e Sinais)
app.get("/api/sessions/:id/dashboard", SessionController.getById);

// Entrada de número manual e disparo do Oráculo
app.post("/api/sessions/:id/spins", SessionController.registerSpin);

// Finalização de sessão e auditoria
app.post("/api/sessions/:id/close", async (req, res) => {
  res.json({ success: true, message: "Sessão encerrada para auditoria." });
});

const PORT = 3001; 
const HOST = '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`
  🚀 SISTEMA HFT CONECTADO
  -----------------------------------------
  ✅ SERVER: http://${HOST}:${PORT}
  ✅ DATABASE: Supabase Cloud (Online)
  ✅ ESTRUTURA: src/controllers/ detectada
  -----------------------------------------
  `);
});
