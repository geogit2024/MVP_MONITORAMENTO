import { centroid as turfCentroid, area as turfArea } from '@turf/turf';
import type { Feature, Geometry } from 'geojson';

export interface AoiAreaMetrics {
  areaM2: number;
  areaHa: number;
  centroidLatLng: [number, number];
}

export const getAoiAreaMetrics = (feature: Feature<Geometry>): AoiAreaMetrics => {
  const areaM2 = turfArea(feature);
  const areaHa = areaM2 / 10000;
  const center = turfCentroid(feature);
  const [lng, lat] = center.geometry.coordinates;
  return {
    areaM2,
    areaHa,
    centroidLatLng: [lat, lng],
  };
};
