import { PrismaClient, Strategy, Session, Spin } from "@prisma/client";

const prisma = new PrismaClient();

interface StrategyConfig {
  payoutRatio: number; coverage: number; targetBet: string;
  minChipsRequired: number; checkWin: (num: number) => boolean;
  canTrigger?: (history: number[]) => boolean; 
}

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

export class StrategyOrchestrator {
  private static REGISTRY: Record<string, StrategyConfig> = {
    "Race: Vizinhos 1 & 21": { payoutRatio: 10/26, coverage: 26, minChipsRequired: 26, targetBet: "CUSTOM_RACE_26_NUM", checkWin: (num) => ![3, 7, 8, 11, 12, 13, 28, 29, 30, 35, 36].includes(num) },
    
    // FUSION BLINDADA: Adicionado o 0 na matriz de vitória. Custo: 25 fichas. Lucro: 11 fichas. (11/25 = 0.44)
    "Race: Fusion": { 
      payoutRatio: 11/25, coverage: 25, minChipsRequired: 25, targetBet: "FUSION_MAIS_ZERO", 
      checkWin: (num) => [17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 28, 12, 35, 3, 26, 0].includes(num) 
    },
    
    "James Bond": { payoutRatio: 8/20, coverage: 25, minChipsRequired: 20, targetBet: "JAMES_BOND_SET", checkWin: (num) => (num >= 13 && num <= 36) || num === 0 },
    
    "Cross: D1 ➔ Col 2 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "COL_2_E_3_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 3 !== 1) || n === 0, canTrigger: (h) => h.length > 0 && h[0] >= 1 && h[0] <= 12 },
    "Cross: D2 ➔ Col 1 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "COL_1_E_3_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 3 !== 2) || n === 0, canTrigger: (h) => h.length > 0 && h[0] >= 13 && h[0] <= 24 },
    "Cross: D3 ➔ Col 1 e 2": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "COL_1_E_2_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 3 !== 0) || n === 0, canTrigger: (h) => h.length > 0 && h[0] >= 25 && h[0] <= 36 },
    "Cross: C1 ➔ Duz 2 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "DUZ_2_E_3_MAIS_ZERO", checkWin: (n) => (n >= 13 && n <= 36) || n === 0, canTrigger: (h) => h.length > 0 && h[0] !== 0 && h[0] % 3 === 1 },
    "Cross: C2 ➔ Duz 1 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "DUZ_1_E_3_MAIS_ZERO", checkWin: (n) => (n >= 1 && n <= 12) || (n >= 25 && n <= 36) || n === 0, canTrigger: (h) => h.length > 0 && h[0] !== 0 && h[0] % 3 === 2 },
    "Cross: C3 ➔ Duz 1 e 2": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "DUZ_1_E_2_MAIS_ZERO", checkWin: (n) => (n >= 1 && n <= 24) || n === 0, canTrigger: (h) => h.length > 0 && h[0] !== 0 && h[0] % 3 === 0 },

    // MACROS BLINDADAS (18 Fichas na Base + 1 Ficha no Zero). Total: 19 Fichas. Lucro Mínimo Garantido: 17 Fichas.
    "Macro: Red + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "RED_MAIS_ZERO", checkWin: (n) => RED_NUMBERS.includes(n) || n === 0 },
    "Macro: Black + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "BLACK_MAIS_ZERO", checkWin: (n) => BLACK_NUMBERS.includes(n) || n === 0 },
    "Macro: Even + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "EVEN_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 2 === 0) || n === 0 },
    "Macro: Odd + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "ODD_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 2 !== 0) || n === 0 }
  };

  public static getConfig(strategyName: string): StrategyConfig {
    for (const [key, config] of Object.entries(this.REGISTRY)) {
      if (strategyName.includes(key)) return config;
    }
    return { payoutRatio: 1.0, coverage: 1, minChipsRequired: 1, targetBet: "UNKNOWN", checkWin: () => false };
  }

  public static calculateSectorZScore(history: number[], config: StrategyConfig): number {
    const sample = history.slice(0, 20); const n = sample.length;
    if (n < 10) return 0.0; 
    const p = config.coverage / 37; const expectedHits = n * p; const standardDeviation = Math.sqrt(n * p * (1 - p)); 
    if (standardDeviation === 0) return 0.0;
    let actualHits = 0; sample.forEach(num => { if (config.checkWin(num)) actualHits++; });
    return (actualHits - expectedHits) / standardDeviation;
  }

  private static getDozenMacroState(n: number): number {
    if (n === 0) return 0;
    if (n <= 12) return 1;
    if (n <= 24) return 2;
    return 3;
  }

  private static calculateMarkovProbability(history: number[], config: StrategyConfig): number {
    const theoreticalProb = config.coverage / 37;
    if (history.length < 5) return theoreticalProb; 

    const lastNumber = history[0];
    const currentMacroState = this.getDozenMacroState(lastNumber);
    let occurrences = 0; let winsImmediatelyAfter = 0;
    
    for (let i = 1; i < history.length; i++) {
      if (this.getDozenMacroState(history[i]) === currentMacroState) {
        occurrences++;
        if (config.checkWin(history[i - 1])) winsImmediatelyAfter++;
      }
    }
    if (occurrences < 3) return theoreticalProb; 
    return winsImmediatelyAfter / occurrences; 
  }

  private static calculateBaseBet(config: StrategyConfig, bankroll: number, minChip: number): number {
    const absoluteMinBet = minChip * config.minChipsRequired; 
    const optimalExposure = bankroll * 0.015; 
    if (optimalExposure < absoluteMinBet) return absoluteMinBet; 
    let multiplierSteps = Math.floor(optimalExposure / absoluteMinBet); 
    if (multiplierSteps < 1) multiplierSteps = 1;
    return multiplierSteps * absoluteMinBet; 
  }

  private static calculateRecoveryBet(accumulatedLoss: number, config: StrategyConfig, minChip: number, bankroll: number, step: number): number {
    const absoluteMinBet = minChip * config.minChipsRequired;
    const recoveryFraction = step === 1 ? 0.5 : 1.0;
    const targetNetProfit = (accumulatedLoss * recoveryFraction) + absoluteMinBet; 
    let exactBet = targetNetProfit / config.payoutRatio;
    const absoluteMaxBet = bankroll * 0.15; if (exactBet > absoluteMaxBet) exactBet = absoluteMaxBet;
    let steps = Math.ceil(exactBet / absoluteMinBet); if (steps < 1) steps = 1;
    return steps * absoluteMinBet;
  }

  public static async resolvePendingSignals(newNumber: number, sessionId: string) {
    try {
      const activeSignals = await prisma.signal.findMany({ 
        where: { session_id: sessionId, result: { in: ["PENDING", "SUGGESTED"] } }, 
        include: { strategy: true }
      });
      if (activeSignals.length === 0) return;

      let totalProfitDelta = 0;
      
      for (const sig of activeSignals) {
        if (sig.result === "SUGGESTED") {
          await prisma.signal.update({ where: { id: sig.id }, data: { result: "MISSED" } });
        } else if (sig.result === "PENDING") {
          const config = this.getConfig(sig.strategy.name);
          const isWin = config.checkWin(newNumber);
          const profitNet = isWin ? (sig.suggested_amount * config.payoutRatio) : -sig.suggested_amount;
          totalProfitDelta += profitNet;
          await prisma.signal.update({ where: { id: sig.id }, data: { result: isWin ? "WIN" : "LOSS" }});
        }
      }

      if (totalProfitDelta !== 0) {
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (session) {
          const newBankroll = session.current_bankroll + totalProfitDelta;
          const currentHigh = session.highest_bankroll && session.highest_bankroll > 0 ? session.highest_bankroll : session.initial_bankroll;
          const newHighest = Math.max(currentHigh, newBankroll);
          await prisma.session.update({ where: { id: sessionId }, data: { current_bankroll: newBankroll, highest_bankroll: newHighest } });
        }
      }
    } catch (error: any) { console.error(`[FAIL-SAFE] Erro ao resolver sinais: ${error.message}`); }
  }

  public static async analyzeMarket(recentSpins: Spin[], activeStrategies: Strategy[], session: Session) {
    try {
      const spinNumbersTimeline = recentSpins.map(s => s.number);
      if (spinNumbersTimeline.length < 10) return; 

      const allSignals = await prisma.signal.findMany({ where: { session_id: session.id }, orderBy: { created_at: "desc" } });

      for (const strategy of activeStrategies) {
        const strategySignals = allSignals.filter(s => s.strategy_id === strategy.id);
        const lastSignal = strategySignals.length > 0 ? strategySignals[0] : null;
        
        if (lastSignal && lastSignal.result === "LOSS") {
          const nextStep = lastSignal.martingale_step + 1;
          
          if (nextStep <= 2) { 
            let accLoss = 0;
            for (const s of strategySignals) {
              if (s.result === "WIN" || s.result === "MISSED" || (s.result === "LOSS" && s.martingale_step === 2)) break;
              if (s.result === "LOSS") accLoss += s.suggested_amount;
            }

            const config = this.getConfig(strategy.name);
            const suggestedAmount = this.calculateRecoveryBet(accLoss, config, session.min_chip, session.current_bankroll, nextStep);
            await prisma.signal.create({ data: { session_id: session.id, strategy_id: strategy.id, target_bet: config.targetBet, suggested_amount: suggestedAmount, martingale_step: nextStep, result: "SUGGESTED" } });
            return; 
          }
        }
      }

      const anyActive = allSignals.some(s => s.result === "PENDING" || s.result === "SUGGESTED");
      if (anyActive) return; 

      const closedCycles = allSignals.filter(s => s.result === "WIN" || (s.result === "LOSS" && s.martingale_step === 2));
      if (closedCycles.length >= 2) {
        const lastCycle = closedCycles[0];
        const prevCycle = closedCycles[1];
        
        if (lastCycle.result === "LOSS" && prevCycle.result === "LOSS") {
          const lastSigTime = new Date(lastCycle.created_at).getTime();
          const spinsSince = recentSpins.filter(s => new Date(s.created_at).getTime() > lastSigTime).length;
          const CIRCUIT_BREAKER_DURATION = 20; 
          
          if (spinsSince < CIRCUIT_BREAKER_DURATION) return;
        }
      }

      let candidates: { strategy: Strategy, config: StrategyConfig, zScore: number, requiredZScore: number, markovProb: number }[] = [];

      for (const strategy of activeStrategies) {
        const config = this.getConfig(strategy.name);
        const strategySignals = allSignals.filter(s => s.strategy_id === strategy.id);
        const lastSignal = strategySignals.length > 0 ? strategySignals[0] : null;

        const lastClosedCycle = strategySignals.find(s => s.result === "WIN" || (s.result === "LOSS" && s.martingale_step === 2));
        const isPenalized = lastClosedCycle && lastClosedCycle.result === "LOSS";
        const requiredCooldown = isPenalized ? 12 : 3; 
        const requiredZScore = isPenalized ? -1.35 : -0.85; 

        let isOnCooldown = false;
        if (lastSignal && lastSignal.result !== "PENDING" && lastSignal.result !== "SUGGESTED") {
          const lastSigTime = new Date(lastSignal.created_at).getTime();
          const spinsSince = recentSpins.filter(s => new Date(s.created_at).getTime() > lastSigTime).length;
          if (spinsSince < requiredCooldown) isOnCooldown = true;
        }

        if (isOnCooldown) continue; 
        if (config.canTrigger && !config.canTrigger(spinNumbersTimeline)) continue;
        
        const zScore = this.calculateSectorZScore(spinNumbersTimeline, config);
        const markovProb = this.calculateMarkovProbability(spinNumbersTimeline, config);
        
        candidates.push({ strategy, config, zScore, requiredZScore, markovProb });
      }

      const validCandidates = candidates.filter(c => {
        if (c.zScore > c.requiredZScore) return false;
        const theoreticalProb = c.config.coverage / 37;
        const isMarkovApproved = c.markovProb >= (theoreticalProb * 0.75);
        if (!isMarkovApproved) return false;
        return true;
      });

      validCandidates.sort((a, b) => a.zScore - b.zScore);
      const topCandidate = validCandidates[0]; 

      if (topCandidate) {
        const suggestedAmount = this.calculateBaseBet(topCandidate.config, session.current_bankroll, session.min_chip);
        await prisma.signal.create({ data: { session_id: session.id, strategy_id: topCandidate.strategy.id, target_bet: topCandidate.config.targetBet, suggested_amount: suggestedAmount, martingale_step: 0, result: "SUGGESTED" } });
      }
    } catch (error: any) { console.error(`[FAIL-SAFE] Erro na Análise Tática: ${error.message}`); }
  }
}
