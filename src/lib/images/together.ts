import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/images/generations';
const GENERATED_DIR = path.join(process.cwd(), 'public', 'generated');

export interface ImageGenPrompt {
  prompt: string;
  width?: number;
  height?: number;
}

export interface GeneratedImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

const QUALITY_SUFFIX = ', professional photography, high resolution, sharp detail, beautiful lighting';

function enhancePrompt(prompt: string): string {
  return prompt + QUALITY_SUFFIX;
}

async function ensureDir() {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

async function downloadAndSave(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const filename = `${crypto.randomUUID()}.jpg`;
  const filePath = path.join(GENERATED_DIR, filename);

  await ensureDir();
  await fs.writeFile(filePath, buffer);

  return `/generated/${filename}`;
}

export async function generateImages(
  apiKey: string,
  prompts: ImageGenPrompt[],
  model: string,
): Promise<GeneratedImage[]> {
  const results = await Promise.all(
    prompts.map(async ({ prompt, width = 1024, height = 1024 }) => {
      const response = await fetch(TOGETHER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: enhancePrompt(prompt),
          width,
          height,
          steps: model.includes('schnell') ? 4 : 20,
          n: 1,
          response_format: 'url',
          output_format: 'jpeg',
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Together.ai API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const imageUrl: string = data.data?.[0]?.url;
      if (!imageUrl) throw new Error('No image URL in Together.ai response');

      const localUrl = await downloadAndSave(imageUrl);
      return { url: localUrl, alt: prompt, width, height };
    }),
  );

  return results;
}
