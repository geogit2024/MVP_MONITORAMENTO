export type LngLat = [number, number];
export type LatLng = [number, number];

const DEFAULT_ROUTING_BASE = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_CACHE = new Map<string, LatLng[]>();

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidLngLat(point: LngLat | null | undefined): point is LngLat {
  if (!point || point.length !== 2) return false;
  return isFiniteCoordinate(point[0]) && isFiniteCoordinate(point[1]);
}

function asFallbackLine(start: LngLat, end: LngLat): LatLng[] {
  return [
    [start[1], start[0]],
    [end[1], end[0]],
  ];
}

function buildCacheKey(start: LngLat, end: LngLat) {
  return [
    start[0].toFixed(5),
    start[1].toFixed(5),
    end[0].toFixed(5),
    end[1].toFixed(5),
  ].join(":");
}

function parseCoordinates(payload: unknown): LatLng[] {
  if (!payload || typeof payload !== "object") return [];
  const routes = (payload as { routes?: Array<{ geometry?: { coordinates?: unknown[] } }> }).routes;
  if (!Array.isArray(routes) || routes.length === 0) return [];
  const coordinates = routes[0]?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .filter((point): point is [number, number] => {
      return Array.isArray(point) && point.length >= 2 && isFiniteCoordinate(point[0]) && isFiniteCoordinate(point[1]);
    })
    .map((point) => [point[1], point[0]]);
}

export async function buildRoutePolyline(start: LngLat, end: LngLat): Promise<LatLng[]> {
  if (!isValidLngLat(start) || !isValidLngLat(end)) {
    return [];
  }

  const cacheKey = buildCacheKey(start, end);
  const cached = ROUTE_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const routingBase = String(import.meta.env.VITE_ROUTING_BASE_URL || DEFAULT_ROUTING_BASE).replace(/\/+$/, "");
  const url = `${routingBase}/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8500);

  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Routing service error: ${response.status}`);
    }

    const payload = await response.json();
    const line = parseCoordinates(payload);
    if (line.length >= 2) {
      ROUTE_CACHE.set(cacheKey, line);
      return line;
    }
  } catch {
    // Fallback is handled below.
  } finally {
    window.clearTimeout(timeoutId);
  }

  const fallback = asFallbackLine(start, end);
  ROUTE_CACHE.set(cacheKey, fallback);
  return fallback;
}
