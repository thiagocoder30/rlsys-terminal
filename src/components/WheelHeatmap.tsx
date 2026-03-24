import React from 'react';

// Sequência física exata da Roleta Europeia
const EUROPEAN_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

interface WheelHeatmapProps {
  spins: any[];
}

export const WheelHeatmap: React.FC<WheelHeatmapProps> = ({ spins }) => {
  // Isola os últimos 50 giros para detectar a zona quente ATUAL
  const recentSpins = spins.slice(0, 50).map(s => s.number !== undefined ? s.number : s);
  
  const frequencies: Record<number, number> = {};
  EUROPEAN_WHEEL.forEach(n => frequencies[n] = 0);
  recentSpins.forEach(n => {
    if (frequencies[n] !== undefined) frequencies[n]++;
  });

  const maxFreq = Math.max(...Object.values(frequencies), 1);

  // Motor de Renderização Térmica (Frio -> Quente -> Fervendo)
  const getHeatColor = (freq: number) => {
    if (freq === 0) return 'bg-slate-800'; // Zona Morta
    const intensity = freq / maxFreq;
    if (intensity > 0.7) return 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]'; // Fervendo
    if (intensity > 0.4) return 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]'; // Quente
    return 'bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]'; // Aquecendo
  };

  return (
    <div className="w-full overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <div className="flex items-center gap-1 min-w-max px-1">
        {EUROPEAN_WHEEL.map((num) => {
          const isRed = RED_NUMBERS.includes(num);
          const isZero = num === 0;
          const freq = frequencies[num];
          const heatClass = getHeatColor(freq);

          return (
            <div key={num} className="flex flex-col items-center gap-1.5 w-8">
              {/* Barra de Intensidade Neon */}
              <div className="w-full h-1.5 rounded-full bg-slate-900/50 overflow-hidden border border-slate-800/50">
                 <div className={`h-full w-full ${heatClass} transition-all duration-700`} style={{ opacity: freq > 0 ? 0.5 + (0.5 * (freq/maxFreq)) : 0.1 }}></div>
              </div>
              
              {/* Bloco do Número */}
              <div className={`w-full h-8 rounded flex items-center justify-center text-[11px] font-black border transition-all duration-300 ${
                isZero ? 'bg-emerald-600 border-emerald-500 text-white' : 
                isRed ? 'bg-red-700 border-red-500 text-white' : 
                'bg-slate-900 border-slate-700 text-slate-300'
              } ${freq > 0 ? 'ring-1 ring-offset-1 ring-offset-[#111827] ring-white/20 scale-105' : 'opacity-70'}`}>
                {num}
              </div>

              {/* Frequência Numérica */}
              <span className={`text-[9px] font-mono font-bold ${freq > 0 ? 'text-slate-300' : 'text-slate-700'}`}>
                {freq > 0 ? `${freq}x` : '-'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
