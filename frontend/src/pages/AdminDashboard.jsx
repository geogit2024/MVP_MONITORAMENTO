import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Plus, ArrowLeft } from 'lucide-react';

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addAmount, setAddAmount] = useState(10);
  const navigate = useNavigate();

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('saas_token');
      const res = await axios.get('http://localhost:8000/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(res.data);
    } catch(err) {
      if(err.response?.status === 403) {
         navigate('/app');
      } else {
         navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [navigate]);

  const handleAddCredits = async (email) => {
    try {
      const token = localStorage.getItem('saas_token');
      await axios.post('http://localhost:8000/api/admin/add_credits', {
        email: email,
        amount: parseInt(addAmount)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUsers();
    } catch(err) {
      alert("Erro ao adicionar créditos SaaS.");
    }
  };

  if(loading) return <div className="min-h-screen bg-slate-950 text-white flex justify-center items-center">Aguarde a autenticação Root...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 font-sans selection:bg-purple-500/30">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8 pb-4 border-b border-white/10">
          <Link to="/app" className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"><ArrowLeft size={24} /></Link>
          <Shield className="text-purple-500" size={36} />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Painel de Super Admin</h1>
            <p className="text-sm text-slate-400">Controle financeiro de Contas Vectorizer.</p>
          </div>
        </div>
        
        <div className="bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/50 text-slate-400 text-sm tracking-wide">
                <th className="p-5 font-semibold w-16">ID</th>
                <th className="p-5 font-semibold">Email Registrado da Conta</th>
                <th className="p-5 font-semibold text-center">Saldo Restante</th>
                <th className="p-5 font-semibold text-center">Privilégio</th>
                <th className="p-5 font-semibold text-right">Faturar Créditos Rápidos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-5 font-mono text-slate-500">#{u.id}</td>
                  <td className="p-5 font-medium">{u.email}</td>
                  <td className="p-5 text-center">
                    <span className={`px-3 py-1 rounded-md text-xs font-bold ${u.credits > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                      {u.credits} Processamentos
                    </span>
                  </td>
                  <td className="p-5 text-xs font-medium text-center">
                    {u.is_admin ? <span className="text-purple-400 bg-purple-500/10 px-2 py-1 rounded">Administrador</span> : <span className="text-slate-500">Cliente</span>}
                  </td>
                  <td className="p-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                        <input type="number" min="1" max="1000" value={addAmount} onChange={e => setAddAmount(e.target.value)} className="w-20 bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono" />
                        <button onClick={() => handleAddCredits(u.email)} className="bg-purple-600 hover:bg-purple-500 text-white p-2 flex gap-1 items-center font-bold text-xs rounded-lg shadow-lg shadow-purple-500/20 transition-all active:scale-95" title="Adicionar Saldo a Conta">
                            <Plus size={16} strokeWidth={3} /> Inject
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <div className="p-8 text-center text-slate-500">Nenhum cliente registrado ainda no SaaS.</div>}
        </div>
      </div>
    </div>
  );
}
