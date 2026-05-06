import { PrismaClient, Strategy, Session, Spin } from "@prisma/client";
import { BankrollManager } from "./BankrollManager";

const prisma = new PrismaClient();

interface StrategyConfig {
  payoutRatio: number; 
  coverage: number; 
  target: string; 
  minChipsRequired: number; 
  checkWin: (num: number) => boolean;
  canTrigger?: (history: number[]) => boolean; 
}

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
const EUROPEAN_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export class StrategyOrchestrator {
  private static REGISTRY: Record<string, StrategyConfig> = {
    "Race: Vizinhos 1 & 21": { payoutRatio: 10/26, coverage: 26, minChipsRequired: 26, target: "CUSTOM_RACE_26_NUM", checkWin: (num) => ![3, 7, 8, 11, 12, 13, 28, 29, 30, 35, 36].includes(num) },
    "Race: Fusion": { payoutRatio: 11/25, coverage: 25, minChipsRequired: 25, target: "FUSION_MAIS_ZERO", checkWin: (num) => [17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 28, 12, 35, 3, 26, 0].includes(num) },
    "Race: P2": { payoutRatio: 11/25, coverage: 25, minChipsRequired: 25, target: "ESTRATEGIA_P2", checkWin: (num) => [0, 1, 2, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 19, 20, 23, 24, 26, 27, 29, 30, 31, 32, 34, 35].includes(num) },
    "James Bond": { payoutRatio: 8/20, coverage: 25, minChipsRequired: 20, target: "JAMES_BOND_SET", checkWin: (num) => (num >= 13 && num <= 36) || num === 0 },
    "Cross: D1 ➔ Col 2 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, target: "COL_2_E_3_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 3 !== 1) || n === 0 },
    "Cross: D2 ➔ Col 1 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, target: "COL_1_E_3_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 3 !== 2) || n === 0 },
    "Cross: D3 ➔ Col 1 e 2": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, target: "COL_1_E_2_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 3 !== 0) || n === 0 },
    "Cross: C1 ➔ Duz 2 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, target: "DUZ_2_E_3_MAIS_ZERO", checkWin: (n) => (n >= 13 && n <= 36) || n === 0 },
    "Cross: C2 ➔ Duz 1 e 3": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, target: "DUZ_1_E_3_MAIS_ZERO", checkWin: (n) => (n >= 1 && n <= 12) || (n >= 25 && n <= 36) || n === 0 },
    "Cross: C3 ➔ Duz 1 e 2": { payoutRatio: 9/21, coverage: 25, minChipsRequired: 21, target: "DUZ_1_E_2_MAIS_ZERO", checkWin: (n) => (n >= 1 && n <= 24) || n === 0 },
    "Macro: Red + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, target: "RED_MAIS_ZERO", checkWin: (n) => RED_NUMBERS.includes(n) || n === 0 },
    "Macro: Black + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, target: "BLACK_MAIS_ZERO", checkWin: (n) => BLACK_NUMBERS.includes(n) || n === 0 },
    "Macro: Even + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, target: "EVEN_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 2 === 0) || n === 0 },
    "Macro: Odd + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, target: "ODD_MAIS_ZERO", checkWin: (n) => (n !== 0 && n % 2 !== 0) || n === 0 },
    "Hedge: Red + Col 2 + Zero": { payoutRatio: 9/27, coverage: 27, minChipsRequired: 27, target: "HEDGE_RED_COL2", checkWin: (n) => RED_NUMBERS.includes(n) || (n % 3 === 2) || n === 0 },
    "Hedge: Black + Col 3 + Zero": { payoutRatio: 9/27, coverage: 27, minChipsRequired: 27, target: "HEDGE_BLACK_COL3", checkWin: (n) => BLACK_NUMBERS.includes(n) || (n % 3 === 0) || n === 0 },
    "Macro: Low (1-18) + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, target: "LOW_MAIS_ZERO", checkWin: (n) => (n >= 1 && n <= 18) || n === 0 },
    "Macro: High (19-36) + Zero": { payoutRatio: 17/19, coverage: 19, minChipsRequired: 19, target: "HIGH_MAIS_ZERO", checkWin: (n) => (n >= 19 && n <= 36) || n === 0 },
    "Race: Sector Alpha": { payoutRatio: 11/25, coverage: 25, minChipsRequired: 25, target: "VOISINS_AND_ORPHELINS", checkWin: (n) => [22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25,1,20,14,31,9,6,34,17].includes(n) },
    "Race: Sector Omega": { payoutRatio: 15/21, coverage: 21, minChipsRequired: 21, target: "TIERS_ORPHELINS_ZERO", checkWin: (n) => [27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,6,34,17,0].includes(n) },
    "Dynamic: Sniper Anomaly": { payoutRatio: 2.0, coverage: 12, minChipsRequired: 1, target: "SNIPER_ANOMALY", checkWin: () => false },
    "Dynamic: Quantum Intersection": { payoutRatio: 36, coverage: 1, minChipsRequired: 1, target: "QUANTUM_INTERSECTION", checkWin: () => false },
    "Dynamic: Rolo Compressor": { payoutRatio: 1.2, coverage: 30, minChipsRequired: 5, target: "MIDDLE_SIX_LINES", checkWin: () => false },
    "Dynamic: Operacao Tridente": { payoutRatio: 4.0, coverage: 18, minChipsRequired: 18, target: "SHOTGUN_STRIKE_V2", checkWin: () => false },
    "Dynamic: Terminais Altos": { payoutRatio: 4.0, coverage: 9, minChipsRequired: 9, target: "TERMINAIS_ALTOS", checkWin: () => false }
  };

  public static getConfig(strategyName: string): StrategyConfig {
    for (const [key, config] of Object.entries(this.REGISTRY)) {
      if (strategyName.includes(key)) return config;
    }
    return { payoutRatio: 1.0, coverage: 1, minChipsRequired: 1, target: "UNKNOWN", checkWin: () => false };
  }

  // ... (getNeighbors, detectTerminaisAltos, detectOperacaoTridente, detectRoloCompressor, detectSniperAnomaly permanecem iguais logicamente)

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
          let isWin = false; 
          let payoutR = 1.0; 
          const config = this.getConfig(sig.strategy.name);

          // ... (Lógica de detecção de vitória isWin permanece igual)
          
          const profitNet = isWin ? (sig.suggested_amount * payoutR) : -sig.suggested_amount;
          totalProfitDelta += profitNet;
          await prisma.signal.update({ where: { id: sig.id }, data: { result: isWin ? "WIN" : "LOSS" }});
        }
      }

      if (totalProfitDelta !== 0) {
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (session) {
          // CORREÇÃO: Arredondamento para evitar bugs de ponto flutuante na banca
          const newBankroll = Math.round((session.current_bankroll + totalProfitDelta) * 100) / 100;
          const currentHigh = session.highest_bankroll && session.highest_bankroll > 0 ? session.highest_bankroll : session.initial_bankroll;
          
          await prisma.session.update({ 
            where: { id: sessionId }, 
            data: { 
              current_bankroll: newBankroll, 
              highest_bankroll: Math.max(currentHigh, newBankroll) 
            } 
          });
        }
      }
    } catch (error: any) { console.error(`[FAIL-SAFE] Erro ao resolver sinais: ${error.message}`); }
  }

  public static async analyzeMarket(recentSpins: Spin[], activeStrategies: Strategy[], session: Session) {
    try {
      const spinNumbersTimeline = recentSpins.map(s => s.number);
      if (spinNumbersTimeline.length < 10) return; 

      // CORREÇÃO: Limite de busca para não sobrecarregar o banco de dados em produção
      const allSignals = await prisma.signal.findMany({ 
        where: { session_id: session.id }, 
        orderBy: { created_at: "desc" },
        take: 50 // Pegamos apenas o histórico necessário para análise de Gale e Cooldown
      });

      // ... (Lógica de criação de estratégias dinâmicas e Martingale permanece igual)

      // ... (Lógica de Cooldown e análise de candidatos permanece igual)

    } catch (error: any) { console.error(`[FAIL-SAFE] Erro na Análise Tática: ${error.message}`); }
  }
}
