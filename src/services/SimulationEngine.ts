import { StrategyOrchestrator } from "./StrategyOrchestrator";

export interface SimulationResult {
  initialBankroll: number;
  finalBankroll: number;
  netProfit: number;
  winRate: string;
  totalSignals: number;
  maxDrawdown: number;
  entropyStatus: string;
  strategiesReport: {
    name: string;
    signalsSent: number;
    wins: number;
    losses: number;
    profit: number;
    winRate: string;
  }[];
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
    
    let currentBankroll = initialBankroll;
    let peakBankroll = initialBankroll;
    let maxDrawdown = 0;
    
    // Rastreadores de Estatística Interna
    const stratStats: Record<string, { signals: number, wins: number, losses: number, profit: number }> = {};
    activeStrategies.forEach(s => {
      stratStats[s.name] = { signals: 0, wins: 0, losses: 0, profit: 0 };
    });

    let activeSignal: { strategyName: string, amount: number, step: number, targetWinCheck: (n: number) => boolean, payout: number } | null = null;
    let totalWins = 0;
    let totalLosses = 0;
    let consecutiveLosses = 0;
    let simulatedHistory: number[] = [];

    // O LOOP DO TEMPO: Viajando pelo passado da roleta
    for (let i = 0; i < spinNumbers.length; i++) {
      const currentNumber = spinNumbers[i];
      
      // 1. Resolve o Sinal Pendente do giro anterior
      if (activeSignal) {
        const isWin = activeSignal.targetWinCheck(currentNumber);
        if (isWin) {
          const profit = (activeSignal.amount * activeSignal.payout);
          currentBankroll += profit;
          stratStats[activeSignal.strategyName].wins++;
          stratStats[activeSignal.strategyName].profit += profit;
          totalWins++;
          consecutiveLosses = 0;
          activeSignal = null;
        } else {
          currentBankroll -= activeSignal.amount;
          stratStats[activeSignal.strategyName].losses++;
          stratStats[activeSignal.strategyName].profit -= activeSignal.amount;
          totalLosses++;
          
          // Lógica de 1 Gale
          if (activeSignal.step === 0) {
            const config = StrategyOrchestrator.getConfig(activeSignal.strategyName);
            const absMin = minChip * config.minChipsRequired;
            let exactBet = (activeSignal.amount + absMin) / activeSignal.payout;
            let steps = Math.ceil(exactBet / absMin); if (steps < 1) steps = 1;
            const recoveryBet = steps * absMin;
            
            activeSignal = { ...activeSignal, amount: recoveryBet, step: 1 };
          } else {
            consecutiveLosses++;
            activeSignal = null; // Morre no Gale 1
          }
        }

        // Atualiza Drawdown Máximo
        if (currentBankroll > peakBankroll) peakBankroll = currentBankroll;
        const currentDrawdown = peakBankroll - currentBankroll;
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;

        // Stop Loss Compulsório da Simulação (-15%)
        if (currentBankroll <= initialBankroll * 0.85) {
           break; // Aborta a simulação, a banca quebrou ou bateu o limite de risco
        }
      }

      // Adiciona o número ao histórico que a IA "conhece" até este exato milissegundo
      simulatedHistory.unshift(currentNumber);

      // 2. Análise de Mercado (A IA procurando alvos se não houver sinal ativo)
      if (!activeSignal && simulatedHistory.length >= 10 && consecutiveLosses < 2) {
        
        // Bloqueio de Entropia simulado
        const entropy = StrategyOrchestrator.calculateShannonEntropy(simulatedHistory);
        if (entropy > 4.60) continue; 

        // Rastreio Físico simulado
        const dropZoneTarget = StrategyOrchestrator.calculatePhysicalDropZone(simulatedHistory);
        if (dropZoneTarget !== null) {
           const config = StrategyOrchestrator.getConfig("Dynamic: Drop Zone");
           activeSignal = { strategyName: "Dynamic: Drop Zone", amount: minChip * 5, step: 0, targetWinCheck: config.checkWin, payout: config.payoutRatio };
           stratStats["Dynamic: Drop Zone"].signals++;
           continue;
        }

        // Simulação do Ranking de Confluência Suprema (Bayesiano)
        let bestCandidate = null;
        let bestScore = Infinity; // Quanto menor, melhor (ZScore negativo)

        for (const strat of activeStrategies) {
          if (strat.name === "Dynamic: Drop Zone") continue;
          const config = StrategyOrchestrator.getConfig(strat.name);
          const zScore = StrategyOrchestrator.calculateSectorZScore(simulatedHistory, config);
          const markovProb = (StrategyOrchestrator as any).calculateMarkovProbability(simulatedHistory, config);
          
          if (zScore <= -0.85 && markovProb >= ((config.coverage / 37) * 0.75)) {
             const score = (zScore - markovProb) * (strat.bayes_weight || 1.0);
             if (score < bestScore) {
               bestScore = score;
               bestCandidate = strat.name;
             }
          }
        }

        if (bestCandidate) {
          const config = StrategyOrchestrator.getConfig(bestCandidate);
          activeSignal = { strategyName: bestCandidate, amount: minChip * config.minChipsRequired, step: 0, targetWinCheck: config.checkWin, payout: config.payoutRatio };
          stratStats[bestCandidate].signals++;
        }
      }
    }

    // Geração do Relatório Militar
    const netProfit = currentBankroll - initialBankroll;
    const totalConcluded = totalWins + totalLosses;
    const winRate = totalConcluded > 0 ? ((totalWins / totalConcluded) * 100).toFixed(1) : "0.0";
    const finalEntropy = StrategyOrchestrator.calculateShannonEntropy(simulatedHistory.slice(0, 37));

    const report = Object.entries(stratStats)
      .filter(([_, data]) => data.signals > 0)
      .map(([name, data]) => ({
        name,
        signalsSent: data.signals,
        wins: data.wins,
        losses: data.losses,
        profit: data.profit,
        winRate: (data.wins + data.losses) > 0 ? ((data.wins / (data.wins + data.losses)) * 100).toFixed(1) : "0.0"
      }))
      .sort((a, b) => b.profit - a.profit);

    let verdict: "GREEN_LIGHT" | "RED_LIGHT" | "WARNING" = "WARNING";
    if (netProfit > 0 && finalEntropy <= 4.5 && maxDrawdown < (initialBankroll * 0.10)) verdict = "GREEN_LIGHT";
    else if (currentBankroll <= initialBankroll * 0.85 || finalEntropy > 4.6) verdict = "RED_LIGHT";

    return {
      initialBankroll,
      finalBankroll: currentBankroll,
      netProfit,
      winRate,
      totalSignals: totalConcluded,
      maxDrawdown,
      entropyStatus: finalEntropy > 4.6 ? "CAOS" : (finalEntropy > 4.0 ? "VOLÁTIL" : "ESTÁVEL"),
      strategiesReport: report,
      bestStrategy: report.length > 0 ? report[0].name : "N/A",
      worstStrategy: report.length > 0 ? report[report.length - 1].name : "N/A",
      verdict
    };
  }
}
