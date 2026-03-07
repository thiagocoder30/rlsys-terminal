/**
 * RL.sys - RaceTrack Strategies Module
 * Engenharia de Algoritmos Financeiros aplicada à Topologia da Roleta.
 */

export class RaceTrackStrategies {
  /**
   * Sequência oficial da Roda da Roleta Europeia (Racetrack).
   */
  static readonly WHEEL_SEQUENCE = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
  ];

  /**
   * Conjunto de Cobertura (Coverage Set) para a estratégia Vizinhos 1 & 21.
   * Abrange 26 números (~70.27% da mesa).
   */
  static readonly COVERAGE_SET_26 = [
    26, 0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18
  ];

  /**
   * Avalia se o gatilho cirúrgico para a estratégia Vizinhos 1 & 21 foi ativado.
   * 
   * @param recentSpins Histórico de números (do mais antigo para o mais recente).
   * @returns boolean True se as condições de regressão à média forem atendidas.
   */
  static evaluateVizinhos1e21(recentSpins: number[]): boolean {
    if (recentSpins.length < 20) return false;

    // 1. Identificar os últimos 2 giros
    const lastTwo = recentSpins.slice(-2);
    
    // 2. Verificar se ambos caíram na "Zona de Loss" (números que NÃO estão no Coverage Set)
    const bothInLossZone = lastTwo.every(n => !this.COVERAGE_SET_26.includes(n));
    
    if (!bothInLossZone) return false;

    // 3. Validação Auxiliar: Hit Rate nos últimos 20 giros
    // O hit rate teórico é 26/37 = 70.27%. 
    // Se estiver abaixo de 60% (12 hits em 20), a zona está estatisticamente "fria".
    const lastTwenty = recentSpins.slice(-20);
    const hits = lastTwenty.filter(n => this.COVERAGE_SET_26.includes(n)).length;
    const hitRate = (hits / 20) * 100;

    // Gatilho: 2 Loss seguidos + Hit Rate < 60% (Regressão à Média iminente)
    return hitRate < 60;
  }
}
