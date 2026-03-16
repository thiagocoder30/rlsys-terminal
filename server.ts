import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { PrismaClient } from "@prisma/client";
import { createServer as createViteServer } from "vite";
import { MathEngine } from "./src/services/MathEngine.ts";
import { StrategyOrchestrator } from "./src/services/StrategyOrchestrator.ts";
import { syncStrategiesToDatabase } from "./src/services/StrategyBootstrapper.ts";

function sanitizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  let sanitized = url.trim().replace(/\[|\]/g, "");
  if (sanitized.includes("YOUR-PASSWORD")) return sanitized;
  try {
    const protocolMatch = sanitized.match(/^(postgresql:\/\/|postgres:\/\/)(.*)$/);
    if (protocolMatch) {
      const protocol = protocolMatch[1];
      const remainder = protocolMatch[2];
      const lastAtIndex = remainder.lastIndexOf("@");
      if (lastAtIndex !== -1) {
        const credentials = remainder.substring(0, lastAtIndex);
        let hostPart = remainder.substring(lastAtIndex + 1);
        if (hostPart.includes("supabase.co") && !hostPart.includes("sslmode=")) {
          hostPart += hostPart.includes("?") ? "&sslmode=require" : "?sslmode=require";
        }
        const firstColonIndex = credentials.indexOf(":");
        if (firstColonIndex !== -1) {
          const user = credentials.substring(0, firstColonIndex);
          const pass = credentials.substring(firstColonIndex + 1);
          if (/[@#!:?&]/.test(pass) && !pass.includes("%")) {
            const encodedPass = encodeURIComponent(pass);
            return `${protocol}${user}:${encodedPass}@${hostPart}`;
          }
        }
      }
    }
  } catch (e) { console.error("Erro DATABASE_URL:", e); }
  return sanitized;
}

const originalUrl = process.env.DATABASE_URL;
const fixedUrl = sanitizeDatabaseUrl(originalUrl);
if (fixedUrl && fixedUrl !== originalUrl) process.env.DATABASE_URL = fixedUrl;

const prisma = new PrismaClient();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set("trust proxy", 1);
  app.use(morgan("combined"));
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 2000 });
  app.use("/api/", limiter);
  app.use(express.json({ limit: "50kb" })); 
  app.use(cors());

  const validateUUID = (req: any, res: any, next: any) => {
    const { id } = req.params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (id && !uuidRegex.test(id)) return res.status(400).json({ error: "ID de sessão inválido." });
    next();
  };

  app.get("/api/health", async (req, res) => {
    try {
      await prisma.$connect();
      const count = await prisma.session.count();
      res.json({ status: "ok", database: "Conectado", sessions: count });
    } catch (error: any) { res.status(500).json({ status: "error", details: error.message }); }
  });

  app.get("/api/macro", async (req, res) => {
    try {
      const closedSessions = await prisma.session.findMany({ where: { status: "CLOSED" }, orderBy: { closed_at: "desc" }, take: 50 });
      let totalProfit = 0; let winningSessions = 0;
      closedSessions.forEach(s => { 
        const profit = s.current_bankroll - s.initial_bankroll; 
        totalProfit += profit; 
        if (profit > 0) winningSessions++; 
      });
      const winRate = closedSessions.length > 0 ? ((winningSessions / closedSessions.length) * 100).toFixed(1) : "0.0";
      res.json({ totalProfit, winRate, totalSessions: closedSessions.length, sessions: closedSessions });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const { initial_bankroll, min_chip } = req.body;
      const session = await prisma.session.create({ 
        data: { 
          initial_bankroll, 
          current_bankroll: initial_bankroll, 
          highest_bankroll: initial_bankroll, 
          min_chip: min_chip || 0.50, 
          status: "ACTIVE" 
        } 
      });
      res.json(session);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/sessions/:id/close", validateUUID, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const session = await prisma.session.update({ where: { id }, data: { status: "CLOSED", closed_at: new Date() }});
      res.json(session);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/sessions/:id/ocr/sync", validateUUID, async (req: any, res: any) => {
    const { id } = req.params; 
    const { numbers } = req.body; 
    if (!Array.isArray(numbers)) return res.status(400).json({ error: "Formato inválido." });
    
    try {
      const lastSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" }, take: 150 });
      const lastNumbersInDB = lastSpins.map(s => s.number).reverse(); 
      let newNumbersToInsert = [...numbers]; 
      
      if (lastNumbersInDB.length > 0) {
        for (let i = 0; i < numbers.length; i++) {
          const sub = numbers.slice(0, numbers.length - i); 
          const lastSubInDB = lastNumbersInDB.slice(-sub.length);
          if (sub.length > 0 && JSON.stringify(sub) === JSON.stringify(lastSubInDB)) { 
            newNumbersToInsert = numbers.slice(sub.length); break; 
          }
        }
      }
      
      if (newNumbersToInsert.length === 0) return res.json({ count: 0, message: "Atualizado" });

      const latestNumber = newNumbersToInsert[newNumbersToInsert.length - 1];
      await StrategyOrchestrator.resolvePendingSignals(latestNumber, id);

      const now = Date.now();
      const spinsDataBulk = newNumbersToInsert.map((n, index) => {
        const props = MathEngine.getNumberProps(n);
        return { session_id: id, number: n, created_at: new Date(now + index), color: props.color, parity: props.parity, dozen: String(props.dozen), column: String(props.column), half: String(props.half) };
      });
      await prisma.spin.createMany({ data: spinsDataBulk });

      const updatedSession = await prisma.session.findUnique({ where: { id } });
      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" }, take: 200 });
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      
      if (updatedSession) {
        await StrategyOrchestrator.analyzeMarket(recentSpins.map(s => s.number), activeStrategies, updatedSession);
      }
      
      res.json({ count: newNumbersToInsert.length });
    } catch (error: any) { 
      console.error("[SYNC ERROR]", error.message);
      res.status(500).json({ error: error.message }); 
    }
  });

  app.post("/api/sessions/:id/spins", validateUUID, async (req: any, res: any) => {
    try {
      const { id } = req.params; 
      const { number } = req.body;
      if (number === undefined || number < 0 || number > 36) return res.status(400).json({ error: "Número inválido." });
      
      await StrategyOrchestrator.resolvePendingSignals(number, id);
      
      const props = MathEngine.getNumberProps(number);
      const spin = await prisma.spin.create({ data: { session_id: id, number, color: props.color, parity: props.parity, dozen: String(props.dozen), column: String(props.column), half: String(props.half) } });

      const updatedSession = await prisma.session.findUnique({ where: { id } });
      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" }, take: 200 });
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      
      if (updatedSession) {
        await StrategyOrchestrator.analyzeMarket(recentSpins.map(s => s.number), activeStrategies, updatedSession); 
      }
      
      res.json(spin);
    } catch (error: any) { 
      console.error("[SPIN ERROR]", error.message);
      res.status(500).json({ error: error.message }); 
    }
  });

  app.get("/api/sessions/:id/dashboard", validateUUID, async (req, res) => {
    try {
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
        include: { spins: { orderBy: { created_at: "desc" }, take: 100 }, signals: { orderBy: { created_at: "desc" }, take: 50, include: { strategy: true } } },
      });
      if (!session) return res.status(404).json({ error: "Sessão não encontrada" });
      
      const zScoreGlobal = MathEngine.calculateZScore(session.spins);
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      const historyNumbers = session.spins.map(s => s.number);
      
      const strategiesStatus = activeStrategies.map(st => {
        const config = StrategyOrchestrator.getConfig(st.name);
        const zScoreSetorial = StrategyOrchestrator.calculateSectorZScore(historyNumbers, config);
        return { id: st.id, name: st.name, isHot: zScoreSetorial <= -0.85, zScore: zScoreSetorial.toFixed(2) };
      });
      res.json({ session, zScore: zScoreGlobal, strategiesStatus });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else { 
    app.use(express.static("dist")); 
  }

  await syncStrategiesToDatabase(prisma);
  app.listen(PORT, "0.0.0.0", () => { 
    console.log(`[SECURITY] RL.sys Terminal running on port ${PORT}`); 
  });
}

startServer();
