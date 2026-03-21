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

const generateDiagnostic = (auditData: any, pnl: number) => {
  if (pnl >= 0) return { title: "OPERAÇÃO BEM SUCEDIDA", text: "Sessão concluída com capital preservado. O motor garantiu a execução no lucro ou break-even.", color: "text-green-400", bg: "bg-green-950/30", border: "border-green-900/50" };
  const entropy = calculateEntropy(auditData.spins || []);
  const durationMs = new Date(auditData.closed_at || Date.now()).getTime() - new Date(auditData.created_at).getTime();
  const mins = durationMs / 60000;
  if (entropy > 4.5) return { title: "CAUSA PRIMÁRIA: CAOS ALGORÍTMICO (VIX)", text: "A entropia da mesa atingiu dispersão máxima. O RNG quebrou padrões lógicos. O Stop Loss atuou para evitar a ruína.", color: "text-red-400", bg: "bg-red-950/30", border: "border-red-900/50" };
  if (mins >= 45) return { title: "CAUSA PRIMÁRIA: FADIGA DE MESA", text: "A exposição prolongada no mercado corroeu a margem matemática. O Time-Stop forçou a liquidação.", color: "text-orange-400", bg: "bg-orange-950/30", border: "border-orange-900/50" };
  return { title: "CAUSA PRIMÁRIA: VARIÂNCIA AGUDA", text: "O sistema encontrou anomalias fora do desvio padrão e acionou o Stop Loss no Gale 1.", color: "text-yellow-400", bg: "bg-yellow-950/30", border: "border-yellow-900/50" };
};

export default function App() {
  const [currentView, setCurrentView] = useState<"MACRO" | "SETUP" | "LAB" | "ACTIVE" | "AUDIT_VIEW">("MACRO");
  const [macroData, setMacroData] = useState<any>(null);
  const [loadingMacro, setLoadingMacro] = useState(true);
  const [startBankroll, setStartBankroll] = useState("100.00");
  const [minChip, setMinChip] = useState<number>(0.50); 
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [auditData, setAuditData] = useState<any>(null);
  const [simReport, setSimReport] = useState<any>(null);
  const [cachedWarmNumbers, setCachedWarmNumbers] = useState<number[]>([]);
  const [circuitBreaker, setCircuitBreaker] = useState<{active: boolean, spinsLeft: number}>({active: false, spinsLeft: 0});
  const [sessionTime, setSessionTime] = useState<number>(0);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const spokenSignalsRef = useRef<Set<string>>(new Set());
  const prevSignalsRef = useRef<any[]>([]);
  const [activeModal, setActiveModal] = useState<{type: 'GREEN'|'LOSS'|'GALE'|'GLOBAL_STOP', data?: any, metrics?: any} | null>(null);

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

  const handleWarmStartDeploy = async () => {
    if (cachedWarmNumbers.length === 0) return alert("Nenhum cache OCR para Warm-Start.");
    setLoading(true);
    try {
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      const res = await fetch("/api/sessions/warm-start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initial_bankroll, min_chip: minChip, numbers: cachedWarmNumbers }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no deploy warm-start");
      localStorage.setItem("rlsys_active_session", json.id); 
      spokenSignalsRef.current.clear(); prevSignalsRef.current = []; setSessionId(json.id); setActiveModal(null); setAuditData(null); setSessionTime(0); setCurrentView("ACTIVE"); 
    } catch (err: any) { alert(err.message || "Erro no Deploy."); } finally { setLoading(false); }
  };

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dashboard`);
      const json = await res.json(); 
      if (json.session?.status === "CLOSED") { localStorage.removeItem("rlsys_active_session"); setCurrentView("MACRO"); }
      else { setData(json); }
    } catch (err: any) {}
  }, [sessionId]);

  useEffect(() => { if (sessionId && data?.session?.status !== "CLOSED" && currentView === "ACTIVE") { fetchData(); const int = setInterval(fetchData, 5000); return () => clearInterval(int); } }, [sessionId, data?.session?.status, currentView, fetchData]);

  useEffect(() => {
    if (currentView !== "ACTIVE" || !data?.session?.created_at || data?.session?.status === "CLOSED" || activeModal?.type === 'GLOBAL_STOP') return;
    const startTime = new Date(data.session.created_at).getTime();
    const interval = setInterval(() => {
      const now = Date.now(); const elapsed = now - startTime; setSessionTime(elapsed);
      if (elapsed >= 50 * 60 * 1000 && activeModal?.type !== 'GLOBAL_STOP') {
        setActiveModal({ type: 'GLOBAL_STOP', metrics: { stopLabel: "TIME-STOP (FADIGA)", pnlFinal: data.session.current_bankroll - data.session.initial_bankroll, isTrailing: data.session.current_bankroll > data.session.initial_bankroll } });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentView, data, activeModal?.type]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000); const minutes = Math.floor(totalSeconds / 60); const seconds = totalSeconds % 60;
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

    let dynamicStopLimit = initialB * 0.85; let stopLabel = "HARD STOP (-15%)"; let isTrailing = false;
    if (highestB >= initialB * 1.08) { dynamicStopLimit = initialB * 1.04; stopLabel = "TRAILING STOP (+4%)"; isTrailing = true; } 
    else if (highestB >= initialB * 1.05) { dynamicStopLimit = initialB * 1.01; stopLabel = "BREAK-EVEN (+1%)"; isTrailing = true; }

    if (currentB <= dynamicStopLimit && data.session.spins.length > 0 && activeModal?.type !== 'GLOBAL_STOP') {
      setActiveModal({ type: 'GLOBAL_STOP', metrics: { stopLabel, pnlFinal: currentB - initialB, isTrailing } }); return; 
    }

    if (activeModal?.type !== 'GLOBAL_STOP') {
      prevSignalsRef.current.forEach(prevSig => {
        if (prevSig.result === 'PENDING') {
          const currSig = currentSignals.find((s:any) => s.id === prevSig.id);
          if (currSig && currSig.result !== 'PENDING') {
            if (currSig.result === 'WIN') {
              const payout = getPayoutRatio(currSig.strategy?.name);
              setActiveModal({ type: 'GREEN', data: currSig, metrics: { pGoal: 100, profitNet: currSig.suggested_amount * payout } });
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
              else { setActiveModal({ type: 'LOSS', data: currSig, metrics: { totalCycleLoss: accLoss, stopLossPercent: initialB - currentB > 0 ? ((initialB - currentB) / (initialB * 0.15)) * 100 : 0 } }); }
            }
          }
        }
      });
    }
    prevSignalsRef.current = currentSignals;
  }, [data, activeModal?.type]);

  const handleCloseSession = async () => {
    if (!sessionId) return;
    if (activeModal?.type !== 'GLOBAL_STOP' && !window.confirm("Fechar caixa?")) return;
    setLoading(true);
    try {
      await fetch(`/api/sessions/${sessionId}/close`, { method: "POST" });
      localStorage.removeItem("rlsys_active_session"); setIsVoiceEnabled(false); 
      await loadSessionAudit(sessionId); 
    } catch (err: any) { alert("Falha: " + err.message); } finally { setLoading(false); }
  };

  const loadSessionAudit = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${id}/audit`);
      setAuditData(await res.json()); setCurrentView("AUDIT_VIEW");
    } catch (err) {} finally { setLoading(false); }
  };

  const handleNumberClick = async (number: number) => {
    if (!sessionId || data?.session?.status === "CLOSED" || activeModal?.type === 'GLOBAL_STOP') return;
    setLoading(true);
    try { await fetch(`/api/sessions/${sessionId}/spins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number }) }); fetchData(); } 
    catch (err: any) {} finally { setLoading(false); }
  };

  const handleSignalAction = async (signalId: string, action: "CONFIRM" | "REJECT") => {
    if (!sessionId) return; setLoading(true);
    try { await fetch(`/api/signals/${signalId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); fetchData(); } 
    catch (err: any) {} finally { setLoading(false); }
  };

  const processOCR = async (file: File): Promise<number[]> => {
    const base64Image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image(); img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas"); let w = img.width, h = img.height; const maxDim = 1200;
          if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } } else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
          canvas.width = w; canvas.height = h; const ctx = canvas.getContext("2d");
          if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h); }
          resolve(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
        }; img.onerror = reject;
      }; reader.onerror = reject;
    });

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY; if (!apiKey) throw new Error("Chave do OCR ausente.");
    const genAI = new GoogleGenerativeAI(apiKey); const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", generationConfig: { temperature: 0.0, maxOutputTokens: 8192, responseMimeType: "application/json" } });
    
    const result = await model.generateContent([`You are an OCR. Extract ALL numbers from the provided roulette image. Return JSON: {"numbers": []}`, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }]);
    const jsonObj = JSON.parse(result.response.text());
    const numbers = [...(jsonObj.numbers || [])].reverse(); 
    if (numbers.length === 0) throw new Error("Nenhum número detectado.");
    return numbers;
  };

  const handleOcrSimulatorUpload = async (file: File) => {
    setLoading(true);
    try {
      const numbers = await processOCR(file);
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      const res = await fetch("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numbers, initial_bankroll, min_chip: minChip }) });
      setSimReport(await res.json()); setCachedWarmNumbers(numbers); 
    } catch (err: any) { alert("Erro Simulador: " + err.message); } finally { setLoading(false); }
  };

  const handleOcrUpload = async (file: File) => {
    if (!sessionId || data?.session?.status === "CLOSED" || activeModal?.type === 'GLOBAL_STOP') return;
    setLoading(true);
    try {
      const numbers = await processOCR(file);
      await fetch(`/api/sessions/${sessionId}/ocr/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numbers }) });
      fetchData();
    } catch (err: any) { alert("Erro OCR: " + err.message); } finally { setLoading(false); }
  };

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

        <div className="w-full max-w-sm flex gap-2 mb-6">
           <button onClick={() => setCurrentView("SETUP")} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg transition-all">Setup Mesa</button>
           <button onClick={() => setCurrentView("LAB")} className="flex-1 bg-gray-800 border border-indigo-500/50 hover:bg-gray-700 text-indigo-400 font-black uppercase tracking-widest py-4 rounded-xl shadow-lg transition-all">Simulador</button>
        </div>

        <div className="w-full max-w-sm">
          <span className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-3 px-2">Relatórios Post-Mortem</span>
          <div className="space-y-2">
            {macroData.sessions && macroData.sessions.length === 0 && <p className="text-xs text-gray-600 text-center py-4">Nenhuma sessão finalizada.</p>}
            {macroData.sessions && macroData.sessions.map((s: any) => {
               const pnl = s.current_bankroll - s.initial_bankroll;
               return (
                 <div key={s.id} onClick={() => loadSessionAudit(s.id)} className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex justify-between items-center cursor-pointer hover:bg-gray-800 transition-colors">
                    <div><span className="text-xs text-white font-bold block">{new Date(s.created_at).toLocaleDateString('pt-BR')}</span><span className="text-[10px] text-gray-500 uppercase tracking-widest block mt-0.5">Auditar</span></div>
                    <span className={`text-lg font-mono font-black ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{pnl >= 0 ? '+' : ''}R$ {pnl.toFixed(2)}</span>
                 </div>
               )
            })}
          </div>
        </div>
      </div>
    );
  }

  if (currentView === "LAB") {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col p-6 select-none overflow-y-auto">
        <div className="flex justify-between items-center mb-8 mt-4">
          <div><h1 className="text-white text-2xl font-black uppercase tracking-tighter">Laboratório HFT</h1><p className="text-indigo-400 text-[10px] uppercase font-bold tracking-[0.2em]">Simulador Monte Carlo</p></div>
          <button onClick={() => { setSimReport(null); setCurrentView("MACRO"); }} className="text-gray-500 text-[10px] font-black uppercase">Voltar</button>
        </div>

        {!simReport ? (
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl w-full shadow-2xl">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div><label className="block text-[8px] text-gray-500 uppercase font-black mb-1">Banca Fictícia (R$)</label><input type="number" value={startBankroll} onChange={(e) => setStartBankroll(e.target.value)} className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white text-sm font-black text-center" /></div>
              <div><label className="block text-[8px] text-gray-500 uppercase font-black mb-1">Ficha (R$)</label><div className="flex gap-1"><button onClick={() => setMinChip(0.50)} className={`flex-1 py-3 rounded-lg border text-xs ${minChip === 0.50 ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 font-black' : 'bg-black border-gray-800 text-gray-500'}`}>0,50</button><button onClick={() => setMinChip(0.10)} className={`flex-1 py-3 rounded-lg border text-xs ${minChip === 0.10 ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 font-black' : 'bg-black border-gray-800 text-gray-500'}`}>0,10</button></div></div>
            </div>
            <div className="bg-indigo-950/20 border border-indigo-900/50 p-4 rounded-xl text-center mb-6">
               <span className="text-[10px] text-indigo-400 uppercase font-black tracking-widest block mb-2">Injeção OCR</span>
               <OcrButton onUpload={handleOcrSimulatorUpload} isLoading={loading} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
             <div className={`p-6 rounded-3xl border-2 shadow-2xl ${simReport.verdict === 'GREEN_LIGHT' ? 'bg-green-950 border-green-500' : (simReport.verdict === 'RED_LIGHT' ? 'bg-red-950 border-red-600' : 'bg-yellow-950 border-yellow-600')}`}>
                <div className="text-center mb-6">
                   <h2 className={`text-2xl font-black uppercase tracking-widest ${simReport.verdict === 'GREEN_LIGHT' ? 'text-green-400' : (simReport.verdict === 'RED_LIGHT' ? 'text-red-400' : 'text-yellow-400')}`}>{simReport.verdict === 'GREEN_LIGHT' ? 'MESA APROVADA' : (simReport.verdict === 'RED_LIGHT' ? 'MESA REPROVADA' : 'ALERTA DE RISCO')}</h2>
                   <span className="text-[9px] uppercase font-black text-gray-400 tracking-widest">Veredito da Simulação</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                   <div className="bg-black/50 p-3 rounded-xl border border-gray-800/50"><span className="block text-[8px] text-gray-500 uppercase tracking-widest mb-1">P&L Simulado</span><span className={`block text-xl font-black font-mono ${simReport.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{simReport.netProfit >= 0 ? '+' : ''}R$ {simReport.netProfit.toFixed(2)}</span></div>
                   <div className="bg-black/50 p-3 rounded-xl border border-gray-800/50"><span className="block text-[8px] text-gray-500 uppercase tracking-widest mb-1">Taxa de Acerto</span><span className="block text-xl font-black text-white font-mono">{simReport.winRate}%</span></div>
                   <div className="bg-black/50 p-3 rounded-xl border border-gray-800/50"><span className="block text-[8px] text-gray-500 uppercase tracking-widest mb-1">VIX (Entropia)</span><span className={`block text-sm font-black font-mono ${simReport.entropyStatus === 'CAOS' ? 'text-red-500' : 'text-gray-300'}`}>{simReport.entropyStatus}</span></div>
                   <div className="bg-black/50 p-3 rounded-xl border border-gray-800/50"><span className="block text-[8px] text-gray-500 uppercase tracking-widest mb-1">Max Drawdown</span><span className="block text-sm font-black text-red-400 font-mono">R$ {simReport.maxDrawdown.toFixed(2)}</span></div>
                </div>
                {simReport.verdict === 'GREEN_LIGHT' && (<button onClick={handleWarmStartDeploy} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase py-4 rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all flex items-center justify-center gap-2">{loading ? "Injetando Memória..." : "⚡ APROVAR DEPLOY PARA MESA REAL"}</button>)}
                {simReport.verdict !== 'GREEN_LIGHT' && (<button onClick={() => setSimReport(null)} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-black uppercase py-4 rounded-xl transition-all">Abortar e Testar Outra Mesa</button>)}
             </div>
             <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl">
               <span className="block text-[10px] text-gray-500 font-black uppercase tracking-widest mb-3">Ranking de Matrizes (Backtest)</span>
               <div className="space-y-2">
                 {simReport.strategiesReport.map((strat: any) => (
                   <div key={strat.name} className="flex justify-between items-center bg-gray-950 p-3 rounded border border-gray-800/50">
                     <div><span className="text-[10px] font-bold text-gray-300 block">{strat.name}</span><span className="text-[8px] text-gray-500 uppercase tracking-widest">{strat.signalsSent} Entradas | {strat.winRate}% WR</span></div>
                     <span className={`text-xs font-mono font-black ${strat.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{strat.profit >= 0 ? '+' : ''}R$ {strat.profit.toFixed(2)}</span>
                   </div>
                 ))}
               </div>
             </div>
          </div>
        )}
      </div>
    );
  }

  if (currentView === "AUDIT_VIEW") {
    if (!auditData) return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-indigo-500 font-black animate-pulse">Compilando Auditoria...</div>);
    const pnl = auditData.current_bankroll - auditData.initial_bankroll;
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
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl"><span className="block text-[9px] text-gray-500 uppercase tracking-widest mb-1">Pico de Lucro</span><span className="block text-sm font-bold text-indigo-400 font-mono">R$ {auditData.highest_bankroll?.toFixed(2) || "0.00"}</span></div>
          </div>
          <div className={`p-4 rounded-xl border ${diagnostic.bg} ${diagnostic.border}`}><span className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${diagnostic.color}`}>{diagnostic.title}</span><p className="text-xs text-gray-300 leading-relaxed">{diagnostic.text}</p></div>
          <div className="bg-black/50 border border-gray-800 rounded-xl overflow-hidden mt-4">
            <div className="p-3 border-b border-gray-800 bg-gray-900/50"><span className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Linha do Tempo</span></div>
            <div className="max-h-80 overflow-y-auto p-2 space-y-2">
              {auditData.signals.length === 0 && <div className="text-center p-4 text-xs text-gray-600">Nenhum sinal gerado.</div>}
              {auditData.signals.slice().reverse().map((sig: any) => (
                <div key={sig.id} className="flex justify-between items-center bg-gray-950 p-3 rounded border border-gray-800/50">
                  <div><span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded mr-2 ${sig.result === 'WIN' ? 'bg-green-900/30 text-green-500' : (sig.result === 'LOSS' ? 'bg-red-900/30 text-red-500' : 'bg-gray-800 text-gray-400')}`}>{sig.result}</span><span className="text-[10px] font-bold text-gray-300">{sig.strategy?.name}</span></div>
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

  if (currentView === "SETUP") {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <h1 className="text-white text-3xl font-black uppercase tracking-tighter mb-2">RL.sys</h1>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.2em] mb-8">Terminal Institucional</p>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl">
          <div className="mb-6 flex justify-between items-center"><span className="text-[10px] uppercase font-black text-gray-500 tracking-widest">Setup Frio</span><button onClick={() => setCurrentView("MACRO")} className="text-indigo-500 hover:text-indigo-400 text-[10px] font-bold uppercase tracking-wider transition-colors">Voltar</button></div>
          <div className="mb-6"><label className="block text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Ficha Mínima</label><div className="grid grid-cols-2 gap-2"><button onClick={() => setMinChip(0.50)} className={`py-3 rounded-xl border ${minChip === 0.50 ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 font-black' : 'bg-black border-gray-800 text-gray-500'}`}>R$ 0,50</button><button onClick={() => setMinChip(0.10)} className={`py-3 rounded-xl border ${minChip === 0.10 ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400 font-black' : 'bg-black border-gray-800 text-gray-500'}`}>R$ 0,10</button></div></div>
          <label className="block text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Banca Atual (R$)</label>
          <input type="number" value={startBankroll} onChange={(e) => setStartBankroll(e.target.value)} className="w-full bg-black border border-gray-700 rounded-xl p-4 text-white text-2xl font-black focus:outline-none focus:border-indigo-500 transition-colors mb-6 text-center" />
          <button onClick={() => initSession()} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg transition-all">Iniciar Mesa Cega</button>
        </div>
      </div>
    );
  }

  const currentEntropy = calculateEntropy(data?.session?.spins || []);
  const entropyPercent = Math.min((currentEntropy / 5.20) * 100, 100);
  let entropyColor = "bg-green-500"; let entropyLabel = "ESTÁVEL";
  if (currentEntropy > 4.0) { entropyColor = "bg-yellow-500"; entropyLabel = "VOLÁTIL"; }
  if (currentEntropy > 4.6) { entropyColor = "bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]"; entropyLabel = "CAOS"; }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col max-w-md mx-auto shadow-2xl border-x border-gray-800 select-none overflow-hidden relative">
      <div className="bg-gray-950 border-b border-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2"><div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" /><span className="text-white font-black tracking-widest uppercase text-xs">RL.sys</span></div>
        <button onClick={handleCloseSession} disabled={loading} className="bg-red-950/40 hover:bg-red-900/80 border border-red-900/50 text-red-500 text-[9px] uppercase font-black px-3 py-2 rounded-lg tracking-widest transition-colors flex items-center gap-1">⏹ Fechar</button>
      </div>

      <div className="flex-shrink-0 pt-2">
        <HeaderStatus bankroll={data?.session?.current_bankroll || 1} initialBankroll={data?.session?.initial_bankroll || 1} zScore={data?.zScore || 0} isConnected={true} />
        
        <div className="mx-4 mt-2 mb-2 bg-black/60 border border-gray-800 p-3 rounded-lg relative overflow-hidden">
           <div className="flex justify-between items-center mb-1"><span className="text-[9px] text-gray-400 uppercase tracking-widest font-black">Índice VIX (Entropia)</span><span className={`text-[9px] font-black uppercase tracking-widest ${currentEntropy > 4.6 ? 'text-red-500' : 'text-gray-300'}`}>{entropyLabel}</span></div>
           <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden flex"><div className={`h-full transition-all duration-1000 ${entropyColor}`} style={{ width: `${entropyPercent}%` }} /></div>
        </div>

        {circuitBreaker.active && (
          <div className="mx-4 mb-4 bg-orange-950/80 border-2 border-orange-500 p-4 rounded-xl flex items-center justify-between shadow-[0_0_20px_rgba(249,115,22,0.3)] animate-pulse">
            <div className="flex items-center gap-3"><span className="text-3xl">⚠️</span><div><h3 className="text-orange-500 font-black uppercase tracking-widest text-sm">Circuit Breaker</h3></div></div>
            <div className="text-right pl-2"><span className="block text-3xl font-black font-mono text-white">{circuitBreaker.spinsLeft}</span></div>
          </div>
        )}
        
        {data?.session?.signals && data.session.signals.length > 0 && data.session.signals.map((sig: any) => {
          if (sig.result !== "SUGGESTED" && sig.result !== "PENDING") return null;
          let displayTarget = sig.target_bet.replace(/_/g, " ");
          if (displayTarget.includes("DROP ZONE")) displayTarget = `ALVO FÍSICO: VIZINHOS DO ${displayTarget.split(" ")[2]}`;

          return (
            <div key={sig.id} className={`mt-4 mx-4 relative overflow-hidden border p-4 rounded-xl transition-all shadow-lg ${sig.result === 'SUGGESTED' ? 'bg-red-950/40 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-green-950/40 border-green-500/30'}`}>
               <div className={`absolute top-0 left-0 w-1 h-full animate-pulse ${sig.result === 'SUGGESTED' ? 'bg-red-500' : 'bg-green-500'}`} />
               <div className="flex justify-between items-start">
                 <div className="pl-2">
                   <div className="flex items-center gap-2 mb-1"><span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${sig.result === 'SUGGESTED' ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'}`}>{sig.result === 'SUGGESTED' ? 'AÇÃO REQUERIDA' : 'APOSTA CONFIRMADA'}</span></div>
                   <h3 className="text-sm font-black uppercase tracking-wide text-white">{sig.strategy?.name}</h3>
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Alvo: {displayTarget}</p>
                 </div>
                 <div className="text-right">
                   <span className="block text-[9px] font-black uppercase tracking-widest mb-1 text-gray-400">Aposta Total</span>
                   <span className="text-2xl font-black font-mono text-white">R$ {sig.suggested_amount.toFixed(2)}</span>
                 </div>
               </div>
               {sig.result === "SUGGESTED" ? (
                 <div className="mt-4 flex gap-2 w-full">
                   <button onClick={() => handleSignalAction(sig.id, "CONFIRM")} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-black py-2 rounded-lg uppercase tracking-widest transition-all">Fiz a Aposta</button>
                   <button onClick={() => handleSignalAction(sig.id, "REJECT")} disabled={loading} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] font-black py-2 rounded-lg uppercase tracking-widest transition-all">Ignorar</button>
                 </div>
               ) : (<div className="mt-4 text-center py-2 bg-black/40 rounded-lg"><span className="text-[10px] text-green-500 font-black uppercase tracking-widest animate-pulse">Aguardando Roleta...</span></div>)}
            </div>
          );
        })}
        <SpinTimeline spins={data?.session?.spins || []} />
      </div>
      
      <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="flex-grow bg-gray-950 rounded-t-[32px] border-t border-gray-800 p-4 pb-8 mt-4 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-6" />
        <div className="space-y-6">
          <section><span className="block text-[10px] uppercase font-black text-gray-500 mb-3 px-2">Entrada Manual</span><ManualEntryInput onNumberSubmit={handleNumberClick} isLoading={loading} /></section>
          <section><span className="block text-[10px] uppercase font-black text-gray-500 mb-3 px-2">Leitura Óptica (OCR)</span><OcrButton onUpload={handleOcrUpload} isLoading={loading} /></section>
        </div>
      </motion.div>

      <AnimatePresence>
        {activeModal && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-md">
            {activeModal.type === 'GLOBAL_STOP' && (
              <div className={`border-2 p-8 rounded-3xl w-full max-w-sm text-center ${activeModal.metrics?.isTrailing ? 'bg-indigo-950 border-indigo-500' : 'bg-red-950 border-red-600'}`}>
                <h2 className="text-white text-3xl font-black uppercase tracking-widest mb-2">Liquidação</h2>
                <p className={`${activeModal.metrics?.isTrailing ? 'text-indigo-400' : 'text-red-400'} font-bold mb-6 text-sm uppercase tracking-widest`}>{activeModal.metrics?.stopLabel} Atingido</p>
                <button onClick={handleCloseSession} className={`w-full text-white font-black uppercase py-4 rounded-xl shadow-lg transition-colors ${activeModal.metrics?.isTrailing ? 'bg-indigo-600' : 'bg-red-600'}`}>Fechar Caixa</button>
              </div>
            )}
            {activeModal.type === 'GREEN' && (
              <div className="bg-green-950 border-2 border-green-500 p-8 rounded-3xl w-full max-w-sm text-center shadow-[0_0_50px_rgba(34,197,94,0.3)]">
                <div className="w-20 h-20 bg-green-500 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg animate-pulse"><span className="text-4xl">💰</span></div>
                <h2 className="text-white text-3xl font-black uppercase tracking-widest mb-2">GREEN</h2>
                <button onClick={() => setActiveModal(null)} className="w-full bg-green-600 hover:bg-green-500 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-colors">Voltar ao Radar</button>
              </div>
            )}
            {activeModal.type === 'GALE' && (
              <div className="bg-orange-950 border-2 border-orange-500 p-8 rounded-3xl w-full max-w-sm text-center shadow-[0_0_50px_rgba(249,115,22,0.3)]">
                <div className="w-20 h-20 bg-orange-500 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg"><span className="text-4xl">⚠️</span></div>
                <h2 className="text-white text-2xl font-black uppercase tracking-widest mb-2">Recuperação</h2>
                <button onClick={() => setActiveModal(null)} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-colors">Confirmar Ordem de Proteção</button>
              </div>
            )}
            {activeModal.type === 'LOSS' && (
              <div className="bg-red-950 border-2 border-red-600 p-8 rounded-3xl w-full max-w-sm text-center shadow-[0_0_50px_rgba(220,38,38,0.3)]">
                <div className="w-20 h-20 bg-red-600 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg"><span className="text-4xl">🛡️</span></div>
                <h2 className="text-white text-2xl font-black uppercase tracking-widest mb-2">Stop Ciclo</h2>
                <button onClick={() => setActiveModal(null)} className="w-full bg-gray-800 border border-gray-600 hover:bg-gray-700 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-colors">Aceitar e Rotacionar</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
