import React from 'react';
import { useNavigate } from 'react-router-dom';
import './MenuPage.css';

const CadastroIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const PainelIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

const AnaliseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);

const ReservatorioIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const DispatchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const MobileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7" y="2" width="10" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

const cards = [
  {
    title: 'Cadastro de Propriedades',
    text: 'Adicione e gerencie os limites das propriedades rurais.',
    route: '/cadastro-propriedades',
    image: 'https://images.unsplash.com/photo-1560493676-04071c5f467b?q=80&w=1974&auto=format&fit=crop',
    icon: <CadastroIcon />,
  },
  {
    title: 'Painel de Monitoramento',
    text: 'Visualize dashboards e o estado atual das propriedades.',
    route: '/monitoramento',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop',
    icon: <PainelIcon />,
  },
  {
    title: 'Módulo de Análise',
    text: 'Execute análises avançadas em imagens de satélite.',
    route: '/monitoramento',
    image: 'https://images.unsplash.com/photo-1614275113774-7d35395c84d6?q=80&w=1887&auto=format&fit=crop',
    icon: <AnaliseIcon />,
  },
  {
    title: 'Painel de Reservatórios',
    text: 'Cadastre e monitore reservatórios ambientais.',
    route: '/reservatorios',
    image: 'https://images.unsplash.com/photo-1482062364825-616fd23b8fc1?q=80&w=1974&auto=format&fit=crop',
    icon: <ReservatorioIcon />,
  },
  {
    title: 'Despacho em Campo',
    text: 'Planeje, despache e acompanhe atividades georreferenciadas.',
    route: '/field-dispatch',
    image: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=1974&auto=format&fit=crop',
    icon: <DispatchIcon />,
  },
  {
    title: 'App Agente de Campo',
    text: 'Acesso móvel para execução de tarefas em campo.',
    route: '/mobile/field-agent',
    image: 'https://images.unsplash.com/photo-1523961131990-5ea7c61b2107?q=80&w=1974&auto=format&fit=crop',
    icon: <MobileIcon />,
  },
];

export default function MenuPage() {
  const navigate = useNavigate();

  return (
    <div className="menu-page-container">
      <header className="menu-header">
        <h1>Painel de Controle</h1>
        <p>Selecione um módulo para iniciar</p>
      </header>

      <main className="menu-grid">
        {cards.map((card) => (
          <div key={card.title} className="menu-card" onClick={() => navigate(card.route)}>
            <div className="card-image-container">
              <img src={card.image} alt={card.title} />
            </div>
            <div className="card-content">
              <div className="card-icon">{card.icon}</div>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
