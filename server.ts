import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();

// Configuração para caminhos de arquivos em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// --- ROTAS DA API ---

// Rota de Sincronização (A que o SessionPage chama)
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

    if (!session) return res.status(404).json({ error: "Sessão não encontrada" });

    res.json({
      ...session,
      signals: session.signals || [],
      spins: session.spins || [],
      current_bankroll: Number(session.current_bankroll || 0),
      initial_bankroll: Number(session.initial_bankroll || 0)
    });
  } catch (error) {
    res.status(500).json({ error: "Erro interno no servidor local" });
  }
});

// --- SERVINDO O FRONT-END (ESTÁTICOS) ---

// Serve os arquivos da pasta 'dist' (gerada pelo npm run build)
app.use(express.static(path.join(__dirname, "dist")));

// ROTA CATCH-ALL: Se não for API, entrega o index.html do React
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"), (err) => {
    if (err) {
      // Se ainda não houver o build, avisa o desenvolvedor
      res.status(200).send("Servidor API Ativo. Para ver a interface, acesse a porta do Vite (ex: localhost:5173) ou execute 'npm run build'.");
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  🚀 [ENTERPRISE SERVER] RODANDO NA PORTA ${PORT}
  ----------------------------------------------
  API: http://localhost:${PORT}/api/sessions/[ID]
  STATUS: Operacional
  ----------------------------------------------
  `);
});
