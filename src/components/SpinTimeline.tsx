import React from "react";
import { motion } from "motion/react";

interface Spin {
  id: string;
  number: number;
  color: string;
}

interface SpinTimelineProps {
  spins: Spin[];
}

export const SpinTimeline: React.FC<SpinTimelineProps> = ({ spins }) => {
  return (
    <div className="w-full bg-black/40 border-y border-white/5 py-3">
      <div className="flex px-4 gap-1.5 overflow-x-auto no-scrollbar items-center">
        {spins.map((spin, idx) => (
          <motion.div
            key={spin.id}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className={`
              flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-inner
              ${spin.color === "RED" ? "bg-red-600 shadow-red-900/50" : ""}
              ${spin.color === "BLACK" ? "bg-zinc-900 shadow-black" : ""}
              ${spin.color === "GREEN" ? "bg-emerald-600 shadow-emerald-900/50" : ""}
              ${idx === 0 ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-900 z-10 scale-105" : "opacity-90"}
            `}
          >
            {spin.number}
          </motion.div>
        ))}
        {spins.length === 0 && (
          <div className="text-gray-700 text-[10px] uppercase font-bold tracking-[0.2em] w-full text-center py-2">
            Aguardando Giros...
          </div>
        )}
      </div>
    </div>
  );
};
