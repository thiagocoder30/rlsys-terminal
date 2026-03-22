import { StrategyOrchestrator } from "./StrategyOrchestrator";

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
            const config = StrategyOrchestrator.getConfig(activeSignal.strategyName);
            const absMin = minChip * config.minChipsRequired;
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
        if (currentBankroll <= initialBankroll * 0.85) break; 
      }

      simulatedHistory.unshift(currentNumber);

      if (!activeSignal && simulatedHistory.length >= 10 && consecutiveLosses < 2) {
        const entropy = StrategyOrchestrator.calculateShannonEntropy(simulatedHistory);
        if (entropy > 4.60) continue; 

        const dropZoneTarget = StrategyOrchestrator.calculatePhysicalDropZone(simulatedHistory);
        if (dropZoneTarget !== null) {
           const config = StrategyOrchestrator.getConfig("Dynamic: Drop Zone");
           activeSignal = { strategyName: "Dynamic: Drop Zone", amount: minChip * 5, step: 0, targetWinCheck: config.checkWin, payout: config.payoutRatio };
           stratStats["Dynamic: Drop Zone"].signals++;
           continue;
        }

        let bestCandidate = null; let bestScore = Infinity; 
        for (const strat of activeStrategies) {
          if (strat.name === "Dynamic: Drop Zone") continue;
          const config = StrategyOrchestrator.getConfig(strat.name);
          const zScore = StrategyOrchestrator.calculateSectorZScore(simulatedHistory, config);
          const markovProb = StrategyOrchestrator.calculateMarkovProbability(simulatedHistory, config);
          if (zScore <= -0.85 && markovProb >= ((config.coverage / 37) * 0.75)) {
             const score = (zScore - markovProb) * (strat.bayes_weight || 1.0);
             if (score < bestScore) { bestScore = score; bestCandidate = strat.name; }
          }
        }

        if (bestCandidate) {
          const config = StrategyOrchestrator.getConfig(bestCandidate);
          activeSignal = { strategyName: bestCandidate, amount: minChip * config.minChipsRequired, step: 0, targetWinCheck: config.checkWin, payout: config.payoutRatio };
          stratStats[bestCandidate].signals++;
        }
      }
    }

    const finalEntropy = StrategyOrchestrator.calculateShannonEntropy(simulatedHistory.slice(0, 37));

    // ==========================================
    // INÍCIO DO FILTRO DE DOUTRINA DE RISCO MÁXIMO
    // ==========================================
    
    // 1. Extrai o relatório bruto de todas as matrizes que operaram
    const rawReport = Object.entries(stratStats)
      .filter(([_, data]) => data.signals > 0)
      .map(([name, data]) => {
        const concluded = data.wins + data.losses;
        const winRateNum = concluded > 0 ? (data.wins / concluded) * 100 : 0;
        return {
          name,
          signalsSent: data.signals,
          wins: data.wins,
          losses: data.losses,
          profit: data.profit,
          winRateNum: winRateNum,
          winRateStr: winRateNum.toFixed(1)
        };
      });

    // 2. A Guilhotina: Sobrevivem apenas estratégias com >= 70% de acerto E lucro positivo
    const eliteStrategies = rawReport
      .filter(strat => strat.winRateNum >= 70.0 && strat.profit > 0)
      .sort((a, b) => b.profit - a.profit);

    // 3. Recalcula o P&L Global e WinRate APENAS usando o esquadrão de elite
    let safeNetProfit = 0;
    let totalEliteConcluded = 0;
    let totalEliteWins = 0;

    eliteStrategies.forEach(strat => {
      safeNetProfit += strat.profit;
      totalEliteConcluded += (strat.wins + strat.losses);
      totalEliteWins += strat.wins;
    });

    const safeWinRateStr = totalEliteConcluded > 0 ? ((totalEliteWins / totalEliteConcluded) * 100).toFixed(1) : "0.0";

    // 4. Formata o relatório para a interface visual
    const finalStrategiesReport = eliteStrategies.map(strat => ({
      name: strat.name,
      signalsSent: strat.signalsSent,
      wins: strat.wins,
      losses: strat.losses,
      profit: strat.profit,
      winRate: strat.winRateStr
    }));

    // 5. O Veredito de Alta Rigidez
    let verdict: "GREEN_LIGHT" | "RED_LIGHT" | "WARNING" = "RED_LIGHT";

    if (finalEntropy > 4.6 || currentBankroll <= initialBankroll * 0.85) {
      verdict = "RED_LIGHT"; // Caos na mesa ou Quebra de Banca = Abortar sumariamente
    } else if (eliteStrategies.length > 0 && safeNetProfit > (initialBankroll * 0.02) && maxDrawdown < (initialBankroll * 0.10)) {
      verdict = "GREEN_LIGHT"; // Tem que garantir pelo menos 2% de lucro com as elites e Drawdown < 10%
    } else if (eliteStrategies.length > 0 && safeNetProfit > 0) {
      verdict = "WARNING"; // Lucro existe, mas a margem é apertada. Alerta amarelo.
    }

    const entropyStatus = finalEntropy > 4.6 ? "CAOS" : (finalEntropy > 4.0 ? "VOLÁTIL" : "ESTÁVEL");
    const bestStrategy = finalStrategiesReport.length > 0 ? finalStrategiesReport[0].name : "N/A";
    const worstStrategy = finalStrategiesReport.length > 0 ? finalStrategiesReport[finalStrategiesReport.length - 1].name : "N/A";

    return { 
      initialBankroll, 
      finalBankroll: initialBankroll + safeNetProfit, 
      netProfit: safeNetProfit, 
      winRate: safeWinRateStr, 
      totalSignals: totalEliteConcluded, 
      maxDrawdown, 
      entropyStatus, 
      strategiesReport: finalStrategiesReport, 
      bestStrategy, 
      worstStrategy, 
      verdict 
    };
  }
}
