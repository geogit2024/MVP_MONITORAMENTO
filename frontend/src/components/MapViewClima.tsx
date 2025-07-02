// Caminho: src/components/MapViewClima.tsx

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, GeoJSON, ImageOverlay } from 'react-leaflet';
import L, { LatLngBoundsExpression } from 'leaflet';
import { Feature } from 'geojson';
import FirmsDataLayer from './FirmsDataLayer'; // <-- 1. Importe o novo componente

import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import '@geoman-io/leaflet-geoman-free';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
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

const MapViewAnimator = ({ target }: { target: LatLngBoundsExpression | null }) => {
    const map = useMap();
    useEffect(() => {
        if (target) {
            map.flyToBounds(target, { padding: [50, 50] });
        }
    }, [target, map]);
    return null;
};

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
    return () => { if (map.pm) { map.pm.removeControls(); map.off('pm:create', handleCreate); } };
  }, [map, onDrawComplete]);
  return null;
};

const BaseMapSelector = ({ onBaseMapChange, activeKey }: { onBaseMapChange: (key: string) => void, activeKey: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    const map = useMap();
    useEffect(() => {
        const closeSelector = () => setIsOpen(false);
        map.on('click', closeSelector);
        return () => { map.off('click', closeSelector); };
    }, [map]);
    const controlStyle: React.CSSProperties = { position: 'absolute', top: '10px', right: '10px', zIndex: 1001, };
    const buttonStyle: React.CSSProperties = { width: '34px', height: '34px', backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3e%3cpath d=%27M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z%27/%3e%3c/svg%3e")', backgroundSize: '20px 20px', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', border: '1px solid #ccc', cursor: 'pointer', backgroundColor: 'white', borderRadius: '5px', boxShadow: '0 1px 5px rgba(0,0,0,0.4)', };
    const optionsContainerStyle: React.CSSProperties = { position: 'relative' };
    const optionsListStyle: React.CSSProperties = { position: 'absolute', top: '0', right: '40px', backgroundColor: 'white', borderRadius: '5px', boxShadow: '0 1px 5px rgba(0,0,0,0.65)', listStyle: 'none', padding: '5px', margin: 0, display: isOpen ? 'block' : 'none', };
    const optionItemStyle: React.CSSProperties = {padding: '8px 12px',cursor: 'pointer',whiteSpace: 'nowrap',color: '#000', backgroundColor: '#fff',   // <- garante contraste
};

    return (
        <div style={controlStyle}>
            <div style={optionsContainerStyle}>
                <button style={buttonStyle} onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} title="Mudar mapa base" />
                <ul style={optionsListStyle}>
                    {Object.keys(baseMaps).map(key => (
                        <li key={key} style={{ ...optionItemStyle, backgroundColor: key === activeKey ? '#f0f0f0' : 'transparent' }} onClick={() => { onBaseMapChange(key); setIsOpen(false); }}>
                            {baseMaps[key as keyof typeof baseMaps].name}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

interface MapViewProps {
  onDrawComplete: (geojson: Feature) => void;
  indexData?: { imageUrl: string; bounds: LatLngBoundsExpression } | null;
  changePolygons?: Feature | null;
  activeAoi?: Feature | null;
  baseMapKey: string;
  onBaseMapChange: (key: string) => void;
  mapViewTarget: LatLngBoundsExpression | null;
  showFirmsPoints?: boolean;
}

export default function MapView({
  onDrawComplete,
  indexData,
  changePolygons,
  activeAoi,
  baseMapKey,
  onBaseMapChange,
  mapViewTarget,
  showFirmsPoints = true,
}: MapViewProps) {

  const aoiStyle = { color: '#ff7800', weight: 3, opacity: 1, fill: false };

  const changePolygonStyle = (feature?: Feature) => ({
    fillColor: feature?.properties?.change_type === 'gain' ? 'green' : 'red',
    color: feature?.properties?.change_type === 'gain' ? 'green' : 'red',
    weight: 1,
    fillOpacity: 0.5
  });

  const activeBaseMap = baseMaps[baseMapKey as keyof typeof baseMaps] || baseMaps.osm;

  return (
    <MapContainer center={[-22.7273, -47.6492]} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer key={baseMapKey} url={activeBaseMap.url} attribution={activeBaseMap.attribution} />
      <MapViewAnimator target={mapViewTarget} />
      <BaseMapSelector onBaseMapChange={onBaseMapChange} activeKey={baseMapKey} />
      <GeomanDrawControl onDrawComplete={onDrawComplete} />
      {activeAoi && <GeoJSON data={activeAoi} style={aoiStyle} />}
      {indexData && <ImageOverlay url={indexData.imageUrl} bounds={indexData.bounds} opacity={0.8} zIndex={10} />}
      {changePolygons && <GeoJSON data={changePolygons} style={changePolygonStyle} />}
      {showFirmsPoints && <FirmsDataLayer />} {/* <-- camada de focos de calor visível por padrão */}
    </MapContainer>
  );
}
