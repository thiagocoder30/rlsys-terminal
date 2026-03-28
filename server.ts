import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { StrategyOrchestrator } from "./src/services/StrategyOrchestrator";
import { SimulationEngine } from "./src/services/SimulationEngine";
import { syncStrategiesToDatabase } from "./src/services/StrategyBootstrapper";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();
const app = express();

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// FUNÇÕES TÁTICAS: O PINTOR ALGORÍTMICO COMPLETO
// ==========================================
function getNumberColor(num: number): string {
  if (num === 0) return "GREEN";
  const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return reds.includes(num) ? "RED" : "BLACK";
}

function getNumberParity(num: number): string {
  if (num === 0) return "ZERO";
  return num % 2 === 0 ? "EVEN" : "ODD";
}

function getNumberDozen(num: number): string {
  if (num === 0) return "ZERO";
  if (num <= 12) return "1";
  if (num <= 24) return "2";
  return "3";
}

function getNumberColumn(num: number): string {
  if (num === 0) return "ZERO";
  if (num % 3 === 1) return "1";
  if (num % 3 === 2) return "2";
  return "3";
}

function getNumberHalf(num: number): string {
  if (num === 0) return "ZERO";
  return num <= 18 ? "1" : "2";
}

// ==========================================
// A NOVA ROTA: HAWK-EYE OCR ON-DEMAND (LABORATÓRIO)
// ==========================================
app.post("/api/vision/analyze-table", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) throw new Error("Comandante, o arquivo de imagem não chegou ao servidor.");

    const apiKey = process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Chave da API ausente no arquivo .env.");

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // MODELO CORRIGIDO PARA A SUA INFRAESTRUTURA (GEMINI 3 FLASH)
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: { temperature: 0.0, maxOutputTokens: 8192, responseMimeType: "application/json" }
    });

    // PROMPT PARA LER A GRADE DE "ÚLTIMOS 500"
    const result = await model.generateContent([
      `You are a highly precise OCR for a roulette game.
      CRITICAL INSTRUCTIONS:
      1. Analyze the provided image, which contains a history of recently drawn roulette numbers.
      2. The numbers are displayed in a grid format (rows and columns).
      3. Extract ALL the numbers you see in this grid. Read them row by row, from left to right, top to bottom.
      4. Ignore text like "ÚLTIMOS 500", "QUENTE E FRIO", IDs, or balances.
      Return ONLY valid JSON: {"numbers": [int, int, ...]}`,
      {
        inlineData: {
          data: req.file.buffer.toString("base64"),
          mimeType: req.file.mimetype
        }
      }
    ]);

    let rawText = result.response.text();
    rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

    const jsonObj = JSON.parse(rawText);
    const numbers = [...(jsonObj.numbers || [])];

    if (numbers.length === 0) throw new Error("A Inteligência não extraiu números do print enviado.");

    res.json({ numbers });
  } catch (error: any) {
    console.error("[HAWK-EYE ERROR]:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ROTAS DO HFT E WARM-START
// ==========================================
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
    const safeNumbers = numbers.map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 36);
    const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
    const report = await SimulationEngine.runBacktest(safeNumbers, initial_bankroll, min_chip, activeStrategies);
    res.json(report);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// MOTOR TÁTICO DE INJEÇÃO DIRETA
app.post("/api/sessions/warm-start", async (req, res) => {
  try {
    const { initial_bankroll, min_chip, numbers } = req.body;

    // 1. Desarma qualquer sessão ativa residual para evitar conflito de front-end
    await prisma.session.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "CLOSED", closed_at: new Date() }
    });

    // 2. Inicia a nova operação
    const session = await prisma.session.create({ 
      data: { 
        initial_bankroll, 
        current_bankroll: initial_bankroll, 
        highest_bankroll: initial_bankroll, 
        min_chip, 
        status: "ACTIVE" 
      } 
    });

    const safeNumbers = numbers.map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 36);

    // 3. Injeta a matriz do terreno (OCR)
    for (const num of safeNumbers) {
      await prisma.spin.create({
        data: { 
          session_id: session.id, 
          number: num, 
          color: getNumberColor(num), 
          parity: getNumberParity(num), 
          dozen: getNumberDozen(num), 
          column: getNumberColumn(num), 
          half: getNumberHalf(num) 
        }
      });
    }

    // 4. Acorda a Inteligência Artificial para analisar o território instantaneamente
    const recentSpins = await prisma.spin.findMany({
      where: { session_id: session.id },
      orderBy: { created_at: "desc" },
      take: 50
    });
    const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
    await StrategyOrchestrator.analyzeMarket(recentSpins, activeStrategies, session);

    res.json({ success: true, session });
  } catch (error: any) { 
    console.error("[WARM-START ERROR]:", error.message);
    res.status(500).json({ error: error.message }); 
  }
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
    const { id } = req.params; const { number } = req.body;
    await StrategyOrchestrator.resolvePendingSignals(number, id);
    const spin = await prisma.spin.create({ data: { session_id: id, number, color: getNumberColor(number), parity: getNumberParity(number), dozen: getNumberDozen(number), column: getNumberColumn(number), half: getNumberHalf(number) } });
    const session = await prisma.session.findUnique({ where: { id } });
    if (session) {
      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" } });
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      await StrategyOrchestrator.analyzeMarket(recentSpins, activeStrategies, session);
    }
    res.json(spin);
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
// ROTEAMENTO DE PRODUÇÃO PADRÃO
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
