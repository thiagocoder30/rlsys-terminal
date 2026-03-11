import { PrismaClient, Strategy, Session } from "@prisma/client";

const prisma = new PrismaClient();

interface StrategyConfig {
  payoutRatio: number;
  coverage: number; // Quantidade de números que a estratégia cobre
  targetBet: string;
  checkWin: (num: number) => boolean;
}

export class StrategyOrchestrator {
  private static REGISTRY: Record<string, StrategyConfig> = {
    "Race: Vizinhos 1 & 21": {
      payoutRatio: 1.11, coverage: 17, targetBet: "CUSTOM_SECTOR_1_21",
      checkWin: (num) => [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25].includes(num)
    },
    "James Bond": {
      payoutRatio: 0.44, coverage: 25, targetBet: "JAMES_BOND_SET",
      checkWin: (num) => (num >= 13 && num <= 36) || num === 0
    },
    "Dúzia 1": { payoutRatio: 2.0, coverage: 12, targetBet: "DOZEN_1", checkWin: (n) => n >= 1 && n <= 12 },
    "Dúzia 2": { payoutRatio: 2.0, coverage: 12, targetBet: "DOZEN_2", checkWin: (n) => n >= 13 && n <= 24 },
    "Dúzia 3": { payoutRatio: 2.0, coverage: 12, targetBet: "DOZEN_3", checkWin: (n) => n >= 25 && n <= 36 },
    "Coluna 1": { payoutRatio: 2.0, coverage: 12, targetBet: "COLUMN_1", checkWin: (n) => n !== 0 && n % 3 === 1 },
    "Coluna 2": { payoutRatio: 2.0, coverage: 12, targetBet: "COLUMN_2", checkWin: (n) => n !== 0 && n % 3 === 2 },
    "Coluna 3": { payoutRatio: 2.0, coverage: 12, targetBet: "COLUMN_3", checkWin: (n) => n !== 0 && n % 3 === 0 }
  };

  private static getConfig(strategyName: string): StrategyConfig {
    for (const [key, config] of Object.entries(this.REGISTRY)) {
      if (strategyName.includes(key)) return config;
    }
    return { payoutRatio: 1.0, coverage: 1, targetBet: "UNKNOWN", checkWin: () => false };
  }

  // --- MATEMÁTICA INSTITUCIONAL: Z-SCORE DA DISTRIBUIÇÃO BINOMIAL ---
  private static calculateSectorZScore(history: number[], config: StrategyConfig): number {
    const sample = history.slice(0, 20); // Analisa a gravidade dos últimos 20 giros
    const n = sample.length;
    if (n < 10) return 0; // Exige amostra mínima para evitar ruído

    const p = config.coverage / 37; // Probabilidade matemática real
    const expectedHits = n * p; // Média esperada (Mu)
    const standardDeviation = Math.sqrt(n * p * (1 - p)); // Desvio Padrão (Sigma)

    if (standardDeviation === 0) return 0;

    let actualHits = 0;
    sample.forEach(num => { if (config.checkWin(num)) actualHits++; });

    // Z-Score = O quão "fria" (anômala) a região está. Quanto mais negativo, melhor a entrada.
    return (actualHits - expectedHits) / standardDeviation;
  }

  public static evaluateStrategyHeat(history: number[], strategyName: string): number {
    if (history.length < 20) return 50.0; 
    const config = this.getConfig(strategyName);
    let hits = 0;
    history.slice(0, 20).forEach(n => { if (config.checkWin(n)) hits++; });
    return (hits / 20) * 100;
  }

  // Dimensionamento (Mão Inicial)
  private static calculateBaseBet(winRatePct: number, payoutRatio: number, bankroll: number, minChip: number): number {
    let kellyFraction = (winRatePct / 100) - ((1 - (winRatePct / 100)) / payoutRatio);
    if (kellyFraction <= 0) kellyFraction = 0.01; 
    const safeFraction = kellyFraction / 4; 
    let rawBet = bankroll * Math.min(safeFraction, 0.015); // Teto de 1.5% na entrada seca
    return Math.max(1, Math.round(rawBet / minChip)) * minChip;
  }

  // Martingale Matemático Exato (Cap de 1 Nível)
  private static calculateRecoveryBet(previousLoss: number, payoutRatio: number, minChip: number, bankroll: number): number {
    const targetNetProfit = previousLoss + minChip; // Cobre a perda + Ficha de Lucro
    let exactBet = targetNetProfit / payoutRatio;
    const absoluteMaxBet = bankroll * 0.08; // Limitador Anti-Quebra (Máx 8%)
    if (exactBet > absoluteMaxBet) exactBet = absoluteMaxBet;
    return Math.ceil(exactBet / minChip) * minChip;
  }

  public static async resolvePendingSignals(newNumber: number, sessionId: string) {
    const pendingSignals = await prisma.signal.findMany({ where: { session_id: sessionId, result: "PENDING" }, include: { strategy: true }});
    for (const sig of pendingSignals) {
      const config = this.getConfig(sig.strategy.name);
      const isWin = config.checkWin(newNumber);
      const profitNet = isWin ? (sig.suggested_amount * config.payoutRatio) : -sig.suggested_amount;
      await prisma.signal.update({ where: { id: sig.id }, data: { result: isWin ? "WIN" : "LOSS" }});
      await prisma.session.update({ where: { id: sessionId }, data: { current_bankroll: { increment: profitNet } }});
    }
  }

  public static async analyzeMarket(spinNumbersTimeline: number[], activeStrategies: Strategy[], session: Session) {
    if (spinNumbersTimeline.length < 10) return; // Precisa de dados para estatística

    for (const strategy of activeStrategies) {
      const config = this.getConfig(strategy.name);
      const winRate = this.evaluateStrategyHeat(spinNumbersTimeline, strategy.name);
      
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

      // STOP LOSS (1 GALE APENAS)
      if (nextStep > 1) {
        console.log(`[RISK] Stop Loss (Gale 1) na ${strategy.name}. Reiniciando.`);
        nextStep = 0; 
        continue; 
      }

      let triggerSignal = false;

      // Se for Gale 1, entra imediato. Se for entrada nova, exige o GATILHO Z-SCORE.
      if (nextStep === 1) {
        triggerSignal = true;
      } else {
        const sectorZScore = this.calculateSectorZScore(spinNumbersTimeline, config);
        
        // GATILHO SNIPER: Z-Score <= -1.65 (Aproximadamente 5% de probabilidade do setor estar tão frio ao acaso)
        // Isso significa que a estratégia está matematicamente sob tensão extrema. A chance de reversão à média é brutal.
        if (sectorZScore <= -1.65) {
          triggerSignal = true;
          console.log(`[MATH] Anomalia Detectada: ${strategy.name} (Z: ${sectorZScore.toFixed(2)})`);
        }
      }

      if (triggerSignal) {
        const alreadyPending = await prisma.signal.findFirst({ where: { session_id: session.id, strategy_id: strategy.id, result: "PENDING" } });
        if (!alreadyPending) {
          let suggestedAmount = nextStep === 0 
            ? this.calculateBaseBet(winRate, config.payoutRatio, session.current_bankroll, session.min_chip)
            : this.calculateRecoveryBet(previousLoss, config.payoutRatio, session.min_chip, session.current_bankroll);

          await prisma.signal.create({
            data: { session_id: session.id, strategy_id: strategy.id, target_bet: config.targetBet, suggested_amount: suggestedAmount, martingale_step: nextStep, result: "PENDING" }
          });
        }
      }
    }
  }
}
