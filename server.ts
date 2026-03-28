import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Importação das rotas
import visionRoutes from './routes/vision';

// Carrega as variáveis de ambiente (.env)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001; // Backend rodando na porta 3001

// Middlewares de Segurança e Parse
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// REGISTRO DE ROTAS DO TERMINAL
// ==========================================

// Rota do Drone OCR (Hawk-Eye)
app.use('/api/vision', visionRoutes);

// Mock de segurança para avisar se rotas antigas estiverem faltando
app.use('/api/macro', (req, res, next) => {
    // Se você tiver um macroRoutes.ts, substitua este bloco por: app.use('/api/macro', macroRoutes);
    console.warn("Aviso: Rota /api/macro interceptada pelo fallback do server.ts");
    next();
});

// ==========================================
// SERVIÇO DE ARQUIVOS ESTÁTICOS (FRONT-END)
// ==========================================
// Serve o front-end compilado pelo Vite
app.use(express.static(path.join(__dirname, '../dist')));

// Redireciona qualquer rota não reconhecida na API para o React Router lidar no Front-end
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../dist/index.html'));
    } else {
        res.status(404).json({ error: "Comandante, Rota de API não encontrada no servidor." });
    }
});

// ==========================================
// INICIALIZAÇÃO DO MOTOR
// ==========================================
app.listen(PORT, () => {
    console.log(`[RL.SYS HFT] Motor Backend de Alta Frequência operando na porta ${PORT}`);
    console.log(`[RL.SYS HFT] Módulo Hawk-Eye (Visão Computacional) -> ONLINE`);
});

export default app;
