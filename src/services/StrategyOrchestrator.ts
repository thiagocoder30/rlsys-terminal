import { PrismaClient, Strategy } from "@prisma/client";

const prisma = new PrismaClient();

export class StrategyOrchestrator {
  // --- MOTOR DE AUTO-TUNING (O PILOTO AUTOMÁTICO) ---
  // Avalia se uma estratégia merece estar ligada baseado no humor atual da mesa
  private static evaluateStrategyHeat(history: number[], strategyName: string): boolean {
    if (history.length < 20) return true; // Se tem pouco dado, deixa ligado por padrão

    const recentHistory = history.slice(0, 20); // Analisa apenas a "respiração" recente da mesa
    let hits = 0;

    // Regras de simulação mental do sistema
    recentHistory.forEach((num) => {
      if (strategyName.includes("Vizinhos") && this.isVizinhança(num)) hits++;
      if (strategyName.includes("James Bond") && this.isJamesBond(num)) hits++;
      // Adicione outras validações conforme criar novas estratégias
    });

    const winRate = (hits / recentHistory.length) * 100;

    // Se a estratégia estiver acertando menos de 25% na janela curta, a mesa está em tendência contrária.
    // O sistema DESLIGA a estratégia automaticamente (retorna false).
    if (winRate < 25) {
      console.log(`[AUTO-TUNING] 📉 Estratégia '${strategyName}' suspensa (WinRate: ${winRate}%). Mesa desfavorável.`);
      return false; 
    }

    console.log(`[AUTO-TUNING] 📈 Estratégia '${strategyName}' ativa (WinRate: ${winRate}%).`);
    return true;
  }

  // --- REGRAS MATEMÁTICAS ---
  private static isVizinhança(num: number): boolean {
    const vizinhosZero = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25];
    return vizinhosZero.includes(num);
  }

  private static isJamesBond(num: number): boolean {
    // Exemplo clássico: Maioria dos números altos + 0
    return (num >= 13 && num <= 36) || num === 0;
  }

  // --- O CORAÇÃO DO RADAR ---
  public static async analyzeMarket(spinNumbersTimeline: number[], activeStrategies: Strategy[]) {
    if (spinNumbersTimeline.length < 5) return; // Precisa de um mínimo de giros para respirar

    const latestNumber = spinNumbersTimeline[0];
    const session = await prisma.session.findFirst({ where: { status: "ACTIVE" } });
    if (!session) return;

    for (const strategy of activeStrategies) {
      // 1. O FILTRO DO PILOTO AUTOMÁTICO
      // O sistema decide sozinho se essa estratégia vale a pena no momento
      const isHot = this.evaluateStrategyHeat(spinNumbersTimeline, strategy.name);
      
      if (!isHot) continue; // Pula essa estratégia, ela foi desligada pelo sistema

      // 2. LÓGICA DE DETECÇÃO DE PADRÕES (Gatilhos)
      let triggerSignal = false;
      let targetBet = "";

      // Exemplo de Gatilho: Se a mesa está quente para Vizinhos e deu um número "gatilho"
      if (strategy.name.includes("Vizinhos")) {
        // Lógica fictícia de exemplo: se os últimos 2 números NÃO foram vizinhos, a probabilidade aumenta (Reversão à média)
        const last1 = spinNumbersTimeline[0];
        const last2 = spinNumbersTimeline[1];
        if (!this.isVizinhança(last1) && !this.isVizinhança(last2)) {
          triggerSignal = true;
          targetBet = "CUSTOM_SECTOR_1_21"; // Setor dos vizinhos
        }
      }

      if (strategy.name.includes("James Bond")) {
        // Se vieram 3 números baixos seguidos, aciona o James Bond (que cobre os altos)
        const baixos = spinNumbersTimeline.slice(0, 3).filter(n => n >= 1 && n <= 12).length;
        if (baixos === 3) {
          triggerSignal = true;
          targetBet = "JAMES_BOND_SET";
        }
      }

      // 3. DISPARO PARA O BANCO DE DADOS (E TELA)
      if (triggerSignal) {
        // Verifica se já não existe um sinal PENDING para não flodar o banco
        const existingSignal = await prisma.signal.findFirst({
          where: { session_id: session.id, strategy_id: strategy.id, result: "PENDING" }
        });

        if (!existingSignal) {
          await prisma.signal.create({
            data: {
              session_id: session.id,
              strategy_id: strategy.id,
              target_bet: targetBet,
              suggested_amount: (session.current_bankroll * 0.01), // Gestão de Risco: 1% da banca
              result: "PENDING"
            }
          });
          console.log(`[RADAR] 🎯 Alvo Detectado via Auto-Tuning: ${strategy.name} -> ${targetBet}`);
        }
      }
    }
  }
  }
          
