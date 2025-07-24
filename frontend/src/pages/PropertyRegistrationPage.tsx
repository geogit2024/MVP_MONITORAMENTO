// src/pages/PropertyRegistrationPage.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { Feature, FeatureCollection, Polygon, Geometry } from 'geojson';
import L, { LatLngBoundsExpression } from 'leaflet';
import MapView from '../components/MapView';
import SidebarCadastro from '../components/SidebarCadastro';
import PropertyForm from '../components/PropertyForm';
import togeojson from '@mapbox/togeojson';
import JSZip from 'jszip';
import './PropertyRegistrationPage.css';
import * as turf from '@turf/turf'; // Importa a biblioteca Turf.js

// A interface da propriedade precisa incluir os novos campos
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
  geometry: Feature<Polygon>; // Garanta que isso é Feature<Polygon> ou Feature<Geometry>
  doc_identidade_path?: string;
  doc_terra_path?: string;
}

const PropertyRegistrationPage = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [newGeometry, setNewGeometry] = useState<Feature | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [mapViewTarget, setMapViewTarget] = useState<LatLngBoundsExpression | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [prefilledData, setPrefilledData] = useState<Partial<Property> | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [isFormReadOnly, setIsFormReadOnly] = useState(true);

  const clearSelectionAndCloseForm = () => {
    setSelectedProperty(null);
    setNewGeometry(null);
    setIsFormOpen(false);
    setIsCreating(false);
    setPrefilledData(null);
    setIsFormReadOnly(true); // Define como leitura ao limpar/fechar o formulário
  };

  const handleStartCreation = () => {
    clearSelectionAndCloseForm();
    setIsCreating(true);
    setIsFormReadOnly(false); // Formulário editável ao iniciar a criação
  };

  const handleGeometryDefined = useCallback(async (geometry: Feature | null) => {
    if (!geometry) return;

    setIsCreating(false);
    setIsFetchingLocation(true);
    clearSelectionAndCloseForm();
    setNewGeometry(geometry);

    try {
      const areaInSquareMeters = turf.area(geometry);
      const areaInHectares = areaInSquareMeters / 10000;

      const center = turf.centroid(geometry);
      const [lon, lat] = center.geometry.coordinates;

      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      if (!response.ok) {
        throw new Error('Não foi possível obter os dados de localização.');
      }
      const data = await response.json();
      const address = data.address;

      const municipio = address.city || address.town || address.village || 'Não encontrado';
      const estado = address.state || 'Não encontrado';

      setPrefilledData({
        municipio: municipio,
        estado: estado,
        area_total: parseFloat(areaInHectares.toFixed(4)),
      });

      const bounds = L.geoJSON(geometry).getBounds();
      setMapViewTarget(bounds);

    } catch (error) {
      console.error("Erro no preenchimento automático:", error);
      alert("Não foi possível preencher os dados de localização automaticamente. Por favor, preencha manualmente.");
      const areaInSquareMeters = turf.area(geometry);
      const areaInHectares = areaInSquareMeters / 10000;
      setPrefilledData({ area_total: parseFloat(areaInHectares.toFixed(4)) });
    } finally {
      setIsFetchingLocation(false);
      setIsFormOpen(true);
      setIsFormReadOnly(false); // Formulário editável após a geometria ser definida
    }
  }, []);

  const handleSelectProperty = async (propertyId: number) => {
    if (propertyId) {
      setIsCreating(false);
      setNewGeometry(null);
      try {
        const response = await fetch(`http://localhost:8000/api/properties/${propertyId}`);
        if (!response.ok) throw new Error("Falha ao buscar detalhes da propriedade.");
        const fullPropertyDetails: Property = await response.json();

        // LOGGING PARA DEPURAR: Verifique o que vem do backend para a geometria
        console.log("Geometria carregada do backend:", fullPropertyDetails.geometry);


        setSelectedProperty(fullPropertyDetails);

        const featureGeo = fullPropertyDetails.geometry.type === "Feature"
            ? fullPropertyDetails.geometry
            : turf.feature(fullPropertyDetails.geometry as Geometry);

        const bounds = L.geoJSON(featureGeo).getBounds();
        setMapViewTarget(bounds);
        setIsFormOpen(true);
        setIsFormReadOnly(true); // Inicia em modo de leitura ao selecionar uma propriedade existente
      } catch (error) {
        console.error(error);
        alert("Não foi possível carregar os detalhes da propriedade.");
      }
    } else {
      clearSelectionAndCloseForm();
    }
  };

  const handleFormSubmit = () => {
    clearSelectionAndCloseForm();
    setRefreshTrigger(currentValue => currentValue + 1);
    alert("Operação realizada com sucesso!");
  };

  const handleEditForm = () => {
    setIsFormReadOnly(false); // Mudar para modo de edição
  };

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
        onSelectProperty={(property) => handleSelectProperty(Number(property.id))}
        selectedPropertyId={selectedProperty?.id || null}
        refreshTrigger={refreshTrigger}
      />
      <main className="main-content">
        {isFetchingLocation && (
          <div className="loading-overlay">
            <span>Calculando área e buscando localização...</span>
          </div>
        )}
        <div className="full-page-map-container">
          <MapView 
            onDrawComplete={isCreating ? handleGeometryDefined : () => {}}
            drawingEnabled={isCreating}
            activeAoi={selectedProperty?.geometry || newGeometry}
            mapViewTarget={mapViewTarget}
            onPropertySelect={(id) => handleSelectProperty(id)}
            refreshTrigger={refreshTrigger}
            classifiedPlots={null}
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
            // CORREÇÃO APLICADA AQUI: Garante que um objeto Feature válido é sempre passado.
            // Se newGeometry e selectedProperty?.geometry são nulos/indefinidos,
            // um Feature de polígono vazio será usado como fallback.
            geometry={
              newGeometry || 
              selectedProperty?.geometry || 
              { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } } as Feature<Polygon>
            }
            onSubmit={handleFormSubmit}
            onCancel={clearSelectionAndCloseForm}
            initialData={selectedProperty ? selectedProperty : prefilledData as Property}
            isReadOnly={isFormReadOnly}
            onEdit={handleEditForm}
            onSegmentationComplete={() => {}}
          />
        </aside>
      )}
    </div>
  );
};

export default PropertyRegistrationPage;