import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ShieldCheck, RefreshCw } from 'lucide-react'; // Adicionei o RefreshCw

import { MacroDashboard } from './pages/MacroDashboard.tsx';
import { SetupSession } from './pages/SetupSession.tsx';
import { LabSimulator } from './pages/LabSimulator.tsx';
import { ActiveSession } from './pages/ActiveSession.tsx';
import { AuditReport } from './pages/AuditReport.tsx';

export default function App() {
  // Função para limpar o loop infinito
  const handleForceReset = () => {
    localStorage.clear(); // Limpa IDs de sessões antigas
    window.location.href = "/setup"; // Força ida para o setup novo
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0B101E] text-slate-200 font-sans selection:bg-blue-900 selection:text-white flex flex-col">
        
        <header className="sticky top-0 z-50 bg-[#0B101E]/95 backdrop-blur-md border-b border-slate-800/80 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <div className="w-full max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            {/* Clique no Logo agora limpa o cache e sai do loop */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={handleForceReset}>
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
              </div>
              <h1 className="text-sm font-black tracking-[0.2em] text-slate-100 drop-shadow-sm uppercase">
                RL.SYS <span className="text-blue-500">HFT</span>
              </h1>
            </div>

            <div className="flex items-center space-x-2 text-[10px] sm:text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
               <button 
                 onClick={handleForceReset}
                 className="mr-2 p-1 hover:text-blue-400 transition-colors"
                 title="Resetar Sistema"
               >
                 <RefreshCw className="w-3 h-3" />
               </button>
               <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20 flex items-center gap-1">
                 <ShieldCheck className="w-3 h-3" /> SISTEMA ON
               </span>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-md mx-auto md:max-w-7xl md:px-4 pt-4 px-3 pb-24 md:pb-8">
          <Routes>
            <Route path="/" element={<MacroDashboard />} />
            <Route path="/setup" element={<SetupSession />} />
            <Route path="/lab" element={<LabSimulator />} />
            <Route path="/session/:id" element={<ActiveSession />} />
            <Route path="/audit/:id" element={<AuditReport />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
