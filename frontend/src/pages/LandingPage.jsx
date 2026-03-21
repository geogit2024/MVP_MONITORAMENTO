import React from 'react';
import { Link } from 'react-router-dom';
import { Map, Zap, Database, Lock } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-blue-500/30">
      {/* Header */}
      <nav className="border-b border-white/5 bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Map className="text-emerald-500" size={28} />
            <span className="font-bold text-xl tracking-tight">AgroSentinel IA</span>
          </div>
          <div className="gap-6 flex items-center">
            <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Entrar</Link>
            <Link to="/register" className="text-sm bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl shadow-lg transition-all font-semibold active:scale-95">Tentar Grátis</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-8">
          <span className="relative flex h-2 w-2 "><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
          Motor NDVI Histórico
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight">
          Laudos Agronômicos <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400">Interpretados por Especialista IA</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
          Acompanhe gráficos temporais de índice vegetativo (NDVI) da safra nos últimos 6 meses. Nossa plataforma gera relatórios fenológicos precisos sobre seu talhão automaticamente.
        </p>
        <Link to="/register" className="inline-flex items-center gap-2 bg-white text-slate-900 hover:bg-slate-100 px-8 py-4 rounded-2xl font-bold text-lg shadow-2xl transition-all hover:scale-105 active:scale-95">
          Ganhe 5 Créditos Iniciais Grátis <Zap size={20} />
        </Link>
      </main>
      
      {/* Cards */}
      <section className="bg-black/30 py-24 border-t border-white/5">
         <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm transition-colors hover:bg-white/[0.04]">
                <Database className="text-emerald-400 mb-5" size={36} strokeWidth={1.5} />
                <h3 className="text-xl font-bold mb-3">Gráficos Temporais (NDVI)</h3>
                <p className="text-slate-400 leading-relaxed">Avalie o histórico de vigor de biomassa a cada 15 dias para identificar picos de colheita e anomalias hídricas.</p>
            </div>
            <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm transition-colors hover:bg-white/[0.04]">
                <Zap className="text-amber-400 mb-5" size={36} strokeWidth={1.5} />
                <h3 className="text-xl font-bold mb-3">Agro-Inteligência</h3>
                <p className="text-slate-400 leading-relaxed">O Motor de IA constrói diagnósticos semânticos textuais sobre a saúde foliar exibida nas curvas de histórico.</p>
            </div>
            <div className="p-8 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm transition-colors hover:bg-white/[0.04]">
                <Lock className="text-purple-400 mb-5" size={36} strokeWidth={1.5} />
                <h3 className="text-xl font-bold mb-3">API Comercial e Paywall</h3>
                <p className="text-slate-400 leading-relaxed">Dedução em tempo real de contas de clientes pelo Banco de Dados. Compre pacotes de créditos e acesse infinitamente o motor.</p>
            </div>
         </div>
      </section>
    </div>
  )
}
