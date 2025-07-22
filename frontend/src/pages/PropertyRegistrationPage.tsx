// src/pages/PropertyRegistrationPage.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { Feature, FeatureCollection, Polygon } from 'geojson';
import L, { LatLngBoundsExpression } from 'leaflet';
import MapView from '../components/MapView';
import SidebarCadastro from '../components/SidebarCadastro';
import PropertyForm from '../components/PropertyForm';
import togeojson from '@mapbox/togeojson';
import JSZip from 'jszip';
import './PropertyRegistrationPage.css';

// ✅ TIPO DE DADO REAL: Definimos a interface da propriedade aqui, para corresponder à API.
// Removida a dependência do mockProperties.
export interface Property {
  id: string;
  propriedade_nome: string;
  incra_codigo?: string;
  municipio: string;
  estado: string;
  area_total: number;
  proprietario_nome: string;
  cpf_cnpj: string;
  email: string;
  matricula?: string;
  ccir?: string;
  geometry: Feature<Polygon>;
}

const PropertyRegistrationPage = () => {
  // ✅ ESTADOS REMOVIDOS: 'properties', 'filteredProperties' e 'searchTerm' foram removidos.
  // A lógica de lista e busca agora é interna da Sidebar.
  
  // Estados para controlar a UI e o fluxo de criação/edição
  const [isCreating, setIsCreating] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [newGeometry, setNewGeometry] = useState<Feature | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [mapViewTarget, setMapViewTarget] = useState<LatLngBoundsExpression | null>(null);

  // ✅ NOVO ESTADO: O gatilho para atualizar os componentes filhos.
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const clearSelectionAndCloseForm = () => {
    setSelectedProperty(null);
    setNewGeometry(null);
    setIsFormOpen(false);
    setIsCreating(false); // Garante que o modo de criação também seja desativado
  };

  const handleStartCreation = () => {
    clearSelectionAndCloseForm();
    setIsCreating(true);
    // O alerta foi removido para uma UX mais limpa, a UI já indica o modo de desenho.
  };

  const handleGeometryDefined = useCallback((geometry: Feature | null) => {
    if (geometry) {
      clearSelectionAndCloseForm();
      setNewGeometry(geometry);
      const bounds = L.geoJSON(geometry).getBounds();
      setMapViewTarget(bounds);
      setIsFormOpen(true); 
      setIsCreating(false);
    }
  }, []);

  // ✅ LÓGICA ATUALIZADA: Agora busca os detalhes da propriedade da API.
  const handleSelectProperty = async (property: Property | null) => {
    if (property) {
      setIsCreating(false);
      setNewGeometry(null);
      
      try {
        // Busca os dados completos para garantir que temos a geometria e todos os campos
        const response = await fetch(`http://localhost:8000/api/properties/${property.id}`);
        if (!response.ok) throw new Error("Falha ao buscar detalhes da propriedade.");
        const fullPropertyDetails: Property = await response.json();

        setSelectedProperty(fullPropertyDetails);
        const bounds = L.geoJSON(fullPropertyDetails.geometry).getBounds();
        setMapViewTarget(bounds);
        setIsFormOpen(true); // Abre o formulário para visualização/edição

      } catch (error) {
        console.error(error);
        alert("Não foi possível carregar os detalhes da propriedade.");
      }

    } else {
      clearSelectionAndCloseForm();
    }
  };
  
  // ✅ LÓGICA ATUALIZADA: A responsabilidade agora é apenas fechar o form e disparar a atualização.
  const handleFormSubmit = () => {
    // A lógica de POST/PUT agora está dentro do PropertyForm.
    // Este componente pai só precisa reagir ao sucesso.
    
    // 1. Fecha o formulário
    clearSelectionAndCloseForm();

    // 2. Dispara o gatilho para que a Sidebar e o Mapa se atualizem
    setRefreshTrigger(currentValue => currentValue + 1);

    alert("Operação realizada com sucesso!");
  };

  // A lógica de upload de arquivo permanece a mesma, pois é uma funcionalidade isolada.
  const handleAoiFileUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      let kmlText = '';
      if (file.name.toLowerCase().endsWith('.kmz')) {
        const zip = await JSZip.loadAsync(file);
        const kmlFile = zip.file(/\.kml$/i)?.[0];
        if (!kmlFile) throw new Error('Nenhum ficheiro .kml encontrado dentro do KMZ.');
        kmlText = await kmlFile.async('string');
      } else {
        kmlText = await file.text();
      }
      const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
      const geojson = togeojson.kml(dom) as FeatureCollection;
      const polygonFeature = geojson.features.find(
        (f): f is Feature => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
      );
      if (polygonFeature) {
        handleGeometryDefined(polygonFeature);
      } else {
        alert('Nenhum polígono válido foi encontrado no ficheiro KML/KMZ.');
      }
    } catch (error: any) {
      alert(`Erro ao processar o ficheiro: ${error.message}`);
    }
  }, [handleGeometryDefined]);
  
  return (
    <div className="main-view">
      <SidebarCadastro
        isCreating={isCreating}
        onStartCreation={handleStartCreation}
        onCancelCreation={clearSelectionAndCloseForm}
        onAoiFileUpload={handleAoiFileUpload}
        onSelectProperty={handleSelectProperty}
        selectedPropertyId={selectedProperty?.id || null}
        // ✅ PROP ATUALIZADA: Passa o gatilho para a Sidebar
        refreshTrigger={refreshTrigger}
      />
      <main className="main-content">
        <div className="full-page-map-container">
          <MapView 
            onDrawComplete={isCreating ? handleGeometryDefined : () => {}}
            drawingEnabled={isCreating}
            activeAoi={selectedProperty?.geometry || newGeometry}
            mapViewTarget={mapViewTarget}
            onPropertySelect={(id) => handleSelectProperty({id} as Property)}
            // ✅ PROP ATUALIZADA: Passa o gatilho para o Mapa
            refreshTrigger={refreshTrigger}
            // As outras props permanecem, pois são de funcionalidades existentes
            {...{
              visibleLayerUrl: null, previewLayerUrl: null, changePolygons: null,
              baseMapKey: "satellite", onBaseMapChange: () => {}, 
              differenceLayerUrl: null,
              indexLayerZIndex: 10, differenceLayerZIndex: 10, previewLayerZIndex: 10
            }}
          />
        </div>
      </main>

      {isFormOpen && (newGeometry || selectedProperty) && (
        <aside className="form-sidebar-right">
          <PropertyForm
            key={selectedProperty?.id || 'new-property-form'}
            geometry={(newGeometry || selectedProperty?.geometry)!}
            onSubmit={handleFormSubmit}
            onCancel={clearSelectionAndCloseForm}
            initialData={selectedProperty}
          />
        </aside>
      )}
    </div>
  );
};

export default PropertyRegistrationPage;