/**
 * RL.sys - Gerenciador de Banca
 * Responsável por calcular o valor das apostas usando o Critério de Kelly Fracionário.
 */

export class BankrollManager {
  /**
   * Calcula a aposta ideal com blindagem institucional e arredondamento tático.
   * * @param currentBankroll Saldo atual da sessão.
   * @param minChip Valor da menor ficha permitida na mesa (ex: 0.10, 0.50).
   * @param baseMultiplier Quantidade de fichas que a estratégia exige (ex: 26 fichas).
   * @param winRate Taxa de acerto atual da estratégia (0-100).
   * @param payoutRatio Razão de lucro líquido (ex: 10/26 ou 1.2).
   * @returns O valor em dinheiro a ser apostado.
   */
  public static calculateSafeBet(
    currentBankroll: number,
    minChip: number,
    baseMultiplier: number,
    winRate: number,
    payoutRatio: number
  ): number {
    // PROTEÇÃO: Garante que o minChip nunca seja zero para evitar erros matemáticos
    const safeMinChip = minChip <= 0 ? 0.10 : minChip;
    const baseBet = safeMinChip * baseMultiplier;

    // 1. ZONA DE SOBREVIVÊNCIA: Se a banca for menor que 30x a aposta base, não arrisca.
    if (currentBankroll < baseBet * 30) {
      return baseBet;
    }

    const p = winRate / 100;
    const q = 1 - p;

    // 2. ASSERTIVIDADE MÍNIMA: Exige pelo menos 65% de confiança para alavancar.
    if (p < 0.65) {
      return baseBet;
    }

    // 3. CRITÉRIO DE KELLY CONSERVADOR (10% do Kelly Original)
    const b = payoutRatio > 0 ? payoutRatio : 1;
    const pureKellyFraction = p - (q / b);
    const safeKellyFraction = pureKellyFraction * 0.10;

    // Se o Kelly resultar em valor negativo ou zero, volta para aposta mínima.
    if (safeKellyFraction <= 0) return baseBet;

    let idealBet = currentBankroll * safeKellyFraction;
    
    // 4. ARREDONDAMENTO TÁTICO: Garante que o valor seja múltiplo exato das fichas da mesa.
    let calculatedBet = Math.floor(idealBet / safeMinChip) * safeMinChip;

    // 5. TRAVAS DE SEGURANÇA (PISO E TETO)
    if (calculatedBet < baseBet) calculatedBet = baseBet;

    // Stop Loss por Entrada: Nunca arrisca mais de 6% da banca em uma única jogada.
    const maxBetLimit = currentBankroll * 0.06;
    if (calculatedBet > maxBetLimit) {
      calculatedBet = Math.floor(maxBetLimit / safeMinChip) * safeMinChip;
    }

    // 6. MODO SNIPER: Alavancagem agressiva para cenários de altíssima probabilidade (>90%).
    if (winRate >= 90 && currentBankroll > baseBet * 50) {
        const sniperBet = currentBankroll * 0.10;
        if (calculatedBet < sniperBet) {
            calculatedBet = Math.floor(sniperBet / safeMinChip) * safeMinChip;
        }
    }

    // Retorno formatado para evitar dízimas infinitas do JavaScript (ex: 10.000000004)
    return parseFloat(calculatedBet.toFixed(2));
  }
}
