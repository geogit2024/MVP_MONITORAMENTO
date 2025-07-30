import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, useMap, GeoJSON } from 'react-leaflet';
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
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const fetchProperties = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/properties');
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
    if (!mapRef.current || !isDrawingTalhao) return;

    const map = mapRef.current;
    map.pm.enableDraw('Polygon', {
      snappable: true,
      continueDrawing: false,
    });

    const handleCreate = (e: any) => {
      const geojson = e.layer.toGeoJSON() as Feature<Polygon>;
      onTalhaoDrawComplete?.(geojson);
      map.pm.disableDraw();
      map.off('pm:create', handleCreate);
    };

    map.on('pm:create', handleCreate);

    return () => {
      map.off('pm:create', handleCreate);
      map.pm.disableDraw();
    };
  }, [isDrawingTalhao]);

  const aoiStyle = { color: '#ff7800', weight: 3, opacity: 1, fill: false };
  const propertyLayerStyle = {
    color: '#007bff',
    weight: 2,
    opacity: 0.8,
    fillColor: '#007bff',
    fillOpacity: 0.2
  };

  const changePolygonStyle = (feature?: Feature) => {
    const type = parseInt(String(feature?.properties?.change_type), 10);
    if (type === 2)
      return { fillColor: '#00ff00', color: '#006400', weight: 1.5, fillOpacity: 0.7 };
    if (type === 1)
      return { fillColor: '#ff0000', color: '#8b0000', weight: 1.5, fillOpacity: 0.7 };
    return { color: '#808080', weight: 1, fillOpacity: 0.5 };
  };

  const onEachProperty = (feature: Feature, layer: Layer) => {
    if (feature.properties) {
      const { nome, proprietario, id } = feature.properties;
      layer.bindPopup(
        `<b>${nome}</b><br>Proprietário: ${proprietario}<br><small>Clique para ver detalhes</small>`
      );
      layer.on({
        click: () => {
          onPropertySelect(id);
          setSelectedPropertyId(id);
        }
      });
    }
  };

  const activeBaseMap = baseMaps[baseMapKey as keyof typeof baseMaps] || baseMaps.osm;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <BaseMapSelector value={baseMapKey} onChange={onBaseMapChange} />

      <MapContainer
        center={[-22.505, -43.179]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        whenCreated={(map) => (mapRef.current = map)}
      >
        <TileLayer
          key={baseMapKey}
          url={activeBaseMap.url}
          attribution={activeBaseMap.attribution}
        />
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

        {activeAoi && <GeoJSON key={JSON.stringify(activeAoi)} data={activeAoi} style={aoiStyle} />}
        {changePolygons && <GeoJSON key={JSON.stringify(changePolygons)} data={changePolygons} style={changePolygonStyle} />}
        {propertiesData && <GeoJSON data={propertiesData} style={propertyLayerStyle} onEachFeature={onEachProperty} />}
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
