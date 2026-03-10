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
    } catch (error: any) { 
      res.status(500).json({ status: "error", details: error.message }); 
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const { initial_bankroll } = req.body;
      const session = await prisma.session.create({ data: { initial_bankroll, current_bankroll: initial_bankroll, status: "ACTIVE" } });
      res.json(session);
    } catch (error: any) { 
      res.status(500).json({ error: error.message }); 
    }
  });

  app.post("/api/sessions/:id/close", validateUUID, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const session = await prisma.session.update({
        where: { id },
        data: { status: "CLOSED", closed_at: new Date() }
      });
      res.json(session);
    } catch (error: any) { 
      res.status(500).json({ error: error.message }); 
    }
  });

  app.post("/api/sessions/:id/ocr/sync", validateUUID, async (req: any, res: any) => {
    const { id } = req.params;
    const { numbers } = req.body; 

    if (!Array.isArray(numbers)) return res.status(400).json({ error: "Formato inválido." });

    const totalExtractedFromIA = numbers.length; 

    try {
      const lastSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" }, take: 150 });
      const lastNumbersInDB = lastSpins.map(s => s.number).reverse(); 
      
      let newNumbersToInsert = [...numbers]; 
      if (lastNumbersInDB.length > 0) {
        for (let i = 0; i < numbers.length; i++) {
          const sub = numbers.slice(0, numbers.length - i);
          const lastSubInDB = lastNumbersInDB.slice(-sub.length);
          if (sub.length > 0 && JSON.stringify(sub) === JSON.stringify(lastSubInDB)) {
            newNumbersToInsert = numbers.slice(sub.length);
            break;
          }
        }
      }

      const totalToInsert = newNumbersToInsert.length;

      if (totalToInsert === 0) {
        return res.json({ count: 0, extractedCount: totalExtractedFromIA, message: "Histórico já atualizado." });
      }

      const now = Date.now();
      const spinsDataBulk = newNumbersToInsert.map((n, index) => {
        const props = MathEngine.getNumberProps(n);
        return { 
          session_id: id, 
          number: n, 
          created_at: new Date(now + index), 
          color: props.color,
          parity: props.parity,
          dozen: String(props.dozen),
          column: String(props.column),
          half: String(props.half)
        };
      });

      await prisma.spin.createMany({ data: spinsDataBulk });

      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" }, take: 200 });
      const spinNumbersTimeline = recentSpins.map(s => s.number).reverse();
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      
      StrategyOrchestrator.analyzeMarket(spinNumbersTimeline, activeStrategies); 

      res.json({ count: totalToInsert, extractedCount: totalExtractedFromIA, numbers: newNumbersToInsert });
    } catch (error: any) { 
      console.error("[FATAL ERROR - OCR SYNC]:", error);
      res.status(500).json({ error: error.message || "Erro interno no Backend." }); 
    }
  });

  app.post("/api/sessions/:id/spins", validateUUID, async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { number } = req.body;

      if (number === undefined || number < 0 || number > 36) return res.status(400).json({ error: "Número inválido." });

      const session = await prisma.session.findUnique({ where: { id } });
      if (!session) return res.status(404).json({ error: "Sessão não encontrada." });
      if (session.status === "CLOSED") return res.status(400).json({ error: "Sessão já está fechada." });

      const props = MathEngine.getNumberProps(number);
      const spin = await prisma.spin.create({ 
        data: { 
          session_id: id, 
          number, 
          color: props.color,
          parity: props.parity,
          dozen: String(props.dozen),
          column: String(props.column),
          half: String(props.half)
        } 
      });

      const recentSpins = await prisma.spin.findMany({ where: { session_id: id }, orderBy: { created_at: "desc" }, take: 200 });
      const spinNumbersTimeline = recentSpins.map(s => s.number).reverse();
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      
      StrategyOrchestrator.analyzeMarket(spinNumbersTimeline, activeStrategies); 

      res.json(spin);
    } catch (error: any) { 
      res.status(500).json({ error: error.message }); 
    }
  });

  // --- ROTA DE DASHBOARD ATUALIZADA (AGORA ENVIA AS ESTRATÉGIAS PARA A TELA) ---
  app.get("/api/sessions/:id/dashboard", validateUUID, async (req, res) => {
    try {
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
        include: { spins: { orderBy: { created_at: "desc" }, take: 100 }, signals: { orderBy: { created_at: "desc" }, take: 50, include: { strategy: true } } },
      });
      if (!session) return res.status(404).json({ error: "Sessão não encontrada" });
      
      const zScore = MathEngine.calculateZScore(session.spins);
      
      // Avalia a temperatura de cada estratégia no milissegundo atual
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      const historyNumbers = session.spins.map(s => s.number);
      const strategiesStatus = activeStrategies.map(st => ({
        id: st.id,
        name: st.name,
        isHot: StrategyOrchestrator.evaluateStrategyHeat(historyNumbers, st.name)
      }));

      res.json({ session, zScore, strategiesStatus });
    } catch (error: any) { 
      res.status(500).json({ error: error.message }); 
    }
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
  
