import { motion } from "motion/react";

interface Props {
  bankroll: number;
  initialBankroll: number;
  zScore: number;
  isConnected: boolean;
}

export function HeaderStatus({ bankroll, initialBankroll, zScore, isConnected }: Props) {
  // --- ALGORITMO DE RISCO ADAPTATIVO INSTITUCIONAL ---
  let tpPercent = 0.05; // Padrão: 5% (Bancas Grandes)
  let slPercent = 0.07; // Padrão: 7% (Bancas Grandes)

  if (initialBankroll <= 200) {
    tpPercent = 0.10; // 10% de Alvo
    slPercent = 0.15; // 15% de Limite
  } else if (initialBankroll <= 1000) {
    tpPercent = 0.07; // 7% de Alvo
    slPercent = 0.10; // 10% de Limite
  }

  const TAKE_PROFIT_TARGET = initialBankroll * (1 + tpPercent);
  const STOP_LOSS_TARGET = initialBankroll * (1 - slPercent);

  const profitOrLoss = bankroll - initialBankroll;
  const isProfit = profitOrLoss >= 0;

  // Calculando a porcentagem para a barra animada da UI
  let progressPercent = 50; 
  if (isProfit) {
    const profitRange = TAKE_PROFIT_TARGET - initialBankroll;
    progressPercent = 50 + ((profitOrLoss / profitRange) * 50);
  } else {
    const lossRange = initialBankroll - STOP_LOSS_TARGET;
    progressPercent = 50 - ((Math.abs(profitOrLoss) / lossRange) * 50);
  }

  // Travas visuais (mantém a barra entre 0 e 100%)
  progressPercent = Math.max(0, Math.min(100, progressPercent));

  const isStopLossHit = bankroll <= STOP_LOSS_TARGET;
  const isTakeProfitHit = bankroll >= TAKE_PROFIT_TARGET;

  return (
    <div className="p-4 bg-gray-950 border-b border-gray-800 relative overflow-hidden shadow-md">
      {/* Luzes de Alerta Crítico (Kill Switch) */}
      {(isStopLossHit || isTakeProfitHit) && (
        <div className={`absolute inset-0 z-0 opacity-20 animate-pulse ${isTakeProfitHit ? 'bg-green-500' : 'bg-red-600'}`} />
      )}

      <div className="flex justify-between items-start relative z-10">
        <div>
          <span className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-1">
            Banca Atual
          </span>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-black tracking-tighter ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
              R$ {bankroll.toFixed(2)}
            </span>
            <span className={`text-[10px] font-bold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
              ({isProfit ? '+' : ''}{((profitOrLoss / initialBankroll) * 100).toFixed(1)}%)
            </span>
          </div>
        </div>

        <div className="text-right">
          <div className="flex items-center justify-end gap-2 mb-1">
            <span className="block text-[10px] uppercase font-black text-gray-500 tracking-widest">
              Status
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              {isConnected ? "On-line" : "Off-line"}
            </span>
          </div>
          <span className={`text-lg font-black tracking-tighter ${zScore <= -2 || zScore >= 2 ? 'text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'text-gray-400'}`}>
            Z: {zScore.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Régua de Medição de Risco */}
      <div className="mt-5 relative z-10">
        <div className="flex justify-between text-[8px] uppercase font-bold text-gray-500 mb-1 px-1 tracking-widest">
          <span className="text-red-500">Stop (-{(slPercent*100).toFixed(0)}%): R$ {STOP_LOSS_TARGET.toFixed(2)}</span>
          <span className="text-green-500">Meta (+{(tpPercent*100).toFixed(0)}%): R$ {TAKE_PROFIT_TARGET.toFixed(2)}</span>
        </div>
        <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden relative shadow-inner">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600 z-20" />
          
          <motion.div 
            className={`h-full relative z-10 ${isProfit ? 'bg-green-500' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'}`}
            initial={{ width: '50%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, type: "spring" }}
          />
        </div>
      </div>
      
      {/* Alerta de Retirada */}
      {isTakeProfitHit && (
        <div className="mt-3 bg-green-900/40 border border-green-500 p-2 rounded text-center text-[10px] font-black uppercase text-green-400 tracking-widest animate-pulse">
          🎯 Meta Atingida! Encerre a sessão e saque os lucros.
        </div>
      )}
      {isStopLossHit && (
        <div className="mt-3 bg-red-900/40 border border-red-500 p-2 rounded text-center text-[10px] font-black uppercase text-red-400 tracking-widest animate-pulse">
          ⚠️ Stop Loss Atingido! Aborte a operação imediatamente.
        </div>
      )}
    </div>
  );
}
  
