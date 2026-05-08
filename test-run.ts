import { ImageAnalysisService } from './src/application/services/ImageAnalysisService.js';
import { GeminiAdapter } from './src/infrastructure/ai/GeminiAdapter.js';
import { SessionController } from './src/controllers/SessionController.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function test() {
    console.log("🚀 Iniciando Teste de Integração RL.SYS...");
    
    const adapter = new GeminiAdapter(process.env.GEMINI_API_KEY || '');
    const vision = new ImageAnalysisService(adapter);
    const session = new SessionController();

    // Simulando o fluxo
    console.log("📸 Simulando análise de imagem...");
    console.log("💾 Salvando dados no repositório local...");
    
    const res = await session.createSession({ 
        game: "Roulette", 
        status: "Active",
        initialBalance: 100 
    });

    if (res.isSuccess) {
        console.log("✅ Sucesso! " + res.value.message);
    } else {
        console.error("❌ Falha no teste.");
    }
}

test();
