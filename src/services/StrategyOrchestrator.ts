import { PrismaClient, Strategy, Session } from "@prisma/client";

const prisma = new PrismaClient();

interface StrategyConfig {
  payoutRatio: number; coverage: number; targetBet: string;
  checkWin: (num: number) => boolean;
  canTrigger?: (history: number[]) => boolean; 
}

export class StrategyOrchestrator {
  private static REGISTRY: Record<string, StrategyConfig> = {
    "Race: Vizinhos 1 & 21": { payoutRatio: 1.11, coverage: 17, targetBet: "CUSTOM_SECTOR_1_21", checkWin: (num) => [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25].includes(num) },
    "James Bond": { payoutRatio: 0.44, coverage: 25, targetBet: "JAMES_BOND_SET", checkWin: (num) => (num >= 13 && num <= 36) || num === 0 },
    "Dúzia 1": { payoutRatio: 2.0, coverage: 12, targetBet: "DOZEN_1", checkWin: (n) => n >= 1 && n <= 12 },
    "Dúzia 2": { payoutRatio: 2.0, coverage: 12, targetBet: "DOZEN_2", checkWin: (n) => n >= 13 && n <= 24 },
    "Dúzia 3": { payoutRatio: 2.0, coverage: 12, targetBet: "DOZEN_3", checkWin: (n) => n >= 25 && n <= 36 },
    "Coluna 1": { payoutRatio: 2.0, coverage: 12, targetBet: "COLUMN_1", checkWin: (n) => n !== 0 && n % 3 === 1 },
    "Coluna 2": { payoutRatio: 2.0, coverage: 12, targetBet: "COLUMN_2", checkWin: (n) => n !== 0 && n % 3 === 2 },
    "Coluna 3": { payoutRatio: 2.0, coverage: 12, targetBet: "COLUMN_3", checkWin: (n) => n !== 0 && n % 3 === 0 },
    
    // ESTRATÉGIAS DE COBERTURA CRUZADA (Payout 0.5)
    "Cross: D1 ➔ Col 2 e 3": { payoutRatio: 0.5, coverage: 24, targetBet: "COLUNAS_2_E_3", checkWin: (n) => n !== 0 && n % 3 !== 1, canTrigger: (h) => h.length > 0 && h[0] >= 1 && h[0] <= 12 },
    "Cross: D2 ➔ Col 1 e 3": { payoutRatio: 0.5, coverage: 24, targetBet: "COLUNAS_1_E_3", checkWin: (n) => n !== 0 && n % 3 !== 2, canTrigger: (h) => h.length > 0 && h[0] >= 13 && h[0] <= 24 },
    "Cross: D3 ➔ Col 1 e 2": { payoutRatio: 0.5, coverage: 24, targetBet: "COLUNAS_1_E_2", checkWin: (n) => n !== 0 && n % 3 !== 0, canTrigger: (h) => h.length > 0 && h[0] >= 25 && h[0] <= 36 },
    "Cross: C1 ➔ Duz 2 e 3": { payoutRatio: 0.5, coverage: 24, targetBet: "DUZIAS_2_E_3", checkWin: (n) => n >= 13 && n <= 36, canTrigger: (h) => h.length > 0 && h[0] !== 0 && h[0] % 3 === 1 },
    "Cross: C2 ➔ Duz 1 e 3": { payoutRatio: 0.5, coverage: 24, targetBet: "DUZIAS_1_E_3", checkWin: (n) => (n >= 1 && n <= 12) || (n >= 25 && n <= 36), canTrigger: (h) => h.length > 0 && h[0] !== 0 && h[0] % 3 === 2 },
    "Cross: C3 ➔ Duz 1 e 2": { payoutRatio: 0.5, coverage: 24, targetBet: "DUZIAS_1_E_2", checkWin: (n) => n >= 1 && n <= 24, canTrigger: (h) => h.length > 0 && h[0] !== 0 && h[0] % 3 === 0 }
  };

  public static getConfig(strategyName: string): StrategyConfig {
    for (const [key, config] of Object.entries(this.REGISTRY)) {
      if (strategyName.includes(key)) return config;
    }
    return { payoutRatio: 1.0, coverage: 1, targetBet: "UNKNOWN", checkWin: () => false };
  }

  public static calculateSectorZScore(history: number[], config: StrategyConfig): number {
    const sample = history.slice(0, 20); 
    const n = sample.length;
    if (n < 10) return 0.0; 
    const p = config.coverage / 37; 
    const expectedHits = n * p; 
    const standardDeviation = Math.sqrt(n * p * (1 - p)); 
    if (standardDeviation === 0) return 0.0;
    let actualHits = 0;
    sample.forEach(num => { if (config.checkWin(num)) actualHits++; });
    return (actualHits - expectedHits) / standardDeviation;
  }

  private static calculateBaseBet(config: StrategyConfig, bankroll: number, minChip: number): number {
    const theoreticalWinRate = config.coverage / 37; 
    let kellyFraction = theoreticalWinRate - ((1 - theoreticalWinRate) / config.payoutRatio);
    if (kellyFraction <= 0) kellyFraction = 0.01; 
    const safeFraction = kellyFraction / 4; 
    let rawBet = bankroll * Math.min(safeFraction, 0.015); 
    return Math.max(1, Math.round(rawBet / minChip)) * minChip;
  }

  private static calculateRecoveryBet(previousLoss: number, payoutRatio: number, minChip: number, bankroll: number): number {
    const targetNetProfit = previousLoss + minChip; 
    let exactBet = targetNetProfit / payoutRatio;
    const absoluteMaxBet = bankroll * 0.08; 
    if (exactBet > absoluteMaxBet) exactBet = absoluteMaxBet;
    return Math.ceil(exactBet / minChip) * minChip;
  }

  public static async resolvePendingSignals(newNumber: number, sessionId: string) {
    const pendingSignals = await prisma.signal.findMany({ where: { session_id: sessionId, result: "PENDING" }, include: { strategy: true }});
    if (pendingSignals.length === 0) return;

    let totalProfitDelta = 0;
    const updates = pendingSignals.map(sig => {
      const config = this.getConfig(sig.strategy.name);
      const isWin = config.checkWin(newNumber);
      const profitNet = isWin ? (sig.suggested_amount * config.payoutRatio) : -sig.suggested_amount;
      totalProfitDelta += profitNet;
      return prisma.signal.update({ where: { id: sig.id }, data: { result: isWin ? "WIN" : "LOSS" }});
    });

    await Promise.all(updates); 
    if (totalProfitDelta !== 0) {
      await prisma.session.update({ where: { id: sessionId }, data: { current_bankroll: { increment: totalProfitDelta } }});
    }
  }

  public static async analyzeMarket(spinNumbersTimeline: number[], activeStrategies: Strategy[], session: Session) {
    if (spinNumbersTimeline.length < 10) return; 

    const allSignals = await prisma.signal.findMany({ where: { session_id: session.id }, orderBy: { created_at: "desc" } });

    for (const strategy of activeStrategies) {
      const strategySignals = allSignals.filter(s => s.strategy_id === strategy.id);
      const lastSignal = strategySignals.length > 0 ? strategySignals[0] : null;
      
      if (lastSignal && lastSignal.result === "LOSS") {
        const nextStep = lastSignal.martingale_step + 1;
        if (nextStep === 1) {
          const config = this.getConfig(strategy.name);
          const suggestedAmount = this.calculateRecoveryBet(lastSignal.suggested_amount, config.payoutRatio, session.min_chip, session.current_bankroll);
          await prisma.signal.create({
            data: { session_id: session.id, strategy_id: strategy.id, target_bet: config.targetBet, suggested_amount: suggestedAmount, martingale_step: nextStep, result: "PENDING" }
          });
          return; 
        }
      }
    }

    const anyPending = allSignals.some(s => s.result === "PENDING");
    if (anyPending) return; 

    let candidates: { strategy: Strategy, config: StrategyConfig, zScore: number }[] = [];

    for (const strategy of activeStrategies) {
      const config = this.getConfig(strategy.name);
      if (config.canTrigger && !config.canTrigger(spinNumbersTimeline)) continue;
      const zScore = this.calculateSectorZScore(spinNumbersTimeline, config);
      candidates.push({ strategy, config, zScore });
    }

    candidates.sort((a, b) => a.zScore - b.zScore);
    const topCandidate = candidates[0]; 

    if (topCandidate && topCandidate.zScore <= -0.85) {
      const suggestedAmount = this.calculateBaseBet(topCandidate.config, session.current_bankroll, session.min_chip);
      await prisma.signal.create({
        data: {
          session_id: session.id,
          strategy_id: topCandidate.strategy.id,
          target_bet: topCandidate.config.targetBet,
          suggested_amount: suggestedAmount,
          martingale_step: 0,
          result: "PENDING"
        }
      });
    }
  }
}
