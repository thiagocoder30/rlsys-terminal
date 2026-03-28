import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Play, CheckCircle2, XCircle, TrendingUp, TrendingDown, Database, Target, ShieldCheck, AlertTriangle, UploadCloud, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ==========================================
// CONSTANTES E MATEMÁTICA FÍSICA
// ==========================================
const EUROPEAN_WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const BASE_SECTORS: Record<string, number[]> = {
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
  "VOISINS": [22,18,29,7,28,12,35,3,26,0,32,15,19,4,21,2,25],
  "TIERS": [27,13,36,11,30,8,23,10,5,24,16,33]
};

const getNeighbors = (center: number, distance: number): number[] => {
  const idx = EUROPEAN_WHEEL.indexOf(center);
  if (idx === -1) return [];
  const res: number[] = [];
  for (let i = -distance; i <= distance; i++) {
    res.push(EUROPEAN_WHEEL[(idx + i + 37) % 37]);
  }
  return res;
};

const calculateEntropy = (spins: number[]) => {
  if (!spins || spins.length < 10) return 0;
  const sample = spins.slice(0, 37);
  const counts: Record<number, number> = {};
  sample.forEach(n => counts[n] = (counts[n] || 0) + 1);
  let entropy = 0;
  for (const key in counts) {
    const p = counts[key] / sample.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
};

export const LabSimulator: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'VALIDATOR' | 'BACKTEST'>('VALIDATOR');

  // --- ESTADOS DO BACKTESTER ---
  const [historySpins, setHistorySpins] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [stratName, setStratName] = useState("Alpha Sniper");
  const [conditionType, setConditionType] = useState("DELAY");
  const [conditionSector, setConditionSector] = useState("RED");
  const [conditionCenter, setConditionCenter] = useState(0);
  const [conditionDistance, setConditionDistance] = useState(2);
  const [conditionThreshold, setConditionThreshold] = useState(5);
  const [targetSector, setTargetSector] = useState("BLACK");
  const [targetCenter, setTargetCenter] = useState(0);
  const [targetDistance, setTargetDistance] = useState(2);
  const [baseBet, setBaseBet] = useState(0.50);
  const [simResult, setSimResult] = useState<any>(null);

  // --- ESTADOS DO VALIDADOR OCR (DRONE) ---
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [validatorResult, setValidatorResult] = useState<any>(null);

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
      } catch (err) { console.error("Erro histórico", err); } finally { setLoading(false); }
    };
    fetchHistory();
  }, []);

  // Motor Dinâmico do Backtest
  const getDynamicSector = (sectorType: string, center: number, distance: number) => {
    if (sectorType === "VIZINHOS") return getNeighbors(center, distance);
    return BASE_SECTORS[sectorType] || [];
  };

  const getDynamicPayout = (sectorType: string, distance: number) => {
    if (sectorType.includes("DOZEN") || sectorType.includes("COL") || sectorType === "TIERS") return 2.0;
    if (sectorType === "VIZINHOS") return 36 / ((distance * 2) + 1);
    if (sectorType === "VOISINS") return 36 / 17;
    return 1.0; 
  };

  const runBacktest = () => {
    if (historySpins.length < 50) alert("Aviso: Poucos dados históricos no banco de dados.");

    let theoreticalBankroll = 100; 
    let wins = 0; let losses = 0; let gales = 0;
    let maxDrawdown = 0; let peakBankroll = 100;
    let activeBet: { targetArr: number[], payout: number, amount: number, step: number } | null = null;

    const conditionArr = getDynamicSector(conditionSector, conditionCenter, conditionDistance);
    const targetArr = getDynamicSector(targetSector, targetCenter, targetDistance);
    const payoutRatio = getDynamicPayout(targetSector, targetDistance);

    for (let i = 0; i < historySpins.length; i++) {
      const currentNumber = historySpins[i];

      if (activeBet) {
        const isWin = activeBet.targetArr.includes(currentNumber);
        if (isWin) {
          theoreticalBankroll += activeBet.amount * activeBet.payout;
          wins++; activeBet = null; 
        } else {
          theoreticalBankroll -= activeBet.amount;
          if (activeBet.step === 0) {
            activeBet = { ...activeBet, amount: activeBet.amount * 2, step: 1 };
            gales++;
          } else {
            losses++; activeBet = null; 
          }
        }
        if (theoreticalBankroll > peakBankroll) peakBankroll = theoreticalBankroll;
        const currentDrawdown = peakBankroll - theoreticalBankroll;
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
      }

      if (!activeBet && i >= conditionThreshold) {
        const window = historySpins.slice(i - conditionThreshold, i);
        let trigger = false;
        if (conditionType === "DELAY") trigger = window.every(num => num === 0 || !conditionArr.includes(num));
        else if (conditionType === "STREAK") trigger = window.every(num => num !== 0 && conditionArr.includes(num));

        if (trigger) {
          const cost = targetSector === "VIZINHOS" ? ((targetDistance * 2) + 1) * baseBet : baseBet;
          activeBet = { targetArr, payout: payoutRatio, amount: cost, step: 0 };
        }
      }
    }

    const totalBets = wins + losses;
    const winRate = totalBets > 0 ? ((wins / totalBets) * 100).toFixed(1) : "0.0";
    const pnl = theoreticalBankroll - 100;

    setSimResult({ totalSpinsAnalyzed: historySpins.length, totalBets, wins, losses, gales, winRate, pnl, maxDrawdown, isProfitable: pnl >= 0 });
  };

  // ==========================================
  // MOTOR DE RECONHECIMENTO DE MESA (OCR + FILTRO)
  // ==========================================
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsAnalyzing(true);
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/vision/analyze-table", { method: "POST", body: formData });
      const data = await res.json();
      
      if (!data.numbers || data.numbers.length < 5) {
        alert("Erro OCR: A IA não conseguiu extrair números suficientes da imagem. Certifique-se de printar o histórico da roleta.");
        setIsAnalyzing(false);
        return;
      }
      
      evaluateTableData(data.numbers);
    } catch (err) {
      console.error("Erro na API do OCR", err);
      alert("Falha de Conexão com o Servidor de Visão. Verifique os logs do backend.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const evaluateTableData = (numbersExtracted: number[]) => {
    const entropy = calculateEntropy(numbersExtracted);
    
    // Filtro Darwiniano
    const approvedStrats: { name: string, winRate: number }[] = [];
    const rejectedStrats: { name: string, winRate: number }[] = [];

    Object.entries(BASE_SECTORS).forEach(([name, arr]) => {
        let hits = 0; let trials = 0;
        for (let i = 0; i < numbersExtracted.length - 4; i++) {
            const window = numbersExtracted.slice(i, i+3);
            const delayed = window.every(n => n === 0 || !arr.includes(n));
            if (delayed) {
                trials++;
                const hit1 = arr.includes(numbersExtracted[i+3]);
                const hit2 = arr.includes(numbersExtracted[i+4]); // Com 1 Gale
                if (hit1 || hit2) hits++;
            }
        }
        
        if (trials > 0) {
            const wr = (hits / trials) * 100;
            if (wr >= 60) approvedStrats.push({ name, winRate: wr });
            else rejectedStrats.push({ name, winRate: wr });
        }
    });

    let isApproved = false;
    let reason = "";

    if (entropy > 4.4) {
        reason = "Entropia Crítica (Mesa Caótica). Padrões destruídos pelo RNG.";
    } else if (approvedStrats.length === 0) {
        reason = "Mesa Hostil. Nenhuma matriz sobreviveu ao teste nesta amostra.";
    } else if (approvedStrats.length >= 2) {
        isApproved = true;
        reason = "Múltiplas matrizes em ressonância. Vantagem Matemática Confirmada.";
    } else {
        reason = "Apenas uma matriz sobreviveu. Risco alto de dependência única.";
    }

    setValidatorResult({
        numbers: numbersExtracted,
        entropy,
        isApproved,
        reason,
        approvedStrats,
        rejectedStrats
    });
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <FlaskConical className="w-10 h-10 text-purple-500 animate-pulse mb-4" />
      <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Iniciando Laboratório...</span>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-6 pb-6">
      
      <div className="flex justify-between items-center mt-2 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
            <FlaskConical className="text-purple-500" /> Laboratório
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Complexo de Testes</p>
        </div>
        <button onClick={() => navigate("/")} className="text-[10px] font-black uppercase tracking-widest text-slate-400 border border-slate-700 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3 h-3" /> VOLTAR
        </button>
      </div>

      <div className="flex p-1 bg-[#0B101E] rounded-xl border border-slate-800">
        <button onClick={() => setActiveTab('VALIDATOR')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'VALIDATOR' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Validador de Mesa</button>
        <button onClick={() => setActiveTab('BACKTEST')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'BACKTEST' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Máquina do Tempo</button>
      </div>

      <AnimatePresence mode="wait">
        
        {/* ========================================== */}
        {/* ABA 1: VALIDADOR OCR DE MESA (O DRONE) */}
        {/* ========================================== */}
        {activeTab === 'VALIDATOR' && (
          <motion.div key="validator" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
            
            <div className="bg-[#111827] border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col items-center text-center">
              <span className="flex items-center gap-2 text-[10px] uppercase font-black text-blue-400 tracking-widest mb-2">
                <Target className="w-4 h-4" /> Reconhecimento de Terreno
              </span>
              <p className="text-xs text-slate-400 font-medium mb-6">Faça o upload do print com o histórico da roleta para a IA avaliar o risco da mesa instantaneamente (Consumo Flash On-Demand).</p>

              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ocr-upload" disabled={isAnalyzing} />
              <label htmlFor="ocr-upload" className={`w-full py-6 rounded-xl border-2 border-dashed font-black uppercase tracking-widest flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${isAnalyzing ? 'bg-blue-900/20 border-blue-500/50 text-blue-400' : 'bg-[#0B101E] border-slate-700 text-slate-400 hover:border-blue-500 hover:text-blue-500'}`}>
                {isAnalyzing ? <Cpu className="w-8 h-8 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
                {isAnalyzing ? 'Processando Visão Computacional...' : 'ENVIAR PRINT DA ROLETA'}
              </label>
            </div>

            {validatorResult && (
              <div className={`p-6 rounded-2xl border shadow-xl ${validatorResult.isApproved ? 'bg-emerald-950/30 border-emerald-500' : 'bg-red-950/30 border-red-500'}`}>
                <div className="text-center border-b border-slate-800/50 pb-5 mb-5">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Veredito da Inteligência</span>
                  {validatorResult.isApproved ? (
                     <h3 className="text-2xl font-black text-emerald-400 uppercase flex items-center justify-center gap-2"><ShieldCheck className="w-6 h-6" /> GO - MESA APROVADA</h3>
                  ) : (
                     <h3 className="text-2xl font-black text-red-400 uppercase flex items-center justify-center gap-2"><AlertTriangle className="w-6 h-6" /> NO GO - MESA HOSTIL</h3>
                  )}
                  <p className="text-xs font-bold uppercase tracking-widest mt-3 text-slate-300">{validatorResult.reason}</p>
                </div>

                <div className="flex justify-between items-center bg-[#0B101E] p-4 rounded-xl border border-slate-800 mb-5">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Entropia (Índice VIX)</span>
                  <span className={`text-xl font-black font-mono ${validatorResult.entropy > 4.2 ? 'text-red-400' : 'text-emerald-400'}`}>{validatorResult.entropy.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-900/50 p-4 rounded-xl border border-emerald-900/50">
                     <span className="text-[10px] uppercase font-black text-emerald-500 tracking-widest flex items-center gap-1 mb-3"><CheckCircle2 className="w-3 h-3" /> Matrizes Assertivas</span>
                     <div className="space-y-2">
                       {validatorResult.approvedStrats.length === 0 && <span className="text-[10px] text-slate-500">Nenhuma matriz sobreviveu.</span>}
                       {validatorResult.approvedStrats.map((s:any, idx:number) => (
                         <div key={idx} className="flex justify-between items-center">
                           <span className="text-xs font-bold text-slate-300">{s.name}</span>
                           <span className="text-[10px] font-mono font-black text-emerald-400">{s.winRate.toFixed(0)}% WR</span>
                         </div>
                       ))}
                     </div>
                   </div>

                   <div className="bg-slate-900/50 p-4 rounded-xl border border-red-900/50 opacity-80">
                     <span className="text-[10px] uppercase font-black text-red-500 tracking-widest flex items-center gap-1 mb-3"><XCircle className="w-3 h-3" /> Matrizes Reprovadas</span>
                     <div className="space-y-2">
                       {validatorResult.rejectedStrats.length === 0 && <span className="text-[10px] text-slate-500">Nenhuma.</span>}
                       {validatorResult.rejectedStrats.map((s:any, idx:number) => (
                         <div key={idx} className="flex justify-between items-center">
                           <span className="text-[10px] font-bold text-slate-500">{s.name}</span>
                           <span className="text-[9px] font-mono font-black text-red-400/70">{s.winRate.toFixed(0)}% WR</span>
                         </div>
                       ))}
                     </div>
                   </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ========================================== */}
        {/* ABA 2: CONSTRUTOR NO-CODE (BACKTEST) */}
        {/* ========================================== */}
        {activeTab === 'BACKTEST' && (
          <motion.div key="backtest" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
            <div className="bg-[#111827] border border-slate-800 p-5 rounded-2xl shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <span className="flex items-center gap-2 text-[10px] uppercase font-black text-slate-400 tracking-widest"><Database className="w-3.5 h-3.5 text-blue-500" /> Matriz Dinâmica</span>
                <select value={baseBet} onChange={(e) => setBaseBet(Number(e.target.value))} className="bg-[#0B101E] border border-blue-900/50 text-blue-400 text-[10px] font-black rounded px-2 py-1 outline-none">
                  <option value={0.10}>Ficha: R$ 0.10</option>
                  <option value={0.50}>Ficha: R$ 0.50</option>
                  <option value={1.00}>Ficha: R$ 1.00</option>
                  <option value={2.50}>Ficha: R$ 2.50</option>
                </select>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Gatilho (Ocorrência)</label>
                    <select value={conditionType} onChange={(e) => setConditionType(e.target.value)} className="w-full bg-[#0B101E] border border-slate-700 rounded-lg p-3 text-white text-xs font-bold outline-none">
                      <option value="DELAY">Atraso (Falta)</option>
                      <option value="STREAK">Repetição (Sequência)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Alvo do Gatilho</label>
                    <select value={conditionSector} onChange={(e) => setConditionSector(e.target.value)} className="w-full bg-[#0B101E] border border-slate-700 rounded-lg p-3 text-white text-xs font-bold outline-none">
                      <option value="VIZINHOS">📌 VIZINHOS FÍSICOS</option>
                      {Object.keys(BASE_SECTORS).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                {conditionSector === "VIZINHOS" && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-purple-900/20 border border-purple-900/50 rounded-xl">
                    <div>
                      <label className="text-[10px] uppercase text-purple-400 font-bold block mb-1">Nº Central</label>
                      <input type="number" min="0" max="36" value={conditionCenter} onChange={(e) => setConditionCenter(Number(e.target.value))} className="w-full bg-[#0B101E] border border-slate-700 rounded-lg p-2 text-white text-center font-bold" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-purple-400 font-bold block mb-1">Distância (Lados)</label>
                      <input type="number" min="1" max="5" value={conditionDistance} onChange={(e) => setConditionDistance(Number(e.target.value))} className="w-full bg-[#0B101E] border border-slate-700 rounded-lg p-2 text-white text-center font-bold" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Duração do Padrão (Giros)</label>
                  <div className="flex items-center gap-4">
                    <input type="range" min="2" max="15" value={conditionThreshold} onChange={(e) => setConditionThreshold(Number(e.target.value))} className="w-full accent-purple-500" />
                    <span className="text-lg font-black text-white w-8">{conditionThreshold}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800/80">
                  <label className="text-[10px] uppercase text-emerald-500 font-bold block mb-1">Ação de Combate (Atirar em...)</label>
                  <select value={targetSector} onChange={(e) => setTargetSector(e.target.value)} className="w-full bg-[#0B101E] border border-emerald-900/50 rounded-lg p-3 text-white text-xs font-bold outline-none">
                    <option value="VIZINHOS">📌 VIZINHOS FÍSICOS</option>
                    {Object.keys(BASE_SECTORS).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {targetSector === "VIZINHOS" && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-emerald-900/20 border border-emerald-900/50 rounded-xl">
                    <div>
                      <label className="text-[10px] uppercase text-emerald-400 font-bold block mb-1">Nº Central</label>
                      <input type="number" min="0" max="36" value={targetCenter} onChange={(e) => setTargetCenter(Number(e.target.value))} className="w-full bg-[#0B101E] border border-slate-700 rounded-lg p-2 text-white text-center font-bold" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-emerald-400 font-bold block mb-1">Distância (Lados)</label>
                      <input type="number" min="1" max="5" value={targetDistance} onChange={(e) => setTargetDistance(Number(e.target.value))} className="w-full bg-[#0B101E] border border-slate-700 rounded-lg p-2 text-white text-center font-bold" />
                    </div>
                  </div>
                )}
              </div>

              <button onClick={runBacktest} className="w-full mt-6 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
                <Play className="w-5 h-5 fill-current" /> EXECUTAR BACKTEST
              </button>
            </div>

            {simResult && (
              <div className={`p-6 rounded-2xl border shadow-2xl ${simResult.isProfitable ? 'bg-emerald-950/30 border-emerald-900/50' : 'bg-red-950/30 border-red-900/50'}`}>
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/50">
                  <div>
                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Veredito Estatístico</span>
                    <h3 className={`text-xl font-black uppercase flex items-center gap-2 ${simResult.isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {simResult.isProfitable ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                      {simResult.isProfitable ? 'APROVADA' : 'TÓXICA'}
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
                  <div><span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Giros Analisados</span><span className="text-lg font-mono font-black text-slate-300">{simResult.totalSpinsAnalyzed}</span></div>
                  <div><span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Gatilhos</span><span className="text-lg font-mono font-black text-white">{simResult.totalBets} Entradas</span></div>
                  <div><span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Win Rate</span><span className="text-lg font-mono font-black text-blue-400">{simResult.winRate}%</span></div>
                  <div><span className="text-[10px] uppercase text-slate-500 font-bold block mb-1">Risco (Drawdown)</span><span className="text-lg font-mono font-black text-orange-400">-R$ {simResult.maxDrawdown.toFixed(2)}</span></div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
