import React, { useEffect, useState } from 'react';
import { TileLayer } from 'react-leaflet';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Props {
  visible: boolean;
}

const PrecipitationLayer: React.FC<Props> = ({ visible }) => {
  const [tileUrl, setTileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setTileUrl(null); // limpa se não for visível
      return;
    }

    const fetchTileUrl = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/earth-images/precipitation-tiles`);
        const data = await response.json();

        if (data?.tileUrl && data.tileUrl.includes('{z}') && data.tileUrl.includes('{x}') && data.tileUrl.includes('{y}')) {
          setTileUrl(data.tileUrl);
        } else {
          console.warn("tileUrl inválido retornado:", data);
          setTileUrl(null);
        }
      } catch (error) {
        console.error("Erro ao carregar tiles de precipitação:", error);
        setTileUrl(null);
      }
    };

    fetchTileUrl();
  }, [visible]);

  if (!visible || !tileUrl) return null;

  return (
    <TileLayer
  url={tileUrl}
  attribution="Precipitação CHIRPS via GEE"
  opacity={0.6}
  zIndex={12}
/>
  );
};

export default PrecipitationLayer;
