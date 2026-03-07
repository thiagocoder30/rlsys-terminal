import { RaceTrackStrategies } from "./RaceTrackStrategies";

export interface RouletteStats {
  zScore: number;
  redCount: number;
  blackCount: number;
  totalSpins: number;
}

export class MathEngine {
  /**
   * Calcula o Z-Score contínuo para a proporção de cores (Vermelho vs Preto).
   * Z = (Observed - Expected) / StandardDeviation
   * Para cores na Roleta Europeia: p = 18/37
   */
  static calculateZScore(spins: { color: string }[]): number {
    const total = spins.length;
    if (total < 10) return 0;

    const redCount = spins.filter((s) => s.color === "RED").length;
    const p = 18 / 37; // Probabilidade teórica
    const expected = total * p;
    const stdDev = Math.sqrt(total * p * (1 - p));

    if (stdDev === 0) return 0;
    return (redCount - expected) / stdDev;
  }

  /**
   * Atualiza o peso Bayesiano de uma estratégia com base no resultado.
   * Usamos uma abordagem de aprendizado por reforço simples.
   */
  static updateBayesWeight(currentWeight: number, isWin: boolean): number {
    const learningRate = 0.05;
    if (isWin) {
      return Math.min(1.0, currentWeight + learningRate * (1 - currentWeight));
    } else {
      return Math.max(0.1, currentWeight - learningRate * currentWeight);
    }
  }

  /**
   * Determina as propriedades de um número de roleta europeia.
   */
  static getNumberProps(n: number) {
    if (n === 0) return { color: "GREEN", parity: "ZERO", dozen: 0, col: 0 };

    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const color = redNumbers.includes(n) ? "RED" : "BLACK";
    const parity = n % 2 === 0 ? "EVEN" : "ODD";
    const dozen = Math.ceil(n / 12);
    const col = n % 3 === 0 ? 3 : n % 3;

    return { color, parity, dozen, col };
  }
}
