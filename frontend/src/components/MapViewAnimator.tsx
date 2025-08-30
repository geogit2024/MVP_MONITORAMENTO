import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface MapViewAnimatorProps {
    target: L.LatLngBoundsExpression | null;
}

const MapViewAnimator = ({ target }: MapViewAnimatorProps) => {
    const map = useMap();

    useEffect(() => {
        if (target) {
            map.flyToBounds(target, {
                padding: [50, 50], // Adiciona uma margem
            });
        }
    }, [target, map]);

    return null; // Não renderiza nada
};

export default MapViewAnimator;