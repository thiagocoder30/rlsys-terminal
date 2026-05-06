/**
 * RL.sys - MathEngine Module
 * Motor matemático para inferência estatística e aprendizado Bayesiano.
 */

export interface RouletteStats {
  zScore: number;
  redCount: number;
  blackCount: number;
  totalSpins: number;
}

export class MathEngine {
  // Otimização: Set estático para busca ultra-rápida de cores
  private static readonly RED_NUMBERS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
  ]);

  /**
   * Calcula o Z-Score para a proporção de cores.
   * Ajuda a identificar quando uma cor está em atraso estatístico extremo.
   */
  static calculateZScore(spins: { color: string }[]): number {
    const total = spins.length;
    // Produção: Mínimo de 10 giros para ter relevância estatística
    if (total < 10) return 0;

    const redCount = spins.filter((s) => s.color === "RED").length;
    const p = 18 / 37; // Probabilidade teórica (Roleta Europeia)
    
    const expected = total * p;
    const stdDev = Math.sqrt(total * p * (1 - p));

    if (stdDev === 0) return 0;
    
    const zScore = (redCount - expected) / stdDev;
    return parseFloat(zScore.toFixed(4));
  }

  /**
   * Atualiza o peso Bayesiano de uma estratégia (Reinforcement Learning).
   * Ajusta a confiança do sistema em uma estratégia específica.
   */
  static updateBayesWeight(currentWeight: number, isWin: boolean): number {
    const learningRate = 0.05; // Velocidade de adaptação
    let newWeight: number;

    if (isWin) {
      // Se ganhou, aumenta o peso (aproxima-se de 1.0)
      newWeight = currentWeight + learningRate * (1 - currentWeight);
    } else {
      // Se perdeu, diminui o peso (mínimo de 0.1 para não descartar a estratégia)
      newWeight = currentWeight - learningRate * currentWeight;
    }

    return parseFloat(Math.max(0.1, Math.min(1.0, newWeight)).toFixed(4));
  }

  /**
   * Mapeia as propriedades físicas e matemáticas de um número.
   */
  static getNumberProps(n: number) {
    if (n === 0) {
      return { color: "GREEN", parity: "ZERO", dozen: 0, col: 0 };
    }

    // Busca O(1) usando o Set estático
    const color = this.RED_NUMBERS.has(n) ? "RED" : "BLACK";
    const parity = n % 2 === 0 ? "EVEN" : "ODD";
    
    // Cálculo de dúzias: 1 (1-12), 2 (13-24), 3 (25-36)
    const dozen = Math.ceil(n / 12);
    
    // Cálculo de colunas: 1, 2 ou 3
    const col = n % 3 === 0 ? 3 : n % 3;

    return { color, parity, dozen, col };
  }
}
