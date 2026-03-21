import express from "express";
import cors from "cors";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { StrategyOrchestrator } from "./src/services/StrategyOrchestrator";
import { SimulationEngine } from "./src/services/SimulationEngine";
import { syncStrategiesToDatabase } from "./src/services/StrategyBootstrapper";

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" })); 

app.get("/api/macro", async (req, res) => {
  try {
    const sessions = await prisma.session.findMany({ where: { status: "CLOSED" }, orderBy: { created_at: "desc" } });
    let totalProfit = 0; sessions.forEach(s => { totalProfit += (s.current_bankroll - s.initial_bankroll); });
    res.json({ totalProfit, totalSessions: sessions.length, sessions });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post("/api/simulate", async (req, res) => {
  try {
    const { numbers, initial_bankroll, min_chip } = req.body;
    if (!numbers || numbers.length === 0) throw new Error("Nenhum giro fornecido.");
    const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
    const report = await SimulationEngine.runBacktest(numbers, initial_bankroll, min_chip, activeStrategies);
    res.json(report);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post("/api/sessions/warm-start", async (req, res) => {
  try {
    const { initial_bankroll, min_chip, numbers } = req.body;
    const session = await prisma.session.create({ data: { initial_bankroll, current_bankroll: initial_bankroll, highest_bankroll: initial_bankroll, min_chip, status: "ACTIVE" } });
    const spinData = numbers.map((num: number) => ({ session_id: session.id, number: num }));
    await prisma.spin.createMany({ data: spinData });
    res.json(session);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post("/api/sessions", async (req, res) => {
  try {
    const { initial_bankroll, min_chip } = req.body;
    const session = await prisma.session.create({ data: { initial_bankroll, current_bankroll: initial_bankroll, highest_bankroll: initial_bankroll, min_chip, status: "ACTIVE" } });
    res.json(session);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.get("/api/sessions/:id/dashboard", async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.findUnique({ where: { id }, include: { spins: { orderBy: { created_at: "desc" } }, signals: { include: { strategy: true }, orderBy: { created_at: "desc" } } } });
    if (!session) return res.status(404).json({ error: "Not found" });
    res.json({ session, zScore: 0, strategiesStatus: [] });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post("/api/sessions/:id/close", async (req, res) => {
  try {
    const { id } = req.params;
    const session = await prisma.session.update({ where: { id }, data: { status: "CLOSED", closed_at: new Date() } });
    await prisma.signal.updateMany({ where: { session_id: id, result: { in: ["PENDING", "SUGGESTED"] } }, data: { result: "MISSED" } });
    res.json(session);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.get("/api/sessions/:id/audit", async (req, res) => {
  try {
    const { id } = req.params;
    const auditData = await prisma.session.findUnique({ where: { id }, include: { spins: { orderBy: { created_at: "desc" } }, signals: { include: { strategy: true }, orderBy: { created_at: "desc" } } } });
    res.json(auditData);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post("/api/sessions/:id/spins", async (req, res) => {
  try {
    const { id } = req.params;
    const { number } = req.body;
    await StrategyOrchestrator.resolvePendingSignals(number, id);
    const spin = await prisma.spin.create({ data: { session_id: id, number } });
    const session = await prisma.session.findUnique({ where: { id } });
    if (session) {
      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" } });
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      await StrategyOrchestrator.analyzeMarket(recentSpins, activeStrategies, session);
    }
    res.json(spin);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post("/api/sessions/:id/ocr/sync", async (req, res) => {
  try {
    const { id } = req.params; const { numbers } = req.body;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) throw new Error("Sessão não existe.");
    for (const num of numbers) {
      await StrategyOrchestrator.resolvePendingSignals(num, id);
      await prisma.spin.create({ data: { session_id: id, number: num } });
      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" } });
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      await StrategyOrchestrator.analyzeMarket(recentSpins, activeStrategies, session);
    }
    res.json({ message: "Success" });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post("/api/signals/:id/action", async (req, res) => {
  try {
    const { id } = req.params; const { action } = req.body;
    if (action === "CONFIRM") await prisma.signal.update({ where: { id }, data: { result: "PENDING" } });
    else if (action === "REJECT") await prisma.signal.update({ where: { id }, data: { result: "MISSED" } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// ROTEAMENTO DE ALTA PERFORMANCE (CAMPO DE BATALHA)
// ==========================================
app.use(express.static(path.join(process.cwd(), "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(process.cwd(), "dist", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n[RL.SYS HFT] Servidor Operacional Iniciado.`);
  console.log(`[NETWORK] Roteamento ativo na porta: ${PORT}`);
  await syncStrategiesToDatabase(prisma);
  console.log(`[BOOTSTRAP] Rede Neural Carregada com Sucesso.\n`);
});
