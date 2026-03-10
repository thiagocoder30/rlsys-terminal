import { PrismaClient, Strategy } from "@prisma/client";

const prisma = new PrismaClient();

export class StrategyOrchestrator {
  // --- MOTOR DE AUTO-TUNING (Obrigatoriamente PUBLIC para a interface ler) ---
  public static evaluateStrategyHeat(history: number[], strategyName: string): boolean {
    if (history.length < 20) return true; 

    const recentHistory = history.slice(0, 20); 
    let hits = 0;

    recentHistory.forEach((num) => {
      if (strategyName.includes("Vizinhos") && this.isVizinhança(num)) hits++;
      if (strategyName.includes("James Bond") && this.isJamesBond(num)) hits++;
    });

    const winRate = (hits / recentHistory.length) * 100;

    if (winRate < 25) {
      console.log(`[AUTO-TUNING] 📉 Estratégia '${strategyName}' suspensa (WinRate: ${winRate}%).`);
      return false; 
    }

    console.log(`[AUTO-TUNING] 📈 Estratégia '${strategyName}' ativa (WinRate: ${winRate}%).`);
    return true;
  }

  private static isVizinhança(num: number): boolean {
    const vizinhosZero = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25];
    return vizinhosZero.includes(num);
  }

  private static isJamesBond(num: number): boolean {
    return (num >= 13 && num <= 36) || num === 0;
  }

  public static async analyzeMarket(spinNumbersTimeline: number[], activeStrategies: Strategy[]) {
    if (spinNumbersTimeline.length < 5) return; 

    const session = await prisma.session.findFirst({ where: { status: "ACTIVE" } });
    if (!session) return;

    for (const strategy of activeStrategies) {
      const isHot = this.evaluateStrategyHeat(spinNumbersTimeline, strategy.name);
      
      if (!isHot) continue; 

      let triggerSignal = false;
      let targetBet = "";

      if (strategy.name.includes("Vizinhos")) {
        const last1 = spinNumbersTimeline[0];
        const last2 = spinNumbersTimeline[1];
        if (!this.isVizinhança(last1) && !this.isVizinhança(last2)) {
          triggerSignal = true;
          targetBet = "CUSTOM_SECTOR_1_21"; 
        }
      }

      if (strategy.name.includes("James Bond")) {
        const baixos = spinNumbersTimeline.slice(0, 3).filter(n => n >= 1 && n <= 12).length;
        if (baixos === 3) {
          triggerSignal = true;
          targetBet = "JAMES_BOND_SET";
        }
      }

      if (triggerSignal) {
        const existingSignal = await prisma.signal.findFirst({
          where: { session_id: session.id, strategy_id: strategy.id, result: "PENDING" }
        });

        if (!existingSignal) {
          await prisma.signal.create({
            data: {
              session_id: session.id,
              strategy_id: strategy.id,
              target_bet: targetBet,
              suggested_amount: (session.current_bankroll * 0.01), 
              result: "PENDING"
            }
          });
        }
      }
    }
  }
                          }
      
