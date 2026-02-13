import { searchPhotos } from '@/lib/images/pexels';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');

  if (!query) {
    return Response.json({ error: 'Missing required parameter: q' }, { status: 400 });
  }

  const orientation = (searchParams.get('orientation') ?? undefined) as
    | 'landscape'
    | 'portrait'
    | 'square'
    | undefined;
  const perPage = Math.max(1, Math.min(80, Number(searchParams.get('per_page')) || 10));

  try {
    const photos = await searchPhotos(query, { orientation, perPage });

    const results = photos.map((photo) => ({
      url: photo.src.original,
      alt: photo.alt,
      photographer: photo.photographer,
      width: photo.width,
      height: photo.height,
    }));

    return Response.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to search images';
    return Response.json({ error: message }, { status: 500 });
  }
}
