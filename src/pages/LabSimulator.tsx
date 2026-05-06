/**
 * RL.sys - LabSimulator Module
 * Componente de análise avançada: Validação por Visão Computacional e Backtesting.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, FlaskConical, Play, CheckCircle2, XCircle, 
  Database, Target, ShieldCheck, AlertTriangle, UploadCloud, Cpu, Zap 
} from 'lucide-react';
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

// --- FUNÇÕES AUXILIARES DE CÁLCULO ---

const getNeighbors = (center: number, distance: number): number[] => {
  const idx = EUROPEAN_WHEEL.indexOf(center);
  if (idx === -1) return [];
  const res: number[] = [];
  for (let i = -distance; i <= distance; i++) {
    res.push(EUROPEAN_WHEEL[(idx + i + 37) % 37]);
  }
  return res;
};

/**
 * Calcula a Entropia de Shannon para medir a aleatoriedade da amostra.
 */
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

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export const LabSimulator: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'VALIDATOR' | 'BACKTEST'>('VALIDATOR');

  // --- ESTADOS GERAIS ---
  const [historySpins, setHistorySpins] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DO BACKTESTER ---
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

  // --- ESTADOS DO VALIDADOR OCR ---
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [validatorResult, setValidatorResult] = useState<any>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Busca histórico de giros para o Backtest ao montar o componente
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
        console.error("Erro ao carregar histórico:", err); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchHistory();
  }, []);

  // --- LÓGICA DE BACKTEST ---

  const getDynamicSector = (sectorType: string, center: number, distance: number) => {
    if (sectorType === "VIZINHOS") return getNeighbors(center, distance);
    return BASE_SECTORS[sectorType] || [];
  };

  const getDynamicPayout = (sectorType: string, distance: number) => {
    if (sectorType.includes("DOZEN") || sectorType.includes("COL") || sectorType === "TIERS") return 2.0;
    if (sectorType === "VIZINHOS") return 36 / ((distance * 2) + 1) - 1; // Lucro líquido
    if (sectorType === "VOISINS") return 36 / 17 - 1;
    return 1.0; 
  };

  const runBacktest = () => {
    if (historySpins.length < 50) {
        setOcrError("Aviso: Dados insuficientes para backtest preciso.");
    }

    let theoreticalBankroll = 100; 
    let wins = 0; let losses = 0; let gales = 0;
    let maxDrawdown = 0; let peakBankroll = 100;
    let activeBet: { targetArr: number[], payout: number, amount: number, step: number } | null = null;

    const conditionArr = getDynamicSector(conditionSector, conditionCenter, conditionDistance);
    const targetArr = getDynamicSector(targetSector, targetCenter, targetDistance);
    const payoutRatio = getDynamicPayout(targetSector, targetDistance);

    for (let i = 0; i < historySpins.length; i++) {
      const currentNumber = historySpins[i];

      // Resolve aposta ativa
      if (activeBet) {
        const isWin = activeBet.targetArr.includes(currentNumber);
        if (isWin) {
          theoreticalBankroll += activeBet.amount * (activeBet.payout + 1); // Retorno total
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

      // Verifica Gatilho
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

    setSimResult({ 
        totalSpinsAnalyzed: historySpins.length, 
        totalBets, wins, losses, gales, winRate, pnl, maxDrawdown, 
        isProfitable: pnl >= 0 
    });
  };

  // --- MOTOR DE VISÃO (OCR) ---

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setIsAnalyzing(true);
    setOcrError(null);
    setValidatorResult(null);
    
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/vision/analyze-table", { method: "POST", body: formData });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Erro de conexão.');

      if (!data.numbers || data.numbers.length < 5) {
        setOcrError("FALHA DE EXTRAÇÃO: Certifique-se de que o print mostra o histórico de números claramente.");
        setIsAnalyzing(false);
        return;
      }
      
      evaluateTableData(data.numbers);
    } catch (err: any) {
      setOcrError(err.message || "Falha crítica de comunicação com o Cérebro Vision.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const evaluateTableData = (numbersExtracted: number[]) => {
    const entropy = calculateEntropy(numbersExtracted);
    const approvedStrats: any[] = [];
    const rejectedStrats: any[] = [];

    Object.entries(BASE_SECTORS).forEach(([name, arr]) => {
        let hits = 0; let trials = 0;
        for (let i = 0; i < numbersExtracted.length - 5; i++) {
            const window = numbersExtracted.slice(i, i+3);
            if (window.every(n => !arr.includes(n))) {
                trials++;
                if (arr.includes(numbersExtracted[i+3]) || arr.includes(numbersExtracted[i+4])) hits++;
            }
        }
        const wr = trials > 0 ? (hits / trials) * 100 : 0;
        if (wr >= 55) approvedStrats.push({ name, winRate: wr });
        else rejectedStrats.push({ name, winRate: wr });
    });

    let isApproved = false;
    let reason = "";

    if (entropy > 4.60) {
        reason = "VIX Crítico: Mesa caótica sem padrões definidos.";
    } else if (approvedStrats.length >= 2) {
        isApproved = true;
        reason = "Ressonância Confirmada: Múltiplas matrizes convergentes.";
    } else {
        reason = "Mesa Instável: Baixa correlação entre matrizes.";
    }

    setValidatorResult({ numbers: numbersExtracted, entropy, isApproved, reason, approvedStrats, rejectedStrats });
  };

  const injectAndEngage = () => {
    if (!validatorResult) return;
    navigate("/setup", { state: { injectedNumbers: validatorResult.numbers } });
  };

  // --- RENDERIZAÇÃO ---

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <FlaskConical className="w-10 h-10 text-purple-500 animate-pulse mb-4" />
      <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Sincronizando Laboratório...</span>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col space-y-6 pb-12">
      
      {/* HEADER */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter text-white flex items-center gap-2">
            <FlaskConical className="text-purple-500 w-5 h-5" /> Lab Simulator
          </h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Módulo de Validação Tática</p>
        </div>
        <button onClick={() => navigate("/")} className="text-[10px] font-black uppercase tracking-widest text-slate-400 border border-slate-700 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 flex items-center gap-1 transition-all">
          <ArrowLeft className="w-3 h-3" /> VOLTAR
        </button>
      </div>

      {/* TABS */}
      <div className="flex p-1 bg-[#0B101E] rounded-xl border border-slate-800">
        <button onClick={() => setActiveTab('VALIDATOR')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'VALIDATOR' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Vision Validator</button>
        <button onClick={() => setActiveTab('BACKTEST')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'BACKTEST' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Historical Backtest</button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'VALIDATOR' ? (
          <motion.div key="v" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
            <div className="bg-[#111827] border border-slate-800 p-8 rounded-2xl shadow-xl text-center">
              <UploadCloud className="w-12 h-12 text-blue-500 mx-auto mb-4" />
              <h3 className="text-sm font-black uppercase text-white mb-2">Análise de Terreno via OCR</h3>
              <p className="text-xs text-slate-400 mb-6">Envie um print do histórico da roleta para validar a mesa.</p>

              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="ocr-upload" disabled={isAnalyzing} />
              <label htmlFor="ocr-upload" className={`w-full py-6 rounded-xl border-2 border-dashed font-black uppercase tracking-widest flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${isAnalyzing ? 'bg-blue-900/20 border-blue-500/50 text-blue-400' : 'bg-[#0B101E] border-slate-700 text-slate-400 hover:border-blue-500 hover:text-blue-500'}`}>
                {isAnalyzing ? <Cpu className="w-8 h-8 animate-spin" /> : 'SELECIONAR PRINT'}
              </label>
            </div>

            {ocrError && (
              <div className="bg-red-950/40 border border-red-500/50 p-4 rounded-xl flex items-center gap-3">
                 <AlertTriangle className="text-red-500 w-5 h-5" />
                 <p className="text-xs font-bold text-red-200">{ocrError}</p>
              </div>
            )}

            {validatorResult && (
              <div className={`p-6 rounded-2xl border shadow-2xl ${validatorResult.isApproved ? 'bg-emerald-950/20 border-emerald-500' : 'bg-red-950/20 border-red-500'}`}>
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Índice de Entropia (VIX)</span>
                        <div className="text-3xl font-mono font-black text-white">{validatorResult.entropy.toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Status da Mesa</span>
                        <div className={`text-sm font-black uppercase ${validatorResult.isApproved ? 'text-emerald-400' : 'text-red-400'}`}>
                            {validatorResult.isApproved ? 'APROVADA' : 'HOSTIL'}
                        </div>
                    </div>
                </div>

                <p className="text-xs font-bold text-slate-300 bg-black/40 p-3 rounded-lg border border-slate-800 mb-6">{validatorResult.reason}</p>

                {validatorResult.isApproved && (
                    <button onClick={injectAndEngage} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
                        <Zap className="w-5 h-5 fill-current" /> INJETAR DADOS E OPERAR
                    </button>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="b" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6">
            {/* O formulário de Backtest e resultados permanecem com a lógica refinada de cálculo PnL */}
            <div className="bg-[#111827] border border-slate-800 p-6 rounded-2xl">
                <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest mb-4 block">Configuração de Backtest</span>
                {/* Inputs de condição e alvo aqui... */}
                <button onClick={runBacktest} className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
                    <Play className="w-5 h-5 fill-current" /> EXECUTAR SIMULAÇÃO
                </button>
            </div>

            {simResult && (
                <div className={`p-6 rounded-2xl border ${simResult.isProfitable ? 'bg-emerald-950/20 border-emerald-900/50' : 'bg-red-950/20 border-red-900/50'}`}>
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500">Resultado Final</span>
                            <div className={`text-2xl font-black ${simResult.isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                                R$ {simResult.pnl.toFixed(2)}
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] uppercase font-bold text-slate-500">Taxa de Acerto</span>
                            <div className="text-2xl font-black text-blue-400">{simResult.winRate}%</div>
                        </div>
                    </div>
                </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
