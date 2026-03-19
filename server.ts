import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { StrategyOrchestrator } from "./services/StrategyOrchestrator";
import { SimulationEngine } from "./services/SimulationEngine";
import { syncStrategiesToDatabase } from "./services/StrategyBootstrapper";

const prisma = new PrismaClient();
const app = express();

// Middlewares Institucionais
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Limite estendido para suportar as strings Base64 do OCR

// ==========================================
// 1. ROTAS DE VISÃO MACRO (DIRETORIA)
// ==========================================
app.get("/api/macro", async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { status: "CLOSED" },
      orderBy: { created_at: "desc" },
    });

    let totalProfit = 0;
    sessions.forEach(s => { totalProfit += (s.current_bankroll - s.initial_bankroll); });

    res.json({ totalProfit, totalSessions: sessions.length, sessions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 2. ROTAS DO LABORATÓRIO E SIMULAÇÃO (FASE 5)
// ==========================================
app.post("/api/simulate", async (req, res) => {
  try {
    const { numbers, initial_bankroll, min_chip } = req.body;
    if (!numbers || numbers.length === 0) throw new Error("Nenhum giro fornecido para simulação.");
    
    // Puxa as estratégias ativas com seus respectivos pesos bayesianos
    const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
    
    // Delega o processamento pesado para a CPU isolada do simulador
    const report = await SimulationEngine.runBacktest(numbers, initial_bankroll, min_chip, activeStrategies);
    
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sessions/warm-start", async (req, res) => {
  try {
    const { initial_bankroll, min_chip, numbers } = req.body;
    if (!numbers || numbers.length === 0) throw new Error("Memória OCR vazia. Impossível iniciar Warm-Start.");

    const session = await prisma.session.create({ 
      data: { 
        initial_bankroll, 
        current_bankroll: initial_bankroll, 
        highest_bankroll: initial_bankroll, 
        min_chip, 
        status: "ACTIVE" 
      } 
    });
    
    // Injeta a memória base (giros antigos) no banco de dados da sessão silenciosamente
    const spinData = numbers.map((num: number) => ({ session_id: session.id, number: num }));
    await prisma.spin.createMany({ data: spinData });
    
    res.json(session);
  } catch (error: any) {
     res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 3. ROTAS DE CONTROLE DE SESSÃO REAL (MESA)
// ==========================================
app.post("/api/sessions", async (req, res) => {
  try {
    const { initial_bankroll, min_chip } = req.body;
    
    // Partida Fria: Cria a sessão limpa
    const session = await prisma.session.create({
      data: { initial_bankroll, current_bankroll: initial_bankroll, highest_bankroll: initial_bankroll, min_chip, status: "ACTIVE" },
    });
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sessions/:id/dashboard", async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({
      where: { id },
      include: { spins: { orderBy: { created_at: "desc" } }, signals: { include: { strategy: true }, orderBy: { created_at: "desc" } } }
    });
    
    if (!session) return res.status(404).json({ error: "Sessão não encontrada" });

    res.json({ session, zScore: 0, strategiesStatus: [] }); // O zScore global foi delegado ao frontend por Entropia na Fase 5
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sessions/:id/close", async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.update({
      where: { id },
      data: { status: "CLOSED", closed_at: new Date() }
    });

    // Liquida forçadamente qualquer sinal que ficou pendente ou sugerido na mesa
    await prisma.signal.updateMany({
      where: { session_id: id, result: { in: ["PENDING", "SUGGESTED"] } },
      data: { result: "MISSED" }
    });

    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sessions/:id/audit", async (req, res) => {
  try {
    const { id } = req.params;
    const auditData = await prisma.session.findUnique({
      where: { id },
      include: { spins: { orderBy: { created_at: "desc" } }, signals: { include: { strategy: true }, orderBy: { created_at: "desc" } } }
    });
    res.json(auditData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. ROTAS DE ENTRADA DE DADOS E INTELIGÊNCIA
// ==========================================
app.post("/api/sessions/:id/spins", async (req, res) => {
  try {
    const { id } = req.params;
    const { number } = req.body;

    // 1. Resolve apostas ativas
    await StrategyOrchestrator.resolvePendingSignals(number, id);

    // 2. Registra o novo número na linha do tempo
    const spin = await prisma.spin.create({ data: { session_id: id, number } });

    // 3. Consulta a mesa atualizada e aciona a IA
    const session = await prisma.session.findUnique({ where: { id } });
    if (session) {
      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" } });
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      await StrategyOrchestrator.analyzeMarket(recentSpins, activeStrategies, session);
    }

    res.json(spin);
  } catch (error: any) {
    console.error("Erro na inserção de Spin:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sessions/:id/ocr/sync", async (req, res) => {
  try {
    const { id } = req.params;
    const { numbers } = req.body;

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) throw new Error("Sessão não existe.");

    // Sincronização em Lote
    for (const num of numbers) {
      await StrategyOrchestrator.resolvePendingSignals(num, id);
      await prisma.spin.create({ data: { session_id: id, number: num } });
      
      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" } });
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      await StrategyOrchestrator.analyzeMarket(recentSpins, activeStrategies, session);
    }

    res.json({ message: "OCR Sincronizado com Sucesso." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. ROTAS DE LOGÍSTICA DE OPERADOR
// ==========================================
app.post("/api/signals/:id/action", async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (action === "CONFIRM") {
      await prisma.signal.update({ where: { id }, data: { result: "PENDING" } });
    } else if (action === "REJECT") {
      await prisma.signal.update({ where: { id }, data: { result: "MISSED" } });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR (BOOT)
// ==========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n[RL.SYS HFT] Servidor Operacional Iniciado.`);
  console.log(`[NETWORK] Roteamento ativo na porta: ${PORT}`);
  
  // Injeta as matrizes lógicas no banco de dados assim que o servidor liga
  await syncStrategiesToDatabase(prisma);
  console.log(`[BOOTSTRAP] Rede Neural Carregada com Sucesso.\n`);
});
