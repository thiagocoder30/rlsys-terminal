import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { StrategyOrchestrator } from "./src/services/StrategyOrchestrator";
import { syncStrategiesToDatabase } from "./src/services/StrategyBootstrapper";

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// HELPER: Cores da Roleta
const getNumberColor = (num: number) => {
  if (num === 0) return "GREEN";
  return [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(num) ? "RED" : "BLACK";
};

// ==========================================
// ROTA DE SESSÃO ENTERPRISE (ANTI-CRASH)
// ==========================================
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

    if (!session) {
      return res.status(404).json({ error: "Sessão não localizada no banco local." });
    }

    // SANITIZAÇÃO: Garante que o Front-end receba arrays, nunca null/undefined
    const enterpriseData = {
      ...session,
      signals: session.signals || [],
      spins: session.spins || [],
      current_bankroll: Number(session.current_bankroll || 0),
      initial_bankroll: Number(session.initial_bankroll || 0)
    };

    res.json(enterpriseData);
  } catch (error: any) {
    console.error("[SERVER ERROR]:", error.message);
    res.status(500).json({ error: "Erro na integridade dos dados locais." });
  }
});

// ==========================================
// WARM-START (INICIALIZAÇÃO DA MESA)
// ==========================================
app.post("/api/sessions/warm-start", async (req, res) => {
  try {
    const { initial_bankroll, min_chip, numbers } = req.body;

    // Fecha sessões anteriores
    await prisma.session.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "CLOSED", closed_at: new Date() }
    });

    // Cria nova sessão com valores garantidos
    const session = await prisma.session.create({ 
      data: { 
        initial_bankroll: parseFloat(initial_bankroll) || 0, 
        current_bankroll: parseFloat(initial_bankroll) || 0, 
        highest_bankroll: parseFloat(initial_bankroll) || 0, 
        min_chip: parseFloat(min_chip) || 2.5, 
        status: "ACTIVE" 
      } 
    });

    const safeNumbers = numbers.map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n));
    
    // Inserção em lote para performance no SQLite
    for (const num of safeNumbers.reverse()) {
      await prisma.spin.create({
        data: { 
          session_id: session.id, 
          number: num, 
          color: getNumberColor(num),
          parity: num % 2 === 0 ? "EVEN" : "ODD",
          dozen: num <= 12 ? "1" : num <= 24 ? "2" : "3",
          column: (num % 3 === 0 ? 3 : num % 3).toString(),
          half: num <= 18 ? "1" : "2"
        }
      });
    }

    res.json({ success: true, session });
  } catch (error: any) { 
    res.status(500).json({ error: error.message }); 
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`[ENTERPRISE] Servidor ativo na porta ${PORT}`);
  await syncStrategiesToDatabase(prisma);
});
