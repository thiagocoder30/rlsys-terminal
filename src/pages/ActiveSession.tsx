import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Activity, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, TrendingUp, PowerOff, Target, Gauge, PieChart, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Componentes Visuais
import { SpinTimeline } from '../components/SpinTimeline';
import { ManualEntryInput } from '../components/ManualEntryInput';
import { WheelHeatmap } from '../components/WheelHeatmap';

// ==========================================
// UTILITÁRIOS MATEMÁTICOS ORIGINAIS
// ==========================================
const getPayoutRatio = (stratName: string) => {
  if (!stratName) return 1.0;
  if (stratName.includes("Vizinhos")) return 10 / 26; 
  if (stratName.includes("James Bond")) return 8 / 20;
  if (stratName.includes("Cross")) return 9 / 21; 
  if (stratName.includes("Dúzia") || stratName.includes("Coluna")) return 2.0;
  if (stratName.includes("Drop Zone")) return 31 / 5;
  if (stratName.includes("Alpha")) return 11 / 25;
  if (stratName.includes("Omega")) return 15 / 21;
  if (stratName.includes("Hedge")) return 9 / 27;
  if (stratName.includes("Macro") || stratName.includes("Zero")) return 17 / 19;
  if (stratName.includes("Quantum")) return 36.0;
  return 1.0;
};

const calculateEntropy = (spins: any[]) => {
  if (!spins || spins.length < 10) return 0;
  const sample = spins.slice(0, 37).map((s:any) => s.number !== undefined ? s.number : s);
  const counts: Record<number, number> = {};
  sample.forEach((n:number) => counts[n] = (counts[n] || 0) + 1);
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
  const sample = spins.slice(0, sampleSize).map((s:any) => s.number !== undefined ? s.number : s);
  const uniqueNumbers = new Set(sample);
  return { uniqueCount: uniqueNumbers.size, sampleSize };
};

export const ActiveSession: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sessionTime, setSessionTime] = useState<number>(0);
  const [circuitBreaker, setCircuitBreaker] = useState<{active: boolean, spinsLeft: number}>({active: false, spinsLeft: 0});
  const [activeModal, setActiveModal] = useState<{type: 'GREEN'|'LOSS'|'GALE'|'GLOBAL_STOP', data?: any, metrics?: any} | null>(null);
  
  const prevSignalsRef = useRef<any[]>([]);

  // ==========================================
  // SINCRONIZAÇÃO SUPABASE (PORTA 3001)
  // ==========================================
  const fetchData = useCallback(async () => {
    if (!id || id === 'undefined') return;
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/sessions/${id}/dashboard`);
      
      // PROTEÇÃO DE BANCO NOVO: Se o ID não existe no Supabase, mata o loop
      if (res.status === 404 || res.status === 400) {
        localStorage.removeItem("activeSessionId");
        navigate('/');
        return;
      }

      const json = await res.json();
      
      if (json.session?.status === "CLOSED") { 
        localStorage.removeItem("activeSessionId"); 
        navigate(`/audit/${id}`); 
      } else { 
        setData(json); 
      }
    } catch (err: any) {
      console.error("Erro de conexão com o servidor 3001");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { 
    fetchData();
    const int = setInterval(fetchData, 3000); // Polling de 3s para economizar bateria no A14
    return () => clearInterval(int); 
  }, [fetchData]);

  // Lógica de Cronômetro
  useEffect(() => {
    if (!data?.session?.created_at || data?.session?.status === "CLOSED") return;
    const startTime = new Date(data.session.created_at).getTime();
    const interval = setInterval(() => {
      setSessionTime(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [data]);

  // ==========================================
  // AÇÕES DO USUÁRIO
  // ==========================================
  const handleNumberClick = async (number: number) => {
    if (!id || activeModal?.type === 'GLOBAL_STOP') return;
    try { 
      await fetch(`http://127.0.0.1:3001/api/sessions/${id}/spins`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ number }) 
      }); 
      fetchData(); 
    } catch (err) {}
  };

  const handleCloseSession = async () => {
    if (!window.confirm("Confirmar fechamento de caixa?")) return;
    try {
      await fetch(`http://127.0.0.1:3001/api/sessions/${id}/close`, { method: "POST" });
      localStorage.removeItem("activeSessionId"); 
      navigate(`/audit/${id}`);
    } catch (err) { alert("Erro ao fechar"); } 
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Zap className="w-10 h-10 text-blue-500 animate-pulse" />
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-[0.3em]">Sincronizando Oráculo...</span>
      </div>
    );
  }

  // Cálculos de Interface
  const spinsList = data?.session?.spins || [];
  const pnl = data ? data.session.current_bankroll - data.session.initial_bankroll : 0;
  const currentEntropy = calculateEntropy(spinsList);
  const { uniqueCount, sampleSize } = calculateLawOfThird(spinsList);
  const activeSignals = data?.session?.signals?.filter((s:any) => s.result === 'SUGGESTED' || s.result === 'PENDING') || [];
  const formatTime = (ms: number) => { const mins = Math.floor(ms / 60000); const secs = Math.floor((ms % 60000) / 1000); return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; };

  return (
    <div className="flex flex-col space-y-4 pb-10">
      
      {/* HEADER DE PERFORMANCE (SUPABASE READY) */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 shadow-lg flex justify-between items-center">
        <div>
          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Caixa Supabase</span>
          <span className="text-2xl font-black font-mono text-white">R$ {data.session.current_bankroll.toFixed(2)}</span>
          <span className={`text-xs font-bold ml-2 ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ({pnl >= 0 ? '+' : ''}R$ {pnl.toFixed(2)})
          </span>
        </div>
        <div className="text-right">
          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Time</span>
          <span className="text-lg font-mono font-bold text-slate-300">{formatTime(sessionTime)}</span>
          <button onClick={handleCloseSession} className="mt-2 text-[9px] bg-red-950/40 text-red-400 border border-red-900/50 px-2 py-1 rounded uppercase font-black">
            Encerrar
          </button>
        </div>
      </div>

      {/* PAINEL MATEMÁTICO */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0B101E] border border-slate-800 rounded-xl p-3">
          <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2"><Gauge className="w-3 h-3 text-purple-500" /> VIX</span>
          <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${Math.min((currentEntropy/5.2)*100, 100)}%` }}></div>
          </div>
        </div>
        <div className="bg-[#0B101E] border border-slate-800 rounded-xl p-3">
          <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2"><PieChart className="w-3 h-3 text-blue-500" /> Lei do Terço</span>
          <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${(uniqueCount/37)*100}%` }}></div>
          </div>
        </div>
      </div>

      {/* HEATMAP E TIMELINE */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-3">
        <WheelHeatmap spins={spinsList} />
      </div>
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-3">
        <SpinTimeline spins={spinsList} />
      </div>

      {/* SINAIS TÁTICOS */}
      <div className="space-y-3">
        {activeSignals.length === 0 ? (
          <div className="bg-[#0B101E] border border-slate-800/50 border-dashed p-6 rounded-xl text-center opacity-40">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Aguardando Convergência...</span>
          </div>
        ) : (
          activeSignals.map((sig: any) => (
            <div key={sig.id} className="p-4 rounded-xl border border-blue-500/30 bg-blue-900/10 shadow-lg">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[9px] text-blue-400 font-black uppercase tracking-tighter">{sig.strategy_name}</span>
                  <span className="text-xl font-black text-white block">{sig.target_bet}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Entrada</span>
                  <span className="text-xl font-mono font-black text-blue-400">R$ {sig.suggested_amount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* TECLADO DE ENTRADA (MANTIDO) */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 shadow-2xl">
        <ManualEntryInput onNumberSubmit={handleNumberClick} disabled={false} />
      </div>

    </div>
  );
};
