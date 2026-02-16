const PLACES_API_BASE = 'https://places.googleapis.com/v1';

export interface PlaceDetails {
  displayName: string;
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  types: string[];
  primaryType: string;
  googleMapsUri: string;
}

const DETAILS_FIELD_MASK = [
  'displayName',
  'formattedAddress',
  'location',
  'types',
  'primaryType',
  'googleMapsUri',
].join(',');

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(
    `${PLACES_API_BASE}/places/${placeId}`,
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': DETAILS_FIELD_MASK,
      },
    },
  );

  if (!res.ok) {
    console.error('[places] Details fetch failed:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  return {
    displayName: data.displayName?.text ?? '',
    formattedAddress: data.formattedAddress ?? '',
    location: data.location ?? { latitude: 0, longitude: 0 },
    types: data.types ?? [],
    primaryType: data.primaryType ?? '',
    googleMapsUri: data.googleMapsUri ?? '',
  };
}

export function isPlacesConfigured(): boolean {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}
