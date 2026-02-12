import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { PROVIDERS } from '@/lib/providers/registry';

const ENCRYPTION_KEY = process.env.KEYS_ENCRYPTION_SECRET!;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function maskKey(encrypted: string): string {
  // Decrypt to get last 4 chars for display
  try {
    const [ivHex, encryptedHex] = encrypted.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      Buffer.from(ivHex, 'hex'),
    );
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return '****' + decrypted.slice(-4);
  } catch {
    return '****';
  }
}

export async function GET() {
  const dbKeys = await prisma.apiKey.findMany();
  const dbKeyMap = new Map(dbKeys.map(k => [k.provider, k]));

  const providers = Object.entries(PROVIDERS).map(([key, config]) => {
    const envKey = process.env[config.envKey];
    const dbKey = dbKeyMap.get(key);

    let status: 'env' | 'db' | 'not_configured';
    let maskedKey: string | null = null;

    if (envKey) {
      status = 'env';
      maskedKey = '****' + envKey.slice(-4);
    } else if (dbKey) {
      status = 'db';
      maskedKey = maskKey(dbKey.encryptedKey);
    } else {
      status = 'not_configured';
    }

    return {
      provider: key,
      name: config.name,
      status,
      maskedKey,
    };
  });

  return NextResponse.json(providers);
}

export async function POST(req: Request) {
  const { provider, key } = await req.json();

  if (!provider || !key) {
    return NextResponse.json({ error: 'provider and key are required' }, { status: 400 });
  }

  if (!PROVIDERS[provider]) {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  const encryptedKey = encrypt(key);

  const apiKey = await prisma.apiKey.upsert({
    where: { provider },
    update: { encryptedKey },
    create: { provider, encryptedKey },
  });

  return NextResponse.json({ provider: apiKey.provider, status: 'db' }, { status: 201 });
}

export async function DELETE(req: Request) {
  const { provider } = await req.json();

  if (!provider) {
    return NextResponse.json({ error: 'provider is required' }, { status: 400 });
  }

  await prisma.apiKey.deleteMany({ where: { provider } });

  return NextResponse.json({ success: true });
}
