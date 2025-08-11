import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface CarWmsLayerProps {
  visible: boolean;
  zIndex: number;
}

const CarWmsLayer = ({ visible, zIndex }: CarWmsLayerProps) => {
  const map = useMap();
  // useRef para manter a referência da camada entre as renderizações
  const layerRef = useRef<L.TileLayer.WMS | null>(null);

  useEffect(() => {
    const url = "http://localhost:8080/geoserver/imagens_satelite/wms";
    const options: L.WMSOptions = {
      layers: "imagens_satelite:PROPRIEDADES_CAR_SP",
      format: "image/png",
      transparent: true,
      zIndex: zIndex,
      attribution: "Cadastro Ambiental Rural"
    };

    // ✅ LÓGICA CORRIGIDA:
    if (visible ) {
      // Se a camada deve estar visível, mas ainda não foi criada...
      if (!layerRef.current) {
        // ...cria a camada e a armazena na referência.
        layerRef.current = L.tileLayer.wms(url, options);
      }
      // Garante que a camada (recém-criada ou já existente) esteja no mapa.
      if (!map.hasLayer(layerRef.current)) {
        layerRef.current.addTo(map);
      }
    } else {
      // Se a camada não deve estar visível e ela existe...
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        // ...a remove do mapa.
        map.removeLayer(layerRef.current);
      }
    }

  // A dependência do 'map' e 'zIndex' garante que a camada se adapte
  // a mudanças nessas propriedades, se necessário.
  }, [visible, map, zIndex]);

  // A função de limpeza agora só precisa garantir que a camada seja removida
  // quando o componente for completamente desmontado da árvore do React.
  useEffect(() => {
    return () => {
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map]); // Executa apenas uma vez na montagem e desmontagem.

  // Este componente não renderiza nenhum elemento no DOM.
  return null;
};

export default CarWmsLayer;
