import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Feature, Geometry } from 'geojson';
import { getAoiAreaMetrics } from '../../utils/area';
import { formatHectaresPtBr } from '../../utils/numberFormat';

interface AoiAreaLabelProps {
  aoi: Feature<Geometry> | null;
}

export default function AoiAreaLabel({ aoi }: AoiAreaLabelProps) {
  const map = useMap();
  const labelRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (labelRef.current) {
      map.removeLayer(labelRef.current);
      labelRef.current = null;
    }

    if (!aoi || !aoi.geometry) return;
    if (aoi.geometry.type !== 'Polygon' && aoi.geometry.type !== 'MultiPolygon') return;

    const metrics = getAoiAreaMetrics(aoi);
    const html = `<div>Área: ${formatHectaresPtBr(metrics.areaHa)}</div>`;
    const icon = L.divIcon({
      className: 'aoi-area-label',
      html,
      iconSize: undefined,
    });

    const marker = L.marker(metrics.centroidLatLng, {
      icon,
      interactive: false,
      keyboard: false,
      pane: 'markerPane',
      zIndexOffset: 1000,
    });
    marker.addTo(map);
    labelRef.current = marker;

    return () => {
      if (labelRef.current) {
        map.removeLayer(labelRef.current);
        labelRef.current = null;
      }
    };
  }, [aoi, map]);

  return null;
}
