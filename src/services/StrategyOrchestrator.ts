import { PrismaClient, Strategy, Session, Spin } from "@prisma/client";
import { BankrollManager } from "./BankrollManager";

const prisma = new PrismaClient();

interface StrategyConfig {
  payoutRatio: number; 
  coverage: number; 
  targetBet: string;
  minChipsRequired: number; 
  checkWin: (num: number) => boolean;
  canTrigger?: (history: number[]) => boolean; 
}

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
const EUROPEAN_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export class StrategyOrchestrator {
  private static REGISTRY: Record<string, StrategyConfig> = {
    "Race: Vizinhos 1 & 21": { payoutRatio: 10/26, coverage: 26, minChipsRequired: 26, targetBet: "CUSTOM_RACE_26_NUM", checkWin: (num) => ![3, 7, 8, 11, 12, 13, 28, 29, 30, 35, 36].includes(num) },
    "Race: Fusion": { payoutRatio: 11/25, coverage: 25, minChipsRequired: 25, targetBet: "FUSION_MAIS_ZERO", checkWin: (num) => [17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 28, 12, 35, 3, 26, 0].includes(num) },
    "Race: P2": { payoutRatio: 11/25, coverage: 25, minChipsRequired: 25, targetBet: "ESTRATEGIA_P2", checkWin: (num) => [0, 1, 2, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 19, 20, 23, 24, 26, 27, 29, 30, 31, 32, 34, 35].includes(num) },
    "James Bond": { payoutRatio: 8/20, coverage: 25, minChipsRequired: 20, targetBet: "JAMES_BOND_SET", checkWin: (num) => (num >= 13 && num <= 36) || num === 0 },
    
    "Cross: D1 ➔ Col 2 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "COL_2_E_3_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 3 !== 1) || n === 0 },
    "Cross: D2 ➔ Col 1 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "COL_1_E_3_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 3 !== 2) || n === 0 },
    "Cross: D3 ➔ Col 1 e 2": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "COL_1_E_2_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 3 !== 0) || n === 0 },
    "Cross: C1 ➔ Duz 2 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "DUZ_2_E_3_MAIS_ZERO", checkWin: (n) => (n >= 13 && n <= 36) || n === 0 },
    "Cross: C2 ➔ Duz 1 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "DUZ_1_E_3_MAIS_ZERO", checkWin: (n) => (n >= 1 && n <= 12) || (n >= 25 && n <= 36) || n === 0 },
    "Cross: C3 ➔ Duz 1 e 2": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, targetBet: "DUZ_1_E_2_MAIS_ZERO", checkWin: (n) => (n >= 1 && n <= 24) || n === 0 },

    "Macro: Red + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "RED_MAIS_ZERO", checkWin: (n) => RED_NUMBERS.includes(n) || n === 0 },
    "Macro: Black + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "BLACK_MAIS_ZERO", checkWin: (n) => BLACK_NUMBERS.includes(n) || n === 0 },
    "Macro: Even + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "EVEN_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 2 === 0) || n === 0 },
    "Macro: Odd + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "ODD_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 2 !== 0) || n === 0 },
    "Hedge: Red + Col 2 + Zero": { payoutRatio: 9/27, coverage: 27, minChipsRequired: 27, targetBet: "HEDGE_RED_COL2", checkWin: (n) => RED_NUMBERS.includes(n) || (n % 3 === 2) || n === 0 },
    "Hedge: Black + Col 3 + Zero": { payoutRatio: 9/27, coverage: 27, minChipsRequired: 27, targetBet: "HEDGE_BLACK_COL3", checkWin: (n) => BLACK_NUMBERS.includes(n) || (n % 3 === 0) || n === 0 },
    "Macro: Low (1-18) + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "LOW_MAIS_ZERO", checkWin: (n) => (n >= 1 && n <= 18) || n === 0 },
    "Macro: High (19-36) + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, targetBet: "HIGH_MAIS_ZERO", checkWin: (n) => (n >= 19 && n <= 36) || n === 0 },
    "Race: Sector Alpha": { payoutRatio: 11/25, coverage: 25, minChipsRequired: 25, targetBet: "VOISINS_AND_ORPHELINS", checkWin: (n) => [22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25,1,20,14,31,9,6,34,17].includes(n) },
    "Race: Sector Omega": { payoutRatio: 15/21, coverage: 21, minChipsRequired: 21, targetBet: "TIERS_ORPHELINS_ZERO", checkWin: (n) => [27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,6,34,17,0].includes(n) },
    
    // Matrizes Dinâmicas HFT
    "Dynamic: Drop Zone": { payoutRatio: 31/5, coverage: 5, minChipsRequired: 5, targetBet: "DROP_ZONE", checkWin: () => false },
    "Dynamic: Heatmap Cluster": { payoutRatio: 31/5, coverage: 5, minChipsRequired: 5, targetBet: "HEATMAP_CLUSTER", checkWin: () => false },
    "Dynamic: Sniper Anomaly": { payoutRatio: 2.0, coverage: 12, minChipsRequired: 1, targetBet: "SNIPER_ANOMALY", checkWin: () => false },
    "Dynamic: Quantum Intersection": { payoutRatio: 36, coverage: 1, minChipsRequired: 1, targetBet: "QUANTUM_INTERSECTION", checkWin: () => false },
    "Dynamic: Rolo Compressor": { payoutRatio: 1.2, coverage: 30, minChipsRequired: 5, targetBet: "MIDDLE_SIX_LINES", checkWin: () => false },
    "Dynamic: Operacao Tridente": { payoutRatio: 4.0, coverage: 18, minChipsRequired: 18, targetBet: "SHOTGUN_STRIKE_V2", checkWin: () => false },
    "Dynamic: Terminais Altos": { payoutRatio: 4.0, coverage: 9, minChipsRequired: 9, targetBet: "TERMINAIS_ALTOS", checkWin: () => false }
  };

  public static getConfig(strategyName: string): StrategyConfig {
    for (const [key, config] of Object.entries(this.REGISTRY)) {
      if (strategyName.includes(key)) return config;
    }
    return { payoutRatio: 1.0, coverage: 1, minChipsRequired: 1, targetBet: "UNKNOWN", checkWin: () => false };
  }

  public static getNeighbors(center: number, distance: number = 1): number[] {
    const idx = EUROPEAN_WHEEL.indexOf(center);
    if (idx === -1) return [];
    const res: number[] = [];
    for (let i = -distance; i <= distance; i++) {
        res.push(EUROPEAN_WHEEL[(idx + i + 37) % 37]);
    }
    return res;
  }

  public static detectTerminaisAltos(history: number[]): { target: string, chips: number, payout: number } | null {
    if (history.length < 12) return null;
    
    const recent12 = history.slice(0, 12);
    let has7 = false, has8 = false, has9 = false;

    recent12.forEach(n => {
        const term = n % 10;
        if (term === 7) has7 = true;
        if (term === 8) has8 = true;
        if (term === 9) has9 = true;
    });

    let targets: number[] = [];

    if (!has7 && !has8 && !has9) {
        targets = [7, 17, 27, 8, 18, 28, 9, 19, 29];
    } 
    else if (!has7 || !has8 || !has9) {
        if (!has7) targets.push(7, 17, 27);
        if (!has8) targets.push(8, 18, 28);
        if (!has9) targets.push(9, 19, 29);
        targets.push(0, 10, 20, 30);
    } 
    else {
        return null; 
    }

    if (targets.length > 0) {
        return {
            target: `TERMINALS_${targets.join("-")}`,
            chips: targets.length,
            payout: 36 / targets.length
        };
    }
    return null;
  }

  public static detectOperacaoTridente(history: number[]): { target: string, chips: number, payout: number } | null {
    if (history.length < 20) return null;
    const num1 = history[0]; 
    const num2 = history[1]; 
    
    const getTargetsFor = (num: number) => {
        if (num === 0) return [0, 1, 2];
        if (num === 36) return [34, 35, 36];
        return [num - 1, num, num + 1];
    };

    const base1 = getTargetsFor(num1);
    const base2 = getTargetsFor(num2);
    const tridentNumbers = new Set<number>();
    [...base1, ...base2].forEach(t => {
        const neighbors = this.getNeighbors(t, 1);
        neighbors.forEach(n => tridentNumbers.add(n));
    });
    
    const tridentArr = Array.from(tridentNumbers);
    const recent20 = history.slice(0, 20);
    let hits = 0;
    recent20.forEach(n => { if (tridentArr.includes(n)) hits++; });

    const expectedHits = 20 * (tridentArr.length / 37);
    if (hits >= expectedHits * 1.2) {
        return { target: `TRIDENT_${tridentArr.join("-")}`, chips: tridentArr.length, payout: 36 / tridentArr.length };
    }
    return null;
  }

  public static detectRoloCompressor(history: number[]): { target: string, chips: number, payout: number } | null {
    if (history.length < 15) return null;
    const deathZone = [0, 1, 2, 3, 34, 35, 36];
    const recent15 = history.slice(0, 15);
    let deathHits = 0;
    for(const n of recent15) { if(deathZone.includes(n)) deathHits++; }
    
    if(deathHits === 0) { return { target: "MIDDLE_SIX_LINES", chips: 5, payout: 1.2 }; }
    return null;
  }

  public static detectSniperAnomaly(history: number[]): { target: string, chips: number, payout: number } | null {
    if (history.length < 20) return null;
    const countStreak = (condition: (n: number) => boolean) => {
      let count = 0;
      for (const n of history) { if (condition(n)) count++; else break; }
      return count;
    };
    if (countStreak(n => n === 0 || n > 12) >= 17) return { target: "SNIPER_DUZ_1", chips: 1, payout: 2.0 };
    if (countStreak(n => n === 0 || n < 13 || n > 24) >= 17) return { target: "SNIPER_DUZ_2", chips: 1, payout: 2.0 };
    if (countStreak(n => n === 0 || n < 25) >= 17) return { target: "SNIPER_DUZ_3", chips: 1, payout: 2.0 };
    if (countStreak(n => n === 0 || n % 3 !== 1) >= 17) return { target: "SNIPER_COL_1", chips: 1, payout: 2.0 };
    if (countStreak(n => n === 0 || n % 3 !== 2) >= 17) return { target: "SNIPER_COL_2", chips: 1, payout: 2.0 };
    if (countStreak(n => n === 0 || n % 3 !== 0) >= 17) return { target: "SNIPER_COL_3", chips: 1, payout: 2.0 };
    if (countStreak(n => RED_NUMBERS.includes(n)) >= 9) return { target: "SNIPER_BLACK_ZERO", chips: 19, payout: 17/19 };
    if (countStreak(n => BLACK_NUMBERS.includes(n)) >= 9) return { target: "SNIPER_RED_ZERO", chips: 19, payout: 17/19 };
    return null;
  }

  public static calculatePhysicalDropZone(history: number[]): number | null {
    if (history.length < 5) return null;
    const getDistance = (n1: number, n2: number) => {
      const i1 = EUROPEAN_WHEEL.indexOf(n1); const i2 = EUROPEAN_WHEEL.indexOf(n2);
      if (i1 === -1 || i2 === -1) return 0;
      let dist = i2 - i1; if (dist < 0) dist += 37; return dist;
    };
    const d1 = getDistance(history[1], history[0]);
    const d2 = getDistance(history[2], history[1]);
    const d3 = getDistance(history[3], history[2]);
    const avg = Math.round((d1 + d2 + d3) / 3);
    const isConsistent = Math.abs(d1 - avg) <= 2 && Math.abs(d2 - avg) <= 2 && Math.abs(d3 - avg) <= 2;
    if (isConsistent) return EUROPEAN_WHEEL[(EUROPEAN_WHEEL.indexOf(history[0]) + avg) % 37];
    return null;
  }

  public static calculateHeatmapClusterTarget(history: number[]): number | null {
    const sample = history.slice(0, 50); const n = sample.length;
    if (n < 20) return null; 
    const frequencies: Record<number, number> = {};
    EUROPEAN_WHEEL.forEach(num => frequencies[num] = 0);
    sample.forEach(num => { if (frequencies[num] !== undefined) frequencies[num]++; });

    let bestCenter: number | null = null; let maxClusterHits = 0;
    for (let i = 0; i < EUROPEAN_WHEEL.length; i++) {
      const center = EUROPEAN_WHEEL[i];
      const clusterHits = frequencies[EUROPEAN_WHEEL[(i - 2 + 37) % 37]] + frequencies[EUROPEAN_WHEEL[(i - 1 + 37) % 37]] + frequencies[center] + frequencies[EUROPEAN_WHEEL[(i + 1) % 37]] + frequencies[EUROPEAN_WHEEL[(i + 2) % 37]];
      if (clusterHits > maxClusterHits) { maxClusterHits = clusterHits; bestCenter = center; }
    }
    const p = 5 / 37; const expected = n * p; const stdDev = Math.sqrt(n * p * (1 - p));
    if (stdDev === 0) return null;
    if ((maxClusterHits - expected) / stdDev >= 2.0 && bestCenter !== null) return bestCenter;
    return null;
  }

  public static calculateShannonEntropy(history: number[]): number {
    if (history.length < 10) return 0;
    const sample = history.slice(0, 37); const counts: Record<number, number> = {};
    sample.forEach(n => counts[n] = (counts[n] || 0) + 1);
    let entropy = 0;
    for (const key in counts) { const p = counts[key] / sample.length; entropy -= p * Math.log2(p); }
    return entropy;
  }

  public static calculateSectorZScore(history: number[], config: StrategyConfig): number {
    const sample = history.slice(0, 20); const n = sample.length;
    if (n < 10) return 0.0; 
    const p = config.coverage / 37; const expectedHits = n * p; const standardDeviation = Math.sqrt(n * p * (1 - p)); 
    if (standardDeviation === 0) return 0.0;
    let actualHits = 0; sample.forEach(num => { if (config.checkWin(num)) actualHits++; });
    return (actualHits - expectedHits) / standardDeviation;
  }

  public static getDozenMacroState(n: number): number {
    if (n === 0) return 0; if (n <= 12) return 1; if (n <= 24) return 2; return 3;
  }

  public static calculateMarkovProbability(history: number[], config: StrategyConfig): number {
    const theoreticalProb = config.coverage / 37;
    if (history.length < 5) return theoreticalProb; 
    const currentMacroState = this.getDozenMacroState(history[0]);
    let occurrences = 0; let winsImmediatelyAfter = 0;
    for (let i = 1; i < history.length; i++) {
      if (this.getDozenMacroState(history[i]) === currentMacroState) { occurrences++; if (config.checkWin(history[i - 1])) winsImmediatelyAfter++; }
    }
    if (occurrences < 3) return theoreticalProb; 
    return winsImmediatelyAfter / occurrences; 
  }

  private static calculateRealWinRate(strategySignals: any[]): number {
    const concluded = strategySignals.filter(s => s.result === "WIN" || s.result === "LOSS");
    if (concluded.length < 3) return 0; 
    const wins = concluded.filter(s => s.result === "WIN").length;
    return (wins / concluded.length) * 100;
  }

  public static calculateRecoveryBet(accumulatedLoss: number, config: StrategyConfig, minChip: number, bankroll: number): number {
    const absoluteMinBet = minChip * config.minChipsRequired;
    let exactBet = (accumulatedLoss + absoluteMinBet) / config.payoutRatio;
    const absoluteMaxBet = bankroll * 0.10; 
    if (exactBet > absoluteMaxBet) exactBet = absoluteMaxBet;
    let steps = Math.ceil(exactBet / absoluteMinBet); if (steps < 1) steps = 1;
    return steps * absoluteMinBet;
  }

  public static async resolvePendingSignals(newNumber: number, sessionId: string) {
    try {
      const activeSignals = await prisma.signal.findMany({ where: { session_id: sessionId, result: { in: ["PENDING", "SUGGESTED"] } }, include: { strategy: true } });
      if (activeSignals.length === 0) return;

      let totalProfitDelta = 0;
      for (const sig of activeSignals) {
        if (sig.result === "SUGGESTED") {
          await prisma.signal.update({ where: { id: sig.id }, data: { result: "MISSED" } });
        } else if (sig.result === "PENDING") {
          let isWin = false;
          let payoutR = 1.0;
          const config = this.getConfig(sig.strategy.name);
          
          if (sig.strategy.name === "Dynamic: Drop Zone" || sig.strategy.name === "Dynamic: Heatmap Cluster") {
             const targetStr = sig.target_bet.split("_").pop(); 
             if (targetStr) {
                 const targetNum = parseInt(targetStr);
                 const targetIndex = EUROPEAN_WHEEL.indexOf(targetNum);
                 const winningSet = [EUROPEAN_WHEEL[(targetIndex - 2 + 37) % 37], EUROPEAN_WHEEL[(targetIndex - 1 + 37) % 37], targetNum, EUROPEAN_WHEEL[(targetIndex + 1) % 37], EUROPEAN_WHEEL[(targetIndex + 2) % 37]];
                 isWin = winningSet.includes(newNumber);
             }
             payoutR = config.payoutRatio;
          } else if (sig.strategy.name === "Dynamic: Sniper Anomaly") {
             const target = sig.target_bet;
             if (target === "SNIPER_DUZ_1") isWin = newNumber >= 1 && newNumber <= 12;
             else if (target === "SNIPER_DUZ_2") isWin = newNumber >= 13 && newNumber <= 24;
             else if (target === "SNIPER_DUZ_3") isWin = newNumber >= 25 && newNumber <= 36;
             else if (target === "SNIPER_COL_1") isWin = newNumber !== 0 && newNumber % 3 === 1;
             else if (target === "SNIPER_COL_2") isWin = newNumber !== 0 && newNumber % 3 === 2;
             else if (target === "SNIPER_COL_3") isWin = newNumber !== 0 && newNumber % 3 === 0;
             else if (target === "SNIPER_RED_ZERO") isWin = RED_NUMBERS.includes(newNumber) || newNumber === 0;
             else if (target === "SNIPER_BLACK_ZERO") isWin = BLACK_NUMBERS.includes(newNumber) || newNumber === 0;
             payoutR = target.includes("ZERO") ? 17/19 : 2.0;
          } else if (sig.strategy.name === "Dynamic: Quantum Intersection") {
             const numbersStr = sig.target_bet.replace("INTERSECTION_", "");
             const targetNumbers = numbersStr.split("-").map(n => parseInt(n));
             isWin = targetNumbers.includes(newNumber);
             payoutR = 36 / targetNumbers.length;
          } else if (sig.strategy.name === "Dynamic: Rolo Compressor") {
             isWin = newNumber >= 4 && newNumber <= 33;
             payoutR = 1.2; 
          } else if (sig.strategy.name === "Dynamic: Operacao Tridente") {
             const numbersStr = sig.target_bet.replace("TRIDENT_", "");
             const targetNumbers = numbersStr.split("-").map(n => parseInt(n));
             isWin = targetNumbers.includes(newNumber);
             payoutR = 36 / targetNumbers.length;
          } else if (sig.strategy.name === "Dynamic: Terminais Altos") {
             const numbersStr = sig.target_bet.replace("TERMINALS_", "");
             const targetNumbers = numbersStr.split("-").map(n => parseInt(n));
             isWin = targetNumbers.includes(newNumber);
             payoutR = 36 / targetNumbers.length;
          } else {
             isWin = config.checkWin(newNumber);
             payoutR = config.payoutRatio;
          }

          const profitNet = isWin ? (sig.suggested_amount * payoutR) : -sig.suggested_amount;
          totalProfitDelta += profitNet;
          await prisma.signal.update({ where: { id: sig.id }, data: { result: isWin ? "WIN" : "LOSS" }});
        }
      }

      if (totalProfitDelta !== 0) {
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (session) {
          const newBankroll = session.current_bankroll + totalProfitDelta;
          const currentHigh = session.highest_bankroll && session.highest_bankroll > 0 ? session.highest_bankroll : session.initial_bankroll;
          await prisma.session.update({ where: { id: sessionId }, data: { current_bankroll: newBankroll, highest_bankroll: Math.max(currentHigh, newBankroll) } });
        }
      }
    } catch (error: any) { console.error(`[FAIL-SAFE] Erro ao resolver sinais: ${error.message}`); }
  }

  public static async analyzeMarket(recentSpins: Spin[], activeStrategies: Strategy[], session: Session) {
    try {
      const spinNumbersTimeline = recentSpins.map(s => s.number);
      if (spinNumbersTimeline.length < 10) return; 

      const entropy = this.calculateShannonEntropy(spinNumbersTimeline);
      if (entropy > 4.60) return; 

      const allSignals = await prisma.signal.findMany({ where: { session_id: session.id }, orderBy: { created_at: "desc" } });

      let heatStrategy = activeStrategies.find(s => s.name === "Dynamic: Heatmap Cluster");
      if (!heatStrategy) { heatStrategy = await prisma.strategy.create({ data: { name: "Dynamic: Heatmap Cluster", description: "Ataca clusters físicos", is_active: true } }); activeStrategies.push(heatStrategy); }
      
      let sniperStrategy = activeStrategies.find(s => s.name === "Dynamic: Sniper Anomaly");
      if (!sniperStrategy) { sniperStrategy = await prisma.strategy.create({ data: { name: "Dynamic: Sniper Anomaly", description: "Explora reversão à média", is_active: true } }); activeStrategies.push(sniperStrategy); }
      
      let quantumStrategy = activeStrategies.find(s => s.name === "Dynamic: Quantum Intersection");
      if (!quantumStrategy) { quantumStrategy = await prisma.strategy.create({ data: { name: "Dynamic: Quantum Intersection", description: "Aposta Plein em interseção", is_active: true } }); activeStrategies.push(quantumStrategy); }

      let roloStrategy = activeStrategies.find(s => s.name === "Dynamic: Rolo Compressor");
      if (!roloStrategy) { roloStrategy = await prisma.strategy.create({ data: { name: "Dynamic: Rolo Compressor", description: "Cerco agressivo central (Six Lines)", is_active: true } }); activeStrategies.push(roloStrategy); }

      let tridenteStrategy = activeStrategies.find(s => s.name === "Dynamic: Operacao Tridente");
      if (!tridenteStrategy) { tridenteStrategy = await prisma.strategy.create({ data: { name: "Dynamic: Operacao Tridente", description: "Ataque dinâmico de dispersão dupla", is_active: true } }); activeStrategies.push(tridenteStrategy); }

      let terminaisStrategy = activeStrategies.find(s => s.name === "Dynamic: Terminais Altos");
      if (!terminaisStrategy) { terminaisStrategy = await prisma.strategy.create({ data: { name: "Dynamic: Terminais Altos", description: "Rastreador de atraso de terminais (Hit & Run)", is_active: true } }); activeStrategies.push(terminaisStrategy); }

      for (const strategy of activeStrategies) {
        const strategySignals = allSignals.filter(s => s.strategy_id === strategy.id);
        const lastSignal = strategySignals.length > 0 ? strategySignals[0] : null;
        
        if (lastSignal && lastSignal.result === "LOSS") {
          let maxGales = 1;
          if (strategy.name === "Dynamic: Rolo Compressor") maxGales = 0;
          else if (strategy.name === "Dynamic: Operacao Tridente") maxGales = 3;
          else if (strategy.name === "Dynamic: Sniper Anomaly" || strategy.name === "Dynamic: Terminais Altos") maxGales = 2;

          const nextStep = lastSignal.martingale_step + 1;
          
          if (nextStep <= maxGales) { 
            let accLoss = 0;
            for (const s of strategySignals) {
              if (s.result === "WIN" || s.result === "MISSED" || (s.result === "LOSS" && s.martingale_step === maxGales)) break;
              if (s.result === "LOSS") accLoss += s.suggested_amount;
            }
            
            let config = this.getConfig(strategy.name);
            if (strategy.name === "Dynamic: Sniper Anomaly") {
                config.payoutRatio = lastSignal.target_bet.includes("ZERO") ? 17/19 : 2.0;
                config.minChipsRequired = lastSignal.target_bet.includes("ZERO") ? 19 : 1;
            } else if (strategy.name === "Dynamic: Quantum Intersection") {
                const targetNumbers = lastSignal.target_bet.replace("INTERSECTION_", "").split("-").map(n => parseInt(n));
                config.payoutRatio = 36 / targetNumbers.length;
                config.minChipsRequired = targetNumbers.length;
            } else if (strategy.name === "Dynamic: Operacao Tridente") {
                const targetNumbers = lastSignal.target_bet.replace("TRIDENT_", "").split("-").map(n => parseInt(n));
                config.payoutRatio = 36 / targetNumbers.length;
                config.minChipsRequired = targetNumbers.length;
            } else if (strategy.name === "Dynamic: Terminais Altos") {
                const targetNumbers = lastSignal.target_bet.replace("TERMINALS_", "").split("-").map(n => parseInt(n));
                config.payoutRatio = 36 / targetNumbers.length;
                config.minChipsRequired = targetNumbers.length;
            }

            const suggestedAmount = this.calculateRecoveryBet(accLoss, config, session.min_chip, session.current_bankroll);
            await prisma.signal.create({ data: { session_id: session.id, strategy_id: strategy.id, target_bet: lastSignal.target_bet, suggested_amount: suggestedAmount, martingale_step: nextStep, result: "SUGGESTED", type: "LIVE" } });
            return; 
          }
        }
      }

      const anyActive = allSignals.some(s => s.result === "PENDING" || s.result === "SUGGESTED");
      if (anyActive) return; 

      const isOnCooldown = (strategyId: string, winDelay: number, lossDelay: number) => {
        const stratSignals = allSignals.filter(s => s.strategy_id === strategyId);
        const lastSig = stratSignals.length > 0 ? stratSignals[0] : null;
        if (!lastSig || lastSig.result === "PENDING" || lastSig.result === "SUGGESTED") return false;
        
        const isLoss = lastSig.result === "LOSS";
        const required = isLoss ? lossDelay : winDelay;
        
        const lastSigTime = new Date(lastSig.created_at).getTime();
        const spinsSince = recentSpins.filter(s => new Date(s.created_at).getTime() > lastSigTime).length;
        
        return spinsSince < required;
      };

      if (sniperStrategy && !isOnCooldown(sniperStrategy.id, 3, 15)) {
        const sniperAnomaly = this.detectSniperAnomaly(spinNumbersTimeline);
        if (sniperAnomaly !== null) {
           const suggestedAmount = BankrollManager.calculateSafeBet(session.current_bankroll, session.min_chip, sniperAnomaly.chips, 95, sniperAnomaly.payout);
           await prisma.signal.create({ data: { session_id: session.id, strategy_id: sniperStrategy.id, target_bet: sniperAnomaly.target, suggested_amount: suggestedAmount, martingale_step: 0, result: "SUGGESTED", type: "LIVE" } });
           return;
        }
      }

      if (roloStrategy && !isOnCooldown(roloStrategy.id, 3, 15)) {
        const roloAnomaly = this.detectRoloCompressor(spinNumbersTimeline);
        if (roloAnomaly !== null) {
           const suggestedAmount = BankrollManager.calculateSafeBet(session.current_bankroll, session.min_chip, roloAnomaly.chips, 81.08, roloAnomaly.payout);
           await prisma.signal.create({ data: { session_id: session.id, strategy_id: roloStrategy.id, target_bet: roloAnomaly.target, suggested_amount: suggestedAmount, martingale_step: 0, result: "SUGGESTED", type: "LIVE" } });
           return;
        }
      }

      if (tridenteStrategy && !isOnCooldown(tridenteStrategy.id, 3, 15)) {
        const tridenteAnomaly = this.detectOperacaoTridente(spinNumbersTimeline);
        if (tridenteAnomaly !== null) {
           const suggestedAmount = BankrollManager.calculateSafeBet(session.current_bankroll, session.min_chip, tridenteAnomaly.chips, 48.6, tridenteAnomaly.payout);
           await prisma.signal.create({ data: { session_id: session.id, strategy_id: tridenteStrategy.id, target_bet: tridenteAnomaly.target, suggested_amount: suggestedAmount, martingale_step: 0, result: "SUGGESTED", type: "LIVE" } });
           return;
        }
      }

      if (terminaisStrategy && !isOnCooldown(terminaisStrategy.id, 3, 15)) {
        const termAnomaly = this.detectTerminaisAltos(spinNumbersTimeline);
        if (termAnomaly !== null) {
           const winRate = (termAnomaly.chips / 37) * 100;
           const suggestedAmount = BankrollManager.calculateSafeBet(session.current_bankroll, session.min_chip, termAnomaly.chips, winRate, termAnomaly.payout);
           await prisma.signal.create({ data: { session_id: session.id, strategy_id: terminaisStrategy.id, target_bet: termAnomaly.target, suggested_amount: suggestedAmount, martingale_step: 0, result: "SUGGESTED", type: "LIVE" } });
           return;
        }
      }

      const closedCycles = allSignals.filter(s => s.result === "WIN" || (s.result === "LOSS" && s.martingale_step === 1));
      if (closedCycles.length >= 2 && closedCycles[0].result === "LOSS" && closedCycles[1].result === "LOSS") {
          const lastSigTime = new Date(closedCycles[0].created_at).getTime();
          const spinsSince = recentSpins.filter(s => new Date(s.created_at).getTime() > lastSigTime).length;
          if (spinsSince < 20) return;
      }

      let candidates: { strategy: Strategy, config: StrategyConfig, zScore: number, requiredZScore: number, markovProb: number, winRate: number }[] = [];

      for (const strategy of activeStrategies) {
        if (strategy.name.includes("Dynamic:")) continue; 
        const config = this.getConfig(strategy.name);
        const strategySignals = allSignals.filter(s => s.strategy_id === strategy.id);
        const lastSignal = strategySignals.length > 0 ? strategySignals[0] : null;

        const lastClosedCycle = strategySignals.find(s => s.result === "WIN" || (s.result === "LOSS" && s.martingale_step === 1));
        const isPenalized = lastClosedCycle && lastClosedCycle.result === "LOSS";
        
        const requiredCooldown = isPenalized ? 25 : 3; 
        const requiredZScore = isPenalized ? -1.50 : -0.85; 

        let isOnCooldownStandard = false;
        if (lastSignal && lastSignal.result !== "PENDING" && lastSignal.result !== "SUGGESTED") {
          const lastSigTime = new Date(lastSignal.created_at).getTime();
          const spinsSince = recentSpins.filter(s => new Date(s.created_at).getTime() > lastSigTime).length;
          if (spinsSince < requiredCooldown) isOnCooldownStandard = true;
        }

        if (isOnCooldownStandard) continue; 
        if (config.canTrigger && !config.canTrigger(spinNumbersTimeline)) continue;
        
        const zScore = this.calculateSectorZScore(spinNumbersTimeline, config);
        const markovProb = this.calculateMarkovProbability(spinNumbersTimeline, config);
        const currentWinRate = this.calculateRealWinRate(strategySignals);
        
        candidates.push({ strategy, config, zScore, requiredZScore, markovProb, winRate: currentWinRate });
      }

      const validCandidates = candidates.filter(c => c.zScore <= c.requiredZScore && c.markovProb >= ((c.config.coverage / 37) * 0.75));

      if (validCandidates.length >= 2 && quantumStrategy) {
        validCandidates.sort((a, b) => (a.zScore - a.markovProb) - (b.zScore - b.markovProb));
        const top1 = validCandidates[0];
        const top2 = validCandidates[1];

        const set1 = EUROPEAN_WHEEL.filter(n => top1.config.checkWin(n));
        const set2 = EUROPEAN_WHEEL.filter(n => top2.config.checkWin(n));
        const intersectionNumbers = set1.filter(n => set2.includes(n));

        if (intersectionNumbers.length > 0 && intersectionNumbers.length <= 8) {
          const targetStr = `INTERSECTION_${intersectionNumbers.join("-")}`;
          const exactBetAmount = session.min_chip * intersectionNumbers.length;

          await prisma.signal.create({ 
            data: { session_id: session.id, strategy_id: quantumStrategy.id, target_bet: targetStr, suggested_amount: exactBetAmount, martingale_step: 0, result: "SUGGESTED", type: "LIVE" } 
          });
          return; 
        }
      }

      if (validCandidates.length > 0) {
        validCandidates.sort((a, b) => (a.zScore - a.markovProb) - (b.zScore - b.markovProb));
        const topCandidate = validCandidates[0]; 
        const suggestedAmount = BankrollManager.calculateSafeBet(session.current_bankroll, session.min_chip, topCandidate.config.minChipsRequired, topCandidate.winRate, topCandidate.config.payoutRatio);

        await prisma.signal.create({ data: { session_id: session.id, strategy_id: topCandidate.strategy.id, target_bet: topCandidate.config.targetBet, suggested_amount: suggestedAmount, martingale_step: 0, result: "SUGGESTED", type: "LIVE" } });
      }

    } catch (error: any) { console.error(`[FAIL-SAFE] Erro na Análise Tática: ${error.message}`); }
  }
}
