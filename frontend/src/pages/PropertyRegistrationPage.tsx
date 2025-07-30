import React, { useState, useCallback, useEffect } from 'react';
import { Feature, FeatureCollection, Polygon, Geometry } from 'geojson';
import L, { LatLngBoundsExpression } from 'leaflet';
import MapView from '../components/MapView';
import SidebarCadastro from '../components/SidebarCadastro';
import PropertyForm from '../components/PropertyForm';
import TalhaoForm from '../components/TalhaoForm';
import togeojson from '@mapbox/togeojson';
import JSZip from 'jszip';
import './PropertyRegistrationPage.css';
import * as turf from '@turf/turf';

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
  const [isDrawingTalhao, setIsDrawingTalhao] = useState(false);
  const [talhaoGeometry, setTalhaoGeometry] = useState<Feature<Polygon> | null>(null);
  const [showTalhaoModal, setShowTalhaoModal] = useState(false);

  const [baseMapKey, setBaseMapKey] = useState('satellite');

  const clearSelectionAndCloseForm = () => {
    setSelectedProperty(null);
    setNewGeometry(null);
    setIsFormOpen(false);
    setIsCreating(false);
    setPrefilledData(null);
    setIsFormReadOnly(true);
  };

  const handleStartCreation = () => {
    clearSelectionAndCloseForm();
    setIsCreating(true);
    setIsFormReadOnly(false);
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
      setIsFormReadOnly(false);
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

        setSelectedProperty(fullPropertyDetails);

        const featureGeo = fullPropertyDetails.geometry.type === "Feature"
            ? fullPropertyDetails.geometry
            : turf.feature(fullPropertyDetails.geometry as Geometry);

        const bounds = L.geoJSON(featureGeo).getBounds();
        setMapViewTarget(bounds);
        setIsFormOpen(true);
        setIsFormReadOnly(true);
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
    setIsFormReadOnly(false);
  };

  const handleDeleteProperty = async (propertyId: string) => {
    if (!window.confirm("Tem certeza que deseja apagar esta propriedade? Esta ação é irreversível.")) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/properties/${propertyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Falha ao apagar propriedade: ${response.statusText} - ${errorText}`);
      }

      alert("Propriedade apagada com sucesso!");
      clearSelectionAndCloseForm();
      setRefreshTrigger(currentValue => currentValue + 1);
    } catch (error: any) {
      console.error("Erro ao apagar propriedade:", error);
      alert(error.message || "Erro de conexão ao apagar propriedade.");
    }
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

  const handleCadastrarTalhao = () => {
    setIsDrawingTalhao(true);
    setTalhaoGeometry(null);
  };

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
            visibleLayerUrl={null}
            previewLayerUrl={null}
            changePolygons={null}
            baseMapKey={baseMapKey}
            onBaseMapChange={setBaseMapKey}
            differenceLayerUrl={null}
            indexLayerZIndex={10}
            differenceLayerZIndex={10}
            previewLayerZIndex={10}
            isDrawingTalhao={isDrawingTalhao}
            onTalhaoDrawComplete={(geometry) => {
              const area = turf.area(geometry) / 10000;
              geometry.properties = { ...geometry.properties, area_ha: area };
              setTalhaoGeometry(geometry);
              setShowTalhaoModal(true);
              setIsDrawingTalhao(false);
            }}
          />
        </div>
      </main>

      {isFormOpen && (newGeometry || selectedProperty) && (
        <aside className="form-sidebar-right">
          <PropertyForm
            key={selectedProperty?.id || 'new-property-form'}
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
            onDelete={selectedProperty ? handleDeleteProperty : () => {}} 
            onSegmentationComplete={() => {}}
            onCadastrarTalhao={handleCadastrarTalhao}
          />
        </aside>
      )}

      {showTalhaoModal && talhaoGeometry && (
        <TalhaoForm
          propriedadeId={selectedProperty?.id || ''}
          geometry={talhaoGeometry}
          initialArea={talhaoGeometry.properties?.area_ha || undefined}
          onClose={() => setShowTalhaoModal(false)}
          onSave={() => {
            console.log("Código do imóvel utilizado como propriedadeId:", propriedadeId);
            setShowTalhaoModal(false);
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
};

export default PropertyRegistrationPage;

