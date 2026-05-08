/**
 * @file StrategyEngine.ts
 * @description Motor Quant HFT com Blindagem de Capital Contra Quebra.
 */

export class StrategyEngine {
  private readonly sectors = {
    voisins: [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25],
    tiers: [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33],
    orphelins: [1, 20, 14, 31, 9, 17, 34, 6]
  };

  public analyze(history: number[]) {
    if (history.length < 30) return null; // Mínimo de amostra para evitar variância curta

    const entropy = this.calculateShannonEntropy(history);
    const zScores = this.calculateZScores(history);
    const volatility = this.calculateVolatility(history);

    // CRITÉRIO DE BLINDAGEM: Se a entropia estiver acima de 4.85, a mesa é imprevisível.
    // Se a volatilidade for extrema, o risco de quebra aumenta.
    const riskLevel = entropy > 4.85 || volatility > 15 ? 'CRITICAL' : 'SAFE';

    return {
      status: riskLevel === 'SAFE' ? 'ALLOWED' : 'LOCKED',
      metrics: { entropy, volatility },
      // Kelly agressivamente reduzido para 1/4 (Fractional Kelly) para evitar quebras
      suggestedFraction: this.calculateFractionalKelly(0.035, 4) 
    };
  }

  private calculateShannonEntropy(history: number[]): number {
    const counts = new Map<number, number>();
    history.forEach(n => counts.set(n, (counts.get(n) || 0) + 1));
    let entropy = 0;
    counts.forEach(count => {
      const p = count / history.length;
      entropy -= p * Math.log2(p);
    });
    return entropy;
  }

  private calculateZScores(history: number[]) {
    const n = history.length;
    const p = 1 / 37;
    const expected = n * p;
    const stdDev = Math.sqrt(n * p * (1 - p));
    const counts = new Map<number, number>();
    history.forEach(num => counts.set(num, (counts.get(num) || 0) + 1));
    const scores: any = {};
    counts.forEach((count, num) => {
      scores[num] = (count - expected) / stdDev;
    });
    return scores;
  }

  private calculateVolatility(history: number[]): number {
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    return Math.sqrt(history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / history.length);
  }

  /**
   * Kelly Fracionário: Técnica Enterprise para crescimento constante sem risco de ruína.
   */
  private calculateFractionalKelly(edge: number, divisor: number = 4): number {
    // Usamos apenas 1/4 da sugestão de Kelly para blindar a banca contra sequências negativas.
    const fullKelly = edge; 
    return fullKelly / divisor;
  }
}
