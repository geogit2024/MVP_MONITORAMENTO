import React, { useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

interface FirePoint {
  latitude: number;
  longitude: number;
  brightness: number;
  acq_date: string;
  acq_time: string;
}

// 🔥 Ícone de fogo (código 10760660)
const fireIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/10760/10760660.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
});

// 🔐 API KEY fixa para teste
const nasaMapKey = '4d560e232ba80fc807eb657aa25957d2';

const FirmsDataLayer: React.FC = () => {
  const [fireData, setFireData] = useState<FirePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchFireData = async () => {
      console.log("📡 Iniciando requisição FIRMS...");

      if (!nasaMapKey) {
        setError("Chave da API da NASA não definida.");
        return;
      }

      const apiUrl = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${nasaMapKey}/VIIRS_SNPP_NRT/BRA/1/`;
      console.log("🌐 Requisitando:", apiUrl);

      try {
        const response = await fetch(apiUrl, { signal });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Erro na API da FIRMS: ${response.statusText} - ${errorText}`);
        }

        const csvText = await response.text();
        const lines = csvText.split('\n');
        const dataLines = lines.slice(1);

        const points: FirePoint[] = dataLines.map(line => {
          const columns = line.split(',');
          if (columns.length > 3) {
            return {
              latitude: parseFloat(columns[1]),
              longitude: parseFloat(columns[2]),
              brightness: parseFloat(columns[3]),
              acq_date: columns[5],
              acq_time: columns[6],
            };
          }
          return null;
        }).filter((p): p is FirePoint => p !== null && !isNaN(p.latitude) && !isNaN(p.longitude));

        console.log(`🔥 ${points.length} focos encontrados.`);
        setFireData(points);
      } catch (err: any) {
        console.error("❗ Erro FIRMS:", err);
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      }
    };

    fetchFireData();

    return () => {
      controller.abort();
    };
  }, []);

  if (error) {
    console.error("❌ FIRMS Error:", error);
    return null;
  }

  return (
    <>
      {fireData.map((point, index) => (
        <Marker
          key={index}
          position={[point.latitude, point.longitude]}
          icon={fireIcon}
        >
          <Popup>
            <b>🔥 Foco de Calor (FIRMS)</b><br />
            Data: {point.acq_date}<br />
            Hora (UTC): {point.acq_time}<br />
            Brilho: {point.brightness} K
          </Popup>
        </Marker>
      ))}
    </>
  );
};

export default FirmsDataLayer;
