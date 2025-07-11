// src/components/MapView.tsx

import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, useMap, GeoJSON } from 'react-leaflet';
import L, { LatLngBoundsExpression } from 'leaflet';
import { Feature } from 'geojson';
import FirmsDataLayer from './FirmsDataLayer';
import PrecipitationLayer from './PrecipitationLayer';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import '@geoman-io/leaflet-geoman-free';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Configuração do ícone padrão do Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

// Definição de Ícones e Camadas Base
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
  }
};

// Componente para animar o mapa (sem alterações)
const MapViewAnimator = ({ target }: { target: LatLngBoundsExpression | null }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyToBounds(target, { padding: [50, 50] });
  }, [target, map]);
  return null;
};

// ✅ CORREÇÃO 1: Componente de desenho agora é controlado por uma prop
const GeomanDrawControl = ({ onDrawComplete, drawingEnabled }: { onDrawComplete: (geojson: Feature) => void, drawingEnabled: boolean }) => {
  const map = useMap();

  // Efeito para adicionar os controles e gerenciar eventos
  useEffect(() => {
    // Adiciona os botões de controle ao mapa
    if (!map.pm) return;
    map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
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
      // Remove desenhos anteriores para permitir apenas um por vez
      map.pm.getGeomanLayers().forEach(layer => {
        if (layer._leaflet_id !== e.layer._leaflet_id) {
          layer.remove();
        }
      });
      const geojson = e.layer.toGeoJSON() as Feature;
      onDrawComplete(geojson);
      map.pm.disableDraw(); // Desativa o modo de desenho após a conclusão
    };

    map.on('pm:create', handleCreate);

    // Cleanup: remove controles e eventos quando o componente for desmontado
    return () => {
      map.pm.removeControls();
      map.off('pm:create', handleCreate);
    };
  }, [map, onDrawComplete]);
  
  // Efeito para ativar/desativar o modo de desenho
  useEffect(() => {
    if (!map.pm) return;
    if (drawingEnabled) {
      map.pm.enableDraw('Polygon');
    } else {
      map.pm.disableDraw();
    }
  }, [drawingEnabled, map]);

  return null;
};

// Componente para gerenciar camadas de Tile dinâmicas (sem alterações)
const DynamicTileLayer = ({ url, zIndex = 10, opacity = 0.8, attribution }: { url: string | null; zIndex?: number; opacity?: number; attribution?: string }) => {
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

// Interface de props do componente principal
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
  drawingEnabled: boolean; // ✅ CORREÇÃO 1: Nova prop adicionada
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
  drawingEnabled, // ✅ CORREÇÃO 1: Nova prop recebida
}: MapViewProps) {
  const [showFirmsPoints, setShowFirmsPoints] = useState(false);
  const [showPrecipitation, setShowPrecipitation] = useState(false);

  const aoiStyle = { color: '#ff7800', weight: 3, opacity: 1, fill: false };
  
  const changePolygonStyle = (feature?: Feature) => {
    const type = parseInt(String(feature?.properties?.change_type), 10);
    if (type === 2) {
      return { fillColor: '#00ff00', color: '#006400', weight: 1.5, fillOpacity: 0.7 };
    } else if (type === 1) {
      return { fillColor: '#ff0000', color: '#8b0000', weight: 1.5, fillOpacity: 0.7 };
    }
    return { color: '#808080', weight: 1, fillOpacity: 0.5 };
  };

  const activeBaseMap = baseMaps[baseMapKey as keyof typeof baseMaps] || baseMaps.osm;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={[-22.505, -43.179]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer key={baseMapKey} url={activeBaseMap.url} attribution={activeBaseMap.attribution} />
        <MapViewAnimator target={mapViewTarget} />
        
        {/* ✅ CORREÇÃO 1: Passa a prop para o controle de desenho */}
        <GeomanDrawControl onDrawComplete={onDrawComplete} drawingEnabled={drawingEnabled} />

        {/* ✅ CORREÇÃO 2: Adicionada uma 'key' para forçar a recriação da camada GeoJSON ao mudar a propriedade. */}
        {activeAoi && <GeoJSON key={JSON.stringify(activeAoi)} data={activeAoi} style={aoiStyle} />}
        
        <DynamicTileLayer url={visibleLayerUrl} zIndex={indexLayerZIndex} attribution="Índice Calculado" />
        <DynamicTileLayer url={previewLayerUrl} zIndex={previewLayerZIndex} attribution="Pré-visualização" />
        <DynamicTileLayer url={differenceLayerUrl} zIndex={differenceLayerZIndex} opacity={0.7} attribution="Diferença NDVI" />
        
        {changePolygons && <GeoJSON key={JSON.stringify(changePolygons)} data={changePolygons} style={changePolygonStyle} />}
        
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