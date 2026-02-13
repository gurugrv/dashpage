import { searchPhotos } from '@/lib/images/pexels';

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');

  if (!query) {
    return Response.json({ error: 'Missing required parameter: q' }, { status: 400 });
  }

  const orientation = (searchParams.get('orientation') ?? 'landscape') as
    | 'landscape'
    | 'portrait'
    | 'square';
  const w = Math.max(1, Math.min(6000, Number(searchParams.get('w')) || 800));
  const h = Math.max(1, Math.min(6000, Number(searchParams.get('h')) || 600));

  try {
    const photos = await searchPhotos(query, { orientation });

    if (!photos.length) {
      return Response.redirect(`https://placehold.co/${w}x${h}`, 302);
    }

    const index = hashCode(query) % photos.length;
    const photo = photos[index];
    const imageUrl = `${photo.src.original}?auto=compress&cs=tinysrgb&w=${w}&h=${h}&fit=crop`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: imageUrl,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return Response.redirect(`https://placehold.co/${w}x${h}`, 302);
  }
}
