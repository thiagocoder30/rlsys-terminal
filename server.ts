import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// ROTA PARA BUSCAR DADOS DA SESSÃO
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

    if (!session) return res.status(404).json({ error: "Sessão não encontrada" });

    res.json({
      ...session,
      signals: session.signals || [],
      spins: session.spins || [],
      current_bankroll: Number(session.current_bankroll || 0)
    });
  } catch (error) {
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// ROTA DE INICIALIZAÇÃO (WARM-START)
app.post("/api/sessions/warm-start", async (req, res) => {
  try {
    const { initial_bankroll, numbers } = req.body;

    const session = await prisma.session.create({
      data: {
        initial_bankroll: parseFloat(initial_bankroll) || 100,
        current_bankroll: parseFloat(initial_bankroll) || 100,
        status: "ACTIVE"
      }
    });

    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar sessão" });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
