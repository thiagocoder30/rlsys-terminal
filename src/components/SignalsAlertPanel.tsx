import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, TrendingUp } from "lucide-react";

interface Signal {
  id: string;
  target_bet: string;
  suggested_amount: number;
  result: string;
}

interface SignalsAlertPanelProps {
  signals: Signal[];
}

export const SignalsAlertPanel: React.FC<SignalsAlertPanelProps> = ({ signals }) => {
  const pendingSignals = signals.filter((s) => s.result === "PENDING");

  return (
    <div className="px-4 py-2 min-h-[80px]">
      <AnimatePresence mode="popLayout">
        {pendingSignals.length > 0 ? (
          pendingSignals.map((signal) => (
            <motion.div
              key={signal.id}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="bg-red-600/20 border-2 border-red-500 rounded-xl p-4 flex items-center justify-between shadow-[0_0_20px_rgba(239,68,68,0.2)] animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="bg-red-500 p-2 rounded-lg">
                  <AlertTriangle className="text-white w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-red-500 font-black text-lg leading-none uppercase">Entrada Confirmada</h3>
                  <p className="text-white font-bold text-xl uppercase">{signal.target_bet}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-gray-400 text-[10px] uppercase block">Sugerido</span>
                <span className="text-2xl font-black text-white">R$ {signal.suggested_amount}</span>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="h-full flex items-center justify-center border border-dashed border-gray-700 rounded-xl opacity-50">
            <div className="flex items-center gap-2 text-gray-500">
              <TrendingUp size={16} />
              <span className="text-xs uppercase tracking-widest">Aguardando Viés Estatístico...</span>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
