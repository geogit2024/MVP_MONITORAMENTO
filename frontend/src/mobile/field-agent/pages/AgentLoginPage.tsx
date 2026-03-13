import React, { useState } from 'react';
import { fieldDispatchApi } from '../../../modules/field-dispatch/services/fieldDispatchApi';
import type { AgentLoginResponse } from '../../../modules/field-dispatch/types';

interface AgentLoginPageProps {
  onLogin: (payload: AgentLoginResponse) => void;
}

export function AgentLoginPage({ onLogin }: AgentLoginPageProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError('');
      const logged = await fieldDispatchApi.agentLogin({ userId: userId.trim(), password: password.trim() });
      onLogin(logged);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Falha no login do agente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-shell">
      <div className="mobile-card">
        <h2>Agente de Campo</h2>
        <p className="subtitle">Acesse suas tarefas operacionais.</p>
        <form className="mobile-form-resizable" onSubmit={handleSubmit}>
          <label>
            Usuário
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="agente.norte"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              spellCheck={false}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="******"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="current-password"
              spellCheck={false}
            />
          </label>
          <button type="submit" className="dispatch-button success" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p className="subtitle">
          Credenciais seed: <code>agente.norte</code> / <code>123456</code> ou <code>agente.sul</code> / <code>123456</code>.
        </p>
        {error ? <p className="subtitle">{error}</p> : null}
      </div>
    </div>
  );
}
