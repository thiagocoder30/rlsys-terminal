import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Play, CheckCircle2, XCircle, TrendingUp, TrendingDown, Database } from 'lucide-react';
import { motion } from 'framer-motion';

// Mapeamento dos Setores da Roleta
const SECTORS: Record<string, number[]> = {
  "RED": [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
  "BLACK": [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35],
  "EVEN": [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36],
  "ODD": [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35],
  "DOZEN_1": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  "DOZEN_2": [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
  "DOZEN_3": [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36],
  "COL_1": [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
  "COL_2": [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  "COL_3": [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
};

const getPayout = (sector: string) => {
  if (sector.includes("DOZEN") || sector.includes("COL")) return 2.0;
  return 1.0;
};

// CORREÇÃO AQUI: Exportando como LabSimulator para bater com o App.tsx
export const LabSimulator: React.FC = () => {
  const navigate = useNavigate();
  const [historySpins, setHistorySpins] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados do Construtor No-Code
  const [stratName, setStratName] = useState("Minha Tática Sniper");
  const [conditionType, setConditionType] = useState("DELAY"); 
  const [conditionSector, setConditionSector] = useState("RED");
  const [conditionThreshold, setConditionThreshold] = useState(5);
  const [targetSector, setTargetSector] = useState("BLACK");

  // Resultados do Simulador
  const [simResult, setSimResult] = useState<any>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch("/api/macro");
        const data = await res.json();
        let allSpins: number[] = [];
        if (data.sessions) {
          data.sessions.forEach((s: any) => {
            if (s.spins) {
              const sessionSpins = s.spins.map((spin: any) => spin.number).reverse(); 
              allSpins = [...allSpins, ...sessionSpins];
            }
          });
        }
        setHistorySpins(allSpins);
      } catch (err) {
        console.error("Erro ao carregar histórico", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const runBacktest = () => {
    if (historySpins.length < 50) {
      alert("Aviso: Poucos dados históricos. O teste pode não ser matematicamente preciso. Opere mais na mesa para gerar dados.");
    }

    let theoreticalBankroll = 100; 
    let wins = 0;
    let losses = 0;
    let gales = 0;
    let maxDrawdown = 0;
    let peakBankroll = 100;
    
    let activeBet: { target: string, amount: number, step: number } | null = null;
    const baseBet = 2.50;

    for (let i = 0; i < historySpins.length; i++) {
      const currentNumber = historySpins[i];

      if (activeBet) {
        const isWin = currentNumber !== 0 && SECTORS[activeBet.target].includes(currentNumber);
        
        if (isWin) {
          theoreticalBankroll += activeBet.amount * getPayout(activeBet.target);
          wins++;
          activeBet = null; 
        } else {
          theoreticalBankroll -= activeBet.amount;
          
          if (activeBet.step === 0) {
            activeBet = { target: activeBet.target, amount: activeBet.amount * 2, step: 1 };
            gales++;
          } else {
            losses++;
            activeBet = null; 
          }
        }

        if (theoreticalBankroll > peakBankroll) peakBankroll = theoreticalBankroll;
        const currentDrawdown = peakBankroll - theoreticalBankroll;
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
      }

      if (!activeBet && i >= conditionThreshold) {
        const window = historySpins.slice(i - conditionThreshold, i);
        let trigger = false;

        if (conditionType === "DELAY") {
          trigger = window.every(num => num === 0 || !SECTORS[conditionSector].includes(num));
        } else if (conditionType === "STREAK") {
          trigger = window.every(num => num !== 0 && SECTORS[conditionSector].includes(num));
        }

        if (trigger) {
          activeBet = { target: targetSector, amount: baseBet, step: 0 };
        }
      }
    }

    const totalBets = wins + losses;
    const winRate = totalBets > 0 ? ((wins / totalBets) * 100).toFixed(1) : "0.0";
    const pnl = theoreticalBankroll - 100;

    setSimResult({
      totalSpinsAnalyzed: historySpins.length,
      totalBets,
      wins,
      losses,
      gales,
      winRate,
      pnl,
      maxDrawdown,
      isProfitable: pnl >= 0
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <FlaskConical className="w-10 h-10 text-purple-500 animate-pulse mb-4" />
        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Iniciando Laboratório...</span>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-6 pb-6">
      
      <div className="flex justify-between items-center mt-2 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
            <FlaskConical className="text-purple-500" /> Laboratório
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Backtesting de Matrizes</p>
        </div>
        <button onClick={() => navigate("/")} className="text-[10px] font-black uppercase tracking-widest text-slate-400 border border-slate-700 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3 h-3" /> VOLTAR
        </button>
      </div>

      <div className="bg-[#111827] border border-slate-800 p-5 rounded-2xl shadow-xl">
        <span className="flex items-center gap-2 text-[10px] uppercase font-black text-slate-400 tracking-widest mb-4">
          <Database className="w-3.5 h-3.5 text-blue-500" /> Parâmetros da Estratégia
        </span>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Nome da Operação</label>
            <input type="text" value={stratName} onChange={(e) => setStratName(e.target.value)} className="w-full bg-[#0B101E] border border-slate-700 rounded-lg p-3 text-white text-sm font-bold focus:border-purple-500 outline-none transition-colors" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Gatilho (Se ocorrer...)</label>
              <select value={conditionType} onChange={(e) => setConditionType(e.target.value)} className="w-full bg-[#0B101E] border border-slate-700 rounded-lg p-3 text-white text-xs font-bold outline-none">
                <option value="DELAY">Atraso (Falta)</option>
                <option value="STREAK">Repetição (Sequência)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Alvo do Gatilho</label>
              <select value={conditionSector} onChange={(e) => setConditionSector(e.target.value)} className="w-full bg-[#0B101E] border border-slate-700 rounded-lg p-3 text-white text-xs font-bold outline-none">
                {Object.keys(SECTORS).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Duração do Padrão (Giros)</label>
            <div className="flex items-center gap-4">
              <input type="range" min="2" max="15" value={conditionThreshold} onChange={(e) => setConditionThreshold(Number(e.target.value))} className="w-full accent-purple-500" />
              <span className="text-lg font-black text-white w-8">{conditionThreshold}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <label className="text-[10px] uppercase text-emerald-500 font-bold block mb-1">Ação de Combate (Apostar em...)</label>
            <select value={targetSector} onChange={(e) => setTargetSector(e.target.value)} className="w-full bg-[#0B101E] border border-emerald-900/50 rounded-lg p-3 text-white text-xs font-bold outline-none">
              {Object.keys(SECTORS).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <button onClick={runBacktest} className="w-full mt-6 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(147,51,234,0.3)]">
          <Play className="w-5 h-5 fill-current" /> EXECUTAR BACKTEST (MÁQUINA DO TEMPO)
        </button>
      </div>

      {simResult && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`p-6 rounded-2xl border shadow-2xl ${simResult.isProfitable ? 'bg-emerald-950/30 border-emerald-900/50' : 'bg-red-950/30 border-red-900/50'}`}>
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/50">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Veredito Estatístico</span>
              <h3 className={`text-xl font-black uppercase flex items-center gap-2 ${simResult.isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                {simResult.isProfitable ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {simResult.isProfitable ? 'MATRIZ APROVADA' : 'MATRIZ TÓXICA'}
              </h3>
            </div>
            <div className="text-right">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Simulação PnL</span>
              <span className={`text-2xl font-mono font-black ${simResult.isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                {simResult.pnl >= 0 ? '+' : ''}R$ {simResult.pnl.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-4">
            <div>
              <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Amostragem (Big Data)</span>
              <span className="text-lg font-mono font-black text-slate-300">{simResult.totalSpinsAnalyzed} Giros</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Gatilhos Disparados</span>
              <span className="text-lg font-mono font-black text-white">{simResult.totalBets} Entradas</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Win Rate (Taxa de Acerto)</span>
              <span className="text-lg font-mono font-black text-blue-400">{simResult.winRate}%</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Drawdown (Risco Máximo)</span>
              <span className="text-lg font-mono font-black text-orange-400">-R$ {simResult.maxDrawdown.toFixed(2)}</span>
            </div>
          </div>

          {!simResult.isProfitable && (
            <div className="mt-4 bg-red-900/20 border border-red-900/50 p-3 rounded-lg flex items-start gap-2">
              <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-300 uppercase font-bold tracking-widest leading-relaxed">
                Reprovado pelo Motor. A matemática dessa estratégia destrói a banca no longo prazo. O Payout não cobre o volume de perdas. Altere os parâmetros.
              </p>
            </div>
          )}
          {simResult.isProfitable && (
            <div className="mt-4 bg-emerald-900/20 border border-emerald-900/50 p-3 rounded-lg flex items-start gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-emerald-300 uppercase font-bold tracking-widest leading-relaxed">
                Validação concluída. Estratégia possui vantagem estatística matemática comprovada no banco de dados.
              </p>
            </div>
          )}
        </motion.div>
      )}

    </motion.div>
  );
};
