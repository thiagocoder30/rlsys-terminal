import React from "react";

interface HeaderStatusProps {
  bankroll: number;
  zScore: number;
  isConnected: boolean;
}

export const HeaderStatus: React.FC<HeaderStatusProps> = ({ bankroll, zScore, isConnected }) => {
  return (
    <div className="grid grid-cols-3 gap-4 p-4 bg-gray-800 border-b border-gray-700">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">Banca Atual</span>
        <span className="text-xl font-bold text-emerald-400">R$ {bankroll.toFixed(2)}</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">Z-Score (Cores)</span>
        <span className={`text-xl font-bold ${Math.abs(zScore) > 2 ? "text-red-500 animate-pulse" : "text-white"}`}>
          {zScore.toFixed(2)}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">Status</span>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-red-500"}`} />
          <span className="text-sm font-medium text-gray-200">{isConnected ? "ONLINE" : "OFFLINE"}</span>
        </div>
      </div>
    </div>
  );
};
