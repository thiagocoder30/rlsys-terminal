import { PrismaClient, Strategy, Session } from "@prisma/client";

const prisma = new PrismaClient();

// --- O DICIONÁRIO INSTITUCIONAL DE ESTRATÉGIAS ---
// Para adicionar estratégias futuras, basta plugar as regras aqui. O sistema fará o resto.
interface StrategyConfig {
  payoutRatio: number;
  targetBet: string;
  checkWin: (num: number) => boolean;
  checkSniperTrigger: (history: number[]) => boolean;
}

export class StrategyOrchestrator {
  private static REGISTRY: Record<string, StrategyConfig> = {
    "Race: Vizinhos 1 & 21": {
      payoutRatio: 1.11, // Retorno líquido sobre 17 fichas
      targetBet: "CUSTOM_SECTOR_1_21",
      checkWin: (num) => [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25].includes(num),
      checkSniperTrigger: (history) => {
        // SNIPER: Exige Anomalia de 5 giros consecutivos sem bater na região
        if (history.length < 5) return false;
        const targetNumbers = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25];
        return history.slice(0, 5).every(n => !targetNumbers.includes(n));
      }
    },
    "James Bond": {
      payoutRatio: 0.44, // Retorno líquido sobre 25 fichas
      targetBet: "JAMES_BOND_SET",
      checkWin: (num) => (num >= 13 && num <= 36) || num === 0,
      checkSniperTrigger: (history) => {
        // SNIPER: Exige Anomalia de 4 giros baixos (1-12) consecutivos
        if (history.length < 4) return false;
        return history.slice(0, 4).every(n => n >= 1 && n <= 12);
      }
    },
    "Race: Fusion": {
      payoutRatio: 1.0, 
      targetBet: "FUSION_ZONE",
      checkWin: (num) => num % 2 === 0 && num !== 0, // Exemplo: Pares
      checkSniperTrigger: (history) => {
        // SNIPER: Exige Anomalia de 4 ímpares seguidos
        if (history.length < 4) return false;
        return history.slice(0, 4).every(n => n % 2 !== 0);
      }
    }
  };

  private static getConfig(strategyName: string): StrategyConfig {
    for (const [key, config] of Object.entries(this.REGISTRY)) {
      if (strategyName.includes(key)) return config;
    }
    // Fail-safe institucional caso a estratégia não esteja mapeada
    return { payoutRatio: 1.0, targetBet: "UNKNOWN", checkWin: () => false, checkSniperTrigger: () => false };
  }

  public static evaluateStrategyHeat(history: number[], strategyName: string): number {
    if (history.length < 20) return 50.0; 
    const recentHistory = history.slice(0, 20); 
    let hits = 0;
    const config = this.getConfig(strategyName);
    
    recentHistory.forEach((num) => { if (config.checkWin(num)) hits++; });
    return (hits / recentHistory.length) * 100;
  }

  // --- MOTOR DE DIMENSIONAMENTO (Mão Inicial) ---
  private static calculateBaseBet(winRatePct: number, payoutRatio: number, bankroll: number, minChip: number): number {
    const w = winRatePct / 100; 
    let kellyFraction = w - ((1 - w) / payoutRatio);
    if (kellyFraction <= 0) kellyFraction = 0.01; 

    const safeFraction = kellyFraction / 4; // Quarter-Kelly
    let rawBet = bankroll * Math.min(safeFraction, 0.02); // Teto base de 2% da banca
    
    const steps = Math.max(1, Math.round(rawBet / minChip));
    return steps * minChip;
  }

  // --- MOTOR DE RECUPERAÇÃO (Gale Matemático Exato) ---
  private static calculateRecoveryBet(previousLoss: number, payoutRatio: number, minChip: number, bankroll: number): number {
    // Objetivo: Lucro Líquido = Prejuízo Anterior + Ficha Mínima (para não sair no zero a zero)
    const targetNetProfit = previousLoss + minChip;
    
    // Fórmula: Aposta = Lucro Desejado / Payout Ratio da Estratégia
    let exactBet = targetNetProfit / payoutRatio;

    // Teto de Segurança Absoluto: Nunca arriscar mais de 8% da banca num Gale 1
    const absoluteMaxBet = bankroll * 0.08;
    if (exactBet > absoluteMaxBet) exactBet = absoluteMaxBet;

    // Arredonda para cima (Ceil) na ficha do provedor para garantir a cobertura matemática
    const steps = Math.ceil(exactBet / minChip);
    return steps * minChip;
  }

  // --- JUIZ DE RESOLUÇÃO AUTOMÁTICA (GREEN/LOSS) ---
  public static async resolvePendingSignals(newNumber: number, sessionId: string) {
    const pendingSignals = await prisma.signal.findMany({
      where: { session_id: sessionId, result: "PENDING" },
      include: { strategy: true }
    });

    for (const sig of pendingSignals) {
      const config = this.getConfig(sig.strategy.name);
      const isWin = config.checkWin(newNumber);
      
      const profitNet = isWin ? (sig.suggested_amount * config.payoutRatio) : -sig.suggested_amount;

      await prisma.signal.update({
        where: { id: sig.id },
        data: { result: isWin ? "WIN" : "LOSS" }
      });

      await prisma.session.update({
        where: { id: sessionId },
        data: { current_bankroll: { increment: profitNet } }
      });
    }
  }

  // --- O RADAR TÁTICO PRINCIPAL ---
  public static async analyzeMarket(spinNumbersTimeline: number[], activeStrategies: Strategy[], session: Session) {
    if (spinNumbersTimeline.length < 5) return; 

    for (const strategy of activeStrategies) {
      const config = this.getConfig(strategy.name);
      const winRate = this.evaluateStrategyHeat(spinNumbersTimeline, strategy.name);
      
      // Auto-Tuning continua operando (Corta a estratégia se estiver em drawndown extremo)
      if (winRate < 20) continue; 

      // Consulta o último sinal para saber se estamos em ciclo de recuperação
      const lastSignal = await prisma.signal.findFirst({
        where: { session_id: session.id, strategy_id: strategy.id },
        orderBy: { created_at: "desc" }
      });

      let nextStep = 0;
      let previousLoss = 0;

      if (lastSignal && lastSignal.result === "LOSS") {
        nextStep = lastSignal.martingale_step + 1;
        previousLoss = lastSignal.suggested_amount;
      }

      // STOP LOSS INSTITUCIONAL: Se errar o Gale 1, encerra o ciclo e aceita o Red para proteger a banca.
      if (nextStep > 1) {
        console.log(`[RISK] Stop Loss (Cap Nível 1) atingido para ${strategy.name}. Ciclo encerrado.`);
        nextStep = 0; // Zera a memória de recuperação
        continue; // Ignora esta rodada e espera nova anomalia
      }

      let triggerSignal = false;

      // Se estiver em ciclo de recuperação (Gale 1), atira imediatamente no próximo giro
      if (nextStep === 1) {
        triggerSignal = true;
      } 
      // Se for entrada inicial, aciona a regra SNIPER (aguarda anomalia)
      else {
        triggerSignal = config.checkSniperTrigger(spinNumbersTimeline);
      }

      if (triggerSignal) {
        const alreadyPending = await prisma.signal.findFirst({
          where: { session_id: session.id, strategy_id: strategy.id, result: "PENDING" }
        });

        if (!alreadyPending) {
          let suggestedAmount = 0;
          
          if (nextStep === 0) {
            suggestedAmount = this.calculateBaseBet(winRate, config.payoutRatio, session.current_bankroll, session.min_chip);
          } else if (nextStep === 1) {
            suggestedAmount = this.calculateRecoveryBet(previousLoss, config.payoutRatio, session.min_chip, session.current_bankroll);
          }

          await prisma.signal.create({
            data: {
              session_id: session.id,
              strategy_id: strategy.id,
              target_bet: config.targetBet,
              suggested_amount: suggestedAmount,
              martingale_step: nextStep,
              result: "PENDING"
            }
          });
        }
      }
    }
  }
}
