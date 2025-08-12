import React, { useEffect, useState, useRef } from 'react';
import InfoTool from './InfoTool'; 
import { MapContainer, TileLayer, useMap, GeoJSON, useMapEvents } from 'react-leaflet';
import L, { LatLngBoundsExpression, Layer } from 'leaflet';
import { Feature, FeatureCollection, Polygon } from 'geojson';
import FirmsDataLayer from './FirmsDataLayer';
import PrecipitationLayer from './PrecipitationLayer';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import '@geoman-io/leaflet-geoman-free';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import BaseMapSelector from './BaseMapSelector';
import LayerControl from './LayerControl';

// Corrige ícones padrão
(L.Icon.Default.prototype as any)._getIconUrl = undefined;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

export const fireIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/482/482541.png',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const baseMaps = {
  osm: {
    name: 'Padrão',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    name: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  dark: {
    name: 'Escuro',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
  },
  google_streets: {
    name: 'Google Streets',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
  },
  google_hybrid: {
    name: 'Google Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
  }
};

// --- COMPONENTES AUXILIARES ---

const MapViewAnimator = ({ target }: { target: LatLngBoundsExpression | null }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyToBounds(target, { padding: [50, 50] });
  }, [target, map]);
  return null;
};

const GeomanDrawControl = ({
  onDrawComplete,
  drawingEnabled,
  isDrawingTalhao,
  onTalhaoDrawComplete
}: {
  onDrawComplete: (geojson: Feature) => void;
  drawingEnabled: boolean;
  isDrawingTalhao?: boolean;
  onTalhaoDrawComplete?: (geometry: Feature<Polygon>) => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map.pm) return;

    map.pm.addControls({
      position: 'topleft',
      drawPolygon: drawingEnabled || isDrawingTalhao,
      drawCircle: false,
      removalMode: true,
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      editMode: false,
      dragMode: false,
      cutPolygon: false
    });

    map.pm.setPathOptions({ color: '#ff7800', fill: false, weight: 3 });

    const handleCreate = (e: any) => {
      const geojson = e.layer.toGeoJSON() as Feature<Polygon>;
      if (isDrawingTalhao && onTalhaoDrawComplete) {
        onTalhaoDrawComplete(geojson);
      } else {
        onDrawComplete(geojson);
      }
      map.pm.getGeomanLayers().forEach(layer => {
        if (layer._leaflet_id !== e.layer._leaflet_id) {
          layer.remove();
        }
      });
      map.pm.disableDraw();
    };

    map.on('pm:create', handleCreate);

    return () => {
      map.pm.removeControls();
      map.off('pm:create', handleCreate);
    };
  }, [map, drawingEnabled, isDrawingTalhao, onTalhaoDrawComplete, onDrawComplete]);

  useEffect(() => {
    if (!map.pm) return;

    if (drawingEnabled || isDrawingTalhao) {
      map.pm.enableDraw('Polygon');
    } else {
      map.pm.disableDraw();
    }
  }, [drawingEnabled, isDrawingTalhao, map]);

  return null;
};

const DynamicTileLayer = ({
  url,
  zIndex = 10,
  opacity = 0.8,
  attribution
}: {
  url: string | null;
  zIndex?: number;
  opacity?: number;
  attribution?: string;
}) => {
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (url) {
      const newLayer = L.tileLayer(url, { zIndex, opacity, attribution });
      newLayer.addTo(map);
      layerRef.current = newLayer;
    }
    return () => {
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [url, map, zIndex, opacity, attribution]);

  return null;
};
const MapClickHandler = ({ onMapClick }: { onMapClick: (e: L.LeafletMouseEvent) => void }) => {
  useMapEvents({
    click(e) {
      onMapClick(e);
    },
  });
  return null;
};
// Componente reativo para camadas WMS com LOGS
const WmsLayer = ({ url, options, visible, layerName }: { url: string; options: L.WMSOptions; visible: boolean; layerName: string }) => {
  const map = useMap();
  const layerRef = useRef<L.TileLayer.WMS | null>(null);

  useEffect(() => {
    if (visible) {
      if (!layerRef.current) {
        layerRef.current = L.tileLayer.wms(url, options);
      }
      if (!map.hasLayer(layerRef.current)) {
        layerRef.current.addTo(map);
      }
    } else {
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
    }
  }, [visible, map, url, options, layerName]);

  useEffect(() => {
    const layer = layerRef.current;
    return () => {
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    };
  }, [map, layerName]);

  return null;
};


// --- PROPS E COMPONENTE PRINCIPAL ---

interface MapViewProps {
  onDrawComplete: (geojson: Feature) => void;
  visibleLayerUrl: string | null;
  previewLayerUrl: string | null;
  changePolygons: Feature | null;
  activeAoi: Feature | null;
  baseMapKey: string;
  onBaseMapChange: (key: string) => void;
  mapViewTarget: LatLngBoundsExpression | null;
  differenceLayerUrl: string | null;
  indexLayerZIndex: number;
  differenceLayerZIndex: number;
  previewLayerZIndex: number;
  drawingEnabled: boolean;
  onPropertySelect: (id: string) => void;
  refreshTrigger: any;
  isDrawingTalhao?: boolean;
  onTalhaoDrawComplete?: (geometry: Feature<Polygon>) => void;
}

export default function MapView({
  onDrawComplete,
  visibleLayerUrl,
  previewLayerUrl,
  changePolygons,
  activeAoi,
  baseMapKey,
  onBaseMapChange,
  mapViewTarget,
  differenceLayerUrl,
  indexLayerZIndex,
  differenceLayerZIndex,
  previewLayerZIndex,
  drawingEnabled,
  onPropertySelect,
  refreshTrigger,
  isDrawingTalhao,
  onTalhaoDrawComplete
}: MapViewProps) {
  const [showFirmsPoints, setShowFirmsPoints] = useState(false);
  const [showPrecipitation, setShowPrecipitation] = useState(false);
  const [propertiesData, setPropertiesData] = useState<FeatureCollection | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [isInfoToolActive, setIsInfoToolActive] = useState(false);
  const [visibleWmsLayers, setVisibleWmsLayers] = useState({
    propriedades_rurais: false,
    talhoes: false,
    propriedades_car_sp: false,
    alertas_desmatamento_mapbiomas: false,
    ucs: false,
  });

  const handleWmsLayerToggle = (layerName: string, isVisible: boolean) => {
    if (layerName === 'propriedades_car_sp' && !isVisible) {
      setIsInfoToolActive(false);
    }
    setVisibleWmsLayers(prev => ({ ...prev, [layerName]: isVisible }));
  };

  const handleGetFeatureInfo = (e: L.LeafletMouseEvent) => {
    if (!isInfoToolActive || !visibleWmsLayers.propriedades_car_sp || !mapRef.current) {
      return;
    }
    const map = mapRef.current;
    const point = map.latLngToContainerPoint(e.latlng);
    const size = map.getSize();
    const bounds = map.getBounds().toBBoxString();
    
    const url = 'http://localhost:8080/geoserver/imagens_satelite/wms';
    const params = {
      service: 'WMS',
      version: '1.1.1',
      request: 'GetFeatureInfo',
      layers: 'imagens_satelite:PROPRIEDADES_CAR_SP',
      query_layers: 'imagens_satelite:PROPRIEDADES_CAR_SP',
      bbox: bounds,
      feature_count: 10,
      height: size.y,
      width: size.x,
      info_format: 'application/json',
      srs: 'EPSG:4326',
      x: Math.round(point.x),
      y: Math.round(point.y),
    };
    
    const wmsUrl = `${url}?${new URLSearchParams(params as any)}`;

    fetch(wmsUrl)
      .then(response => response.json())
      .then(data => {
        if (data && data.features && data.features.length > 0) {
          const feature = data.features[0];
          const props = feature.properties;
          const content = `
            <div>
              <h4>Informações do Imóvel</h4>
              <p><strong>Código:</strong> ${props.cod_imovel}</p>
              <p><strong>Município:</strong> ${props.nom_munici}</p>
              <p><strong>Área (ha):</strong> ${parseFloat(props.num_area).toFixed(2)}</p>
              <p><strong>Condição:</strong> ${props.des_condic}</p>
            </div>
          `;
          L.popup()
            .setLatLng(e.latlng)
            .setContent(content)
            .openOn(map);
        }
      })
      .catch(error => {
        console.error('Erro ao buscar GetFeatureInfo:', error);
      })
      .finally(() => {
        setIsInfoToolActive(false);
      });
  };

  const fetchProperties = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/properties' );
      if (!response.ok) throw new Error('Falha ao carregar propriedades.');
      const data: FeatureCollection = await response.json();
      setPropertiesData(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, [refreshTrigger]);
  
  useEffect(() => {
  if (!mapRef.current) return;
  const mapContainer = mapRef.current.getContainer();
  if (isInfoToolActive) {
    mapContainer.classList.add('crosshair-cursor');
  } else {
    mapContainer.classList.remove('crosshair-cursor');
  }
}, [isInfoToolActive]);

  const onEachProperty = (feature: Feature, layer: Layer) => {
    if (feature.properties) {
      const { nome, proprietario, id } = feature.properties;
      layer.bindPopup(
        `<b>${nome}</b>  
         Proprietário: ${proprietario}  
         <small>Clique para ver detalhes</small>`
      );
      layer.on({
        click: () => onPropertySelect(String(id))
      });
    }
  };

  const activeBaseMap = baseMaps[baseMapKey as keyof typeof baseMaps] || baseMaps.osm;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}>
        <BaseMapSelector value={baseMapKey} onChange={onBaseMapChange} />
      </div>
      <div style={{ position: 'absolute', top: '90px', right: '10px', zIndex: 999 }}>
        <LayerControl onLayerToggle={handleWmsLayerToggle} initialState={visibleWmsLayers} />
      </div>
      
      <div style={{ position: 'absolute', top: '200px', left: '10px', zIndex: 1000 }}>
        {visibleWmsLayers.propriedades_car_sp && (
          <InfoTool 
            onClick={() => setIsInfoToolActive(prev => !prev)} 
            isActive={isInfoToolActive} 
          />
        )}
      </div>

      <MapContainer
        center={[-22.505, -43.179]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer key={baseMapKey} url={activeBaseMap.url} attribution={activeBaseMap.attribution} />
        
        <MapClickHandler onMapClick={handleGetFeatureInfo} />

        <MapViewAnimator target={mapViewTarget} />
        <GeomanDrawControl 
          onDrawComplete={onDrawComplete}
          drawingEnabled={drawingEnabled}
          isDrawingTalhao={isDrawingTalhao}
          onTalhaoDrawComplete={onTalhaoDrawComplete}
        />
        
        <DynamicTileLayer url={visibleLayerUrl} zIndex={indexLayerZIndex} attribution="Índice Calculado" />
        <DynamicTileLayer url={previewLayerUrl} zIndex={previewLayerZIndex} attribution="Pré-visualização" />
        <DynamicTileLayer url={differenceLayerUrl} zIndex={differenceLayerZIndex} opacity={0.7} attribution="Diferença NDVI" />

        <WmsLayer
          url="http://localhost:8080/geoserver/imagens_satelite/wms"
          options={{ layers: 'imagens_satelite:propriedades_rurais', format: 'image/png', transparent: true, zIndex: 450 }}
          visible={visibleWmsLayers.propriedades_rurais}
          layerName="propriedades_rurais"
        />
        <WmsLayer
          url="http://localhost:8080/geoserver/imagens_satelite/wms"
          options={{ layers: 'imagens_satelite:talhoes', format: 'image/png', transparent: true, zIndex: 460 }}
          visible={visibleWmsLayers.talhoes}
          layerName="talhoes"
        />
        <WmsLayer
          url="http://localhost:8080/geoserver/imagens_satelite/wms"
          options={{
            layers: 'imagens_satelite:PROPRIEDADES_CAR_SP',
            format: 'image/png',
            transparent: true,
            zIndex: 470
          }}
          visible={visibleWmsLayers.propriedades_car_sp}
          layerName="propriedades_car_sp"
        />
         <WmsLayer
          url="http://localhost:8080/geoserver/imagens_satelite/wms" // <-- Altere o workspace
          options={{
            layers: 'imagens_satelite:ucs', // <-- Altere o nome completo da camada
            format: 'image/png',
            transparent: true,
            zIndex: 490 // zIndex alto para ficar por cima de outras camadas
          }}
          visible={visibleWmsLayers.ucs} // <<-- Conecta a visibilidade ao estado
          layerName="ucs"
        />
        <WmsLayer
          url="https://alerta.mapbiomas.org/geoserver/wms"
          options={{
            layers: 'mapbiomas-alerta:desmatamento_alerta',
            format: 'image/png',
            transparent: true,
            zIndex: 480,
            cql_filter: "detection_date >= '2024-08-11' AND detection_date <= '2025-08-11'"
          }}
          visible={visibleWmsLayers.alertas_desmatamento_mapbiomas}
          layerName="alertas_desmatamento_mapbiomas"
        />
        {activeAoi && <GeoJSON key={JSON.stringify(activeAoi )} data={activeAoi} />}
        {propertiesData && <GeoJSON data={propertiesData} onEachFeature={onEachProperty} />}
        
        {showFirmsPoints && <FirmsDataLayer />}
        <PrecipitationLayer visible={showPrecipitation} />
      </MapContainer>

      <div style={{ position: 'absolute', bottom: '20px', left: '10px', zIndex: 1001, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button className="map-layer-button firms" onClick={() => setShowFirmsPoints(p => !p)}>
          {showFirmsPoints ? 'Ocultar FIRMS' : 'Mostrar FIRMS'}
        </button>
        <button className="map-layer-button precipitation" onClick={() => setShowPrecipitation(p => !p)}>
          {showPrecipitation ? 'Ocultar Precipitação' : 'Mostrar Precipitação'}
        </button>
      </div>
    </div>
  );
}