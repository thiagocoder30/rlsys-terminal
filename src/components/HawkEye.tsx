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
  
  const isScanningRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performScan = async () => {
    if (!isScanningRef.current) return;

    try {
      setStatus("CAPTURANDO TELA VIA ADB...");
      
      const radarResponse = await fetch('/api/radar/scan');
      if (!radarResponse.ok) {
        throw new Error("Falha na varredura da IA. Reajustando mira...");
      }
      
      const radarData = await radarResponse.json();
      
      // Se a IA retornar uma quantidade absurda de números (lixo), nós ignoramos
      if (radarData.numbers && radarData.numbers.length > 0 && radarData.numbers.length <= 15) {
        setStatus(`ÚLTIMOS NÚMEROS: ${radarData.numbers.join(', ')}`);
        
        await fetch(`/api/sessions/${sessionId}/ocr/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numbers: radarData.numbers })
        });
        
        onNumbersDetected(); 
      } else if (radarData.numbers && radarData.numbers.length > 15) {
        setStatus("RUÍDO DETECTADO NA MESA. IGNORANDO...");
      }
    } catch (err: any) {
      console.error("[HAWK-EYE ERROR]:", err);
      setStatus("VARREDURA EM ANDAMENTO (MANTENDO O RITMO)...");
    } finally {
      // CADÊNCIA SEGURA: 22 Segundos (Protege o limite de 5 requisições/minuto da IA Gratuita)
      if (isScanningRef.current) {
        setStatus("AGUARDANDO JANELA DE SINCRO (22s)...");
        timeoutRef.current = setTimeout(performScan, 22000);
      }
    }
  };

  const startAutonomousScan = () => {
    setIsScanning(true);
    isScanningRef.current = true;
    setError(null);
    setStatus("RADAR ATIVO: INICIANDO VARREDURA...");
    performScan();
  };

  const stopScan = () => {
    setIsScanning(false);
    isScanningRef.current = false;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStatus("RADAR DESATIVADO");
  };

  useEffect(() => {
    return () => {
      isScanningRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
