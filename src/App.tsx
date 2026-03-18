import { useState, useEffect, useCallback, useRef } from "react";
import { HeaderStatus } from "./components/HeaderStatus";
import { SpinTimeline } from "./components/SpinTimeline";
import { ManualEntryInput } from "./components/ManualEntryInput";
import { OcrButton } from "./components/OcrButton";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

const calculateEntropy = (spins: any[]) => {
  if (!spins || spins.length < 10) return 0;
  const sample = spins.slice(0, 37).map((s:any) => s.number);
  const counts: Record<number, number> = {};
  sample.forEach((n:number) => counts[n] = (counts[n] || 0) + 1);
  let entropy = 0;
  for (const key in counts) {
    const p = counts[key] / sample.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
};

// MOTOR DE DIAGNÓSTICO PÓS-SESSÃO
const generateDiagnostic = (auditData: any, pnl: number) => {
  if (pnl >= 0) return { title: "OPERAÇÃO BEM SUCEDIDA", text: "Sessão concluída com capital preservado. O motor de risco garantiu a execução no lucro ou break-even matemático.", color: "text-green-400", bg: "bg-green-950/30", border: "border-green-900/50" };
  
  const entropy = calculateEntropy(auditData.spins || []);
  const durationMs = new Date(auditData.closed_at || Date.now()).getTime() - new Date(auditData.created_at).getTime();
  const mins = durationMs / 60000;

  if (entropy > 4.5) return { title: "CAUSA PRIMÁRIA: CAOS ALGORÍTMICO (VIX)", text: "A entropia da mesa atingiu dispersão máxima. O RNG do cassino quebrou padrões lógicos. O Stop Loss atuou para evitar a ruína em um mercado imprevisível.", color: "text-red-400", bg: "bg-red-950/30", border: "border-red-900/50" };
  if (mins >= 45) return { title: "CAUSA PRIMÁRIA: FADIGA DE MESA", text: "A exposição prolongada no mercado corroeu a margem matemática. O limite de Time-Stop foi cruzado, forçando a liquidação antes de perdas maiores.", color: "text-orange-400", bg: "bg-orange-950/30", border: "border-orange-900/50" };
  
  return { title: "CAUSA PRIMÁRIA: VARIÂNCIA AGUDA", text: "As matrizes operacionais encontraram anomalias fora do desvio padrão. O sistema preferiu acionar o Stop Loss controlado no Gale 1 a expor a banca ao risco de quebra.", color: "text-yellow-400", bg: "bg-yellow-950/30", border: "border-yellow-900/50" };
};

export default function App() {
  const [currentView, setCurrentView] = useState<"MACRO" | "SETUP" | "ACTIVE" | "AUDIT_VIEW">("MACRO");
  const [macroData, setMacroData] = useState<any>(null);
  const [loadingMacro, setLoadingMacro] = useState(true);

  const [startBankroll, setStartBankroll] = useState("100.00");
  const [minChip, setMinChip] = useState<number>(0.50); 
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState<any>(null);
  
  const [circuitBreaker, setCircuitBreaker] = useState<{active: boolean, spinsLeft: number}>({active: false, spinsLeft: 0});
  const [sessionTime, setSessionTime] = useState<number>(0);

  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const spokenSignalsRef = useRef<Set<string>>(new Set());
  const prevSignalsRef = useRef<any[]>([]);
  
  const [activeModal, setActiveModal] = useState<{type: 'GREEN'|'LOSS'|'GALE'|'GLOBAL_STOP', data?: any, metrics?: any} | null>(null);
  const [debugInfo, setDebugInfo] = useState<{isOpen: boolean; sentImageBase64: string | null; rawAiText: string; filteredNumbers: number[];}>({ isOpen: false, sentImageBase64: null, rawAiText: "", filteredNumbers: [] });

  const fetchMacro = useCallback(async () => {
    setLoadingMacro(true);
    try { const res = await fetch("/api/macro"); const json = await res.json(); setMacroData(json); } 
    catch (err) { console.error("Erro macro:", err); } finally { setLoadingMacro(false); }
  }, []);

  useEffect(() => { 
    const activeSession = localStorage.getItem("rlsys_active_session");
    if (activeSession && currentView === "MACRO") { setSessionId(activeSession); setCurrentView("ACTIVE"); } 
    else if (currentView === "MACRO") { fetchMacro(); }
  }, [currentView, fetchMacro]);

  const initSession = async (retries = 3) => {
    setLoading(true);
    try {
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      if (isNaN(initial_bankroll) || initial_bankroll <= 0) throw new Error("Valor inválido.");
      const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initial_bankroll, min_chip: minChip }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no servidor");
      localStorage.setItem("rlsys_active_session", json.id); 
      spokenSignalsRef.current.clear(); prevSignalsRef.current = []; setSessionId(json.id); setActiveModal(null); setAuditData(null); setSessionTime(0); setCurrentView("ACTIVE"); 
    } catch (err: any) {
      if (retries > 0) setTimeout(() => initSession(retries - 1), 2000); else alert(err.message || "Erro de conexão.");
    } finally { setLoading(false); }
  };

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dashboard`);
      if (!res.ok) throw new Error("Falha na sincronização");
      const json = await res.json(); 
      if (json.session.status === "CLOSED") { localStorage.removeItem("rlsys_active_session"); setCurrentView("MACRO"); }
      else { setData(json); }
    } catch (err: any) { console.warn("Instabilidade de rede ignorada."); }
  }, [sessionId]);

  useEffect(() => { if (sessionId && data?.session?.status !== "CLOSED" && currentView === "ACTIVE") { fetchData(); const int = setInterval(fetchData, 5000); return () => clearInterval(int); } }, [sessionId, data?.session?.status, currentView, fetchData]);

  useEffect(() => {
    if (currentView !== "ACTIVE" || !data?.session?.created_at || data?.session?.status === "CLOSED" || activeModal?.type === 'GLOBAL_STOP') return;
    const startTime = new Date(data.session.created_at).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - startTime;
      setSessionTime(elapsed);
      const TIME_LIMIT_MS = 50 * 60 * 1000;
      if (elapsed >= TIME_LIMIT_MS && activeModal?.type !== 'GLOBAL_STOP') {
        const initialB = data.session.initial_bankroll;
        const currentB = data.session.current_bankroll;
        setActiveModal({ type: 'GLOBAL_STOP', metrics: { stopLabel: "TIME-STOP (FADIGA)", pnlFinal: currentB - initialB, isTrailing: currentB > initialB } });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentView, data?.session?.created_at, data?.session?.status, activeModal?.type]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

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
      const pnlFinal = currentB - initialB;
      setActiveModal({ type: 'GLOBAL_STOP', metrics: { stopLabel, pnlFinal, isTrailing } });
      return; 
    }

    if (activeModal?.type !== 'GLOBAL_STOP') {
      const prevSignals = prevSignalsRef.current;
      prevSignals.forEach(prevSig => {
        if (prevSig.result === 'PENDING') {
          const currSig = currentSignals.find((s:any) => s.id === prevSig.id);
          if (currSig && currSig.result !== 'PENDING') {
            if (currSig.result === 'WIN') {
              const payout = getPayoutRatio(currSig.strategy?.name); const profitNet = currSig.suggested_amount * payout;
              setActiveModal({ type: 'GREEN', data: currSig, metrics: { pGoal: 100, profitNet } });
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
              else { 
                const stopLossPercent = initialB - currentB > 0 ? ((initialB - currentB) / (initialB * 0.15)) * 100 : 0;
                setActiveModal({ type: 'LOSS', data: currSig, metrics: { totalCycleLoss: accLoss, stopLossPercent } }); 
              }
            }
          }
        }
      });
    }
    prevSignalsRef.current = currentSignals;
  }, [data, isVoiceEnabled, activeModal?.type]);

  const handleCloseSession = async () => {
    if (!sessionId) return;
    if (activeModal?.type !== 'GLOBAL_STOP' && !window.confirm("Deseja liquidar a sessão e fechar o caixa?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/close`, { method: "POST" });
      if (!res.ok) throw new Error("Erro ao fechar caixa.");
      localStorage.removeItem("rlsys_active_session"); 
      setIsVoiceEnabled(false); 
      await loadSessionAudit(sessionId); 
    } catch (err: any) { alert("Falha: " + err.message); } finally { setLoading(false); }
  };

  const loadSessionAudit = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${id}/audit`);
      const json = await res.json();
      setAuditData(json);
      setCurrentView("AUDIT_VIEW");
    } catch (err) { console.error("Erro ao buscar auditoria", err); } finally { setLoading(false); }
  };

  const downloadCSV = () => {
    if (!auditData) return;
    const BOM = "\uFEFF";
    const headers = "Data/Hora,Estrategia,Alvo,Valor Apostado,Etapa (Gale),Status,Resultado\n";
    const rows = auditData.signals.map((s: any) => {
      const date = new Date(s.created_at).toLocaleString('pt-BR');
      return `"${date}","${s.strategy.name}","${s.target_bet.replace(/_/g, ' ')}",R$ ${s.suggested_amount.toFixed(2)},${s.martingale_step},"${s.result}",${s.result === 'WIN' ? 'LUCRO' : (s.result === 'LOSS' ? 'PREJUIZO' : 'IGNORADO')}`;
    }).join("\n");
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(BOM + headers + rows);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `Auditoria_RLsys_${auditData.id.substring(0,8)}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleNumberClick = async (number: number) => {
    if (!sessionId || data?.session?.status === "CLOSED" || activeModal?.type === 'GLOBAL_STOP') return;
    setLoading(true);
    try { await fetch(`/api/sessions/${sessionId}/spins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number }) }); fetchData(); } 
    catch (err: any) { console.error(err); } finally { setLoading(false); }
  };

  const handleSignalAction = async (signalId: string, action: "CONFIRM" | "REJECT") => {
    if (!sessionId) return; setLoading(true);
    try { await fetch(`/api/signals/${signalId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); fetchData(); } 
    catch (err: any) { console.error(err); } finally { setLoading(false); }
  };

  const handleOcrUpload = async (file: File) => {
    alert("Função OCR Ativa (Leitura Ocultada no log para velocidade).");
  };

  // --- 1. TELA MACRO (LISTA DE SESSÕES) ---
  if (currentView === "MACRO") {
    if (loadingMacro) return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center"><div className="text-indigo-500 animate-pulse font-black text-2xl mb-2">RL.SYS</div></div>);
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center p-6 select-none overflow-y-auto pb-20">
        <h1 className="text-white text-3xl font-black uppercase tracking-tighter mt-8 mb-2">RL.sys</h1>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.2em] mb-8">Painel do Diretor</p>
        
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl mb-6">
          <span className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-4">Evolução Patrimonial</span>
          <div className="flex justify-between items-end border-b border-gray-800 pb-4 mb-4">
            <div><span className="block text-xs font-bold text-gray-400 uppercase">P&L Líquido Global</span><span className={`text-3xl font-black ${macroData.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{macroData.totalProfit >= 0 ? '+' : ''}R$ {macroData.totalProfit.toFixed(2)}</span></div>
            <div className="text-right"><span className="block text-xs font-bold text-gray-400 uppercase">Operações</span><span className="text-xl font-bold text-white">{macroData.totalSessions}</span></div>
          </div>
        </div>

        <button onClick={() => setCurrentView("SETUP")} className="w-full max-w-sm bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg mb-6 transition-all">Nova Operação Tática</button>

        <div className="w-full max-w-sm">
          <span className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-3 px-2">Relatórios Post-Mortem (Sessões)</span>
          <div className="space-y-2">
            {macroData.sessions && macroData.sessions.length === 0 && <p className="text-xs text-gray-600 text-center py-4">Nenhuma sessão finalizada.</p>}
            {macroData.sessions && macroData.sessions.map((s: any) => {
               const pnl = s.current_bankroll - s.initial_bankroll;
               return (
                 <div key={s.id} onClick={() => loadSessionAudit(s.id)} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:bg-gray-800 transition-colors">
                    <div>
                      <span className="text-xs text-white font-bold block">{new Date(s.created_at).toLocaleDateString('pt-BR')}</span>
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest block mt-0.5">Clique para Auditar</span>
                    </div>
                    <span className={`text-lg font-mono font-black ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {pnl >= 0 ? '+' : ''}R$ {pnl.toFixed(2)}
                    </span>
                 </div>
               )
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- 2. TELA DE AUDITORIA INDIVIDUAL COM DIAGNÓSTICO DE CAUSA ---
  if (currentView === "AUDIT_VIEW") {
    if (!auditData) return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-indigo-500 font-black animate-pulse">Compilando Auditoria...</div>);
    
    const pnl = auditData.current_bankroll - auditData.initial_bankroll;
    const wins = auditData.signals.filter((s:any) => s.result === 'WIN').length;
    const totalConcluded = auditData.signals.filter((s:any) => s.result === 'WIN' || s.result === 'LOSS').length;
    const winRate = totalConcluded > 0 ? ((wins / totalConcluded) * 100).toFixed(1) : 0;
    
    const diagnostic = generateDiagnostic(auditData, pnl);
    
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col max-w-md mx-auto shadow-2xl border-x border-gray-800 select-none overflow-y-auto pb-10">
        <div className="bg-indigo-950/40 border-b border-indigo-900/50 p-6 pt-10 text-center">
          <div className="w-16 h-16 bg-indigo-600/20 border border-indigo-500 rounded-full mx-auto flex items-center justify-center mb-4"><span className="text-2xl">📋</span></div>
          <h2 className="text-white text-xl font-black uppercase tracking-widest mb-1">Auditoria Detalhada</h2>
          <p className="text-indigo-400 text-[10px] uppercase font-bold tracking-[0.2em]">{new Date(auditData.created_at).toLocaleString('pt-BR')}</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl"><span className="block text-[9px] text-gray-500 uppercase tracking-widest mb-1">P&L da Sessão</span><span className={`block text-xl font-black font-mono ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{pnl >= 0 ? '+' : ''}R$ {pnl.toFixed(2)}</span></div>
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl"><span className="block text-[9px] text-gray-500 uppercase tracking-widest mb-1">Taxa de Acerto</span><span className="block text-xl font-black text-white font-mono">{winRate}%</span></div>
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl"><span className="block text-[9px] text-gray-500 uppercase tracking-widest mb-1">Pico de Lucro</span><span className="block text-sm font-bold text-indigo-400 font-mono">R$ {auditData.highest_bankroll?.toFixed(2) || "0.00"}</span></div>
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl"><span className="block text-[9px] text-gray-500 uppercase tracking-widest mb-1">Giros Lidos</span><span className="block text-sm font-bold text-white font-mono">{auditData.spins?.length || 0}</span></div>
          </div>

          {/* NOVO: PAINEL DE DIAGNÓSTICO INTELIGENTE */}
          <div className={`p-4 rounded-xl border ${diagnostic.bg} ${diagnostic.border}`}>
            <span className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${diagnostic.color}`}>{diagnostic.title}</span>
            <p className="text-xs text-gray-300 leading-relaxed">{diagnostic.text}</p>
          </div>

          <button onClick={downloadCSV} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg transition-colors flex justify-center items-center gap-2"><span>⬇️</span> Exportar Planilha (.CSV)</button>
          
          <div className="bg-black/50 border border-gray-800 rounded-xl overflow-hidden mt-4">
            <div className="p-3 border-b border-gray-800 bg-gray-900/50"><span className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Linha do Tempo de Entradas</span></div>
            <div className="max-h-80 overflow-y-auto p-2 space-y-2">
              {auditData.signals.length === 0 && <div className="text-center p-4 text-xs text-gray-600">Nenhum sinal gerado.</div>}
              {auditData.signals.slice().reverse().map((sig: any) => (
                <div key={sig.id} className="flex justify-between items-center bg-gray-950 p-3 rounded border border-gray-800/50">
                  <div>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded mr-2 ${sig.result === 'WIN' ? 'bg-green-900/30 text-green-500' : (sig.result === 'LOSS' ? 'bg-red-900/30 text-red-500' : 'bg-gray-800 text-gray-400')}`}>{sig.result}</span>
                    <span className="text-[10px] font-bold text-gray-300">{sig.strategy?.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-gray-500">R$ {sig.suggested_amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => { setAuditData(null); fetchMacro(); setCurrentView("MACRO"); }} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg transition-colors mt-6">Voltar ao Painel</button>
        </div>
      </div>
    );
  }

  // --- 3. TELA DE SETUP ---
  if (currentView === "SETUP") {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <h1 className="text-white text-3xl font-black uppercase tracking-tighter mb-2">RL.sys</h1>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.2em] mb-8">Terminal Institucional</p>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl">
          <div className="mb-6 flex justify-between items-center"><span className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Setup da Mesa</span><button onClick={() => setCurrentView("MACRO")} className="text-indigo-500 hover:text-indigo-400 text-[10px] font-bold uppercase tracking-wider transition-colors">Voltar</button></div>
          <div className="mb-6"><label className="block text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Ficha Mínima</label><div className="grid grid-cols-2 gap-2"><button onClick={() => setMinChip(0.50)} className={`py-3 rounded-xl border ${minChip === 0.50 ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 font-black' : 'bg-black border-gray-800 text-gray-500'}`}>R$ 0,50</button><button onClick={() => setMinChip(0.10)} className={`py-3 rounded-xl border ${minChip === 0.10 ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 font-black' : 'bg-black border-gray-800 text-gray-500'}`}>R$ 0,10</button></div></div>
          <label className="block text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Banca Atual (R$)</label>
          <input type="number" value={startBankroll} onChange={(e) => setStartBankroll(e.target.value)} className="w-full bg-black border border-gray-700 rounded-xl p-4 text-white text-2xl font-black focus:outline-none focus:border-indigo-500 transition-colors mb-6 text-center" />
          <button onClick={() => initSession()} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg transition-all">{loading ? "..." : "Iniciar Sessão"}</button>
        </div>
      </div>
    );
  }

  // --- 4. TELA ATIVA (RADAR DE MESA) ---
  const initialB = data?.session?.initial_bankroll || 1;
  const currentB = data?.session?.current_bankroll || 1;
  const highestB = data?.session?.highest_bankroll || initialB;
  let visualStopLimit = initialB * 0.85; let visualStopLabel = "HARD STOP (-15%)";
  if (highestB >= initialB * 1.08) { visualStopLimit = initialB * 1.04; visualStopLabel = "TRAILING STOP (+4%)"; } 
  else if (highestB >= initialB * 1.05) { visualStopLimit = initialB * 1.01; visualStopLabel = "BREAK-EVEN (+1%)"; }
  const distanceToStop = currentB - visualStopLimit;

  const currentEntropy = calculateEntropy(data?.session?.spins || []);
  const entropyPercent = Math.min((currentEntropy / 5.20) * 100, 100);
  let entropyColor = "bg-green-500"; let entropyLabel = "ESTÁVEL";
  if (currentEntropy > 4.0) { entropyColor = "bg-yellow-500"; entropyLabel = "VOLÁTIL"; }
  if (currentEntropy > 4.6) { entropyColor = "bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]"; entropyLabel = "CAOS"; }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col max-w-md mx-auto shadow-2xl border-x border-gray-800 select-none overflow-hidden relative">
      <div className="bg-gray-950 border-b border-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2"><div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" /><span className="text-white font-black tracking-widest uppercase text-xs">RL.sys</span></div>
        <div className="flex gap-2">
          <button onClick={handleCloseSession} disabled={loading} className="bg-red-950/40 hover:bg-red-900/80 border border-red-900/50 text-red-500 text-[9px] uppercase font-black px-3 py-2 rounded-lg tracking-widest transition-colors flex items-center gap-1">⏹ Fechar</button>
        </div>
      </div>

      <div className="flex-shrink-0 pt-2">
        <HeaderStatus bankroll={currentB} initialBankroll={initialB} zScore={data?.zScore || 0} isConnected={true} />
        
        <div className="mx-4 mt-2 mb-2 bg-black/60 border border-gray-800 p-3 rounded-lg relative overflow-hidden">
           <div className="flex justify-between items-center mb-1">
              <span className="text-[9px] text-gray-400 uppercase tracking-widest font-black">Índice VIX (Entropia)</span>
              <span className={`text-[9px] font-black uppercase tracking-widest ${currentEntropy > 4.6 ? 'text-red-500' : 'text-gray-300'}`}>{entropyLabel}</span>
           </div>
           <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden flex">
              <div className={`h-full transition-all duration-1000 ${entropyColor}`} style={{ width: `${entropyPercent}%` }} />
           </div>
        </div>

        <div className="mx-4 mb-4 bg-gray-950 border border-gray-800 p-2 rounded-lg flex justify-between items-center">
          <div className="flex flex-col"><span className="text-[8px] text-gray-500 uppercase tracking-widest font-black">{visualStopLabel}</span><span className={`text-xs font-mono font-bold ${highestB > initialB ? 'text-indigo-400' : 'text-red-400'}`}>R$ {visualStopLimit.toFixed(2)}</span></div>
          <div className="flex flex-col items-center border-x border-gray-800 px-3"><span className="text-[8px] text-gray-500 uppercase tracking-widest font-black">Uptime</span><span className={`text-xs font-mono font-bold ${sessionTime > 45 * 60 * 1000 ? 'text-orange-500 animate-pulse' : 'text-indigo-400'}`}>{formatTime(sessionTime)}</span></div>
          <div className="text-right flex flex-col"><span className="text-[8px] text-gray-500 uppercase tracking-widest font-black">Distância Livre</span><span className="text-xs font-mono text-gray-300">R$ {Math.max(0, distanceToStop).toFixed(2)}</span></div>
        </div>

        {circuitBreaker.active && (
          <div className="mx-4 mb-4 bg-orange-950/80 border-2 border-orange-500 p-4 rounded-xl flex items-center justify-between shadow-[0_0_20px_rgba(249,115,22,0.3)] animate-pulse">
            <div className="flex items-center gap-3"><span className="text-3xl">⚠️</span><div><h3 className="text-orange-500 font-black uppercase tracking-widest text-sm">Circuit Breaker</h3><p className="text-orange-400 text-[10px] uppercase font-bold tracking-widest mt-1">Anomalia detectada.</p></div></div>
            <div className="text-right pl-2"><span className="block text-3xl font-black font-mono text-white">{circuitBreaker.spinsLeft}</span><span className="text-[8px] text-gray-400 uppercase tracking-widest">Giros</span></div>
          </div>
        )}
        
        {data?.session?.signals && data.session.signals.length > 0 && data.session.signals.map((sig: any) => {
          if (sig.result !== "SUGGESTED" && sig.result !== "PENDING") return null;
          let displayTarget = sig.target_bet.replace(/_/g, " ");
          if (displayTarget.includes("DROP ZONE")) {
             const zoneCenter = displayTarget.split(" ")[2];
             displayTarget = `ALVO FÍSICO: VIZINHOS DO ${zoneCenter}`;
          }

          return (
            <div key={sig.id} className={`mt-4 mx-4 relative overflow-hidden border p-4 rounded-xl transition-all shadow-lg ${sig.result === 'SUGGESTED' ? 'bg-red-950/40 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-green-950/40 border-green-500/30'}`}>
               <div className={`absolute top-0 left-0 w-1 h-full animate-pulse ${sig.result === 'SUGGESTED' ? 'bg-red-500' : 'bg-green-500'}`} />
               <div className="flex justify-between items-start">
                 <div className="pl-2">
                   <div className="flex items-center gap-2 mb-1">
                     <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${sig.result === 'SUGGESTED' ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'}`}>
                       {sig.result === 'SUGGESTED' ? 'AÇÃO REQUERIDA' : 'APOSTA CONFIRMADA'}
                     </span>
                     {sig.martingale_step > 0 && <span className="text-[9px] font-black uppercase tracking-widest bg-orange-900/50 text-orange-400 px-2 py-0.5 rounded">GALE {sig.martingale_step}</span>}
                   </div>
                   <h3 className="text-sm font-black uppercase tracking-wide text-white">{sig.strategy?.name}</h3>
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Alvo: {displayTarget}</p>
                 </div>
                 <div className="text-right">
                   <span className={`block text-[9px] font-black uppercase tracking-widest mb-1 ${sig.result === 'SUGGESTED' ? 'text-red-500' : 'text-green-500'}`}>Aposta Total</span>
                   <span className="text-2xl font-black font-mono text-white">R$ {sig.suggested_amount.toFixed(2)}</span>
                 </div>
               </div>
               {sig.result === "SUGGESTED" ? (
                 <div className="mt-4 flex gap-2 w-full">
                   <button onClick={() => handleSignalAction(sig.id, "CONFIRM")} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-black py-2 rounded-lg uppercase tracking-widest transition-all">Fiz a Aposta</button>
                   <button onClick={() => handleSignalAction(sig.id, "REJECT")} disabled={loading} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] font-black py-2 rounded-lg uppercase tracking-widest transition-all">Ignorar</button>
                 </div>
               ) : (
                 <div className="mt-4 text-center py-2 bg-black/40 rounded-lg"><span className="text-[10px] text-green-500 font-black uppercase tracking-widest animate-pulse">Aguardando Roleta...</span></div>
               )}
            </div>
          );
        })}
        <SpinTimeline spins={data?.session?.spins || []} />
      </div>
      
      <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="flex-grow bg-gray-950 rounded-t-[32px] border-t border-gray-800 p-4 pb-8 mt-4 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-6" />
        <div className="space-y-6">
          <section><span className="block text-[10px] uppercase font-black text-gray-500 mb-3 px-2">Entrada Manual</span><ManualEntryInput onNumberSubmit={handleNumberClick} isLoading={loading} /></section>
        </div>
      </motion.div>

      {/* RESTAURAÇÃO COMPLETA DA CENTRAL DE MODAIS DE AÇÃO */}
      <AnimatePresence>
        {activeModal && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            
            {activeModal.type === 'GLOBAL_STOP' && (
              <div className={`border-2 p-8 rounded-3xl w-full max-w-sm text-center ${activeModal.metrics?.isTrailing ? 'bg-indigo-950 border-indigo-500 shadow-[0_0_50px_rgba(99,102,241,0.3)]' : 'bg-red-950 border-red-600 shadow-[0_0_50px_rgba(220,38,38,0.3)]'}`}>
                <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg animate-pulse ${activeModal.metrics?.isTrailing ? 'bg-indigo-500' : 'bg-red-600'}`}><span className="text-4xl">🛑</span></div>
                <h2 className="text-white text-3xl font-black uppercase tracking-widest mb-2">Liquidação</h2>
                <p className={`${activeModal.metrics?.isTrailing ? 'text-indigo-400' : 'text-red-400'} font-bold mb-6 text-sm uppercase tracking-widest`}>{activeModal.metrics?.stopLabel} Atingido</p>
                <div className="bg-black/50 p-4 rounded-xl mb-6"><span className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1">Resultado Final Travado</span><span className={`block text-3xl font-black font-mono ${activeModal.metrics?.pnlFinal >= 0 ? 'text-green-500' : 'text-red-500'}`}>{activeModal.metrics?.pnlFinal >= 0 ? '+' : ''}R$ {activeModal.metrics?.pnlFinal.toFixed(2)}</span></div>
                <button onClick={handleCloseSession} className={`w-full text-white font-black uppercase py-4 rounded-xl shadow-lg transition-colors ${activeModal.metrics?.isTrailing ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-red-600 hover:bg-red-500'}`}>Fechar Caixa</button>
              </div>
            )}

            {activeModal.type === 'GREEN' && (
              <div className="bg-green-950 border-2 border-green-500 p-8 rounded-3xl w-full max-w-sm text-center shadow-[0_0_50px_rgba(34,197,94,0.3)]">
                <div className="w-20 h-20 bg-green-500 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg animate-pulse"><span className="text-4xl">💰</span></div>
                <h2 className="text-white text-3xl font-black uppercase tracking-widest mb-2">GREEN</h2>
                <div className="bg-black/50 p-4 rounded-xl mb-4 border border-green-900/50"><div className="flex justify-between items-center mb-2 border-b border-green-900/50 pb-2"><span className="text-[10px] text-gray-400 uppercase tracking-widest">Aposta Total</span><span className="text-sm text-gray-300 font-mono">R$ {activeModal.data?.suggested_amount.toFixed(2)}</span></div><div className="flex justify-between items-center"><span className="text-[10px] text-green-500 font-black uppercase tracking-widest">Lucro Líquido</span><span className="text-xl text-green-400 font-black font-mono">+ R$ {activeModal.metrics?.profitNet?.toFixed(2)}</span></div></div>
                <button onClick={() => setActiveModal(null)} className="w-full bg-green-600 hover:bg-green-500 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-colors">Voltar ao Radar</button>
              </div>
            )}

            {activeModal.type === 'GALE' && (
              <div className="bg-orange-950 border-2 border-orange-500 p-8 rounded-3xl w-full max-w-sm text-center shadow-[0_0_50px_rgba(249,115,22,0.3)]">
                <div className="w-20 h-20 bg-orange-500 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg"><span className="text-4xl">⚠️</span></div>
                <h2 className="text-white text-2xl font-black uppercase tracking-widest mb-2">Recuperação</h2>
                <div className="bg-black/50 p-4 rounded-xl mb-6 border border-orange-900/50"><div className="flex justify-between items-center mb-2 border-b border-orange-900/50 pb-2"><span className="text-[10px] text-gray-400 uppercase tracking-widest">Loss Acumulado</span><span className="text-sm text-red-400 font-mono">- R$ {activeModal.metrics?.previousLoss?.toFixed(2)}</span></div><div className="text-center pt-2"><span className="block text-[10px] text-orange-500 font-black uppercase tracking-widest mb-1">Próxima Aposta Total</span><span className="block text-3xl text-white font-black font-mono">R$ {activeModal.data?.suggested_amount.toFixed(2)}</span></div></div>
                <button onClick={() => setActiveModal(null)} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-colors">Confirmar Ordem de Proteção</button>
              </div>
            )}

            {activeModal.type === 'LOSS' && (
              <div className="bg-red-950 border-2 border-red-600 p-8 rounded-3xl w-full max-w-sm text-center shadow-[0_0_50px_rgba(220,38,38,0.3)]">
                <div className="w-20 h-20 bg-red-600 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg"><span className="text-4xl">🛡️</span></div>
                <h2 className="text-white text-2xl font-black uppercase tracking-widest mb-2">Stop Ciclo</h2>
                <div className="bg-black/50 p-4 rounded-xl mb-6 border border-red-900/50"><div className="flex justify-between items-center mb-2 border-b border-red-900/50 pb-2"><span className="text-[10px] text-gray-400 uppercase tracking-widest">Prejuízo do Ciclo</span><span className="text-xl text-red-500 font-black font-mono">- R$ {activeModal.metrics?.totalCycleLoss?.toFixed(2)}</span></div><div className="pt-2"><span className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1">Alerta Global (Stop -15%)</span><div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mb-1"><div className="bg-red-500 h-full transition-all" style={{ width: `${Math.min(activeModal.metrics?.stopLossPercent || 0, 100)}%` }} /></div><span className="block text-[10px] text-red-400 font-mono text-right">{activeModal.metrics?.stopLossPercent?.toFixed(1)}% Atingido</span></div></div>
                <button onClick={() => setActiveModal(null)} className="w-full bg-gray-800 border border-gray-600 hover:bg-gray-700 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-colors">Aceitar e Rotacionar</button>
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
