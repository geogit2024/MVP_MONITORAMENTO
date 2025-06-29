import { useState, useEffect } from 'react';
import API from '../api';

export default function TesteAPI() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    // ao montar, faz GET /health
    API.get('/health')
      .then(response => {
        setData(response.data);
      })
      .catch(err => {
        console.error('Erro ao chamar /health:', err);
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading)  return <p>Carregando dados…</p>;
  if (error)    return <p style={{ color: 'red' }}>Erro: {error}</p>;

  return (
    <div>
      <h2>Teste de API</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
