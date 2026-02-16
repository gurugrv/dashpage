import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    configured: !!process.env.GOOGLE_PLACES_API_KEY,
    hasAutocompleteKey: !!process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY,
  });
}
