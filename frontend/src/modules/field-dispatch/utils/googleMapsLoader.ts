const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const GOOGLE_MAPS_REGION = String(import.meta.env.VITE_GOOGLE_MAPS_REGION || 'BR').trim();

type GoogleMapsWindow = Window &
  typeof globalThis & {
    google?: {
      maps?: {
        importLibrary?: (libraryName: string) => Promise<any>;
      };
    };
  };

export interface GoogleAddressSearchResult {
  coordinates: [number, number];
  formattedAddress: string;
  placeId?: string;
  viewport?: [[number, number], [number, number]];
  provider?: 'google' | 'nominatim';
}

let googleMapsScriptPromise: Promise<void> | null = null;

export function hasGoogleMapsSearchConfigured() {
  return Boolean(GOOGLE_MAPS_API_KEY);
}

async function ensureGoogleMapsLoaded(): Promise<void> {
  const mapsWindow = window as GoogleMapsWindow;
  if (mapsWindow.google?.maps?.importLibrary) {
    return;
  }

  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Configure VITE_GOOGLE_MAPS_API_KEY para habilitar a busca de enderecos Google.');
  }

  if (!googleMapsScriptPromise) {
    googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-google-maps-loader="field-dispatch"]'
      );

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener(
          'error',
          () => reject(new Error('Falha ao carregar a biblioteca do Google Maps.')),
          { once: true }
        );
        return;
      }

      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsLoader = 'field-dispatch';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        GOOGLE_MAPS_API_KEY
      )}&v=weekly&loading=async`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar a biblioteca do Google Maps.'));
      document.head.appendChild(script);
    });
  }

  await googleMapsScriptPromise;

  if (!mapsWindow.google?.maps?.importLibrary) {
    throw new Error('Google Maps carregou sem disponibilizar importLibrary.');
  }
}

export async function searchAddressWithGoogleMaps(query: string): Promise<GoogleAddressSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  await ensureGoogleMapsLoaded();
  const mapsWindow = window as GoogleMapsWindow;
  const geocodingLibrary = await mapsWindow.google!.maps!.importLibrary!('geocoding');
  const geocoder = new geocodingLibrary.Geocoder();

  try {
    const response = await geocoder.geocode({
      address: normalizedQuery,
      region: GOOGLE_MAPS_REGION || undefined,
    });

    const results = Array.isArray(response?.results) ? response.results : [];
    return results
      .map((result: any): GoogleAddressSearchResult | null => {
        const location = result?.geometry?.location;
        if (!location || typeof location.lat !== 'function' || typeof location.lng !== 'function') {
          return null;
        }

        const viewport = result?.geometry?.viewport;
        const southWest =
          viewport && typeof viewport.getSouthWest === 'function' ? viewport.getSouthWest() : null;
        const northEast =
          viewport && typeof viewport.getNorthEast === 'function' ? viewport.getNorthEast() : null;

        return {
          coordinates: [location.lng(), location.lat()],
          formattedAddress: String(result?.formatted_address || normalizedQuery),
          placeId: result?.place_id ? String(result.place_id) : undefined,
          provider: 'google',
          viewport:
            southWest && northEast
              ? [
                  [southWest.lat(), southWest.lng()],
                  [northEast.lat(), northEast.lng()],
                ]
              : undefined,
        };
      })
      .filter((result: GoogleAddressSearchResult | null): result is GoogleAddressSearchResult => Boolean(result));
  } catch (error: unknown) {
    throw new Error((error as Error)?.message || 'Falha ao buscar endereco no Google Maps.');
  }
}

async function searchAddressWithNominatim(query: string): Promise<GoogleAddressSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
      normalizedQuery
    )}`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Falha ao consultar o servico de busca de enderecos.');
  }

  const results = await response.json();
  if (!Array.isArray(results)) return [];

  return results
    .map((result: any): GoogleAddressSearchResult | null => {
      const lat = Number(result?.lat);
      const lon = Number(result?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      const bbox = Array.isArray(result?.boundingbox) ? result.boundingbox : null;
      const south = bbox ? Number(bbox[0]) : Number.NaN;
      const north = bbox ? Number(bbox[1]) : Number.NaN;
      const west = bbox ? Number(bbox[2]) : Number.NaN;
      const east = bbox ? Number(bbox[3]) : Number.NaN;

      return {
        coordinates: [lon, lat],
        formattedAddress: String(result?.display_name || normalizedQuery),
        placeId: result?.place_id ? String(result.place_id) : undefined,
        provider: 'nominatim',
        viewport:
          Number.isFinite(south) &&
          Number.isFinite(north) &&
          Number.isFinite(west) &&
          Number.isFinite(east)
            ? [
                [south, west],
                [north, east],
              ]
            : undefined,
      };
    })
    .filter((result: GoogleAddressSearchResult | null): result is GoogleAddressSearchResult => Boolean(result));
}

export async function searchAddress(query: string): Promise<GoogleAddressSearchResult[]> {
  if (hasGoogleMapsSearchConfigured()) {
    try {
      const googleResults = await searchAddressWithGoogleMaps(query);
      if (googleResults.length > 0) {
        return googleResults;
      }
    } catch {
      // Mantem fallback operacional quando a chave expira, quota falha ou o script nao carrega.
    }
  }

  return searchAddressWithNominatim(query);
}
