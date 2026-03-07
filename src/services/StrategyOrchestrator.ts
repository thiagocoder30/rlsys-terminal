import { RaceTrackStrategies } from "./RaceTrackStrategies";

/**
 * RL.sys - Strategy Orchestrator
 * Arquiteto de Software Financeiro & Data Scientist
 * 
 * Centraliza a inteligência probabilística e orquestra a execução de múltiplas estratégias.
 */

export interface StrategyResult {
  strategyId: string;
  strategyName: string;
  score: number;
  targetBet: string;
  confidence: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export class StrategyOrchestrator {
  // --- DEFINIÇÕES DE COBERTURA (Arrays Exatos Obrigatórios) ---
  
  static readonly FUSION_COVERAGE = [17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 28, 12, 35, 3, 26];
  static readonly JAMES_BOND_COVERAGE = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36];
  static readonly VIZINHOS_1_21_COVERAGE = RaceTrackStrategies.COVERAGE_SET_26;

  static getCoverage(strategyName: string): number[] {
    if (strategyName.includes("Fusion")) return this.FUSION_COVERAGE;
    if (strategyName.includes("James Bond")) return this.JAMES_BOND_COVERAGE;
    if (strategyName.includes("Vizinhos 1 & 21")) return this.VIZINHOS_1_21_COVERAGE;
    return [];
  }

  static getTargetBet(strategyName: string): string {
    if (strategyName.includes("Fusion")) return "FUSION_ZONE";
    if (strategyName.includes("James Bond")) return "JAMES_BOND_SET";
    if (strategyName.includes("Vizinhos 1 & 21")) return "CUSTOM_SECTOR_1_21";
    return "STRAIGHT_UP";
  }

  /**
   * Analisa o mercado e retorna a melhor oportunidade estatística.
   * 
   * @param recentSpins Histórico de giros (Antigo -> Novo)
   * @param activeStrategies Estratégias vindas do banco de dados (com bayes_weight)
   */
  static analyzeMarket(recentSpins: number[], activeStrategies: any[]): StrategyResult | null {
    if (recentSpins.length < 10) return null;

    const evaluations: StrategyResult[] = [];
    const THRESHOLD_CRITICAL = 75;

    for (const strategy of activeStrategies) {
      const coverage = this.getCoverage(strategy.name);
      if (coverage.length === 0) continue;

      // 1. CÁLCULO DE HIT/MISS (Janela Micro e Macro)
      const lastTen = recentSpins.slice(-10);
      const lastTwenty = recentSpins.slice(-20);
      
      const hitsTen = lastTen.filter(n => coverage.includes(n)).length;
      const hitsTwenty = lastTwenty.filter(n => coverage.includes(n)).length;
      
      const hitRateTen = (hitsTen / 10);
      const hitRateTwenty = (hitsTwenty / 20);

      // 2. SCORE DE ANOMALIA (Z-Score Simplificado / Regressão à Média)
      // Contamos perdas consecutivas imediatas
      let consecutiveLosses = 0;
      for (let i = recentSpins.length - 1; i >= 0; i--) {
        if (!coverage.includes(recentSpins[i])) {
          consecutiveLosses++;
        } else {
          break;
        }
      }

      let anomalyScore = 0;
      if (consecutiveLosses === 1) anomalyScore = 20;
      if (consecutiveLosses === 2) anomalyScore = 60;
      if (consecutiveLosses >= 3) anomalyScore = 100;

      // Se a taxa de acerto recente está muito abaixo da teórica, aumentamos o score
      const theoreticalProb = coverage.length / 37;
      const deviation = theoreticalProb - hitRateTwenty;
      const deviationScore = Math.max(0, deviation * 100);

      // 3. FILTRO BAYESIANO
      // O peso bayesiano (0.1 a 1.0) modula a confiança baseada no histórico de acertos da estratégia
      const rawScore = (anomalyScore * 0.7) + (deviationScore * 0.3);
      const finalScore = rawScore * (strategy.bayes_weight || 0.5) * 2; // Normalizado para escala ~100

      // 4. DETERMINAÇÃO DE CONFIANÇA
      let confidence: StrategyResult["confidence"] = "LOW";
      if (finalScore > 40) confidence = "MEDIUM";
      if (finalScore > 65) confidence = "HIGH";
      if (finalScore > THRESHOLD_CRITICAL) confidence = "CRITICAL";

      evaluations.push({
        strategyId: strategy.id,
        strategyName: strategy.name,
        score: finalScore,
        targetBet: this.getTargetBet(strategy.name),
        confidence
      });
    }

    // Retornar a estratégia com maior pontuação
    if (evaluations.length === 0) return null;

    const winner = evaluations.reduce((prev, current) => (prev.score > current.score) ? prev : current);

    // Só sugerimos se houver confiança mínima (Threshold de Mercado)
    if (winner.score < 50) return null;

    return winner;
  }
}
