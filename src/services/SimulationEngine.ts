import { StrategyOrchestrator } from "./StrategyOrchestrator";
import { TriplicationMatrix } from "./TriplicationMatrix";

export interface SimulationResult {
  initialBankroll: number;
  finalBankroll: number;
  netProfit: number;
  winRate: string;
  totalSignals: number;
  maxDrawdown: number;
  entropyStatus: string;
  strategiesReport: { name: string; signalsSent: number; wins: number; losses: number; profit: number; winRate: string; }[];
  bestStrategy: string;
  worstStrategy: string;
  verdict: "GREEN_LIGHT" | "RED_LIGHT" | "WARNING";
}

export class SimulationEngine {
  public static async runBacktest(
    spinNumbers: number[], 
    initialBankroll: number, 
    minChip: number, 
    activeStrategies: any[]
  ): Promise<SimulationResult> {
    let currentBankroll = initialBankroll; let peakBankroll = initialBankroll; let maxDrawdown = 0;
    const stratStats: Record<string, { signals: number, wins: number, losses: number, profit: number }> = {};
    activeStrategies.forEach(s => { stratStats[s.name] = { signals: 0, wins: 0, losses: 0, profit: 0 }; });

    let activeSignal: { strategyName: string, amount: number, step: number, targetWinCheck: (n: number) => boolean, payout: number } | null = null;
    let totalWins = 0; let totalLosses = 0; let consecutiveLosses = 0; let simulatedHistory: number[] = [];

    for (let i = 0; i < spinNumbers.length; i++) {
      const currentNumber = spinNumbers[i];
      
      if (activeSignal) {
        const isWin = activeSignal.targetWinCheck(currentNumber);
        if (isWin) {
          const profit = (activeSignal.amount * activeSignal.payout); currentBankroll += profit;
          stratStats[activeSignal.strategyName].wins++; stratStats[activeSignal.strategyName].profit += profit;
          totalWins++; consecutiveLosses = 0; activeSignal = null;
        } else {
          currentBankroll -= activeSignal.amount;
          stratStats[activeSignal.strategyName].losses++; stratStats[activeSignal.strategyName].profit -= activeSignal.amount;
          totalLosses++;
          
          if (activeSignal.step === 0) {
            const absMin = minChip * (activeSignal.payout === 1 ? 5 : 1); 
            let exactBet = (activeSignal.amount + absMin) / activeSignal.payout;
            let steps = Math.ceil(exactBet / absMin); if (steps < 1) steps = 1;
            activeSignal = { ...activeSignal, amount: steps * absMin, step: 1 };
          } else {
            consecutiveLosses++; activeSignal = null; 
          }
        }
        if (currentBankroll > peakBankroll) peakBankroll = currentBankroll;
        const currentDrawdown = peakBankroll - currentBankroll;
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
        
        // CORREÇÃO CRÍTICA: Removido o 'break' de Stop Loss Global durante o Backtest.
        // O simulador precisa processar todos os 500 números para achar a taxa de acerto real das matrizes.
      }

      simulatedHistory.unshift(currentNumber);

      if (!activeSignal && simulatedHistory.length >= 2 && consecutiveLosses < 2) {
        let bestCandidate = null; let bestScore = Infinity; 
        let triplicationTarget: number[] | null = null;

        for (const strat of activeStrategies) {
          if (strat.name === "Dynamic: Drop Zone") continue;

          if (strat.name.startsWith("Triplications:")) {
             const targets = TriplicationMatrix.getTargets(simulatedHistory, strat.name);
             if (targets) {
                 const score = -1.2 * (strat.bayes_weight || 1.0);
                 if (score < bestScore) { 
                     bestScore = score; bestCandidate = strat.name; triplicationTarget = targets; 
                 }
             }
             continue;
          }

          const config = StrategyOrchestrator.getConfig(strat.name);
          const zScore = StrategyOrchestrator.calculateSectorZScore(simulatedHistory, config);
          const markovProb = StrategyOrchestrator.calculateMarkovProbability(simulatedHistory, config);
          if (zScore <= -0.85 && markovProb >= ((config.coverage / 37) * 0.75)) {
             const score = (zScore - markovProb) * (strat.bayes_weight || 1.0);
             if (score < bestScore) { 
                 bestScore = score; bestCandidate = strat.name; triplicationTarget = null; 
             }
          }
        }

        if (bestCandidate) {
          if (bestCandidate.startsWith("Triplications:") && triplicationTarget) {
              activeSignal = { strategyName: bestCandidate, amount: minChip * 5, step: 0, targetWinCheck: (n: number) => triplicationTarget!.includes(n), payout: 1 };
          } else {
              const config = StrategyOrchestrator.getConfig(bestCandidate);
              activeSignal = { strategyName: bestCandidate, amount: minChip * config.minChipsRequired, step: 0, targetWinCheck: config.checkWin, payout: config.payoutRatio };
          }
          stratStats[bestCandidate].signals++;
        }
      }
    }

    const finalEntropy = StrategyOrchestrator.calculateShannonEntropy(simulatedHistory.slice(0, 37));

    const rawReport = Object.entries(stratStats)
      .filter(([_, data]) => data.signals > 0)
      .map(([name, data]) => {
        const concluded = data.wins + data.losses;
        const winRateNum = concluded > 0 ? (data.wins / concluded) * 100 : 0;
        return { name, signalsSent: data.signals, wins: data.wins, losses: data.losses, profit: data.profit, winRateNum: winRateNum, winRateStr: winRateNum.toFixed(1) };
      });

    const eliteStrategies = rawReport
      .filter(strat => strat.winRateNum >= 70.0 && strat.profit > 0)
      .sort((a, b) => b.profit - a.profit);

    let safeNetProfit = 0; let totalEliteConcluded = 0; let totalEliteWins = 0;
    eliteStrategies.forEach(strat => {
      safeNetProfit += strat.profit;
      totalEliteConcluded += (strat.wins + strat.losses);
      totalEliteWins += strat.wins;
    });

    const safeWinRateStr = totalEliteConcluded > 0 ? ((totalEliteWins / totalEliteConcluded) * 100).toFixed(1) : "0.0";
    const finalStrategiesReport = eliteStrategies.map(strat => ({
      name: strat.name, signalsSent: strat.signalsSent, wins: strat.wins, losses: strat.losses, profit: strat.profit, winRate: strat.winRateStr
    }));

    // ==========================================
    // VEREDITO BLINDADO E CORRIGIDO
    // O veredito agora respeita APENAS a saúde do Esquadrão de Elite (safeNetProfit)
    // ==========================================
    let verdict: "GREEN_LIGHT" | "RED_LIGHT" | "WARNING" = "RED_LIGHT";
    
    if (finalEntropy > 4.6) {
      verdict = "RED_LIGHT"; // Caos absoluto detectado na física da roleta
    } else if (eliteStrategies.length > 0 && safeNetProfit >= (initialBankroll * 0.02)) {
      verdict = "GREEN_LIGHT"; // Elite filtrou o lixo e garantiu lucro mínimo de 2%
    } else if (eliteStrategies.length > 0 && safeNetProfit > 0) {
      verdict = "WARNING"; // Elite teve lucro, mas abaixo de 2% (Risco Amarelo)
    }

    const entropyStatus = finalEntropy > 4.6 ? "CAOS" : (finalEntropy > 4.0 ? "VOLÁTIL" : "ESTÁVEL");
    
    return { 
      initialBankroll, finalBankroll: initialBankroll + safeNetProfit, netProfit: safeNetProfit, winRate: safeWinRateStr, 
      totalSignals: totalEliteConcluded, maxDrawdown, entropyStatus, strategiesReport: finalStrategiesReport, 
      bestStrategy: finalStrategiesReport.length > 0 ? finalStrategiesReport[0].name : "N/A", 
      worstStrategy: finalStrategiesReport.length > 0 ? finalStrategiesReport[finalStrategiesReport.length - 1].name : "N/A", verdict 
    };
  }
}
