// src/pages/MenuPage.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import './MenuPage.css';

// Componente para um ícone de Cadastro (SVG)
const CadastroIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

// Componente para um ícone de Painel (SVG)
const PainelIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="21" x2="9" y2="9"></line>
    </svg>
);

// Componente para um ícone de Análise (SVG)
const AnaliseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
        <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
    </svg>
);

const MenuPage = () => {
  const navigate = useNavigate();

  return (
    <div className="menu-page-container">
      <header className="menu-header">
        <h1>Painel de Controle</h1>
        <p>Selecione um módulo para iniciar</p>
      </header>

      <main className="menu-grid">
        {/* ✅ ALTERAÇÃO: onClick agora navega para a rota de cadastro */}
        <div className="menu-card" onClick={() => navigate('/cadastro-propriedades')}>
          <div className="card-image-container">
            <img src="https://images.unsplash.com/photo-1560493676-04071c5f467b?q=80&w=1974&auto=format&fit=crop" alt="Cadastro de Propriedades" />
          </div>
          <div className="card-content">
            <div className="card-icon"><CadastroIcon /></div>
            <h3>Cadastro de Propriedades</h3>
            <p>Adicione e gerencie os limites das suas propriedades rurais.</p>
          </div>
        </div>

        {/* Card 2: Painel de Monitoramento */}
        <div className="menu-card" onClick={() => navigate('/monitoramento')}>
          <div className="card-image-container">
            <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop" alt="Painel de Monitoramento" />
          </div>
          <div className="card-content">
            <div className="card-icon"><PainelIcon /></div>
            <h3>Painel de Monitoramento</h3>
            <p>Visualize dashboards e o estado atual das suas propriedades.</p>
          </div>
        </div>

        {/* Card 3: Módulo de Análise */}
        <div className="menu-card" onClick={() => navigate('/monitoramento')}>
          <div className="card-image-container">
            <img src="https://images.unsplash.com/photo-1614275113774-7d35395c84d6?q=80&w=1887&auto=format&fit=crop" alt="Módulo de Análise" />
          </div>
          <div className="card-content">
            <div className="card-icon"><AnaliseIcon /></div>
            <h3>Módulo de Análise</h3>
            <p>Execute análises avançadas de imagens de satélite.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MenuPage;