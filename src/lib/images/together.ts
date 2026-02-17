import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const TOGETHER_API_URL = 'https://api.together.xyz/v1/images/generations';
const GENERATED_DIR = path.join(process.cwd(), 'public', 'generated');

const MODEL_COST_PER_IMAGE: Record<string, number> = {
  'Rundiffusion/Juggernaut-Lightning-Flux': 0.002,
  'black-forest-labs/FLUX.1-schnell': 0.003,
  'black-forest-labs/FLUX.1-dev': 0.025,
  'black-forest-labs/FLUX.1.1-pro': 0.04,
};

const LOG_PREFIX = '[Together.ai Image]';

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
  const modelShort = model.split('/').pop() ?? model;
  const costPerImage = MODEL_COST_PER_IMAGE[model] ?? 0;
  const batchStart = Date.now();

  console.log(`${LOG_PREFIX} Batch start — ${prompts.length} image(s), model: ${modelShort}`);

  const results = await Promise.all(
    prompts.map(async ({ prompt, width = 1024, height = 1024 }, idx) => {
      const steps = model.includes('schnell') || model.includes('Lightning') ? 4 : 20;
      const imgStart = Date.now();

      console.log(`${LOG_PREFIX}  [${idx + 1}/${prompts.length}] ${width}x${height}, ${steps} steps — "${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}"`);

      try {
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
            steps,
            n: 1,
            response_format: 'url',
            output_format: 'jpeg',
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          const elapsed = ((Date.now() - imgStart) / 1000).toFixed(1);
          console.error(`${LOG_PREFIX}  [${idx + 1}] FAILED in ${elapsed}s — ${response.status}: ${errorBody.slice(0, 200)}`);
          throw new Error(`Together.ai API error ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const imageUrl: string = data.data?.[0]?.url;
        if (!imageUrl) throw new Error('No image URL in Together.ai response');

        const localUrl = await downloadAndSave(imageUrl);
        const elapsed = ((Date.now() - imgStart) / 1000).toFixed(1);
        console.log(`${LOG_PREFIX}  [${idx + 1}] OK in ${elapsed}s → ${localUrl}`);

        return { url: localUrl, alt: prompt, width, height };
      } catch (err) {
        const elapsed = ((Date.now() - imgStart) / 1000).toFixed(1);
        if (!(err instanceof Error) || !err.message.startsWith('Together.ai API error')) {
          console.error(`${LOG_PREFIX}  [${idx + 1}] FAILED in ${elapsed}s — ${err instanceof Error ? err.message : err}`);
        }
        throw err;
      }
    }),
  );

  const totalElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
  const totalCost = costPerImage * results.length;
  console.log(`${LOG_PREFIX} Batch complete — ${results.length} image(s) in ${totalElapsed}s, est. cost: $${totalCost.toFixed(3)}`);

  return results;
}
