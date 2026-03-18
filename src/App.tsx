import { useState, useEffect, useCallback, useRef } from "react";
import { HeaderStatus } from "./components/HeaderStatus";
import { SignalsAlertPanel } from "./components/SignalsAlertPanel";
import { ZScoreSparkline } from "./components/ZScoreSparkline";
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
  return 1.0;
};

// NOVA FUNÇÃO: Cálculo Frontend de Entropia para o HUD
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

export default function App() {
  const [currentView, setCurrentView] = useState<"MACRO" | "SETUP" | "ACTIVE">("MACRO");
  const [macroData, setMacroData] = useState<any>(null);
  const [loadingMacro, setLoadingMacro] = useState(true);

  const [startBankroll, setStartBankroll] = useState("1000.00");
  const [minChip, setMinChip] = useState<number>(0.50); 
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zHistory, setZHistory] = useState<number[]>([]);
  
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
    setError(null); setLoading(true);
    try {
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      if (isNaN(initial_bankroll) || initial_bankroll <= 0) throw new Error("Valor inválido.");
      const res = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initial_bankroll, min_chip: minChip }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro no servidor");
      localStorage.setItem("rlsys_active_session", json.id); 
      spokenSignalsRef.current.clear(); prevSignalsRef.current = []; setSessionId(json.id); setActiveModal(null); setAuditData(null); setSessionTime(0); setCurrentView("ACTIVE"); 
    } catch (err: any) {
      if (retries > 0) setTimeout(() => initSession(retries - 1), 2000); else setError(err.message || "Erro de conexão.");
    } finally { setLoading(false); }
  };

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dashboard`);
      if (!res.ok) throw new Error("Falha na sincronização");
      const json = await res.json(); 
      if (json.session.status === "CLOSED") { localStorage.removeItem("rlsys_active_session"); setCurrentView("MACRO"); }
      else { setData(json); setZHistory((prev) => [...prev.slice(-49), json.zScore]); }
    } catch (err: any) { console.warn("Instabilidade de rede ignorada."); }
  }, [sessionId]);

  useEffect(() => { if (sessionId && data?.session?.status !== "CLOSED") { fetchData(); const int = setInterval(fetchData, 5000); return () => clearInterval(int); } }, [sessionId, data?.session?.status, fetchData]);

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
        if (isVoiceEnabled) {
          const utterance = new SpeechSynthesisUtterance("Atenção. Tempo limite. Fechando o caixa.");
          utterance.lang = "pt-BR"; utterance.rate = 1.1; window.speechSynthesis.speak(utterance);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentView, data?.session?.created_at, data?.session?.status, activeModal?.type, isVoiceEnabled]);

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

    if (isVoiceEnabled) {
      const suggestedSignals = currentSignals.filter((s: any) => s.result === "SUGGESTED");
      suggestedSignals.forEach((signal: any) => {
        if (!spokenSignalsRef.current.has(signal.id)) {
          spokenSignalsRef.current.add(signal.id);
          const utterance = new SpeechSynthesisUtterance(`Alvo. ${signal.strategy?.name}.`);
          utterance.lang = "pt-BR"; utterance.rate = 1.15; window.speechSynthesis.speak(utterance);
        }
      });
    }

    if (activeModal?.type !== 'GLOBAL_STOP') {
      const prevSignals = prevSignalsRef.current;
      prevSignals.forEach(prevSig => {
        if (prevSig.result === 'PENDING') {
          const currSig = currentSignals.find((s:any) => s.id === prevSig.id);
          if (currSig && currSig.result !== 'PENDING') {
            if (currSig.result === 'WIN') {
              const goal = initialB * 1.10; let pGoal = 0;
              if (currentB >= goal) pGoal = 100; else if (currentB > initialB) pGoal = ((currentB - initialB) / (goal - initialB)) * 100;
              const payout = getPayoutRatio(currSig.strategy?.name); const profitNet = currSig.suggested_amount * payout;
              setActiveModal({ type: 'GREEN', data: currSig, metrics: { pGoal, profitNet } });
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
                const currentLossAbsolute = initialB - currentB;
                const stopLossPercent = currentLossAbsolute > 0 ? (currentLossAbsolute / (initialB * 0.15)) * 100 : 0;
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
    if (activeModal?.type !== 'GLOBAL_STOP' && !window.confirm("ATENÇÃO: Deseja liquidar a sessão e fechar o caixa agora?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/close`, { method: "POST" });
      if (!res.ok) throw new Error("Erro ao fechar caixa.");
      localStorage.removeItem("rlsys_active_session"); 
      setIsVoiceEnabled(false); await fetchAuditData(sessionId);
    } catch (err: any) { alert("Falha: " + err.message); } finally { setLoading(false); }
  };

  const fetchAuditData = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}/audit`);
      const json = await res.json();
      setAuditData(json);
    } catch (err) { console.error("Erro ao buscar auditoria", err); }
  };

  useEffect(() => {
    if (data?.session?.status === "CLOSED" && !auditData && sessionId) {
      fetchAuditData(sessionId);
    }
  }, [data?.session?.status, auditData, sessionId]);

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
    catch (err: any) { console.error("Erro inserção:", err); alert("Erro de latência. Tente novamente."); } finally { setLoading(false); }
  };

  const handleSignalAction = async (signalId: string, action: "CONFIRM" | "REJECT") => {
    if (!sessionId) return; setLoading(true);
    try { await fetch(`/api/signals/${signalId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); fetchData(); } 
    catch (err: any) { alert("Erro ao registrar ação."); } finally { setLoading(false); }
  };

  const handleOcrUpload = async (file: File) => {
    if (!sessionId || data?.session?.status === "CLOSED" || activeModal?.type === 'GLOBAL_STOP') return;
    setLoading(true);
    let rawTextStr = "", extractedNumbersArray: number[] = []; let debugImageStr = "";
    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image(); img.src = e.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement("canvas"); let w = img.width, h = img.height; const maxDim = 1200;
            if (w > h) { if (w > maxDim) { h *= maxDim / w; w = maxDim; } } else { if (h > maxDim) { w *= maxDim / h; h = maxDim; } }
            canvas.width = w; canvas.height = h; const ctx = canvas.getContext("2d");
            if (ctx) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h); }
            const finalBase64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1]; debugImageStr = `data:image/jpeg;base64,${finalBase64}`; resolve(finalBase64);
          }; img.onerror = reject;
        }; reader.onerror = reject;
      });
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY; if (!apiKey) throw new Error("Chave não configurada.");
      const genAI = new GoogleGenerativeAI(apiKey); const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview", generationConfig: { temperature: 0.0, maxOutputTokens: 8192, responseMimeType: "application/json" } });
      let attempt = 0; 
      while (attempt <= 15) {
        try {
          const result = await model.generateContent([`You are an OCR. Extract ALL numbers from the provided roulette table image. You MUST return a JSON object containing exactly these arrays. DO NOT MISS ANY ROW. Structure: {"top_row": [],"grid_row_1": [],"grid_row_2": [],"grid_row_3": [],"grid_row_4": [],"grid_row_5": [],"grid_row_6": [],"grid_row_7": [],"grid_row_8": [],"grid_row_9_bottom": []}`, { inlineData: { data: base64Image, mimeType: "image/jpeg" } }]);
          rawTextStr = result.response.text(); if (rawTextStr) break;
        } catch (apiErr: any) { attempt++; if (attempt > 15) throw apiErr; await new Promise(r => setTimeout(r, attempt * 3000)); }
      }
      try {
        const jsonObj = JSON.parse(rawTextStr); extractedNumbersArray = [...(jsonObj.top_row || []), ...(jsonObj.grid_row_1 || []), ...(jsonObj.grid_row_2 || []), ...(jsonObj.grid_row_3 || []), ...(jsonObj.grid_row_4 || []), ...(jsonObj.grid_row_5 || []), ...(jsonObj.grid_row_6 || []), ...(jsonObj.grid_row_7 || []), ...(jsonObj.grid_row_8 || []), ...(jsonObj.grid_row_9_bottom || [])];
      } catch (parseError) { extractedNumbersArray = (rawTextStr.match(/\b([0-9]|[12][0-9]|3[0-6])\b/g) || []).map(n => parseInt(n)); }
      const numbers = [...extractedNumbersArray].reverse();
      setDebugInfo({ isOpen: true, sentImageBase64: debugImageStr, rawAiText: rawTextStr, filteredNumbers: extractedNumbersArray });
      if (numbers.length === 0) throw new Error("Nenhum número detectado.");
      await fetch(`/api/sessions/${sessionId}/ocr/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numbers }) });
      fetchData();
    } catch (err: any) { alert("Erro OCR: " + err.message); setDebugInfo({ isOpen: true, sentImageBase64: debugImageStr, rawAiText: rawTextStr || "FALHA", filteredNumbers: extractedNumbersArray }); } finally { setLoading(false); }
  };

  if (currentView === "MACRO") {
    if (loadingMacro) return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center"><div className="text-indigo-500 animate-pulse font-black text-2xl mb-2">RL.SYS</div><div className="text-gray-600 text-[10px] uppercase">Carregando Histórico...</div></div>);
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center p-6 select-none overflow-y-auto">
        <h1 className="text-white text-3xl font-black uppercase tracking-tighter mt-8 mb-2">RL.sys</h1>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.2em] mb-8">Painel do Diretor</p>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl mb-6">
          <span className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-4">Evolução Patrimonial</span>
          <div className="flex justify-between items-end border-b border-gray-800 pb-4 mb-4">
            <div><span className="block text-xs font-bold text-gray-400 uppercase">P&L Líquido Global</span><span className={`text-3xl font-black ${macroData.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>{macroData.totalProfit >= 0 ? '+' : ''}R$ {macroData.totalProfit.toFixed(2)}</span></div>
            <div className="text-right"><span className="block text-xs font-bold text-gray-400 uppercase">Operações</span><span className="text-xl font-bold text-white">{macroData.totalSessions}</span></div>
          </div>
        </div>
        <button onClick={() => setCurrentView("SETUP")} className="w-full max-w-sm bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-lg mb-8 transition-all">Nova Operação Tática</button>
      </div>
    );
  }

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

  if (data?.session?.status === "CLOSED") {
    // ... [código de auditoria inalterado, mantido da versão anterior]
    return (<div className="min-h-screen bg-gray-950 text-center pt-20"><button onClick={() => { localStorage.removeItem("rlsys_active_session"); window.location.reload(); }} className="bg-gray-800 hover:bg-gray-700 text-white font-black uppercase tracking-widest py-4 px-8 rounded-xl shadow-lg transition-colors">Voltar ao Radar Global</button></div>);
  }

  const initialB = data?.session?.initial_bankroll || 1;
  const currentB = data?.session?.current_bankroll || 1;
  const highestB = data?.session?.highest_bankroll || initialB;
  let visualStopLimit = initialB * 0.85; let visualStopLabel = "HARD STOP (-15%)";
  if (highestB >= initialB * 1.08) { visualStopLimit = initialB * 1.04; visualStopLabel = "TRAILING STOP (+4%)"; } 
  else if (highestB >= initialB * 1.05) { visualStopLimit = initialB * 1.01; visualStopLabel = "BREAK-EVEN (+1%)"; }
  const distanceToStop = currentB - visualStopLimit;

  // CÁLCULO DO VIX (ENTROPIA)
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
          <button onClick={() => setIsVoiceEnabled(!isVoiceEnabled)} className={`border text-[9px] uppercase font-black px-3 py-2 rounded-lg tracking-widest transition-colors flex items-center gap-1 ${isVoiceEnabled ? 'bg-indigo-900/40 border-indigo-500/50 text-indigo-400' : 'bg-gray-900 border-gray-700 text-gray-500'}`}>{isVoiceEnabled ? "🔊 Voz ON" : "🔇 Voz OFF"}</button>
          <button onClick={handleCloseSession} disabled={loading} className="bg-red-950/40 hover:bg-red-900/80 border border-red-900/50 text-red-500 text-[9px] uppercase font-black px-3 py-2 rounded-lg tracking-widest transition-colors flex items-center gap-1">⏹ Fechar</button>
        </div>
      </div>

      <div className="flex-shrink-0 pt-2">
        <HeaderStatus bankroll={currentB} initialBankroll={initialB} zScore={data?.zScore || 0} isConnected={true} />
        
        {/* NOVO: TERMÔMETRO VIX (SHANNON ENTROPY) */}
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
            <div className="text-right pl-2"><span className="block text-3xl font-black font-mono text-white">{circuitBreaker.spinsLeft}</span><span className="text-[8px] text-gray-400 uppercase tracking-widest">Giros<br/>Restantes</span></div>
          </div>
        )}
        
        {data?.session?.signals && data.session.signals.length > 0 && data.session.signals.map((sig: any) => {
          if (sig.result !== "SUGGESTED" && sig.result !== "PENDING") return null;
          
          // Tratamento Visual para a DROP ZONE DINÂMICA
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
                   <span className={`block text-[9px] font-black uppercase tracking-widest mb-1 ${sig.result === 'SUGGESTED' ? 'text-red-500' : 'text-green-500'}`}>Aposta Total (R$)</span>
                   <span className="text-2xl font-black font-mono text-white">{sig.suggested_amount.toFixed(2)}</span>
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
          <section><span className="block text-[10px] uppercase font-black text-gray-500 mb-3 px-2">Leitura Óptica (OCR)</span><OcrButton onUpload={handleOcrUpload} isLoading={loading} /></section>
        </div>
      </motion.div>
    </div>
  );
}
