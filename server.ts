import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { StrategyOrchestrator } from "./src/services/StrategyOrchestrator";
import { SimulationEngine } from "./src/services/SimulationEngine";
import { syncStrategiesToDatabase } from "./src/services/StrategyBootstrapper";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" })); 

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

// ==========================================
// ROTA BLINDADA DE OCR
// ==========================================
app.post("/api/ocr", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) throw new Error("Imagem não fornecida ao servidor.");

    const apiKey = process.env.VITE_GEMINI_API_KEY; 
    if (!apiKey) throw new Error("Chave da API ausente.");

    const genAI = new GoogleGenerativeAI(apiKey); 
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview", 
      generationConfig: { temperature: 0.0, maxOutputTokens: 8192, responseMimeType: "application/json" } 
    });
    
    const result = await model.generateContent([
      `You are an OCR. Extract ALL numbers from the provided roulette image. Return JSON: {"numbers": []}`, 
      { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
    ]);
    
    let rawText = result.response.text();
    rawText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    const jsonObj = JSON.parse(rawText);
    const numbers = [...(jsonObj.numbers || [])].reverse(); 
    if (numbers.length === 0) throw new Error("Nenhum número detectado pela IA.");
    
    res.json({ numbers });
  } catch (error: any) { 
    res.status(500).json({ error: error.message }); 
  }
});

// ==========================================
// ROTAS DO HFT
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

// ==========================================
// ROTA DE WARM-START (COM INJEÇÃO TOTAL DE ATRIBUTOS)
// ==========================================
app.post("/api/sessions/warm-start", async (req, res) => {
  try {
    const { initial_bankroll, min_chip, numbers } = req.body;
    console.log(`\n[DEPLOY] Solicitando Warm-Start. Números brutos recebidos: ${numbers?.length || 0}`);

    const session = await prisma.session.create({ data: { initial_bankroll, current_bankroll: initial_bankroll, highest_bankroll: initial_bankroll, min_chip, status: "ACTIVE" } });
    
    const safeNumbers = numbers
      .map((n: any) => parseInt(n, 10))
      .filter((n: number) => !isNaN(n) && n >= 0 && n <= 36);

    console.log(`[DEPLOY] Números validados e limpos: ${safeNumbers.length}`);

    // Injeção cirúrgica com TODOS os parâmetros da mesa
    for (const num of safeNumbers) {
      await prisma.spin.create({
        data: { 
          session_id: session.id, 
          number: num,
          color: getNumberColor(num),
          parity: getNumberParity(num),
          dozen: getNumberDozen(num),
          column: getNumberColumn(num)
        }
      });
    }
    
    console.log(`[DEPLOY] Sucesso. Banco de dados carregado com ${safeNumbers.length} giros.`);
    res.json(session);
  } catch (error: any) { 
    console.error(`[DEPLOY ERRO CRÍTICO]:`, error.message);
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
    const { id } = req.params;
    const { number } = req.body;
    await StrategyOrchestrator.resolvePendingSignals(number, id);
    
    const spin = await prisma.spin.create({ 
      data: { 
        session_id: id, 
        number,
        color: getNumberColor(number),
        parity: getNumberParity(number),
        dozen: getNumberDozen(number),
        column: getNumberColumn(number)
      } 
    });
    
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

    const dbSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" }, take: 10 });
    const dbNumbers = dbSpins.map(s => s.number);

    const safeNumbers = numbers
      .map((n: any) => parseInt(n, 10))
      .filter((n: number) => !isNaN(n) && n >= 0 && n <= 36);

    let newNumbers: number[] = [];
    if (dbNumbers.length === 0) {
      newNumbers = safeNumbers;
    } else {
      let matchIndex = -1;
      for (let i = 0; i < safeNumbers.length; i++) {
         let isMatch = true;
         for (let j = 0; j < Math.min(3, dbNumbers.length); j++) {
            if (safeNumbers[i + j] !== dbNumbers[j]) { isMatch = false; break; }
         }
         if (isMatch) { matchIndex = i; break; }
      }
      if (matchIndex === -1) {
         newNumbers = safeNumbers.length > 0 ? [safeNumbers[0]] : [];
      } else {
         newNumbers = safeNumbers.slice(0, matchIndex);
      }
    }

    const toInsert = [...newNumbers].reverse();

    for (const num of toInsert) {
      await StrategyOrchestrator.resolvePendingSignals(num, id);
      
      await prisma.spin.create({ 
        data: { 
          session_id: id, 
          number: num,
          color: getNumberColor(num),
          parity: getNumberParity(num),
          dozen: getNumberDozen(num),
          column: getNumberColumn(num)
        } 
      });
      
      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" } });
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      await StrategyOrchestrator.analyzeMarket(recentSpins, activeStrategies, session);
    }
    
    res.json({ message: "Success", added: toInsert.length });
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
