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

// Componente para animar o mapa
const MapViewAnimator = ({ target }: { target: LatLngBoundsExpression | null }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyToBounds(target, { padding: [50, 50] });
  }, [target, map]);
  return null;
};

// Componente para controle de desenho Geoman
const GeomanDrawControl = ({ onDrawComplete }: { onDrawComplete: (geojson: Feature) => void }) => {
  const map = useMap();
  useEffect(() => {
    map.pm.addControls({
      position: 'topleft',
      drawPolygon: true,
      drawCircle: true,
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
      map.pm.getGeomanLayers().forEach(l => {
        if (l._leaflet_id !== e.layer._leaflet_id) {
          l.remove();
        }
      });
      let finalLayer = e.layer;
      if (e.shape === 'Circle') {
        finalLayer = L.PM.Utils.circleToPolygon(e.layer, 64);
      }
      const geojson = finalLayer.toGeoJSON() as Feature;
      onDrawComplete(geojson);
    };
    map.on('pm:create', handleCreate);
    return () => {
      map.pm.removeControls();
      map.off('pm:create', handleCreate);
    };
  }, [map, onDrawComplete]);
  return null;
};


// Componente para gerenciar camadas de Tile dinâmicas
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
            if (layerRef.current) {
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
}: MapViewProps) {
  const [showFirmsPoints, setShowFirmsPoints] = useState(false);
  const [showPrecipitation, setShowPrecipitation] = useState(false);

  const aoiStyle = { color: '#ff7800', weight: 3, opacity: 1, fill: false };
  
  // ✅ ATUALIZAÇÃO: Lógica de cores ajustada para os novos rótulos do backend
  const changePolygonStyle = (feature?: Feature) => {
    const type = parseInt(String(feature?.properties?.change_type), 10);

    if (type === 2) { // 2 = Ganho (Acréscimo de vegetação)
      return {
        fillColor: '#00ff00',
        color: '#006400',
        weight: 1.5,
        fillOpacity: 0.7
      };
    } else if (type === 1) { // 1 = Perda (Supressão de vegetação)
      return {
        fillColor: '#ff0000',
        color: '#8b0000',
        weight: 1.5,
        fillOpacity: 0.7
      };
    }
    
    // Estilo padrão para qualquer outro caso
    return { color: '#808080', weight: 1, fillOpacity: 0.5 };
  };

  const activeBaseMap = baseMaps[baseMapKey as keyof typeof baseMaps] || baseMaps.osm;

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer center={[-22.7273, -47.6492]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer key={baseMapKey} url={activeBaseMap.url} attribution={activeBaseMap.attribution} />
        <MapViewAnimator target={mapViewTarget} />
        <GeomanDrawControl onDrawComplete={onDrawComplete} />
        {activeAoi && <GeoJSON data={activeAoi} style={aoiStyle} />}
        
        {/* Camadas dinâmicas de análise */}
        <DynamicTileLayer url={visibleLayerUrl} zIndex={10} attribution="Índice Calculado" />
        <DynamicTileLayer url={previewLayerUrl} zIndex={11} attribution="Pré-visualização" />
        
        {/* Camadas de Detecção de Mudança */}
        <DynamicTileLayer url={differenceLayerUrl} zIndex={12} opacity={0.7} attribution="Diferença NDVI" />
        {changePolygons && <GeoJSON data={changePolygons} style={changePolygonStyle} />}
        
        {/* Outras camadas de dados */}
        {showFirmsPoints && <FirmsDataLayer />}
        <PrecipitationLayer visible={showPrecipitation} />
      </MapContainer>

      {/* Botões de camadas adicionais */}
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