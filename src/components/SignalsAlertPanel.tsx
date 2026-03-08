import { motion, AnimatePresence } from "motion/react";

interface Signal {
  id: string;
  target_bet: string;
  suggested_amount: number;
  result: string;
  created_at: string;
}

interface Props {
  signals: Signal[];
}

export function SignalsAlertPanel({ signals }: Props) {
  // Filtra apenas os sinais da rodada atual que ainda não tiveram resultado
  const activeSignals = signals.filter(s => s.result === "PENDING");

  if (activeSignals.length === 0) {
    return (
      <div className="mt-6 mx-4 bg-gray-900/50 border border-gray-800 rounded-xl p-6 text-center shadow-inner">
        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping mx-auto mb-3" />
        <span className="block text-[10px] uppercase font-black text-gray-500 tracking-[0.2em]">Radar Institucional</span>
        <p className="text-gray-600 text-xs mt-2 font-medium">Aguardando viés estatístico da mesa...</p>
      </div>
    );
  }

  return (
    <div className="mt-6 mx-4 space-y-3">
      <span className="block text-[10px] uppercase font-black text-red-500 tracking-[0.2em] animate-pulse flex items-center gap-2">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
        Oportunidade Detectada
      </span>
      
      <AnimatePresence>
        {activeSignals.map((signal) => (
          <motion.div
            key={signal.id}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-red-950/80 border border-red-500 rounded-2xl p-5 relative overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.2)]"
          >
            {/* Efeito de sirene no fundo */}
            <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none" />
            
            <div className="flex justify-between items-center relative z-10">
              <div>
                <p className="text-[10px] uppercase font-black text-red-400 tracking-widest mb-1">
                  Alvo de Entrada
                </p>
                <p className="text-2xl font-black text-white uppercase tracking-tighter drop-shadow-md">
                  {signal.target_bet.replace(/_/g, " ")}
                </p>
              </div>
              
              <div className="text-right bg-black/40 px-4 py-2 rounded-xl border border-red-500/30">
                <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest mb-1">
                  Aposta (R$)
                </p>
                <p className="text-xl font-bold text-green-400 drop-shadow-md">
                  {signal.suggested_amount.toFixed(2)}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
        }
        
