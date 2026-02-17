import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateImages } from '@/lib/images/together';
import { resolveApiKey } from '@/lib/keys/key-manager';

const requestSchema = z.object({
  prompts: z.array(
    z.object({
      prompt: z.string().min(1).max(500),
      width: z.number().int().min(256).max(1920).optional().default(1024),
      height: z.number().int().min(256).max(1920).optional().default(1024),
    }),
  ).min(1).max(12),
  model: z.string().default('black-forest-labs/FLUX.1-dev'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = requestSchema.parse(body);

    const apiKey = await resolveApiKey('Together');
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Together.ai API key not configured. Add it in Settings > API Keys.' },
        { status: 401 },
      );
    }

    const images = await generateImages(apiKey, parsed.prompts, parsed.model);

    return NextResponse.json({ success: true, images });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: error.issues },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : 'Image generation failed';
    console.error('[/api/images/generate]', message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
