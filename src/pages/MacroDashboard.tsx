import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Beaker, History, TrendingUp } from 'lucide-react';

export function MacroDashboard() {
  const navigate = useNavigate();
  const [hasActiveSession, setHasActiveSession] = useState(false);

  useEffect(() => {
    // Verifica se existe um ID salvo, mas valida se ele é real
    const sessionId = localStorage.getItem('activeSessionId');
    if (sessionId && sessionId !== 'undefined') {
      setHasActiveSession(true);
    }
  }, []);

  const startFresh = () => {
    localStorage.removeItem('activeSessionId');
    navigate('/setup');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 gap-4">
        {/* CARD PRINCIPAL: SETUP */}
        <div 
          onClick={startFresh}
          className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl cursor-pointer hover:border-blue-500/50 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-blue-500" /> Operação Real
              </h2>
              <p className="text-slate-400 text-sm mt-1">Configurar nova banca e iniciar Oráculo.</p>
            </div>
            <TrendingUp className="w-8 h-8 text-slate-700 group-hover:text-blue-500 transition-colors" />
          </div>
        </div>

        {/* CARD LABORATÓRIO: O QUE VOCÊ QUER TESTAR */}
        <div 
          onClick={() => navigate('/lab')}
          className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl cursor-pointer hover:border-purple-500/50 transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Beaker className="w-5 h-5 text-purple-500" /> Laboratório HFT
              </h2>
              <p className="text-slate-400 text-sm mt-1">Simular mesa e testar estratégias Markov/VIX.</p>
            </div>
            <Beaker className="w-8 h-8 text-slate-700 group-hover:text-purple-500 transition-colors" />
          </div>
        </div>

        {/* HISTÓRICO / AUDITORIA */}
        <div 
          onClick={() => navigate('/audit/list')}
          className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl cursor-pointer hover:border-emerald-500/50 transition-all group opacity-60"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-500" /> Relatórios
              </h2>
              <p className="text-slate-400 text-sm mt-1">Analisar performance de sessões passadas.</p>
            </div>
          </div>
        </div>
      </div>

      {hasActiveSession && (
        <button 
          onClick={() => navigate(`/session/${localStorage.getItem('activeSessionId')}`)}
          className="w-full py-4 bg-blue-600/20 border border-blue-500/50 text-blue-400 rounded-xl font-bold hover:bg-blue-600/30 transition-all"
        >
          Retomar Sessão em Aberto
        </button>
      )}
    </div>
  );
}
