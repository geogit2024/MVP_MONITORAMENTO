// src/components/FirmsDataLayer.tsx

import React, { useEffect, useState } from 'react';
import { useMap, Marker, Popup } from 'react-leaflet';
import Papa from 'papaparse';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

import fireIconUrl from '../assets/fire_icon.png';

interface FirePoint {
  latitude: number;
  longitude: number;
  acq_date: string;
  acq_time: string;
  brightness: number;
  confidence: string;
}

const NASA_API_KEY = '54085c77340460b47086f7fb9a70b754';

const customFireIcon = new L.Icon({
  iconUrl: fireIconUrl,
  iconSize: [25, 25],
  iconAnchor: [12, 25],
  popupAnchor: [0, -25],
});

const FirmsDataLayer: React.FC = () => {
  const map = useMap();
  const [firePoints, setFirePoints] = useState<FirePoint[]>([]);

  useEffect(() => {
    console.log("Iniciando requisição FIRMS...");

    const controller = new AbortController();
    const signal = controller.signal;

    const fetchFireData = async () => {
      const FIRMS_URL = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${NASA_API_KEY}/VIIRS_SNPP_NRT/BRA/7/`;
      console.log("Requisitando:", FIRMS_URL);

      try {
        const response = await fetch(FIRMS_URL, { signal });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Erro na requisição FIRMS (${response.status}): ${response.statusText}. Resposta: ${errorText}`);
          if (response.status === 403 || errorText.includes("Invalid MAP_KEY")) {
            alert("Erro: Chave de API da NASA FIRMS inválida ou sem permissão.");
          } else {
            alert(`Erro ao carregar dados FIRMS: ${response.statusText}`);
          }
          throw new Error(`Erro de rede: ${response.statusText}`);
        }

        const csvText = await response.text();

        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(), // CORREÇÃO CRÍTICA
          complete: (results) => {
            console.log("Colunas disponíveis:", results.meta.fields);
            console.log("Dados brutos do PapaParse:", results.data.slice(0, 5));
            const validData = results.data.filter((row: any) =>
              !isNaN(parseFloat(row.latitude)) &&
              !isNaN(parseFloat(row.longitude)) &&
              !isNaN(parseFloat(row.bright_ti4))
            ).map((row: any) => ({
              latitude: parseFloat(row.latitude),
              longitude: parseFloat(row.longitude),
              acq_date: String(row.acq_date),
              acq_time: String(row.acq_time),
              confidence: String(row.confidence),
              brightness: parseFloat(row.bright_ti4)
            })) as FirePoint[];

            console.log(`${validData.length} focos encontrados.`);
            setFirePoints(validData);
          },
          error: (error: any) => {
            console.error("Erro ao parsear o CSV:", error);
            alert("Erro ao processar os dados de focos de incêndio.");
          }
        });

      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Requisição FIRMS cancelada.');
        } else {
          console.error("Erro FIRMS inesperado:", error);
          if (!error.message.includes("Erro na rede")) {
            alert("Ocorreu um erro inesperado ao buscar dados FIRMS.");
          }
        }
      }
    };

    fetchFireData();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <>
      {firePoints.map((point, index) => (
        <Marker
          key={index}
          position={[point.latitude, point.longitude]}
          icon={customFireIcon}
        >
          <Popup>
            <b>Foco de Incêndio (VIIRS)</b><br />
            Data: {point.acq_date}<br />
            Hora: {point.acq_time}<br />
            Confiança: {point.confidence}<br />
            Brilho: {point.brightness} K
          </Popup>
        </Marker>
      ))}
    </>
  );
};

export default FirmsDataLayer;
