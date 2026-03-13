import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface TalhoesWmsLayerProps {
  visible: boolean;
  zIndex?: number;
}

const TalhoesWmsLayer: React.FC<TalhoesWmsLayerProps> = ({ visible, zIndex = 490 }) => {
  const map = useMap();
  const layerRef = useRef<L.TileLayer.WMS | null>(null);

  // URL base do seu GeoServer WMS
  const wmsUrl = 'http://localhost:8080/geoserver/imagens_satelite/wms';

  useEffect(( ) => {
    // Inicializa a camada WMS com as opÃ§Ãµes corretas
    if (!layerRef.current) {
      layerRef.current = L.tileLayer.wms(wmsUrl, {
        layers: 'imagens_satelite:talhoes', // Nome da camada no GeoServer
        format: 'image/png',
        transparent: true,
        version: '1.1.0',
        crs: L.CRS.EPSG4326,
        zIndex: zIndex,
      });
    }

    const layer = layerRef.current;

    // Adiciona ou remove a camada do mapa com base na prop 'visible'
    if (visible && !map.hasLayer(layer)) {
      layer.addTo(map);
    } else if (!visible && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  }, [visible, map, zIndex, wmsUrl]); // Adicionado wmsUrl Ã s dependÃªncias

  // Garante que a camada seja removida quando o componente for desmontado
  useEffect(() => {
    const layer = layerRef.current;
    return () => {
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    };
  }, [map]);

  return null; // Este componente nÃ£o renderiza nenhum HTML diretamente
};

export default TalhoesWmsLayer;

