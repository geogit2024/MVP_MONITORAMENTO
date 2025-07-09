// src/components/FirmsDataLayer.tsx

import React, { useEffect, useState } from 'react';
import { useMap, Marker, Popup } from 'react-leaflet';
import Papa from 'papaparse'; // Usaremos esta biblioteca para ler o CSV
import { fireIcon } from './MapView'; // Importa o ícone de fogo que definimos no MapView

// Instale a biblioteca papaparse se ainda não a tiver: npm install papaparse @types/papaparse

// Interface para estruturar os dados de cada foco de incêndio
interface FirePoint {
  latitude: number;
  longitude: number;
  acq_date: string;
  acq_time: string;
  confidence: string;
}

// A sua chave de API da NASA FIRMS. É mais seguro guardá-la numa variável de ambiente.
const NASA_API_KEY = '4d560e29b1207399999a444d320b925f'; // Substitua pela sua chave real, se necessário

const FirmsDataLayer: React.FC = () => {
  const map = useMap();
  const [firePoints, setFirePoints] = useState<FirePoint[]>([]);

  useEffect(() => {
    console.log("Iniciando requisição FIRMS...");

    // 1. Cria um AbortController para poder cancelar a requisição
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchFireData = async () => {
      // URL para buscar dados dos últimos 1 dia para o Brasil (BRA)
      const FIRMS_URL = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${NASA_API_KEY}/VIIRS_SNPP_NRT/BRA/1/`;
      console.log("Requisitando:", FIRMS_URL);

      try {
        const response = await fetch(FIRMS_URL, { signal }); // 2. Passa o 'signal' para o fetch

        if (!response.ok) {
          throw new Error(`Erro na rede: ${response.statusText}`);
        }

        const csvText = await response.text();
        
        // Usa o PapaParse para converter o texto CSV em um array de objetos JSON
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          complete: (results) => {
            // Filtra linhas que possam ser nulas ou inválidas
            const validData = results.data.filter((row: any) => row.latitude && row.longitude) as FirePoint[];
            console.log(`${validData.length} focos encontrados.`);
            setFirePoints(validData);
          },
          error: (error: any) => {
            console.error("Erro ao parsear o CSV:", error);
          }
        });

      } catch (error: any) {
        // 4. Se o erro for um AbortError, nós o ignoramos. É um cancelamento esperado.
        if (error.name === 'AbortError') {
          console.log('Requisição FIRMS cancelada.');
        } else {
          // Se for outro tipo de erro, mostramo-lo na consola.
          console.error("Erro FIRMS:", error);
        }
      }
    };

    fetchFireData();

    // 3. A função de limpeza do useEffect. Será chamada quando o componente for desmontado.
    return () => {
      controller.abort(); // Cancela a requisição fetch se ela ainda estiver em andamento
    };
  }, []); // O array de dependências vazio faz com que este efeito seja executado apenas uma vez, quando o componente é montado.

  // Renderiza um Marcador para cada ponto de fogo encontrado
  return (
    <>
      {firePoints.map((point, index) => (
        <Marker
          key={index}
          position={[point.latitude, point.longitude]}
          icon={fireIcon}
        >
          <Popup>
            <b>Foco de Incêndio (VIIRS)</b><br />
            Data: {point.acq_date}<br />
            Hora: {point.acq_time}<br />
            Confiança: {point.confidence}
          </Popup>
        </Marker>
      ))}
    </>
  );
};

export default FirmsDataLayer;