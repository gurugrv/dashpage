import { NextResponse } from 'next/server';
import { getPlaceDetails, isPlacesConfigured } from '@/lib/places/google-places';

export async function POST(req: Request) {
  if (!isPlacesConfigured()) {
    return NextResponse.json({ error: 'Google Places not configured' }, { status: 501 });
  }

  const { placeId } = await req.json();
  if (!placeId) {
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 });
  }

  const details = await getPlaceDetails(placeId);
  if (!details) {
    return NextResponse.json({ error: 'Failed to fetch place details' }, { status: 502 });
  }

  return NextResponse.json(details);
}
