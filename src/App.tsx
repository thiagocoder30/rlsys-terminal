import { useState, useEffect, useCallback } from "react";
import { HeaderStatus } from "./components/HeaderStatus";
import { SignalsAlertPanel } from "./components/SignalsAlertPanel";
import { ZScoreSparkline } from "./components/ZScoreSparkline";
import { SpinTimeline } from "./components/SpinTimeline";
import { ManualEntryInput } from "./components/ManualEntryInput";
import { OcrButton } from "./components/OcrButton";
import { motion } from "motion/react";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function App() {
  // Estados de Configuração e Sessão
  const [setupMode, setSetupMode] = useState(true);
  const [startBankroll, setStartBankroll] = useState("100.00");
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zHistory, setZHistory] = useState<number[]>([]);

  const initSession = async (retries = 3) => {
    setError(null);
    setLoading(true);
    try {
      const healthRes = await fetch("/api/health");
      const health = await healthRes.json();
      
      if (health.status === "error") {
        const errorMsg = health.hint ? `${health.message}\n\n${health.hint}` : (health.message || "Banco de dados inacessível.");
        throw new Error(errorMsg);
      }

      // Converte o texto digitado pelo usuário para número
      const initial_bankroll = parseFloat(startBankroll.replace(",", "."));
      if (isNaN(initial_bankroll) || initial_bankroll <= 0) {
        throw new Error("Valor de banca inválido.");
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_bankroll }),
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro na resposta do servidor");
      
      setSessionId(json.id);
      setSetupMode(false); // Desliga a tela inicial
    } catch (err: any) {
      if (retries > 0 && err.message === "Failed to fetch") {
        setTimeout(() => initSession(retries - 1), 2000);
      } else {
        setError(err.message || "Não foi possível conectar ao servidor.");
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dashboard`);
      if (!res.ok) throw new Error("Falha na sincronização");
      const json = await res.json();
      setData(json);
      setZHistory((prev) => [...prev.slice(-49), json.zScore]);
      setError(null);
    } catch (err: any) {
      console.error("Erro ao buscar dados:", err.message);
    }
  }, [sessionId]);

  // Apenas puxa dados periodicamente SE a sessão já estiver ativa
  useEffect(() => {
    if (sessionId) {
      fetchData();
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [sessionId, fetchData]);

  const handleNumberClick = async (number: number) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3000/api/sessions/${sessionId}/spins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number }),
      });
      if (!res.ok) throw new Error("Falha ao registrar número");
      fetchData();
    } catch (err: any) {
      alert("Erro ao inserir número manualmente.");
    } finally {
      setLoading(false);
    }
  };

  const handleOcrUpload = async (file: File) => {
    if (!sessionId) return;
    setLoading(true);
    const startTime = Date.now();

    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image();
          img.src = e.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const maxDim = 1200; 
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
              if (width > maxDim) { height *= maxDim / width; width = maxDim; }
            } else {
              if (height > maxDim) { width *= maxDim / height; height = maxDim; }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, width, height);
            }
            const compressed = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
            resolve(compressed);
          };
          img.onerror = reject;
        };
        reader.onerror = reject;
      });

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chave VITE_GEMINI_API_KEY não configurada.");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3-flash-preview",
        generationConfig: { temperature: 0.0, maxOutputTokens: 1000 }
      });

      const maxRetries = 2;
      let attempt = 0;
      let extractedText = "";

      while (attempt <= maxRetries) {
        try {
          const result = await model.generateContent([
            "Extract ALL numbers from this roulette board. You MUST read the top horizontal row AND every single row in the large grid below it. Read left-to-right, top-to-bottom. Do not stop until you reach the very last number at the bottom right. Output ONLY numbers separated by commas. No text.",
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
          ]);
          extractedText = result.response.text();
          if (extractedText) break;
        } catch (apiErr: any) {
          attempt++;
          const errString = String(apiErr.message || JSON.stringify(apiErr)).toLowerCase();
          if (errString.includes("503") || errString.includes("high demand") || errString.includes("429")) {
            if (attempt > maxRetries) throw apiErr;
            await new Promise(r => setTimeout(r, 1500));
          } else {
            throw apiErr;
          }
        }
      }

      if (!extractedText) throw new Error("A IA não retornou texto algum.");

      const rawNumbers = (extractedText.match(/\b([0-9]|[12][0-9]|3[0-6])\b/g) || []).map(n => parseInt(n));
      const numbers = rawNumbers.reverse(); 

      if (numbers.length === 0) throw new Error("Nenhum número válido (0-36) detectado.");

      const res = await fetch(`http://localhost:3000/api/sessions/${sessionId}/ocr/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers }),
      });
      
      const resultData = await res.json();
      if (!res.ok) throw new Error(resultData.error || "Erro na sincronização");
      
      const timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

      if (resultData.count > 0) {
        alert(`⚡ Leitura: ${numbers.length} números.\nInjetados: ${resultData.count} novos giros em ${timeTaken}s!`);
      } else {
        alert(`Leitura: ${numbers.length} números.\nNenhum giro novo (histórico já atualizado).`);
      }
      
      if (typeof fetchData === 'function') fetchData();
      
    } catch (err: any) {
      console.error("Erro no OCR Turbo:", err);
      const errString = String(err.message || JSON.stringify(err)).toLowerCase();
      if (errString.includes("503") || errString.includes("high demand")) {
        alert("⚠️ Rede congestionada. Tente novamente em alguns segundos.");
      } else {
        alert("Erro ao processar a imagem: " + (err.message || "Falha desconhecida."));
      }
    } finally {
      setLoading(false);
    }
  };

  // --- TELA INICIAL (SETUP DE BANCA) ---
  if (setupMode && !error) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
          <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
        </div>
        <h1 className="text-white text-3xl font-black uppercase tracking-tighter mb-2">RL.sys</h1>
        <p className="text-gray-500 text-xs font-bold uppercase tracking-[0.2em] mb-8">Terminal Institucional</p>
        
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl">
          <label className="block text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">
            Banca Atual de Operação (R$)
          </label>
          <input 
            type="number" 
            value={startBankroll}
            onChange={(e) => setStartBankroll(e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-xl p-4 text-white text-2xl font-black focus:outline-none focus:border-indigo-500 transition-colors mb-6 text-center"
            placeholder="Ex: 150.00"
          />
          
          <button 
            onClick={() => initSession()}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-900/20 disabled:opacity-50"
          >
            {loading ? "Conectando..." : "Iniciar Sessão Segura"}
          </button>
        </div>
        <p className="text-gray-600 text-[10px] mt-8 max-w-xs leading-relaxed">
          O algoritmo ajustará as metas de Take Profit e Stop Loss de acordo com a sua exposição de capital.
        </p>
      </div>
    );
  }

  // --- TELA DE ERRO ---
  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-500/10 border border-red-500 p-6 rounded-2xl max-w-sm">
          <h2 className="text-red-500 font-black text-xl mb-2 uppercase">Erro de Conexão</h2>
          <p className="text-gray-400 text-sm mb-6 whitespace-pre-wrap text-left bg-black/40 p-4 rounded-lg border border-red-500/20">{error}</p>
          <button onClick={() => initSession()} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95 mb-4 shadow-lg shadow-red-900/20">
            TENTAR NOVAMENTE
          </button>
        </div>
      </div>
    );
  }

  // --- TELA DE CARREGAMENTO (AGUARDANDO DADOS INICIAIS) ---
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
        <div className="text-indigo-500 animate-pulse font-black text-2xl tracking-tighter mb-2">RL.SYS INITIALIZING...</div>
        <div className="text-gray-600 text-[10px] uppercase tracking-[0.3em]">Sincronizando Protocolos</div>
      </div>
    );
  }

  // --- DASHBOARD PRINCIPAL ---
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col max-w-md mx-auto shadow-2xl border-x border-gray-800 select-none overflow-hidden">
      <div className="flex-shrink-0">
        <HeaderStatus 
          bankroll={data.session.current_bankroll} 
          initialBankroll={data.session.initial_bankroll} // Puxa do backend o valor inicial exato
          zScore={data.zScore} 
          isConnected={true} 
        />
        <div className="mt-4">
          <span className="px-4 text-[10px] uppercase font-bold text-gray-500 tracking-widest">Volatilidade Z-Score</span>
          <ZScoreSparkline data={zHistory} />
        </div>
        <SignalsAlertPanel signals={data.session.signals} />
        <SpinTimeline spins={data.session.spins} />
      </div>

      <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="flex-grow bg-gray-950 rounded-t-[32px] border-t border-gray-800 p-4 pb-8 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
        <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-6" />
        <div className="space-y-6">
          <section>
            <span className="block text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] mb-3 px-2">Entrada Manual</span>
            <ManualEntryInput onNumberSubmit={handleNumberClick} isLoading={loading} />
          </section>
          <section>
            <span className="block text-[10px] uppercase font-black text-gray-500 tracking-[0.2em] mb-3 px-2">Leitura Óptica (OCR)</span>
            <OcrButton onUpload={handleOcrUpload} isLoading={loading} />
          </section>
        </div>
      </motion.div>

      {data.session.signals.some((s: any) => s.result === "PENDING") && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 pointer-events-none border-[8px] border-red-500/30 animate-pulse z-50" />
      )}
    </div>
  );
    }
          
