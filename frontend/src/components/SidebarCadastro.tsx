// src/components/SidebarCadastro.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SidebarCadastro.css';

// ✅ TIPO LOCAL: Definimos a interface aqui, independente de mocks.
// Esta interface deve corresponder aos dados retornados pela sua API.
interface Property {
  id: string;
  propriedade_nome: string;
  proprietario_nome: string;
  municipio: string;
  estado: string;
  // Adicione outros campos se necessário
}

// ✅ PROPS ATUALIZADAS: Removemos props de dados e adicionamos o gatilho de atualização.
interface SidebarCadastroProps {
  isCreating: boolean;
  onStartCreation: () => void;
  onCancelCreation: () => void;
  onAoiFileUpload: (file: File | null) => void;
  onSelectProperty: (property: Property | null) => void;
  selectedPropertyId: string | null;
  refreshTrigger: any; // Gatilho para forçar a atualização da lista
}

const SidebarCadastro: React.FC<SidebarCadastroProps> = ({
  isCreating,
  onStartCreation,
  onCancelCreation,
  onAoiFileUpload,
  onSelectProperty,
  selectedPropertyId,
  refreshTrigger, // Prop recebida para saber quando atualizar
}) => {
  const navigate = useNavigate();

  // ✅ ESTADO INTERNO: O componente agora gerencia sua própria lista e busca.
  const [properties, setProperties] = useState<Property[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // ✅ LÓGICA DE BUSCA: Função para buscar os dados da API.
  const fetchProperties = async () => {
    setIsLoading(true);
    try {
      // O endpoint pode ser colocado em uma variável de ambiente no futuro
      const response = await fetch('http://localhost:8000/api/properties');
      if (!response.ok) {
        throw new Error('Falha ao carregar propriedades.');
      }
      const data = await response.json(); // Espera um FeatureCollection

      // Transforma a resposta da API na estrutura de dados que o componente precisa
      const propertyList: Property[] = data.features.map((feature: any) => ({
        id: feature.properties.id.toString(),
        propriedade_nome: feature.properties.nome,
        proprietario_nome: feature.properties.proprietario,
        municipio: feature.properties.municipio,
        estado: feature.properties.estado,
      }));
      setProperties(propertyList);
    } catch (error) {
      console.error("Erro ao buscar propriedades:", error);
      // Aqui você poderia definir um estado de erro para exibir uma mensagem ao usuário
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ EFEITO DE ATUALIZAÇÃO: Roda na primeira vez e sempre que o 'refreshTrigger' mudar.
  useEffect(() => {
    fetchProperties();
  }, [refreshTrigger]);

  // ✅ FILTRO LOCAL: A busca agora acontece diretamente na lista em memória.
  const filteredProperties = properties.filter(prop =>
    prop.propriedade_nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            // ✅ O input agora atualiza o estado local
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
          {/* ✅ EXIBIÇÃO CONDICIONAL: Mostra 'Carregando' ou a lista de propriedades */}
          {isLoading ? (
            <div className="loading-state">Carregando propriedades...</div>
          ) : (
            filteredProperties.map(prop => (
              <div
                key={prop.id}
                className={`property-list-item ${selectedPropertyId === prop.id ? 'selected' : ''}`}
                onClick={() => onSelectProperty(prop)}
                tabIndex={0}
              >
                <span className="property-name">{prop.propriedade_nome}</span>
                {/* O detalhe agora usa os dados vindos da API */}
                <span className="property-details">{prop.proprietario_nome} | {prop.municipio}-{prop.estado}</span>
              </div>
            ))
          )}
          {/* Mensagem para quando a busca não retorna resultados */}
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