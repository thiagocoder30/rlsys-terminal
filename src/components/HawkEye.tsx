import React, { useState, useRef, useEffect } from 'react';
import { Play, Square, Activity, AlertTriangle } from 'lucide-react';

interface HawkEyeProps {
  sessionId: string;
  onNumbersDetected: () => void;
}

export const HawkEye: React.FC<HawkEyeProps> = ({ sessionId, onNumbersDetected }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState<string>("AGUARDANDO ATIVAÇÃO");
  const [error, setError] = useState<string | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startAutonomousScan = async () => {
    setIsScanning(true);
    setError(null);
    setStatus("RADAR ATIVO: VARRENDO A MESA...");

    // Loop de varredura autônoma (dispara a cada 8 segundos para cruzar com o tempo do giro real)
    scanIntervalRef.current = setInterval(async () => {
      try {
        setStatus("CAPTURANDO TELA VIA ADB...");
        
        // 1. Ordem de disparo para o Cérebro (Back-end) tirar a foto nativa
        const radarResponse = await fetch('/api/radar/scan');
        if (!radarResponse.ok) {
          throw new Error("Falha na varredura. Aguardando próximo ciclo...");
        }
        
        const radarData = await radarResponse.json();
        
        if (radarData.numbers && radarData.numbers.length > 0) {
          setStatus(`ÚLTIMOS NÚMEROS: ${radarData.numbers.join(', ')}`);
          
          // 2. Transmite os dados mastigados para sincronizar a sessão
          await fetch(`/api/sessions/${sessionId}/ocr/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numbers: radarData.numbers })
          });
          
          onNumbersDetected(); // Atualiza a tela de sinais do usuário
        }
      } catch (err: any) {
        console.error("[HAWK-EYE ERROR]:", err);
        setStatus("VARREDURA EM ANDAMENTO...");
        // Mantemos o radar rodando. Se uma foto sair embaçada, ele acerta na próxima.
      }
    }, 8000); 
  };

  const stopScan = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    setIsScanning(false);
    setStatus("RADAR DESATIVADO");
  };

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, []);

  return (
    <div className="bg-[#0f172a] rounded-xl border border-blue-900/50 p-6 flex flex-col items-center justify-center space-y-4 shadow-[0_0_15px_rgba(30,58,138,0.3)]">
      <div className="flex items-center space-x-3 mb-2">
        <Activity className={`w-6 h-6 ${isScanning ? 'text-green-500 animate-pulse' : 'text-slate-500'}`} />
        <h3 className="text-lg font-bold text-slate-200 tracking-wider">RADAR HAWK-EYE (ADB)</h3>
      </div>
      
      {error && (
        <div className="flex items-center space-x-2 text-red-400 bg-red-950/30 px-4 py-2 rounded-lg border border-red-900/50">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      <div className="w-full bg-slate-900 rounded-lg p-3 text-center border border-slate-800">
        <span className={`text-sm font-mono ${isScanning ? 'text-blue-400' : 'text-slate-500'}`}>
          {status}
        </span>
      </div>

      {!isScanning ? (
        <button
          onClick={startAutonomousScan}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold tracking-widest flex items-center justify-center space-x-2 transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]"
        >
          <Play className="w-5 h-5 fill-current" />
          <span>LIGAR RADAR AUTÔNOMO</span>
        </button>
      ) : (
        <button
          onClick={stopScan}
          className="w-full py-4 bg-red-900/80 hover:bg-red-800 text-white rounded-lg font-bold tracking-widest flex items-center justify-center space-x-2 transition-all border border-red-700/50"
        >
          <Square className="w-5 h-5 fill-current" />
          <span>DESLIGAR RADAR</span>
        </button>
      )}
    </div>
  );
};
