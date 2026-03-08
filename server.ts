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

// --- DATABASE URL SANITIZER ---
function sanitizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  let sanitized = url.trim();
  sanitized = sanitized.replace(/\[|\]/g, "");

  if (sanitized.includes("YOUR-PASSWORD")) {
    console.warn("⚠️ DATABASE_URL ainda contém 'YOUR-PASSWORD'.");
    return sanitized;
  }

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
            const fixedUrl = `${protocol}${user}:${encodedPass}@${hostPart}`;
            console.info("✅ DATABASE_URL auto-corrigida (caracteres especiais na senha foram codificados e SSL garantido).");
            return fixedUrl;
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
if (fixedUrl && fixedUrl !== originalUrl) {
  process.env.DATABASE_URL = fixedUrl;
}

if (process.env.DATABASE_URL) {
  const maskedUrl = process.env.DATABASE_URL.replace(/:([^@]+)@/, ":****@");
  console.log(`[DATABASE] Using URL: ${maskedUrl}`);
}

const prisma = new PrismaClient();

if (!process.env.DATABASE_URL) {
  console.error("❌ CRITICAL ERROR: DATABASE_URL is missing. Prisma will not be able to connect.");
  console.info("💡 Please add DATABASE_URL to your Secrets panel in Google AI Studio.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set("trust proxy", 1);
  app.use(morgan("combined"));
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

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
    if (id && !uuidRegex.test(id)) {
      return res.status(400).json({ error: "ID de sessão inválido." });
    }
    next();
  };

  // --- API ROUTES ---
  
  app.get("/api/health", async (req, res) => {
    const dbUrl = process.env.DATABASE_URL || "";
    
    try {
      if (!dbUrl) {
        return res.json({ status: "error", message: "DATABASE_URL não configurada nos Secrets do AI Studio." });
      }

      if (dbUrl.includes("[") || dbUrl.includes("]") || dbUrl.includes("YOUR-PASSWORD")) {
        return res.json({
          status: "error",
          message: "A DATABASE_URL ainda contém placeholders como '[ ]' ou 'YOUR-PASSWORD'.",
          hint: "Remova os colchetes e substitua 'YOUR-PASSWORD' pela sua senha real do Supabase."
        });
      }
      
      await prisma.$connect();
      const count = await prisma.session.count();
      
      res.json({ 
        status: "ok", 
        database: "Conectado", 
        sessions: count,
        url_configured: true,
        host: dbUrl.split("@")[1]?.split(":")[0] || "unknown"
      });
    } catch (error: any) {
      console.error("Erro no Health Check:", error.message);
      let hint = "Verifique se a senha na DATABASE_URL está correta e se as tabelas foram criadas.";
      const code = error.code || "UNKNOWN";
      
      if (code === "P1000" || error.message.includes("Authentication failed")) {
        hint = "⚠️ ERRO DE AUTENTICAÇÃO: A senha do banco de dados está incorreta.";
      } else if (code === "P1001" || error.message.includes("Can't reach database server")) {
        hint = "⚠️ BANCO INACESSÍVEL: O servidor do banco de dados não respondeu.";
      }

      res.status(500).json({ status: "error", message: "Falha na conexão com o banco de dados.", details: error.message, code, hint });
    }
  });

  // Helper para giros manuais (1 por vez)
  const processNewSpin = async (sessionId: string, number: number) => {
    const props = MathEngine.getNumberProps(number);
    const spin = await prisma.spin.create({
      data: { session_id: sessionId, number, ...props },
    });

    const pendingSignals = await prisma.signal.findMany({
      where: { session_id: sessionId, result: "PENDING" },
    });

    for (const signal of pendingSignals) {
      let isWin = false;
      if (signal.target_bet === "RED" && props.color === "RED") isWin = true;
      if (signal.target_bet === "BLACK" && props.color === "BLACK") isWin = true;
      if (signal.target_bet === "CUSTOM_SECTOR_1_21") isWin = StrategyOrchestrator.VIZINHOS_1_21_COVERAGE.includes(number);
      if (signal.target_bet === "FUSION_ZONE") isWin = StrategyOrchestrator.FUSION_COVERAGE.includes(number);
      if (signal.target_bet === "JAMES_BOND_SET") isWin = StrategyOrchestrator.JAMES_BOND_COVERAGE.includes(number);

      await prisma.signal.update({
        where: { id: signal.id },
        data: { result: isWin ? "WIN" : "LOSS" },
      });

      const strategy = await prisma.strategy.findUnique({ where: { id: signal.strategy_id } });
      if (strategy) {
        const newWeight = MathEngine.updateBayesWeight(strategy.bayes_weight, isWin);
        await prisma.strategy.update({
          where: { id: strategy.id },
          data: { bayes_weight: newWeight },
        });
      }
    }

    const recentSpins = await prisma.spin.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: "desc" },
      take: 100,
    });
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
            session_id: sessionId,
            strategy_id: recommendation.strategyId,
            target_bet: recommendation.targetBet,
            suggested_amount: recommendation.confidence === "CRITICAL" ? 50 : 10,
            result: "PENDING"
          }
        });
      }
    }
    return spin;
  };

  app.post("/api/sessions", async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) return res.status(500).json({ error: "DATABASE_URL não configurada." });
      const { initial_bankroll } = req.body;
      const session = await prisma.session.create({
        data: { initial_bankroll, current_bankroll: initial_bankroll },
      });
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: "Falha na comunicação com o banco de dados." });
    }
  });

  app.post("/api/sessions/:id/spins", validateUUID, async (req, res) => {
    const { id } = req.params;
    const { number } = req.body;
    try {
      const spin = await processNewSpin(id, number);
      res.json(spin);
    } catch (error) {
      res.status(500).json({ error: "Erro ao registrar giro" });
    }
  });

  // --- ROTA DE OCR REESCRITA (BULK INSERT) ---
  app.post("/api/sessions/:id/ocr/sync", validateUUID, async (req: any, res: any) => {
    const { id } = req.params;
    const { numbers } = req.body;

    if (!Array.isArray(numbers)) {
      return res.status(400).json({ error: "Formato de números inválido." });
    }

    try {
      const lastSpins = await prisma.spin.findMany({
        where: { session_id: id },
        orderBy: { created_at: "desc" },
        take: 50,
      });

      const lastNumbers = lastSpins.map(s => s.number).reverse();
      let newNumbers = [...numbers];
      
      if (lastNumbers.length > 0) {
        let foundMatch = false;
        for (let i = 0; i < numbers.length; i++) {
          const sub = numbers.slice(0, numbers.length - i);
          const lastSub = lastNumbers.slice(-sub.length);
          
          if (sub.length > 0 && JSON.stringify(sub) === JSON.stringify(lastSub)) {
            newNumbers = numbers.slice(sub.length);
            foundMatch = true;
            break;
          }
        }
      }

      if (newNumbers.length === 0) {
        return res.json({ count: 0, message: "Todos os números já constam no histórico institucional." });
      }

      // 1. Preparar a Carga (Bulk Data)
      const spinsData = newNumbers.map(n => {
        const props = MathEngine.getNumberProps(n);
        return {
          session_id: id,
          number: n,
          ...props
        };
      });

      // 2. Inserção Rápida no Banco de Dados (Uma única viagem)
      await prisma.spin.createMany({
        data: spinsData
      });

      // 3. Resolver Sinais Pendentes (Apenas com o 1º número da nova leva)
      const pendingSignals = await prisma.signal.findMany({
        where: { session_id: id, result: "PENDING" },
      });

      if (pendingSignals.length > 0 && newNumbers.length > 0) {
        const firstNewNumber = newNumbers[0];
        const props = MathEngine.getNumberProps(firstNewNumber);

        for (const signal of pendingSignals) {
          let isWin = false;
          if (signal.target_bet === "RED" && props.color === "RED") isWin = true;
          if (signal.target_bet === "BLACK" && props.color === "BLACK") isWin = true;
          if (signal.target_bet === "CUSTOM_SECTOR_1_21") isWin = StrategyOrchestrator.VIZINHOS_1_21_COVERAGE.includes(firstNewNumber);
          if (signal.target_bet === "FUSION_ZONE") isWin = StrategyOrchestrator.FUSION_COVERAGE.includes(firstNewNumber);
          if (signal.target_bet === "JAMES_BOND_SET") isWin = StrategyOrchestrator.JAMES_BOND_COVERAGE.includes(firstNewNumber);

          await prisma.signal.update({
            where: { id: signal.id },
            data: { result: isWin ? "WIN" : "LOSS" },
          });

          const strategy = await prisma.strategy.findUnique({ where: { id: signal.strategy_id } });
          if (strategy) {
            const newWeight = MathEngine.updateBayesWeight(strategy.bayes_weight, isWin);
            await prisma.strategy.update({
              where: { id: strategy.id },
              data: { bayes_weight: newWeight },
            });
          }
        }
      }

      // 4. Rodar o Cérebro Orquestrador UMA ÚNICA VEZ no final
      const recentSpins = await prisma.spin.findMany({
        where: { session_id: id },
        orderBy: { created_at: "desc" },
        take: 100,
      });
      const spinNumbers = recentSpins.map(s => s.number).reverse();
      const activeStrategies = await prisma.strategy.findMany({ where: { is_active: true } });
      const recommendation = StrategyOrchestrator.analyzeMarket(spinNumbers, activeStrategies);

      if (recommendation && recommendation.confidence !== "LOW") {
        const existingPending = await prisma.signal.findFirst({
          where: { session_id: id, strategy_id: recommendation.strategyId, result: "PENDING" }
        });
        if (!existingPending) {
          await prisma.signal.create({
            data: {
              session_id: id,
              strategy_id: recommendation.strategyId,
              target_bet: recommendation.targetBet,
              suggested_amount: recommendation.confidence === "CRITICAL" ? 50 : 10,
              result: "PENDING"
            }
          });
        }
      }

      res.json({ count: newNumbers.length, numbers: newNumbers });
    } catch (error: any) {
      console.error("Erro no Sync OCR:", error);
      res.status(500).json({ error: "Falha ao sincronizar números do OCR no banco de dados." });
    }
  });

  app.get("/api/sessions/:id/dashboard", validateUUID, async (req, res) => {
    const { id } = req.params;
    try {
      const session = await prisma.session.findUnique({
        where: { id },
        include: {
          spins: { orderBy: { created_at: "desc" }, take: 50 },
          signals: { orderBy: { created_at: "desc" }, take: 10 },
        },
      });
      if (!session) return res.status(404).json({ error: "Sessão não encontrada" });
      const zScore = MathEngine.calculateZScore(session.spins);
      res.json({ session, zScore });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar dados do dashboard" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[SERVER ERROR]", err);
    res.status(500).json({ error: "Erro interno no servidor institucional." });
  });

  await syncStrategiesToDatabase(prisma);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SECURITY] RL.sys Institutional Terminal running on port ${PORT}`);
    console.log(`[SECURITY] Rate Limiting: ENABLED`);
    console.log(`[SECURITY] Helmet Protection: ENABLED`);
    console.log(`[SECURITY] Database Sanitization: ACTIVE`);
  });

  process.on("SIGTERM", async () => {
    console.log("SIGTERM received. Closing Prisma and Server...");
    await prisma.$disconnect();
    process.exit(0);
  });
}

startServer();
        
