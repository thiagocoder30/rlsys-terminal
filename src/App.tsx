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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zHistory, setZHistory] = useState<number[]>([]);

  // Inicializar Sessão
  const initSession = async (retries = 3) => {
    setError(null);
    try {
      const healthRes = await fetch("/api/health");
      const health = await healthRes.json();
      
      if (health.status === "error") {
        const errorMsg = health.hint ? `${health.message}\n\n${health.hint}` : (health.message || "Banco de dados inacessível.");
        throw new Error(errorMsg);
      }

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_bankroll: 1000 }),
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro na resposta do servidor");
      
      setSessionId(json.id);
    } catch (err: any) {
      console.error(`Erro ao iniciar sessão:`, err);
      if (retries > 0 && err.message === "Failed to fetch") {
        setTimeout(() => initSession(retries - 1), 2000);
      } else {
        setError(err.message || "Não foi possível conectar ao servidor.");
      }
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

  useEffect(() => {
    if (!sessionId && !error) {
      initSession();
    } else if (sessionId) {
      fetchData();
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [sessionId, fetchData, error]);

  // Entrada Manual
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

  // OCR Modo Turbo Institucional
  const handleOcrUpload = async (file: File) => {
    if (!sessionId) return;
    setLoading(true);
    const startTime = Date.now();

    try {
      // 1. Hyper-Compressão (500px, 50% qualidade)
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image();
          img.src = e.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const maxWidth = 500;
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
              height = (maxWidth / width) * height;
              width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", 0.5).split(",")[1]);
          };
          img.onerror = reject;
        };
        reader.onerror = reject;
      });

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Chave VITE_GEMINI_API_KEY não configurada.");

      const genAI = new GoogleGenerativeAI(apiKey);
      
      // 2. Modelo estrito e criatividade zerada para velocidade máxima
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3-flash-preview",
        generationConfig: { temperature: 0.0, maxOutputTokens: 400 }
      });

      const maxRetries = 2;
      let attempt = 0;
      let extractedText = "";

      while (attempt < maxRetries) {
        try {
          // 3. Prompt em inglês para processamento de tokens ultrarrápido
          const result = await model.generateContent([
            "Extract only the roulette numbers from this image. Return strictly comma-separated digits. Example: 14,24,4. No text, no spaces.",
            { inlineData: { data: base64Image, mimeType: "image/jpeg" } }
          ]);
          extractedText = result.response.text();
          break;
        } catch (apiErr: any) {
          attempt++;
          const errString = String(apiErr.message || JSON.stringify(apiErr)).toLowerCase();
          if (errString.includes("503") || errString.includes("high demand") || errString.includes("429")) {
            await new Promise(r => setTimeout(r, 1000));
          } else {
            throw apiErr;
          }
        }
      }

      if (!extractedText) throw new Error("A IA não retornou números legíveis.");

      const numbers = extractedText.split(",")
        .map(n => parseInt(n.trim()))
        .filter(n => !isNaN(n) && n >= 0 && n <= 36)
        .reverse();

      if (numbers.length === 0) throw new Error("Nenhum número válido detectado na imagem.");

      const res = await fetch(`http://localhost:3000/api/sessions/${sessionId}/ocr/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers }),
      });

      const resultData = await res.json();
      if (!res.ok) throw new Error(resultData.error || "Falha na sincronização do backend");

      const timeTaken = ((Date.now() - startTime) / 1000).toFixed(1);

      if (resultData.count > 0) {
        alert(`⚡ Extração Turbo: ${resultData.count} giros injetados em ${timeTaken} segundos!`);
      } else {
        alert("Nenhum giro novo detectado em relação ao histórico atual.");
      }

      if (typeof fetchData === 'function') fetchData();

    } catch (err: any) {
      console.error("Erro no OCR Turbo:", err);
      const errString = String(err.message || JSON.stringify(err)).toLowerCase();
      if (errString.includes("503") || errString.includes("high demand")) {
        alert("⚠️ Rede congestionada. Tente novamente em alguns segundos.");
      } else {
        // Alerta detalhado para não ficarmos cegos em caso de falha
        alert("Erro ao processar a imagem: " + (err.message || "Falha desconhecida."));
      }
    } finally {
      setLoading(false);
    }
  };

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

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
        <div className="text-indigo-500 animate-pulse font-black text-2xl tracking-tighter mb-2">RL.SYS INITIALIZING...</div>
        <div className="text-gray-600 text-[10px] uppercase tracking-[0.3em]">Verificando Protocolos de Dados</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col max-w-md mx-auto shadow-2xl border-x border-gray-800 select-none overflow-hidden">
      <div className="flex-shrink-0">
        <HeaderStatus bankroll={data.session.current_bankroll} zScore={data.zScore} isConnected={true} />
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
                                                                                
