import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { PrismaClient } from "@prisma/client";
import { createServer as createViteServer } from "vite";
import { MathEngine } from "./src/services/MathEngine.ts";
import { RaceTrackStrategies } from "./src/services/RaceTrackStrategies.ts";
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
        if (hostPart.includes("sslmode=require") && !remainder.includes("sslmode=require")) {
           return `${protocol}${credentials}@${hostPart}`;
        }
      }
    }
  } catch (e) {
    console.error("Erro ao tentar auto-corrigir DATABASE_URL:", e);
  }
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

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    message: { error: "Muitas requisições. Tente novamente em 15 minutos." }
  });
  app.use("/api/", limiter);
  app.use(cors());
  app.use(express.json({ limit: "10kb" }));

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
    } catch (error: any) {
      res.status(500).json({ status: "error", message: "Falha na conexão", details: error.message });
    }
  });

  const processNewSpin = async (sessionId: string, number: number) => {
    const props = MathEngine.getNumberProps(number);
    const spin = await prisma.spin.create({ data: { session_id: sessionId, number, ...props } });

    const pendingSignals = await prisma.signal.findMany({ where: { session_id: sessionId, result: "PENDING" } });
    for (const signal of pendingSignals) {
      let isWin = false;
      if (signal.target_bet === "RED" && props.color === "RED") isWin = true;
      if (signal.target_bet === "BLACK" && props.color === "BLACK") isWin = true;
      if (signal.target_bet === "CUSTOM_SECTOR_1_21") isWin = StrategyOrchestrator.VIZINHOS_1_21_COVERAGE.includes(number);
      if (signal.target_bet === "FUSION_ZONE") isWin = StrategyOrchestrator.FUSION_COVERAGE.includes(number);
      if (signal.target_bet === "JAMES_BOND_SET") isWin = StrategyOrchestrator.JAMES_BOND_COVERAGE.includes(number);

      await prisma.signal.update({ where: { id: signal.id }, data: { result: isWin ? "WIN" : "LOSS" } });
      const strategy = await prisma.strategy.findUnique({ where: { id: signal.strategy_id } });
      if (strategy) {
        const newWeight = MathEngine.updateBayesWeight(strategy.bayes_weight, isWin);
        await prisma.strategy.update({ where: { id: strategy.id }, data: { bayes_weight: newWeight } });
      }
    }

    const recentSpins = await prisma.spin.findMany({ where: { session_id: sessionId }, orderBy: { created_at: "desc" }, take: 100 });
    const spinNumbers = recentSpins.map(s => s.number).reverse();
    const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
    const recommendation = StrategyOrchestrator.analyzeMarket(spinNumbers, activeStrategies);

    if (recommendation && recommendation.confidence !== "LOW") {
      const existingPending = await prisma.signal.findFirst({
        where: { session_id: sessionId, strategy_id: recommendation.strategyId, result: "PENDING" }
      });
      if (!existingPending) {
        await prisma.signal.create({
          data: {
            session_id: sessionId, strategy_id: recommendation.strategyId, target_bet: recommendation.targetBet,
            suggested_amount: recommendation.confidence === "CRITICAL" ? 50 : 10, result: "PENDING"
          }
        });
      }
    }
    return spin;
  };

  app.post("/api/sessions", async (req, res) => {
    try {
      const { initial_bankroll } = req.body;
      const session = await prisma.session.create({ data: { initial_bankroll, current_bankroll: initial_bankroll } });
      res.json(session);
    } catch (error: any) { res.status(500).json({ error: "Falha na comunicação." }); }
  });

  app.post("/api/sessions/:id/spins", validateUUID, async (req, res) => {
    try {
      const spin = await processNewSpin(req.params.id, req.body.number);
      res.json(spin);
    } catch (error) { res.status(500).json({ error: "Erro ao registrar giro" }); }
  });

  // --- ROTA DE OCR: CORREÇÃO DEFINITIVA DE ORDEM (TIMESTAMPS SEQUENCIAIS) ---
  app.post("/api/sessions/:id/ocr/sync", validateUUID, async (req: any, res: any) => {
    const { id } = req.params;
    const { numbers } = req.body;

    if (!Array.isArray(numbers)) return res.status(400).json({ error: "Formato inválido." });

    try {
      const lastSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" }, take: 50 });
      const lastNumbers = lastSpins.map(s => s.number).reverse(); // Oldest to Newest
      
      let newNumbers = [...numbers]; // Frontend manda [Oldest -> Newest]
      if (lastNumbers.length > 0) {
        for (let i = 0; i < numbers.length; i++) {
          const sub = numbers.slice(0, numbers.length - i);
          const lastSub = lastNumbers.slice(-sub.length);
          if (sub.length > 0 && JSON.stringify(sub) === JSON.stringify(lastSub)) {
            newNumbers = numbers.slice(sub.length);
            break;
          }
        }
      }

      if (newNumbers.length === 0) return res.json({ count: 0, message: "Histórico já atualizado." });

      const now = Date.now();
      const spinsData = newNumbers.map((n, index) => {
        const props = MathEngine.getNumberProps(n);
        return {
          session_id: id,
          number: n,
          // CRÍTICO: Soma 1 milissegundo para cada número, garantindo a ordem cronológica no Banco!
          created_at: new Date(now + index), 
          ...props
        };
      });

      await prisma.spin.createMany({ data: spinsData });

      // Cérebro Orquestrador
      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" }, take: 100 });
      const spinNumbers = recentSpins.map(s => s.number).reverse();
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      const recommendation = StrategyOrchestrator.analyzeMarket(spinNumbers, activeStrategies);

      if (recommendation && recommendation.confidence !== "LOW") {
        const existingPending = await prisma.signal.findFirst({ where: { session_id: id, strategy_id: recommendation.strategyId, result: "PENDING" } });
        if (!existingPending) {
          await prisma.signal.create({
            data: { session_id: id, strategy_id: recommendation.strategyId, target_bet: recommendation.targetBet, suggested_amount: 10, result: "PENDING" }
          });
        }
      }

      res.json({ count: newNumbers.length, numbers: newNumbers });
    } catch (error: any) { res.status(500).json({ error: "Falha ao sincronizar OCR." }); }
  });

  app.get("/api/sessions/:id/dashboard", validateUUID, async (req, res) => {
    try {
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
        include: { spins: { orderBy: { created_at: "desc" }, take: 100 }, signals: { orderBy: { created_at: "desc" }, take: 10 } },
      });
      if (!session) return res.status(404).json({ error: "Sessão não encontrada" });
      const zScore = MathEngine.calculateZScore(session.spins);
      res.json({ session, zScore });
    } catch (error) { res.status(500).json({ error: "Erro dashboard" }); }
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
      
