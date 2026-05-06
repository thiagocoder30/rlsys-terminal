import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Activity, ShieldCheck, AlertTriangle, CheckCircle2, 
  XCircle, TrendingUp, PowerOff, Target, Gauge, PieChart, Zap 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Componentes Visuais (Certifique-se que os caminhos estão corretos)
import { SpinTimeline } from '../components/SpinTimeline';
import { ManualEntryInput } from '../components/ManualEntryInput';
import { WheelHeatmap } from '../components/WheelHeatmap';

// ==========================================
// UTILITÁRIOS MATEMÁTICOS TÁTICOS
// ==========================================

const getPayoutRatio = (stratName: string): number => {
  if (!stratName) return 1.0;
  const name = stratName.toLowerCase();
  if (name.includes("vizinhos")) return 36 / 5; // Ex: Vizinhos de 2 lados (5 números)
  if (name.includes("james bond")) return 2.0;
  if (name.includes("dúzia") || name.includes("coluna")) return 2.0;
  if (name.includes("quantum")) return 35.0;
  if (name.includes("zero")) return 35.0;
  return 1.0; // Payout padrão (Even Money)
};

const calculateEntropy = (spins: any[]): number => {
  if (!spins || spins.length < 10) return 0;
  const sample = spins.slice(0, 37).map(s => (typeof s === 'object' ? s.number : s));
  const counts: Record<number, number> = {};
  sample.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
  let entropy = 0;
  for (const key in counts) {
    const p = counts[key] / sample.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
};

const calculateLawOfThird = (spins: any[]) => {
  if (!spins || spins.length === 0) return { uniqueCount: 0, sampleSize: 0 };
  const sampleSize = Math.min(spins.length, 37);
  const sample = spins.slice(0, sampleSize).map(s => (typeof s === 'object' ? s.number : s));
  const uniqueNumbers = new Set(sample);
  return { uniqueCount: uniqueNumbers.size, sampleSize };
};

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export const ActiveSession: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sessionTime, setSessionTime] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- SINCRONIZAÇÃO COM BACKEND (PORTA 3001) ---

  const fetchData = useCallback(async () => {
    if (!id || id === 'undefined') return;
    setIsSyncing(true);
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/sessions/${id}/dashboard`);
      
      if (res.status === 404 || res.status === 400) {
        localStorage.removeItem("rlsys_active_session");
        navigate('/');
        return;
      }

      const json = await res.json();
      
      if (json.session?.status === "CLOSED") { 
        localStorage.removeItem("rlsys_active_session"); 
        navigate(`/audit/${id}`); 
        return;
      }

      setData(json);
    } catch (err) {
      console.warn("RL.SYS: Servidor HFT offline ou instável.");
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [id, navigate]);

  useEffect(() => { 
    fetchData();
    const int = setInterval(fetchData, 3000); // Polling 3s
    return () => clearInterval(int); 
  }, [fetchData]);

  // Cronômetro da Sessão
  useEffect(() => {
    if (!data?.session?.created_at || data?.session?.status === "CLOSED") return;
    const startTime = new Date(data.session.created_at).getTime();
    const interval = setInterval(() => {
      setSessionTime(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [data]);

  // --- HANDLERS ---

  const handleNumberClick = async (number: number) => {
    if (!id) return;
    try { 
      await fetch(`http://127.0.0.1:3001/api/sessions/${id}/spins`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ number }) 
      }); 
      fetchData(); 
    } catch (err) {
      console.error("Erro ao registrar número.");
    }
  };

  const handleCloseSession = async () => {
    if (!window.confirm("Deseja realmente encerrar a sessão e fechar o caixa?")) return;
    try {
      await fetch(`http://127.0.0.1:3001/api/sessions/${id}/close`, { method: "POST" });
      localStorage.removeItem("rlsys_active_session"); 
      navigate(`/audit/${id}`);
    } catch (err) { 
      alert("Falha ao encerrar sessão."); 
    } 
  };

  // --- CÁLCULOS DE UI ---

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <Zap className="w-10 h-10 text-blue-500 animate-pulse" />
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.3em]">Sincronizando Oráculo...</span>
      </div>
    );
  }

  const spinsList = data?.session?.spins || [];
  const bankroll = data?.session?.current_bankroll || 0;
  const initialBankroll = data?.session?.initial_bankroll || 0;
  const pnl = bankroll - initialBankroll;
  const currentEntropy = calculateEntropy(spinsList);
  const { uniqueCount } = calculateLawOfThird(spinsList);
  const activeSignals = data?.session?.signals?.filter((s: any) => s.result === 'SUGGESTED' || s.result === 'PENDING') || [];

  const formatTime = (ms: number) => { 
    const mins = Math.floor(ms / 60000); 
    const secs = Math.floor((ms % 60000) / 1000); 
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; 
  };

  return (
    <div className="flex flex-col space-y-4 pb-12">
      
      {/* PERFORMANCE BAR */}
      <div className="bg-[#111827] border border-slate-800 rounded-2xl p-5 shadow-2xl flex justify-between items-center relative overflow-hidden">
        {isSyncing && <div className="absolute top-0 left-0 w-full h-[1px] bg-blue-500 animate-pulse"></div>}
        <div>
          <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Activity className="w-2 h-2" /> Live Bankroll
          </span>
          <span className="text-3xl font-black font-mono text-white tracking-tighter">
            R$ {bankroll.toFixed(2)}
          </span>
          <div className={`text-[10px] font-black mt-1 uppercase flex items-center gap-1 ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            {pnl >= 0 ? '+' : ''}R$ {pnl.toFixed(2)} ({((pnl/initialBankroll)*100).toFixed(1)}%)
          </div>
        </div>
        <div className="text-right">
          <span className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Session Time</span>
          <span className="text-xl font-mono font-black text-slate-300 block mb-2">{formatTime(sessionTime)}</span>
          <button 
            onClick={handleCloseSession} 
            className="bg-red-950/30 text-red-500 border border-red-900/40 px-3 py-1 rounded-lg uppercase font-black text-[9px] hover:bg-red-500 hover:text-white transition-all active:scale-95 flex items-center gap-1"
          >
            <PowerOff className="w-3 h-3" /> Encerrar
          </button>
        </div>
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0B101E] border border-slate-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
              <Gauge className="w-3 h-3 text-purple-500" /> VIX (Entropy)
            </span>
            <span className="text-[10px] font-mono text-purple-400 font-bold">{currentEntropy.toFixed(2)}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-purple-500" 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((currentEntropy/5.2)*100, 100)}%` }}
            />
          </div>
        </div>
        <div className="bg-[#0B101E] border border-slate-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
              <PieChart className="w-3 h-3 text-blue-500" /> Law of Third
            </span>
            <span className="text-[10px] font-mono text-blue-400 font-bold">{uniqueCount}/37</span>
          </div>
          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-blue-500" 
              initial={{ width: 0 }}
              animate={{ width: `${(uniqueCount/37)*100}%` }}
            />
          </div>
        </div>
      </div>

      {/* WHEEL HEATMAP & TIMELINE */}
      <div className="grid gap-3">
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4">
          <WheelHeatmap spins={spinsList} />
        </div>
        <div className="bg-[#111827] border border-slate-800 rounded-2xl p-4 overflow-hidden">
          <SpinTimeline spins={spinsList} />
        </div>
      </div>

      {/* TACTICAL SIGNALS */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
            <Target className="w-3 h-3 text-blue-500" /> Gatilhos de Alta Frequência
        </h3>
        <AnimatePresence mode="popLayout">
            {activeSignals.length === 0 ? (
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[#0B101E] border border-slate-800/50 border-dashed p-8 rounded-2xl text-center"
            >
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-blue-500 animate-spin mb-3"></div>
                    <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Mapeando padrões residuais...</span>
                </div>
            </motion.div>
            ) : (
            activeSignals.map((sig: any) => (
                <motion.div 
                    key={sig.id}
                    initial={{ opacity: 0, x: -10 }} 
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-5 rounded-2xl border border-blue-500/30 bg-blue-900/10 shadow-lg relative overflow-hidden group"
                >
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                    <div className="flex justify-between items-center relative z-10">
                        <div>
                            <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest flex items-center gap-1 mb-1">
                                <ShieldCheck className="w-3 h-3" /> {sig.strategy_name}
                            </span>
                            <span className="text-2xl font-black text-white block tracking-tighter uppercase">{sig.target_bet}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-[9px] text-slate-500 font-black uppercase block mb-1">Fichas Sugeridas</span>
                            <span className="text-2xl font-mono font-black text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg">
                                R$ {sig.suggested_amount.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </motion.div>
            ))
            )}
        </AnimatePresence>
      </div>

      {/* MANUAL ENTRY */}
      <div className="bg-[#111827] border border-slate-800 rounded-3xl p-5 shadow-2xl sticky bottom-4 z-40 backdrop-blur-md bg-opacity-90">
        <ManualEntryInput onNumberSubmit={handleNumberClick} disabled={false} />
      </div>

    </div>
  );
};
