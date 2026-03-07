import dotenv from 'dotenv';
dotenv.config(); // Força a leitura do .env imediatamente
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
// Tenta corrigir automaticamente erros comuns de formatação na DATABASE_URL
function sanitizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;

  let sanitized = url.trim();

  // 1. Remover colchetes acidentais [ ]
  sanitized = sanitized.replace(/\[|\]/g, "");

  // 2. Corrigir placeholders não substituídos
  if (sanitized.includes("YOUR-PASSWORD")) {
    console.warn("⚠️ DATABASE_URL ainda contém 'YOUR-PASSWORD'.");
    return sanitized;
  }

  // 3. Auto-fix para caracteres especiais na senha (@, #, !, etc)
  // Padrão: postgresql://user:password@host:port/db
  // Se houver múltiplos '@', o Prisma se perde. Tentamos codificar a senha.
  try {
    const protocolMatch = sanitized.match(/^(postgresql:\/\/|postgres:\/\/)(.*)$/);
    if (protocolMatch) {
      const protocol = protocolMatch[1];
      const remainder = protocolMatch[2];
      
      // Encontrar o último '@' que separa as credenciais do host
      const lastAtIndex = remainder.lastIndexOf("@");
      if (lastAtIndex !== -1) {
        const credentials = remainder.substring(0, lastAtIndex);
        let hostPart = remainder.substring(lastAtIndex + 1);
        
        // 4. Garantir SSL para Supabase
        if (hostPart.includes("supabase.co") && !hostPart.includes("sslmode=")) {
          hostPart += hostPart.includes("?") ? "&sslmode=require" : "?sslmode=require";
        }

        const firstColonIndex = credentials.indexOf(":");
        if (firstColonIndex !== -1) {
          const user = credentials.substring(0, firstColonIndex);
          const pass = credentials.substring(firstColonIndex + 1);
          
          // Só codifica se detectar caracteres que quebram a URL e não parecem já estar codificados
          if (/[@#!:?&]/.test(pass) && !pass.includes("%")) {
            const encodedPass = encodeURIComponent(pass);
            const fixedUrl = `${protocol}${user}:${encodedPass}@${hostPart}`;
            console.info("✅ DATABASE_URL auto-corrigida (caracteres especiais na senha foram codificados e SSL garantido).");
            return fixedUrl;
          }
        }
        
        // Se não precisou codificar a senha, mas precisou do SSL
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

// Verificação de segurança na inicialização
if (!process.env.DATABASE_URL) {
  console.error("❌ CRITICAL ERROR: DATABASE_URL is missing. Prisma will not be able to connect.");
  console.info("💡 Please add DATABASE_URL to your Secrets panel in Google AI Studio.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Configuração para ambiente atrás de proxy (necessário para express-rate-limit)
  app.set("trust proxy", 1);

  // 0. Logging Profissional (Audit Trail)
  app.use(morgan("combined"));

  // 1. Segurança de Cabeçalhos (Helmet)
  app.use(helmet({
    contentSecurityPolicy: false, // Desativado para compatibilidade com o preview do Vite
    crossOriginEmbedderPolicy: false
  }));

  // 2. Rate Limiting (Proteção contra Brute Force/DDoS)
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 2000, // Aumentado para suportar polling de 5s (12/min * 15 = 180 reqs/sessão)
    message: { error: "Muitas requisições. Tente novamente em 15 minutos." }
  });
  app.use("/api/", limiter);

  app.use(cors());
  app.use(express.json({ limit: "10kb" })); // Proteção contra payloads gigantes

  // Middleware de Validação de UUID
  const validateUUID = (req: any, res: any, next: any) => {
    const { id } = req.params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (id && !uuidRegex.test(id)) {
      return res.status(400).json({ error: "ID de sessão inválido." });
    }
    next();
  };

  // --- API ROUTES ---
  
  // Health Check / Diagnóstico
  app.get("/api/health", async (req, res) => {
    const dbUrl = process.env.DATABASE_URL || "";
    
    try {
      if (!dbUrl) {
        return res.json({ 
          status: "error", 
          message: "DATABASE_URL não configurada nos Secrets do AI Studio." 
        });
      }

      // Verificação de placeholders comuns
      if (dbUrl.includes("[") || dbUrl.includes("]") || dbUrl.includes("YOUR-PASSWORD")) {
        return res.json({
          status: "error",
          message: "A DATABASE_URL ainda contém placeholders como '[ ]' ou 'YOUR-PASSWORD'.",
          hint: "Remova os colchetes e substitua 'YOUR-PASSWORD' pela sua senha real do Supabase."
        });
      }
      
      // Teste de conexão real
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
        hint = "⚠️ ERRO DE AUTENTICAÇÃO: A senha do banco de dados está incorreta.\n\n" +
               "COMO CORRIGIR:\n" +
               "1. Verifique se a senha no DATABASE_URL é a mesma que você definiu no Supabase.\n" +
               "2. Se a senha tiver caracteres especiais, certifique-se de que eles estão codificados (ex: @ -> %40).";
      } else if (code === "P1001" || error.message.includes("Can't reach database server")) {
        hint = "⚠️ BANCO INACESSÍVEL: O servidor do banco de dados não respondeu.\n\n" +
               "SOLUÇÕES RÁPIDAS:\n" +
               "1. Verifique se o projeto no Supabase está PAUSADO (ative-o no dashboard).\n" +
               "2. Tente mudar a porta de 5432 para 6543 na sua DATABASE_URL (Pooler do Supabase).\n" +
               "3. Adicione '?pgbouncer=true' ao final da URL se usar a porta 6543.\n" +
               "4. Verifique se o host 'db.iseocnrxqbvliirqlmrj.supabase.co' está correto.";
      } else if (error.message.includes("invalid port number") || error.message.includes("Error parsing connection string")) {
        hint = "⚠️ ERRO DE FORMATAÇÃO: A URL de conexão é inválida.\n\n" +
               "Verifique se não há espaços ou caracteres invisíveis na DATABASE_URL.";
      }

      res.status(500).json({ 
        status: "error", 
        message: "Falha na conexão com o banco de dados.",
        details: error.message,
        code,
        hint
      });
    }
  });

  // Helper para processar um novo giro (Spin) e atualizar sinais
  const processNewSpin = async (sessionId: string, number: number) => {
    const props = MathEngine.getNumberProps(number);
    const spin = await prisma.spin.create({
      data: {
        session_id: sessionId,
        number,
        ...props,
      },
    });

    // 1. Resolver sinais pendentes
    const pendingSignals = await prisma.signal.findMany({
      where: { session_id: sessionId, result: "PENDING" },
    });

    for (const signal of pendingSignals) {
      let isWin = false;
      if (signal.target_bet === "RED" && props.color === "RED") isWin = true;
      if (signal.target_bet === "BLACK" && props.color === "BLACK") isWin = true;
      
      // Nova condição: Setor Customizado (Vizinhos 1 & 21)
      if (signal.target_bet === "CUSTOM_SECTOR_1_21") {
        isWin = StrategyOrchestrator.VIZINHOS_1_21_COVERAGE.includes(number);
      }
      
      // Novas Estratégias: Fusion e James Bond
      if (signal.target_bet === "FUSION_ZONE") {
        isWin = StrategyOrchestrator.FUSION_COVERAGE.includes(number);
      }
      if (signal.target_bet === "JAMES_BOND_SET") {
        isWin = StrategyOrchestrator.JAMES_BOND_COVERAGE.includes(number);
      }

      await prisma.signal.update({
        where: { id: signal.id },
        data: { result: isWin ? "WIN" : "LOSS" },
      });

      // Atualizar peso Bayesiano da estratégia
      const strategy = await prisma.strategy.findUnique({ where: { id: signal.strategy_id } });
      if (strategy) {
        const newWeight = MathEngine.updateBayesWeight(strategy.bayes_weight, isWin);
        await prisma.strategy.update({
          where: { id: strategy.id },
          data: { bayes_weight: newWeight },
        });
      }
    }

    // 2. Avaliar novas oportunidades (Motor Orquestrador de Estratégias)
    const recentSpins = await prisma.spin.findMany({
      where: { session_id: sessionId },
      orderBy: { created_at: "desc" },
      take: 100, // Janela macro para análise estatística
    });
    const spinNumbers = recentSpins.map(s => s.number).reverse();

    const activeStrategies = await prisma.strategy.findMany({
      where: { is_active: true }
    });

    const recommendation = StrategyOrchestrator.analyzeMarket(spinNumbers, activeStrategies);

    if (recommendation && recommendation.confidence !== "LOW") {
      // Evitar duplicar sinal pendente para a mesma estratégia
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
        console.log(`[ORCHESTRATOR] Novo Sinal Gerado: ${recommendation.strategyName} (${recommendation.confidence})`);
      }
    }

    return spin;
  };

  // Iniciar Sessão
  app.post("/api/sessions", async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.status(500).json({ 
          error: "DATABASE_URL não configurada. Adicione a string de conexão do Supabase nos Secrets." 
        });
      }

      const { initial_bankroll } = req.body;
      const session = await prisma.session.create({
        data: {
          initial_bankroll,
          current_bankroll: initial_bankroll,
        },
      });
      res.json(session);
    } catch (error: any) {
      console.error("Erro ao criar sessão:", error.message);
      res.status(500).json({ 
        error: "Falha na comunicação com o banco de dados. Verifique a integridade da conexão." 
      });
    }
  });

  // Injetar Giro Manual
  app.post("/api/sessions/:id/spins", validateUUID, async (req, res) => {
    const { id } = req.params;
    const { number } = req.body;

    try {
      const spin = await processNewSpin(id, number);
      res.json(spin);
    } catch (error) {
      console.error("Erro ao registrar giro:", error);
      res.status(500).json({ error: "Erro ao registrar giro" });
    }
  });

  // Sincronizar Números Extraídos pelo OCR (Frontend)
  app.post("/api/sessions/:id/ocr/sync", validateUUID, async (req: any, res: any) => {
    const { id } = req.params;
    const { numbers } = req.body;

    if (!Array.isArray(numbers)) {
      return res.status(400).json({ error: "Formato de números inválido." });
    }

    console.log(`[OCR-SYNC] Recebidos ${numbers.length} números para a sessão ${id}`);

    try {
      // Buscar os últimos giros para evitar duplicatas
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
        return res.json({ 
          count: 0, 
          message: "Todos os números já constam no histórico institucional." 
        });
      }

      // Inserção sequencial para garantir ordem
      for (const n of newNumbers) {
        await processNewSpin(id, n);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      console.log(`[OCR-SYNC] ${newNumbers.length} novos giros inseridos.`);
      res.json({ count: newNumbers.length, numbers: newNumbers });
    } catch (error: any) {
      console.error("Erro no Sync OCR:", error);
      res.status(500).json({ error: "Falha ao sincronizar números do OCR." });
    }
  });

  // Dashboard Data
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

      res.json({
        session,
        zScore,
      });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar dados do dashboard" });
    }
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[SERVER ERROR]", err);
    res.status(500).json({ error: "Erro interno no servidor institucional." });
  });

  // --- AUTO-BOOTSTRAP STRATEGIES ---
  await syncStrategiesToDatabase(prisma);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SECURITY] RL.sys Institutional Terminal running on port ${PORT}`);
    console.log(`[SECURITY] Rate Limiting: ENABLED`);
    console.log(`[SECURITY] Helmet Protection: ENABLED`);
    console.log(`[SECURITY] Database Sanitization: ACTIVE`);
  });

  // --- GRACEFUL SHUTDOWN (Prevenção de Vazamento de Conexões) ---
  process.on("SIGTERM", async () => {
    console.log("SIGTERM received. Closing Prisma and Server...");
    await prisma.$disconnect();
    process.exit(0);
  });
}

startServer();
