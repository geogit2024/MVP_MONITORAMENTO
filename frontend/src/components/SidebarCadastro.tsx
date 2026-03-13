import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SidebarCadastro.css';
import type { Property } from '../types/property';

interface SidebarCadastroProps {
  isCreating: boolean;
  onStartCreation: () => void;
  onCancelCreation: () => void;
  onAoiFileUpload: (file: File | null) => void;
  onSelectProperty: (property: Property | null) => void;
  selectedPropertyId: string | number | null;
  refreshTrigger: unknown;
  setSelectedProperty?: (property: Property | null) => void;
  setIsReadOnly?: (readOnly: boolean) => void;
}

const SidebarCadastro: React.FC<SidebarCadastroProps> = ({
  isCreating,
  onStartCreation,
  onCancelCreation,
  onAoiFileUpload,
  onSelectProperty,
  selectedPropertyId,
  refreshTrigger,
  setSelectedProperty,
  setIsReadOnly,
}) => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchProperties = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/properties');
      if (!response.ok) throw new Error('Falha ao carregar propriedades.');
      const data = await response.json();
      const propertyList: Property[] = data.features.map((feature: any) => ({
        id: feature.properties.id.toString(),
        propriedade_nome: feature.properties.nome,
        proprietario_nome: feature.properties.proprietario,
        municipio: feature.properties.municipio,
        estado: feature.properties.estado,
      }));
      setProperties(propertyList);
    } catch (error) {
      console.error('Erro ao buscar propriedades:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, [refreshTrigger]);

  const filteredProperties = properties.filter((prop) =>
    prop.propriedade_nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectProperty = (prop: Property) => {
    onSelectProperty(prop);
    if (typeof setSelectedProperty === 'function') setSelectedProperty(prop);
    if (typeof setIsReadOnly === 'function') setIsReadOnly(false);
  };

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
            onChange={(e) => setSearchTerm(e.target.value)}
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
          {isLoading ? (
            <div className="loading-state">Carregando propriedades...</div>
          ) : (
            filteredProperties.map((prop) => (
              <div
                key={prop.id}
                className={`property-list-item ${String(selectedPropertyId) === String(prop.id) ? 'selected' : ''}`}
                onClick={() => handleSelectProperty(prop)}
                tabIndex={0}
              >
                <span className="property-name">{prop.propriedade_nome}</span>
                <span className="property-details">{prop.proprietario_nome} | {prop.municipio}-{prop.estado}</span>
              </div>
            ))
          )}
          {!isLoading && filteredProperties.length === 0 && (
            <div className="no-results">
              {searchTerm ? 'Nenhuma propriedade encontrada.' : 'Nenhuma propriedade cadastrada.'}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

export default SidebarCadastro;
