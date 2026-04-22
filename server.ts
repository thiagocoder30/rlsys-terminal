import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ROTA DE TELEMETRIA DA SESSÃO
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    // Busca robusta com inclusão de relações
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        signals: { include: { strategy: true }, orderBy: { created_at: "desc" } },
        spins: { orderBy: { created_at: "desc" }, take: 50 }
      }
    });

    if (!session) {
      return res.status(404).json({ error: "Sessão não localizada no banco." });
    }

    // Blindagem contra valores nulos (evita tela branca)
    res.json({
      ...session,
      signals: session.signals || [],
      spins: session.spins || [],
      current_bankroll: Number(session.current_bankroll || 0),
      initial_bankroll: Number(session.initial_bankroll || 0)
    });
  } catch (error) {
    console.error("[API ERROR]:", error);
    res.status(500).json({ error: "Falha na sincronização de dados." });
  }
});

// Warm-start (Inicia a mesa)
app.post("/api/sessions/warm-start", async (req, res) => {
  try {
    const { initial_bankroll, min_chip, numbers } = req.body;
    
    const session = await prisma.session.create({ 
      data: { 
        initial_bankroll: parseFloat(initial_bankroll) || 0, 
        current_bankroll: parseFloat(initial_bankroll) || 0, 
        status: "ACTIVE" 
      } 
    });
    
    // Lógica simplificada de inserção de giros (exemplo)
    if (numbers && numbers.length > 0) {
      for (const num of numbers) {
        await prisma.spin.create({
          data: { session_id: session.id, number: parseInt(num), color: "BLACK" }
        });
      }
    }

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ error: "Erro ao iniciar mesa." });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 BACKEND HFT ATIVO NA PORTA ${PORT}`);
});
