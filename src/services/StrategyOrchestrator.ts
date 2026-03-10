import { PrismaClient, Strategy, Session } from "@prisma/client";

const prisma = new PrismaClient();

export class StrategyOrchestrator {
  
  public static evaluateStrategyHeat(history: number[], strategyName: string): number {
    if (history.length < 20) return 50.0; 

    const recentHistory = history.slice(0, 20); 
    let hits = 0;

    recentHistory.forEach((num) => {
      if (strategyName.includes("Vizinhos") && this.isVizinhança(num)) hits++;
      if (strategyName.includes("James Bond") && this.isJamesBond(num)) hits++;
    });

    return (hits / recentHistory.length) * 100;
  }

  // --- MOTOR DE GESTÃO DE RISCO (KELLY CRITERION FRACIONADO) ---
  private static calculateSafeBet(winRatePct: number, payoutRatio: number, bankroll: number, minChip: number): number {
    const w = winRatePct / 100; 
    
    let kellyFraction = w - ((1 - w) / payoutRatio);

    if (kellyFraction <= 0) return minChip; 

    const safeFraction = kellyFraction / 4;

    const finalFraction = Math.min(safeFraction, 0.03);

    const rawBet = bankroll * finalFraction;

    const steps = Math.max(1, Math.round(rawBet / minChip));
    return steps * minChip;
  }

  private static isVizinhança(num: number): boolean {
    const vizinhosZero = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25];
    return vizinhosZero.includes(num);
  }

  private static isJamesBond(num: number): boolean {
    return (num >= 13 && num <= 36) || num === 0;
  }

  public static async analyzeMarket(spinNumbersTimeline: number[], activeStrategies: Strategy[], session: Session) {
    if (spinNumbersTimeline.length < 5) return; 

    for (const strategy of activeStrategies) {
      const winRate = this.evaluateStrategyHeat(spinNumbersTimeline, strategy.name);
      
      if (winRate < 25) continue; 

      let triggerSignal = false;
      let targetBet = "";
      let payoutRatio = 1.0; 

      if (strategy.name.includes("Vizinhos")) {
        const last1 = spinNumbersTimeline[0];
        const last2 = spinNumbersTimeline[1];
        if (!this.isVizinhança(last1) && !this.isVizinhança(last2)) {
          triggerSignal = true;
          targetBet = "CUSTOM_SECTOR_1_21"; 
          payoutRatio = 1.12; 
        }
      }

      if (strategy.name.includes("James Bond")) {
        const baixos = spinNumbersTimeline.slice(0, 3).filter(n => n >= 1 && n <= 12).length;
        if (baixos === 3) {
          triggerSignal = true;
          targetBet = "JAMES_BOND_SET";
          payoutRatio = 0.44; 
        }
      }

      if (triggerSignal) {
        const existingSignal = await prisma.signal.findFirst({
          where: { session_id: session.id, strategy_id: strategy.id, result: "PENDING" }
        });

        if (!existingSignal) {
          const suggestedAmount = this.calculateSafeBet(winRate, payoutRatio, session.current_bankroll, session.min_chip);

          await prisma.signal.create({
            data: {
              session_id: session.id,
              strategy_id: strategy.id,
              target_bet: targetBet,
              suggested_amount: suggestedAmount,
              result: "PENDING"
            }
          });
          console.log(`[RISK MANAGEMENT] Kelly sugeriu R$ ${suggestedAmount.toFixed(2)} para ${strategy.name}`);
        }
      }
    }
  }
      }
