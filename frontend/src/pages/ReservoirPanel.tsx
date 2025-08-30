import React, { useState, useEffect, useCallback } from 'react';
import { Feature, FeatureCollection } from 'geojson';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import L from 'leaflet';

import ReservoirSidebar from '../components/ReservoirSidebar';
import MapViewAnimator from '../components/MapViewAnimator'; // Importa o componente reutilizável

import 'leaflet/dist/leaflet.css';
import './ReservoirPanel.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const ReservoirPanel: React.FC = () => {
    const [reservoirs, setReservoirs] = useState<FeatureCollection>({
        type: 'FeatureCollection',
        features: [],
    });
    const [loading, setLoading] = useState(true);
    const [mapKey, setMapKey] = useState(Date.now());
    
    // 1. Estado para guardar os limites (bounds) do reservatório selecionado
    const [mapViewTarget, setMapViewTarget] = useState<L.LatLngBoundsExpression | null>(null);

    const fetchReservoirs = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/reservoirs`);
            if (!response.ok) throw new Error('Falha ao buscar dados');
            const data = await response.json();
            setReservoirs(data);
            setMapKey(Date.now()); 
        } catch (error) {
            console.error("Erro ao buscar reservatórios:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReservoirs();
    }, [fetchReservoirs]);
    
    // 2. Função que será chamada pela Sidebar ao clicar em um item
    const handleReservoirSelect = (feature: Feature) => {
        if (feature && feature.geometry) {
            // Calcula os limites da geometria e atualiza o estado
            const bounds = L.geoJSON(feature).getBounds();
            setMapViewTarget(bounds);
        }
    };

    return (
        <div className="reservoir-panel-container">
            {/* 3. Passa a nova função como prop para a Sidebar */}
            <ReservoirSidebar 
                reservoirs={reservoirs.features} 
                onRefresh={fetchReservoirs}
                onReservoirSelect={handleReservoirSelect} 
            />
            <div className="map-content">
                <MapContainer center={[-15.793889, -47.882778]} zoom={4} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                        attribution='&copy; Google'
                    />
                    {reservoirs.features.length > 0 && 
                        <GeoJSON 
                            key={mapKey} 
                            data={reservoirs} 
                            onEachFeature={(feature, layer) => {
                                if (feature.properties) {
                                    const { name, description } = feature.properties;
                                    layer.bindPopup(`<b>${name}</b><br>${description || 'Sem descrição'}`);
                                }
                            }}
                        />
                    }
                    {/* 4. Adiciona o componente Animator aqui, passando o alvo */}
                    <MapViewAnimator target={mapViewTarget} />
                </MapContainer>
            </div>
        </div>
    );
};

export default ReservoirPanel;