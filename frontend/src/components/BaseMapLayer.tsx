// src/components/BaseMapLayer.tsx
import { useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { baseMaps } from './BaseMapSelector';

interface Props {
  baseMapKey: string;
}

export default function BaseMapLayer({ baseMapKey }: Props) {
  // --- LOG DE RASTREAMENTO ---
  console.log(`%c[PASSO 4] %cMONTAGEM/UPDATE: BaseMapLayer recebeu a prop 'baseMapKey' = '${baseMapKey}'.`, "font-weight:bold; color:green;", "color:auto;");
  
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    // --- LOG DE RASTREAMENTO ---
    console.log(`%c[PASSO 5] %cEFEITO ACIONADO: O useEffect em BaseMapLayer foi acionado para a chave '${baseMapKey}'.`, "font-weight:bold; color:orange;", "color:auto;");

    // Remove a camada anterior se ela existir no mapa
    if (layerRef.current && map.hasLayer(layerRef.current)) {
        console.log(`[PASSO 6] AÇÃO LEAFLET: Removendo camada anterior do mapa.`);
        map.removeLayer(layerRef.current);
    }

    // Encontra a configuração do novo mapa base
    const baseMapConfig = baseMaps.find(bm => bm.key === baseMapKey) || baseMaps[0];
    
    if (!baseMapConfig) {
        console.error(`[ERRO] Configuração de mapa base para a chave '${baseMapKey}' não foi encontrada!`);
        return;
    }

    // --- LOG DE RASTREAMENTO ---
    console.log(`[PASSO 7] AÇÃO LEAFLET: Criando nova camada com URL: ${baseMapConfig.url}`);
    
    const newBaseLayer = L.tileLayer(baseMapConfig.url, { 
      attribution: baseMapConfig.attribution,
      zIndex: 0,
      maxZoom: 19,
      // Configurações adicionais para melhor performance
      updateWhenIdle: false,
      updateWhenZooming: false,
      keepBuffer: 2
    });
    
    // Adiciona a nova camada ao mapa
    newBaseLayer.addTo(map);
    console.log(`%c[PASSO 8] %cSUCESSO: Nova camada adicionada ao mapa. A tela deve atualizar.`, "font-weight:bold; color:darkgreen;", "color:auto;");

    // Armazena a referência da nova camada para a próxima execução
    layerRef.current = newBaseLayer;

    // Função de limpeza para quando o componente é desmontado ou baseMapKey muda
    return () => {
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [baseMapKey, map]); // O efeito depende da chave do mapa e da instância do mapa

  return null;
}
