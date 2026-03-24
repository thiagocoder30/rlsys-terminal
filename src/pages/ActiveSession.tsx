import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Activity, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, TrendingUp, PowerOff, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Importação dos seus componentes visuais
import { SpinTimeline } from '../components/SpinTimeline';
import { ManualEntryInput } from '../components/ManualEntryInput';
import { WheelHeatmap } from '../components/WheelHeatmap'; // <-- INJEÇÃO DO HEATMAP

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
  return 1.0;
};

export const ActiveSession: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sessionTime, setSessionTime] = useState<number>(0);
  const [circuitBreaker, setCircuitBreaker] = useState<{active: boolean, spinsLeft: number}>({active: false, spinsLeft: 0});
  const [activeModal, setActiveModal] = useState<{type: 'GREEN'|'LOSS'|'GALE'|'GLOBAL_STOP', data?: any, metrics?: any} | null>(null);
  
  const prevSignalsRef = useRef<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/sessions/${id}/dashboard`);
      const json = await res.json(); 
      if (json.session?.status === "CLOSED") { 
        localStorage.removeItem("rlsys_active_session"); 
        navigate(`/audit/${id}`); 
      } else { 
        setData(json); 
      }
    } catch (err: any) {
      console.error("Erro ao buscar dados da sessão:", err);
    }
  }, [id, navigate]);

  useEffect(() => { 
    if (id && data?.session?.status !== "CLOSED") { 
      fetchData(); 
      const int = setInterval(fetchData, 5000); 
      return () => clearInterval(int); 
    } 
  }, [id, data?.session?.status, fetchData]);

  useEffect(() => {
    if (!data?.session?.created_at || data?.session?.status === "CLOSED" || activeModal?.type === 'GLOBAL_STOP') return;
    const startTime = new Date(data.session.created_at).getTime();
    const interval = setInterval(() => {
      const now = Date.now(); 
      const elapsed = now - startTime; 
      setSessionTime(elapsed);
      if (elapsed >= 50 * 60 * 1000 && activeModal?.type !== 'GLOBAL_STOP') {
        setActiveModal({ type: 'GLOBAL_STOP', metrics: { stopLabel: "TIME-STOP (FADIGA)", pnlFinal: data.session.current_bankroll - data.session.initial_bankroll, isTrailing: data.session.current_bankroll > data.session.initial_bankroll } });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [data, activeModal?.type]);

  useEffect(() => {
    if (!data?.session || data.session.status === "CLOSED") return;
    
    const initialB = data.session.initial_bankroll;
    const currentB = data.session.current_bankroll;
    const highestB = data.session.highest_bankroll || initialB;
    const currentSignals = data.session.signals || [];

    const closedCycles = currentSignals.filter((s:any) => s.result === "WIN" || (s.result === "LOSS" && s.martingale_step === 1)).sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    let cbActive = false; let cbSpinsLeft = 0;
    if (closedCycles.length >= 2 && closedCycles[0].result === "LOSS" && closedCycles[1].result === "LOSS") {
      const lastStopDate = new Date(closedCycles[0].created_at).getTime();
      const spinsSince = data.session.spins.filter((s:any) => new Date(s.created_at).getTime() > lastStopDate).length;
      if (spinsSince < 20) { cbActive = true; cbSpinsLeft = 20 - spinsSince; }
    }
    setCircuitBreaker({ active: cbActive, spinsLeft: cbSpinsLeft });

    let dynamicStopLimit = initialB * 0.85; 
    let stopLabel = "HARD STOP (-15%)"; 
    let isTrailing = false;
    
    if (highestB >= initialB * 1.08) { dynamicStopLimit = initialB * 1.04; stopLabel = "TRAILING STOP (+4%)"; isTrailing = true; } 
    else if (highestB >= initialB * 1.05) { dynamicStopLimit = initialB * 1.01; stopLabel = "BREAK-EVEN (+1%)"; isTrailing = true; }

    if (currentB <= dynamicStopLimit && data.session.spins.length > 0 && activeModal?.type !== 'GLOBAL_STOP') {
      setActiveModal({ type: 'GLOBAL_STOP', metrics: { stopLabel, pnlFinal: currentB - initialB, isTrailing } }); 
      return; 
    }

    if (activeModal?.type !== 'GLOBAL_STOP') {
      prevSignalsRef.current.forEach(prevSig => {
        if (prevSig.result === 'PENDING') {
          const currSig = currentSignals.find((s:any) => s.id === prevSig.id);
          if (currSig && currSig.result !== 'PENDING') {
            if (currSig.result === 'WIN') {
              const payout = getPayoutRatio(currSig.strategy?.name);
              setActiveModal({ type: 'GREEN', data: currSig, metrics: { profitNet: currSig.suggested_amount * payout } });
            } else if (currSig.result === 'LOSS') {
              let accLoss = 0;
              const stratSigs = currentSignals.filter((s:any) => s.strategy_id === currSig.strategy_id).sort((a:any, b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              for (const s of stratSigs) {
                  if (new Date(s.created_at).getTime() <= new Date(currSig.created_at).getTime()) {
                      if (s.result === "LOSS") accLoss += s.suggested_amount;
                      if (s.martingale_step === 0) break;
                  }
              }
              const galeSig = currentSignals.find((s:any) => s.strategy_id === currSig.strategy_id && (s.result === 'SUGGESTED' || s.result === 'PENDING') && s.martingale_step > currSig.martingale_step);
              if (galeSig) { setActiveModal({ type: 'GALE', data: galeSig, metrics: { previousLoss: accLoss } }); } 
              else { setActiveModal({ type: 'LOSS', data: currSig, metrics: { totalCycleLoss: accLoss } }); }
            }
          }
        }
      });
    }
    prevSignalsRef.current = currentSignals;
  }, [data, activeModal?.type]);

  const handleCloseSession = async () => {
    if (activeModal?.type !== 'GLOBAL_STOP' && !window.confirm("Confirmar saque e fechamento de caixa?")) return;
    setLoading(true);
    try {
      await fetch(`/api/sessions/${id}/close`, { method: "POST" });
      localStorage.removeItem("rlsys_active_session"); 
      navigate(`/audit/${id}`);
    } catch (err: any) { 
      alert("Falha: " + err.message); 
      setLoading(false);
    } 
  };

  const handleNumberClick = async (number: number) => {
    if (!id || data?.session?.status === "CLOSED" || activeModal?.type === 'GLOBAL_STOP') return;
    try { await fetch(`/api/sessions/${id}/spins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number }) }); fetchData(); } 
    catch (err: any) {}
  };

  const handleSignalAction = async (signalId: string, action: "CONFIRM" | "REJECT") => {
    if (!id) return;
    try { await fetch(`/api/signals/${signalId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); fetchData(); } 
    catch (err: any) {} 
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Activity className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">Carregando Mesa...</span>
      </div>
    );
  }

  const pnl = data.session.current_bankroll - data.session.initial_bankroll;
  const activeSignals = data.session.signals?.filter((s:any) => s.result === 'SUGGESTED' || s.result === 'PENDING') || [];
  const formatTime = (ms: number) => { const mins = Math.floor(ms / 60000); const secs = Math.floor((ms % 60000) / 1000); return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; };

  return (
    <div className="flex flex-col space-y-4">
      
      {/* HEADER DE PERFORMANCE */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 shadow-lg flex justify-between items-center relative overflow-hidden">
        {circuitBreaker.active && (
          <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500"></div>
        )}
        <div>
          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Caixa Atual</span>
          <span className="text-2xl font-black font-mono text-white">R$ {data.session.current_bankroll.toFixed(2)}</span>
          <span className={`text-xs font-bold ml-2 ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ({pnl >= 0 ? '+' : ''}R$ {pnl.toFixed(2)})
          </span>
        </div>
        <div className="text-right flex flex-col items-end">
          <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tempo de Mesa</span>
          <span className="text-lg font-mono font-bold text-slate-300">{formatTime(sessionTime)}</span>
          <button onClick={handleCloseSession} className="mt-2 text-[10px] flex items-center gap-1 bg-red-950/40 text-red-400 border border-red-900/50 px-2 py-1 rounded hover:bg-red-900/50 transition-colors">
            <PowerOff className="w-3 h-3" /> ENCERRAR
          </button>
        </div>
      </div>

      {circuitBreaker.active && (
        <div className="bg-yellow-950/30 border border-yellow-900/50 p-3 rounded-lg flex items-center gap-3 animate-pulse">
          <AlertTriangle className="text-yellow-500 w-5 h-5 flex-shrink-0" />
          <p className="text-[10px] text-yellow-200 uppercase font-bold tracking-wider leading-relaxed">
            Mesa hostil detectada. Algoritmo em resfriamento obrigatório. Entradas bloqueadas por mais <span className="text-yellow-400 text-xs font-black">{circuitBreaker.spinsLeft}</span> giros.
          </p>
        </div>
      )}

      {/* HEATMAP FÍSICO DO CILINDRO */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-3 shadow-lg">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            <Target className="w-3.5 h-3.5 text-blue-500" /> Heatmap Balístico
          </span>
          <span className="text-[8px] font-bold text-slate-600 uppercase border border-slate-700 px-1.5 py-0.5 rounded">Últimos 50 Giros</span>
        </div>
        <WheelHeatmap spins={data.session.spins || []} />
      </div>

      {/* LINHA DO TEMPO (Histórico da Roleta) */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-3 shadow-lg">
        <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">Radar Sequencial (Últimos Números)</span>
        <SpinTimeline spins={data.session.spins || []} />
      </div>

      {/* PAINEL DE SINAIS (Ordens de Operação) */}
      <div className="space-y-3">
        {activeSignals.length === 0 && !circuitBreaker.active && (
          <div className="bg-[#0B101E] border border-slate-800/50 border-dashed p-6 rounded-xl flex flex-col items-center justify-center text-center opacity-60">
            <Activity className="w-6 h-6 text-blue-500/50 mb-2" />
            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Aguardando Padrão Matemático...</span>
          </div>
        )}

        {activeSignals.map((sig: any) => (
          <div key={sig.id} className={`p-4 rounded-xl border shadow-lg relative overflow-hidden transition-all ${sig.result === 'PENDING' ? 'bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'bg-[#111827] border-slate-700'}`}>
            {sig.result === 'PENDING' && <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 animate-pulse"></div>}
            
            <div className="flex justify-between items-start mb-3">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">{sig.strategy?.name}</span>
                <span className="text-lg font-black text-white block mt-1">{sig.target_bet.replace(/_/g, " ")}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Ficha Sugerida</span>
                <span className="text-xl font-mono font-black text-blue-400">R$ {sig.suggested_amount.toFixed(2)}</span>
              </div>
            </div>

            {sig.martingale_step > 0 && (
               <div className="mb-3 inline-block bg-orange-900/40 border border-orange-800/50 px-2 py-0.5 rounded text-[10px] font-black text-orange-400 uppercase tracking-widest">
                 Atenção: GALE {sig.martingale_step} (Recuperação)
               </div>
            )}

            {sig.result === 'SUGGESTED' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => handleSignalAction(sig.id, "CONFIRM")} className="bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-xs py-3 rounded-lg tracking-widest transition-colors">Confirmar Entrada</button>
                <button onClick={() => handleSignalAction(sig.id, "REJECT")} className="bg-slate-800 hover:bg-slate-700 text-slate-400 font-black uppercase text-xs py-3 rounded-lg tracking-widest transition-colors">Ignorar (Abortar)</button>
              </div>
            )}
            {sig.result === 'PENDING' && (
              <div className="text-center mt-2 p-2 bg-blue-950/30 rounded-lg">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300 animate-pulse">Entrada Confirmada. Aguardando Roleta...</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* TECLADO DE INSERÇÃO MANUAL */}
      <div className="mt-8 pb-4">
         <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 shadow-2xl">
           <div className="flex items-center justify-between mb-3">
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inserção Manual Rápida</span>
             <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
           </div>
           <ManualEntryInput onNumberSubmit={handleNumberClick} disabled={false} />
         </div>
      </div>

      {/* SISTEMA DE MODAIS */}
      <AnimatePresence>
        {activeModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className={`w-full max-w-sm rounded-2xl p-6 border shadow-2xl ${
              activeModal.type === 'GREEN' ? 'bg-emerald-950/90 border-emerald-500' :
              activeModal.type === 'GALE' ? 'bg-orange-950/90 border-orange-500' :
              activeModal.type === 'LOSS' ? 'bg-red-950/90 border-red-500' :
              'bg-[#111827] border-blue-500'
            }`}>
              
              <div className="text-center space-y-4">
                {activeModal.type === 'GREEN' && <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />}
                {activeModal.type === 'GALE' && <TrendingUp className="w-16 h-16 text-orange-400 mx-auto" />}
                {activeModal.type === 'LOSS' && <XCircle className="w-16 h-16 text-red-400 mx-auto" />}
                {activeModal.type === 'GLOBAL_STOP' && <ShieldCheck className="w-16 h-16 text-blue-400 mx-auto" />}

                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">
                  {activeModal.type === 'GREEN' ? 'LUCRO CAPTURADO!' :
                   activeModal.type === 'GALE' ? 'PREPARAR GALE' :
                   activeModal.type === 'LOSS' ? 'STOP LOSS' :
                   activeModal.metrics?.stopLabel}
                </h2>

                <p className="text-sm text-slate-300 font-medium">
                  {activeModal.type === 'GREEN' && `O motor extraiu +R$ ${activeModal.metrics?.profitNet?.toFixed(2)} do mercado.`}
                  {activeModal.type === 'GALE' && `Gale ativado. A próxima entrada tentará recuperar R$ ${activeModal.metrics?.previousLoss?.toFixed(2)}.`}
                  {activeModal.type === 'LOSS' && `Ciclo encerrado com perda de R$ ${activeModal.metrics?.totalCycleLoss?.toFixed(2)}.`}
                  {activeModal.type === 'GLOBAL_STOP' && `Operações bloqueadas. ${activeModal.metrics?.isTrailing ? 'Lucro garantido.' : 'Proteção de capital ativada.'}`}
                </p>

                <button 
                  onClick={() => {
                    if(activeModal.type === 'GLOBAL_STOP') { handleCloseSession(); } 
                    else { setActiveModal(null); }
                  }} 
                  className="w-full py-4 mt-6 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black uppercase tracking-widest transition-colors border border-white/20"
                >
                  {activeModal.type === 'GLOBAL_STOP' ? 'LIQUIDAR CAIXA' : 'CONTINUAR OPERAÇÃO'}
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
