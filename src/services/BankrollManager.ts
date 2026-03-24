// src/services/BankrollManager.ts

export class BankrollManager {
  /**
   * Calcula a aposta ideal usando Kelly Criterion Fracionário de alta segurança.
   * Protege bancas pequenas e alavanca agressivamente apenas no "Modo Sniper".
   */
  public static calculateSafeBet(
    currentBankroll: number,
    minChip: number,
    baseMultiplier: number,
    winRate: number,
    payoutRatio: number
  ): number {
    const baseBet = minChip * baseMultiplier;

    // 1. ZONA DE SOBREVIVÊNCIA: Risco de ruína alto. Proteção de capital prioritária.
    if (currentBankroll < baseBet * 30) {
      return baseBet;
    }

    // 2. ASSERTIVIDADE MATEMÁTICA: Exige vantagem para alavancar.
    const p = winRate / 100;
    const q = 1 - p;

    // Se a estratégia acerta menos de 65%, é arriscado alavancar na roleta.
    if (p < 0.65) {
      return baseBet;
    }

    // 3. CRITÉRIO DE KELLY CONSERVADOR (10% Kelly)
    // f = p - (q / b) (Onde b é o lucro líquido da aposta)
    const b = payoutRatio > 0 ? payoutRatio : 1;
    const pureKellyFraction = p - (q / b);
    
    // Blindagem Institucional: Usa apenas 10% da banca recomendada pelo Kelly Original
    const safeKellyFraction = pureKellyFraction * 0.10;

    if (safeKellyFraction <= 0) return baseBet;

    let idealBet = currentBankroll * safeKellyFraction;
    
    // 4. ARREDONDAMENTO TÁTICO: Converte para múltiplos exatos de fichas (0.10 ou 0.50)
    let calculatedBet = Math.floor(idealBet / minChip) * minChip;

    // 5. TRAVAS DE TETO E PISO
    if (calculatedBet < baseBet) calculatedBet = baseBet;

    // Stop Loss Natural: NUNCA arrisca mais de 6% da banca em uma entrada normal
    const maxBetLimit = currentBankroll * 0.06;
    if (calculatedBet > maxBetLimit) {
      calculatedBet = Math.floor(maxBetLimit / minChip) * minChip;
    }

    // 6. MODO SNIPER (Vantagem Extrema)
    // Se a taxa de acerto passar de 90% e a banca aguentar, ataca com até 10% da banca
    if (winRate >= 90 && currentBankroll > baseBet * 50) {
        const sniperBet = currentBankroll * 0.10;
        if (calculatedBet < sniperBet) {
            calculatedBet = Math.floor(sniperBet / minChip) * minChip;
        }
    }

    return Number(calculatedBet.toFixed(2));
  }
}
