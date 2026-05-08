import { StrategyBootstrapper } from './src/application/services/StrategyBootstrapper.js';
import { StrategyOrchestrator } from './src/application/services/StrategyOrchestrator.js';

async function runEngineTest() {
    console.log("🧠 Testando Motor de Inteligência RL.SYS...");

    // 1. Inicializa o Bootstrapper (Carrega as estratégias)
    const bootstrapper = new StrategyBootstrapper();
    const strategies = bootstrapper.getStrategies();
    
    // 2. Inicializa o Orquestrador
    const orchestrator = new StrategyOrchestrator(strategies);

    // 3. Simula um histórico onde o último número é 26 (Vizinho do Zero)
    const mockHistory = [10, 5, 26]; 
    console.log(`🎰 Histórico simulado: [${mockHistory.join(', ')}]`);

    // 4. Processa o histórico
    const result = await orchestrator.processNewNumber(mockHistory);

    if (result.isSuccess) {
        const signals = result.value;
        if (signals.length > 0) {
            console.log("🚀 SINAL GERADO COM SUCESSO:");
            signals.forEach(s => {
                console.log(`   [${s.strategyId}] -> APOSTA: ${s.betType} | MSG: ${s.message}`);
            });
        } else {
            console.log("⚪ Nenhum sinal gerado para este número.");
        }
    } else {
        console.error("❌ Erro no motor:", result.error);
    }
}

runEngineTest();
