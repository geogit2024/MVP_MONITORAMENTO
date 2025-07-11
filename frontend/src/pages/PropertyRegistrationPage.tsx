// src/pages/PropertyRegistrationPage.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { Feature, FeatureCollection, Polygon } from 'geojson';
import L, { LatLngBoundsExpression } from 'leaflet';
import MapView from '../components/MapView';
import SidebarCadastro from '../components/SidebarCadastro';
import PropertyForm from '../components/PropertyForm';
import { Property, mockProperties } from '../mockProperties';
import togeojson from '@mapbox/togeojson';
import JSZip from 'jszip';
import './PropertyRegistrationPage.css';

const PropertyRegistrationPage = () => {
  const [properties, setProperties] = useState<Property[]>(mockProperties);
  const [isCreating, setIsCreating] = useState(false);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>(properties);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [newGeometry, setNewGeometry] = useState<Feature | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [mapViewTarget, setMapViewTarget] = useState<LatLngBoundsExpression | null>(null);

  useEffect(() => {
    const results = properties.filter(prop =>
      prop.propriedade_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prop.proprietario_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prop.municipio.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredProperties(results);
  }, [searchTerm, properties]);
  
  const clearSelectionAndCloseForm = () => {
    setSelectedProperty(null);
    setNewGeometry(null);
    setIsFormOpen(false);
  };

  const handleStartCreation = () => {
    clearSelectionAndCloseForm();
    setIsCreating(true);
    alert("Modo de desenho ativado. Por favor, desenhe a área da propriedade no mapa ou carregue um ficheiro.");
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

  const handleSelectProperty = (property: Property | null) => {
    if (property) {
      setNewGeometry(null);
      setSelectedProperty(property);
      const bounds = L.geoJSON(property.geometry).getBounds();
      setMapViewTarget(bounds);
      setIsFormOpen(true);
    } else {
      clearSelectionAndCloseForm();
    }
    setIsCreating(false);
  };
  
  const handleFormSubmit = (formData: any) => {
    if (selectedProperty) {
      const updatedProperty = { ...selectedProperty, ...formData, area_total: parseFloat(formData.area_total) };
      setProperties(properties.map(p => p.id === updatedProperty.id ? updatedProperty : p));
      alert("Propriedade atualizada com sucesso! (Simulação)");
    } else {
      const newProperty: Property = {
        id: new Date().toISOString(),
        geometry: newGeometry as Feature<Polygon>,
        ...formData,
        area_total: parseFloat(formData.area_total),
      };
      setProperties([...properties, newProperty]);
      alert("Propriedade cadastrada com sucesso! (Simulação)");
    }
    clearSelectionAndCloseForm();
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
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        properties={filteredProperties}
        onSelectProperty={handleSelectProperty}
        selectedPropertyId={selectedProperty?.id || null}
      />
      <main className="main-content">
        <div className="full-page-map-container">
          <MapView 
            onDrawComplete={isCreating ? handleGeometryDefined : () => {}}
            activeAoi={selectedProperty?.geometry || newGeometry}
            mapViewTarget={mapViewTarget}
            {...{
              visibleLayerUrl: null, previewLayerUrl: null, changePolygons: null,
              baseMapKey: "satellite", onBaseMapChange: () => {}, 
              differenceLayerUrl: null
            }}
          />
        </div>
      </main>

      {isFormOpen && (newGeometry || selectedProperty) && (
        <aside className="form-sidebar-right">
          <PropertyForm
            // ✅ CORREÇÃO ADICIONADA AQUI
            // A chave única força o componente a ser recriado do zero
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