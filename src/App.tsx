/**
 * RL.sys - Main Application Entry Point
 * Gerencia o roteamento global, layout principal e estados de reset.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { ShieldCheck, RefreshCw } from 'lucide-react';

import { MacroDashboard } from './pages/MacroDashboard';
import { SetupSession } from './pages/SetupSession';
import { LabSimulator } from './pages/LabSimulator';
import { ActiveSession } from './pages/ActiveSession';
import { AuditReport } from './pages/AuditReport';

// Componente Interno para gerenciar o Header e Logica de Navegação
function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  /**
   * handleForceReset: Limpa o estado local e reinicia o fluxo.
   * Útil para destravar o sistema em caso de sessões corrompidas.
   */
  const handleForceReset = () => {
    localStorage.clear(); // Remove tokens e IDs de sessão
    sessionStorage.clear(); // Limpa cache temporário
    
    // Redireciona para o setup e força um refresh leve para limpar o estado do React
    navigate('/setup');
    window.location.reload(); 
  };

  return (
    <div className="min-h-screen bg-[#0B101E] text-slate-200 font-sans selection:bg-blue-900 selection:text-white flex flex-col">
      
      {/* HEADER GLOBAL */}
      <header className="sticky top-0 z-50 bg-[#0B101E]/95 backdrop-blur-md border-b border-slate-800/80 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="w-full max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          
          {/* LOGO & RESET */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
            </div>
            <h1 className="text-sm font-black tracking-[0.2em] text-slate-100 drop-shadow-sm uppercase">
              RL.SYS <span className="text-blue-500">HFT</span>
            </h1>
          </div>

          {/* STATUS & ACTIONS */}
          <div className="flex items-center space-x-2 text-[10px] sm:text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
             <button 
               onClick={handleForceReset}
               className="mr-2 p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-blue-400 transition-all active:scale-95"
               title="Resetar Sistema"
             >
               <RefreshCw className="w-4 h-4" />
             </button>
             <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20 flex items-center gap-1">
               <ShieldCheck className="w-3 h-3" /> SISTEMA ON
             </span>
          </div>
        </div>
      </header>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main className="flex-1 w-full max-w-md mx-auto md:max-w-7xl md:px-4 pt-4 px-3 pb-24 md:pb-8">
        {children}
      </main>

      {/* DICA DIDÁTICA: Você pode adicionar um rodapé de navegação mobile aqui no futuro */}
    </div>
  );
}

// COMPONENTE PRINCIPAL
export default function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<MacroDashboard />} />
          <Route path="/setup" element={<SetupSession />} />
          <Route path="/lab" element={<LabSimulator />} />
          <Route path="/session/:id" element={<ActiveSession />} />
          <Route path="/audit/:id" element={<AuditReport />} />
          
          {/* Rota de Fallback: Redireciona qualquer URL inválida para o Início */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
