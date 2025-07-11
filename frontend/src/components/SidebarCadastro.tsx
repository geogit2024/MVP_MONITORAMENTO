// src/components/SidebarCadastro.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
// A interface 'Property' agora vem do nosso arquivo de mock
import { Property } from '../mockProperties'; 
import './SidebarCadastro.css';

interface SidebarCadastroProps {
  isCreating: boolean;
  onStartCreation: () => void;
  onCancelCreation: () => void;
  onAoiFileUpload: (file: File | null) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  properties: Property[];
  onSelectProperty: (property: Property | null) => void;
  selectedPropertyId: string | null;
}

const SidebarCadastro: React.FC<SidebarCadastroProps> = ({
  isCreating,
  onStartCreation,
  onCancelCreation,
  onAoiFileUpload,
  searchTerm,
  onSearchTermChange,
  properties,
  onSelectProperty,
  selectedPropertyId,
}) => {
  const navigate = useNavigate();

  return (
    <aside className="sidebar-container">
      <div className="sidebar-header-flex">
        <button onClick={() => navigate('/menu')} className="back-button" title="Voltar ao Menu">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <h3>Minhas Propriedades</h3>
        <div className="header-actions">
          <button onClick={onStartCreation} className="add-button" title="Incluir Nova Propriedade">+</button>
        </div>
      </div>
      
      <div className="sidebar-content">
        <div className="search-container">
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="search-input"
            disabled={isCreating}
          />
        </div>

        {isCreating && (
            <div className="info-box">
                <p>Modo de desenho ativo. Defina os limites no mapa ou carregue um ficheiro.</p>
                <label className="file-upload-label">
                  Carregar KML/KMZ
                  <input 
                    type="file" 
                    accept=".kml,.kmz"
                    onChange={(e) => onAoiFileUpload(e.target.files ? e.target.files[0] : null)} 
                  />
                </label>
                <button onClick={onCancelCreation} className="button-secondary small-button">Cancelar</button>
            </div>
        )}

        <div className="property-list">
          {properties.map(prop => (
            <div
              key={prop.id}
              className={`property-list-item ${selectedPropertyId === prop.id ? 'selected' : ''}`}
              onClick={() => onSelectProperty(prop)}
              tabIndex={0}
            >
              {/* ✅ CORREÇÃO: Usando os novos nomes dos campos */}
              <span className="property-name">{prop.propriedade_nome}</span>
              <span className="property-details">{prop.proprietario_nome} | {prop.municipio}-{prop.estado}</span>
            </div>
          ))}
          {properties.length === 0 && searchTerm && (
            <div className="no-results">Nenhuma propriedade encontrada.</div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default SidebarCadastro;