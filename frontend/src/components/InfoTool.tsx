// src/components/InfoTool.tsx
import React from 'react';
import './InfoTool.css'; // Vamos criar este CSS a seguir

interface InfoToolProps {
  onClick: () => void;
  isActive: boolean;
}

const InfoTool: React.FC<InfoToolProps> = ({ onClick, isActive }) => {
  // O ícone de "informação" (SVG)
  const infoIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  );

  // Adiciona a classe 'active' ao botão se a ferramenta estiver ativa
  const buttonClass = `info-tool-button ${isActive ? 'active' : ''}`;

  return (
    <div className="leaflet-control leaflet-bar">
      <button
        className={buttonClass}
        onClick={onClick}
        title="Consultar informações da camada CAR (clique aqui e depois no mapa)"
      >
        {infoIcon}
      </button>
    </div>
  );
};

export default InfoTool;