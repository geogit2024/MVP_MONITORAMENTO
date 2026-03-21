import React, { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Map, ArrowRight } from 'lucide-react';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await axios.post('http://localhost:8000/api/register', {
        email, password
      });
      // Auto login
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      
      const loginRes = await axios.post('http://localhost:8000/api/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      localStorage.setItem('saas_token', loginRes.data.access_token);
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.detail || "Erro desconhecido ao cadastrar");
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
        <h2 className="text-2xl font-bold text-white mb-2">Crie sua Conta SaaS</h2>
        <p className="text-slate-400 text-sm mb-8">Ganhe imediatamente 5 Créditos Cortesia para analisar perímetros de talhões complexos.</p>
        
        {error && <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-sm font-medium">{error}</div>}
        
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Seu Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans"
              placeholder="seu@agronegocio.com.br"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Sua Senha</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-sans"
              placeholder="Mínimo 6 caracteres"
              minLength="6"
            />
          </div>
          
          <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg active:scale-[0.98] flex justify-center items-center gap-2 mt-4 disabled:opacity-50">
            {isLoading ? 'Registrando Banco de Dados...' : 'Receber Meus 5 Créditos'} <ArrowRight size={18} />
          </button>
        </form>
        
        <div className="mt-8 text-center text-sm text-slate-400">
          Já possui um contrato corporativo? <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-medium">Faça o Log-In</Link>
        </div>
      </div>
    </div>
  );
}
