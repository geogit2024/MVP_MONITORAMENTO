import React, { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Map, ArrowRight } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    const formData = new URLSearchParams();
    formData.append('username', email); // OAuth2 expects username
    formData.append('password', password);

    try {
      const response = await axios.post('http://localhost:8000/api/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      localStorage.setItem('saas_token', response.data.access_token);
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.detail || "Falha nas credenciais");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 selection:bg-blue-500/30">
      <Link to="/" className="flex items-center gap-2 mb-10 opacity-70 hover:opacity-100 transition-opacity">
        <Map className="text-emerald-500" size={32} />
        <span className="font-bold text-2xl text-white tracking-tight">AgroSentinel IA</span>
      </Link>
      
      <div className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2">Bem-vindo de volta</h2>
        <p className="text-slate-400 text-sm mb-8">Faça login com seu email para continuar utilizando a plataforma e acessar seus créditos.</p>
        
        {error && <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm font-medium">{error}</div>}
        
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email corporativo</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans"
              placeholder="seu@agronegocio.com.br"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Senha</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans"
              placeholder="••••••••"
            />
          </div>
          
          <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg active:scale-[0.98] flex justify-center items-center gap-2 mt-4 disabled:opacity-50">
            {isLoading ? 'Entrando...' : 'Entrar na Plataforma'} <ArrowRight size={18} />
          </button>
        </form>
        
        <div className="mt-8 text-center text-sm text-slate-400">
          Ainda não mapeia os talentos digitais? <Link to="/register" className="text-blue-400 hover:text-blue-300 font-medium">Crie sua conta agora</Link>
        </div>
      </div>
    </div>
  );
}
