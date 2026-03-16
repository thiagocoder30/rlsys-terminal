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
  if (stratName.includes("Vizinhos")) return 0.38; 
  if (stratName.includes("James Bond")) return 0.44;
  if (stratName.includes("Cross")) return 0.44; 
  if (stratName.includes("Dúzia") || stratName.includes("Coluna")) return 2.0;
  return 1.0;
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
      spokenSignalsRef.current.clear(); prevSignalsRef.current = []; setSessionId(json.id); setActiveModal(null); setCurrentView("ACTIVE"); 
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
      if (json.session.status === "CLOSED") { localStorage.removeItem("rlsys_active_session"); }
      setData(json); setZHistory((prev) => [...prev.slice(-49), json.zScore]);
    } catch (err: any) { 
      if (err.message.includes("Falha")) { localStorage.removeItem("rlsys_active_session"); setCurrentView("MACRO"); }
    }
  }, [sessionId]);

  useEffect(() => { if (sessionId) { fetchData(); const int = setInterval(fetchData, 5000); return () => clearInterval(int); } }, [sessionId, fetchData]);

  useEffect(() => {
    if (!data?.session) return;
    const initialB = data.session.initial_bankroll;
    const currentB = data.session.current_bankroll;
    const highestB = data.session.highest_bankroll || initialB;
    const currentSignals = data.session.signals || [];

    let dynamicStopLimit = initialB * 0.85; 
    let stopLabel = "HARD STOP (-15%)";
    let isTrailing = false;

    if (highestB >= initialB * 1.08) { dynamicStopLimit = initialB * 1.04; stopLabel = "TRAILING STOP (+4%)"; isTrailing = true; } 
    else if (highestB >= initialB * 1.05) { dynamicStopLimit = initialB * 1.01; stopLabel = "BREAK-EVEN (+1%)"; isTrailing = true; }

    if (currentB <= dynamicStopLimit && data.session.spins.length > 0 && activeModal?.type !== 'GLOBAL_STOP') {
      const pnlFinal = currentB - initialB;
      setActiveModal({ type: 'GLOBAL_STOP', metrics: { stopLabel, pnlFinal, isTrailing } });
      if (isVoiceEnabled) {
        const utterance = new SpeechSynthesisUtterance(`Atenção. Limite de ${stopLabel} atingido. Fechando caixa.`);
        utterance.lang = "pt-BR"; utterance.rate = 1.1; window.speechSynthesis.speak(utterance);
      }
      return; 
    }

    if (isVoiceEnabled) {
      // O sistema SÓ FALA quando aparece a Sugestão (Ação Requerida)
      const suggestedSignals = currentSignals.filter((s: any) => s.result === "SUGGESTED");
      suggestedSignals.forEach((signal: any) => {
        if (!spokenSignalsRef.current.has(signal.id)) {
          spokenSignalsRef.current.add(signal.id);
          const reais = Math.floor(signal.suggested_amount); const centavos = Math.round((signal.suggested_amount - reais) * 100); 
          let text = reais > 0 ? `${reais} reai${reais !== 1 ? 's' : ''}` : "";
          if (reais > 0 && centavos > 0) text += " e "; if (centavos > 0) text += `${centavos} centavo${centavos !== 1 ? 's' : ''}`; if (!text) text = "zero reais";
          const utterance = new SpeechSynthesisUtterance(`Alvo. ${signal.strategy?.name}. Aposta total: ${text}.`);
          utterance.lang = "pt-BR"; utterance.rate = 1.15; window.speechSynthesis.speak(utterance);
        }
      });
    }

    if (activeModal?.type !== 'GLOBAL_STOP') {
      const prevSignals = prevSignalsRef.current;
      prevSignals.forEach(prevSig => {
        // OS MODAIS DE RESOLUÇÃO SÓ APARECEM SE A APOSTA ESTAVA 'PENDING' (CONFIRMADA)
        if (prevSig.result === 'PENDING') {
          const currSig = currentSignals.find((s:any) => s.id === prevSig.id);
          if (currSig && currSig.result !== 'PENDING') {
            if (currSig.result === 'WIN') {
              const goal = initialB * 1.10; let pGoal = 0;
              if (currentB >= goal) pGoal = 100; else if (currentB > initialB) pGoal = ((currentB - initialB) / (goal - initialB)) * 100;
              const payout = getPayoutRatio(currSig.strategy?.name); const profitNet = currSig.suggested_amount * payout;
              setActiveModal({ type: 'GREEN', data: currSig, metrics: { pGoal, profitNet } });
            } else if (currSig.result === 'LOSS') {
              const galeSig = currentSignals.find((s:any) => s.strategy_id === currSig.strategy_id && (s.result === 'SUGGESTED' || s.result === 'PENDING') && s.martingale_step > currSig.martingale_step);
              if (galeSig) { setActiveModal({ type: 'GALE', data: galeSig, metrics: { previousLoss: currSig.suggested_amount } }); } 
              else { 
                let totalCycleLoss = currSig.suggested_amount;
                if (currSig.martingale_step === 1) {
                  const prevInitialSig = currentSignals.find((s:any) => s.strategy_id === currSig.strategy_id && s.martingale_step === 0 && s.created_at < currSig.created_at);
                  if (prevInitialSig) totalCycleLoss += prevInitialSig.suggested_amount;
                }
                const currentLossAbsolute = initialB - currentB;
                const stopLossPercent = currentLossAbsolute > 0 ? (currentLossAbsolute / (initialB * 0.15)) * 100 : 0;
                setActiveModal({ type: 'LOSS', data: currSig, metrics: { totalCycleLoss, stopLossPercent } }); 
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
      setIsVoiceEnabled(false); fetchData(); 
    } catch (err: any) { alert("Falha: " + err.message); } finally { setLoading(false); }
  };

  const handleNumberClick = async (number: number) => {
    if (!sessionId || data?.session?.status === "CLOSED" || activeModal?.type === 'GLOBAL_STOP') return;
    setLoading(true);
    try { await fetch(`http://localhost:3000/api/sessions/${sessionId}/spins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number }) }); fetchData(); } 
    catch (err: any) { alert("Erro ao inserir."); } finally { setLoading(false); }
  };

  // BOTÕES DE CONFIRMAÇÃO
  const handleSignalAction = async (signalId: string, action: "CONFIRM" | "REJECT") => {
    if (!sessionId) return;
    setLoading(true);
    try {
      await fetch(`/api/signals/${signalId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      fetchData();
    } catch (err: any) { alert("Erro ao registrar ação."); } finally { setLoading(false); }
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
      await fetch(`http://localhost:3000/api/sessions/${sessionId}/ocr/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ numbers }) });
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
    const pnl = data.session.current_bankroll - data.session.initial_bankroll;
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl relative overflow-hidden">
          <h2 className="text-white text-xl font-black uppercase tracking-widest mb-4">Sessão Encerrada</h2>
          <div className="bg-black/50 p-4 rounded-xl mb-6">
            <span className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1">Resultado Líquido</span>
            <span className={`block text-3xl font-black font-mono ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>{pnl >= 0 ? '+' : ''}R$ {pnl.toFixed(2)}</span>
          </div>
          <button onClick={() => { localStorage.removeItem("rlsys_active_session"); window.location.reload(); }} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-colors">Voltar</button>
        </div>
      </div>
    );
  }

  const initialB = data?.session?.initial_bankroll || 1;
  const currentB = data?.session?.current_bankroll || 1;
  const highestB = data?.session?.highest_bankroll || initialB;
  let visualStopLimit = initialB * 0.85; let visualStopLabel = "HARD STOP (-15%)";
  if (highestB >= initialB * 1.08) { visualStopLimit = initialB * 1.04; visualStopLabel = "TRAILING STOP (+4%)"; } 
  else if (highestB >= initialB * 1.05) { visualStopLimit = initialB * 1.01; visualStopLabel = "BREAK-EVEN (+1%)"; }
  const distanceToStop = currentB - visualStopLimit;

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
        
        <div className="mx-4 mt-2 mb-4 bg-gray-950 border border-gray-800 p-2 rounded-lg flex justify-between items-center">
          <div className="flex flex-col"><span className="text-[8px] text-gray-500 uppercase tracking-widest font-black">{visualStopLabel}</span><span className={`text-xs font-mono font-bold ${highestB > initialB ? 'text-indigo-400' : 'text-red-400'}`}>R$ {visualStopLimit.toFixed(2)}</span></div>
          <div className="text-right flex flex-col"><span className="text-[8px] text-gray-500 uppercase tracking-widest font-black">Distância Livre</span><span className="text-xs font-mono text-gray-300">R$ {Math.max(0, distanceToStop).toFixed(2)}</span></div>
        </div>
        
        {data?.strategiesStatus && data.strategiesStatus.length > 0 && (
          <div className="mt-4 mx-4 bg-gray-900/50 border border-gray-800 rounded-xl p-4 shadow-inner max-h-40 overflow-y-auto">
            <span className="block text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] mb-3">Ranking Quantitativo</span>
            <div className="grid grid-cols-2 gap-2">
              {data.strategiesStatus.map((strat: any) => (
                <div key={strat.id} className="flex justify-between items-center bg-black/40 p-2 rounded border border-gray-800/50">
                  <span className="text-[9px] font-bold text-gray-400 tracking-wide truncate">{strat.name}</span>
                  <span className={`text-[8px] font-mono ${parseFloat(strat.zScore) <= -0.85 ? 'text-red-400' : 'text-gray-600'}`}>Z: {strat.zScore}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ALERTA DE OPORTUNIDADE COM BOTÕES DE AÇÃO */}
        {data?.session?.signals && data.session.signals.length > 0 && data.session.signals.map((sig: any) => {
          if (sig.result !== "SUGGESTED" && sig.result !== "PENDING") return null;
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
                   <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Alvo: {sig.target_bet.replace(/_/g, " ")}</p>
                 </div>
                 <div className="text-right">
                   <span className={`block text-[9px] font-black uppercase tracking-widest mb-1 ${sig.result === 'SUGGESTED' ? 'text-red-500' : 'text-green-500'}`}>Aposta Total (R$)</span>
                   <span className="text-2xl font-black font-mono text-white">{sig.suggested_amount.toFixed(2)}</span>
                 </div>
               </div>
               
               {/* BOTÕES APARECEM SOMENTE QUANDO A AÇÃO É REQUERIDA */}
               {sig.result === "SUGGESTED" ? (
                 <div className="mt-4 flex gap-2 w-full">
                   <button onClick={() => handleSignalAction(sig.id, "CONFIRM")} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-black py-2 rounded-lg uppercase tracking-widest transition-all">Fiz a Aposta</button>
                   <button onClick={() => handleSignalAction(sig.id, "REJECT")} disabled={loading} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] font-black py-2 rounded-lg uppercase tracking-widest transition-all">Ignorar</button>
                 </div>
               ) : (
                 <div className="mt-4 text-center py-2 bg-black/40 rounded-lg">
                   <span className="text-[10px] text-green-500 font-black uppercase tracking-widest animate-pulse">Aguardando Roleta...</span>
                 </div>
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

      <AnimatePresence>
        {debugInfo.isOpen && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed inset-0 z-50 bg-gray-950/95 p-4 overflow-y-auto backdrop-blur-sm">
            <div className="flex justify-between items-center mb-6 mt-4"><h2 className="text-yellow-500 font-black text-xl uppercase tracking-tighter">Raio-X (Debug OCR)</h2><button onClick={() => setDebugInfo({ ...debugInfo, isOpen: false })} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold uppercase text-xs transition-colors">Fechar</button></div>
            <div className="space-y-6 pb-20">
              <div className="bg-black border border-gray-800 rounded-xl p-4"><span className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-2">1. Imagem processada</span>{debugInfo.sentImageBase64 ? (<img src={debugInfo.sentImageBase64} className="w-full rounded border border-gray-700 opacity-80" />) : (<p className="text-red-500 text-xs font-mono">Falha na imagem.</p>)}</div>
              <div className="bg-black border border-gray-800 rounded-xl p-4"><span className="block text-[10px] uppercase font-black text-gray-500 tracking-widest mb-2">2. Resposta Crua (JSON) da IA</span><pre className="text-yellow-400 font-mono text-[10px] whitespace-pre-wrap break-all bg-gray-900 p-3 rounded border border-yellow-900/50 max-h-40 overflow-y-auto">{debugInfo.rawAiText || "Vazio ou Erro."}</pre></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <div className="bg-black/50 p-4 rounded-xl mb-6"><span className="block text-[10px] text-gray-400 uppercase tracking-widest mb-1">Progresso da Meta (+10%)</span><div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden"><div className="bg-green-500 h-full transition-all" style={{ width: `${Math.min(activeModal.metrics?.pGoal || 0, 100)}%` }} /></div><span className="block mt-2 text-white font-mono">{activeModal.metrics?.pGoal?.toFixed(1)}% Concluído</span></div>
                <button onClick={() => setActiveModal(null)} className="w-full bg-green-600 hover:bg-green-500 text-white font-black uppercase py-4 rounded-xl shadow-lg transition-colors">Voltar ao Radar</button>
              </div>
            )}
            {activeModal.type === 'GALE' && (
              <div className="bg-orange-950 border-2 border-orange-500 p-8 rounded-3xl w-full max-w-sm text-center shadow-[0_0_50px_rgba(249,115,22,0.3)]">
                <div className="w-20 h-20 bg-orange-500 rounded-full mx-auto flex items-center justify-center mb-6 shadow-lg"><span className="text-4xl">⚠️</span></div>
                <h2 className="text-white text-2xl font-black uppercase tracking-widest mb-2">Recuperação</h2>
                <div className="bg-black/50 p-4 rounded-xl mb-6 border border-orange-900/50"><div className="flex justify-between items-center mb-2 border-b border-orange-900/50 pb-2"><span className="text-[10px] text-gray-400 uppercase tracking-widest">Loss Anterior</span><span className="text-sm text-red-400 font-mono">- R$ {activeModal.metrics?.previousLoss?.toFixed(2)}</span></div><div className="text-center pt-2"><span className="block text-[10px] text-orange-500 font-black uppercase tracking-widest mb-1">Próxima Aposta Total</span><span className="block text-3xl text-white font-black font-mono">R$ {activeModal.data?.suggested_amount.toFixed(2)}</span></div></div>
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
