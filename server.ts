import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// ROTA DE SINCRONIZAÇÃO DA SESSÃO
app.get("/api/sessions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        signals: { include: { strategy: true }, orderBy: { created_at: "desc" } },
        spins: { orderBy: { created_at: "desc" }, take: 40 }
      }
    });

    if (!session) return res.status(404).json({ error: "Sessão não localizada." });

    res.json({
      ...session,
      signals: session.signals || [],
      spins: session.spins || [],
      current_bankroll: Number(session.current_bankroll || 0)
    });
  } catch (error) {
    res.status(500).json({ error: "Erro de sincronização." });
  }
});

app.post("/api/sessions/warm-start", async (req, res) => {
  try {
    const { initial_bankroll } = req.body;
    const session = await prisma.session.create({
      data: {
        initial_bankroll: parseFloat(initial_bankroll) || 100,
        current_bankroll: parseFloat(initial_bankroll) || 100,
        status: "ACTIVE"
      }
    });
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar sessão." });
  }
});

// ESCUTANDO EM 127.0.0.1 PARA EVITAR PERMISSÕES DE REDE NO ANDROID
const PORT = 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 [SERVER] Ativo em http://127.0.0.1:${PORT}`);
});
