import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// Fix for default marker icons
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Draw Component — Protected against double-mount (React 19 StrictMode)
function DrawControl({ onAreaDrawn }) {
    const map = useMap();
    const controlRef = useRef(null);
    const drawnItemsRef = useRef(null);

    useEffect(() => {
        if (!map) return;
        // Prevent double-mount in React StrictMode
        if (controlRef.current) return;

        // Fix: expose L globally only when component mounts (not at module scope)
        if (typeof window !== 'undefined') {
            window.L = L;
        }
        // Dynamically import leaflet-draw after global L is set
        import('leaflet-draw').then(() => {
            if (controlRef.current) return; // Check again after async import

            const drawnItems = new L.FeatureGroup();
            map.addLayer(drawnItems);
            drawnItemsRef.current = drawnItems;

            const drawControl = new L.Control.Draw({
                edit: {
                    featureGroup: drawnItems,
                    remove: true
                },
                draw: {
                    polygon: {
                        allowIntersection: false,
                        showArea: true
                    },
                    polyline: false,
                    circle: false,
                    rectangle: false,
                    marker: false,
                    circlemarker: false
                }
            });

            map.addControl(drawControl);
            controlRef.current = drawControl;

            const onCreate = (e) => {
                const layer = e.layer;
                drawnItems.addLayer(layer);
                const geojson = layer.toGeoJSON();
                onAreaDrawn(geojson);
            };

            map.on(L.Draw.Event.CREATED, onCreate);
            map._drawOnCreate = onCreate; // store ref for cleanup
        });

        return () => {
            if (controlRef.current) {
                try {
                    map.removeControl(controlRef.current);
                } catch (e) {}
                controlRef.current = null;
            }
            if (drawnItemsRef.current) {
                try {
                    map.removeLayer(drawnItemsRef.current);
                } catch (e) {}
                drawnItemsRef.current = null;
            }
            if (map._drawOnCreate) {
                map.off(L.Draw.Event.CREATED, map._drawOnCreate);
                delete map._drawOnCreate;
            }
        };
    }, [map]); // intentionally exclude onAreaDrawn from deps to prevent re-mount loop

    return null;
}

// Camera Handler
function CameraHandler({ focusGeojson }) {
    const map = useMap();
    
    useEffect(() => {
        if (!focusGeojson || !map) return;
        try {
            const layer = L.geoJSON(focusGeojson);
            const bounds = layer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50], animate: true });
            }
        } catch (e) {
            console.error("Error focusing camera:", e);
        }
    }, [focusGeojson, map]);
    
    return null;
}

const MapLoader = ({ geojson, cameraFocusGeojson, onAreaDrawn, savedAreas }) => {
    return (
        <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative">
            <MapContainer 
                center={[-15.7801, -47.9292]} 
                zoom={4} 
                className="w-full h-full z-0"
            >
                <TileLayer
                    attribution='&copy; Google'
                    url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                />
                
                <CameraHandler focusGeojson={cameraFocusGeojson} />
                <DrawControl onAreaDrawn={onAreaDrawn} />

                {/* Drawn/Highlighted Area */}
                {geojson && (
                    <GeoJSON 
                        key={`highlight-${JSON.stringify(geojson)}`}
                        data={geojson} 
                        style={{ color: '#10b981', weight: 4, fillOpacity: 0.3 }} 
                    />
                )}

                {/* Saved Areas — using react-leaflet Tooltip (not L.Tooltip JSX!) */}
                {savedAreas && savedAreas.map((area) => {
                    try {
                        const areaData = typeof area.geojson_data === 'string' 
                            ? JSON.parse(area.geojson_data) 
                            : area.geojson_data;
                            
                        return (
                            <GeoJSON 
                                key={`area-${area.id}-${area.is_monitoring}`} 
                                data={areaData} 
                                style={{ 
                                    color: area.is_monitoring ? '#3b82f6' : '#94a3b8', 
                                    weight: 2, 
                                    fillOpacity: 0.15 
                                }} 
                            >
                                <Tooltip sticky>{area.name}</Tooltip>
                            </GeoJSON>
                        );
                    } catch (e) {
                        return null;
                    }
                })}
            </MapContainer>
        </div>
    );
};

export default MapLoader;