import { prisma } from '@/lib/db/prisma';
import { PROVIDERS } from '@/lib/providers/registry';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.KEYS_ENCRYPTION_SECRET!;

export async function resolveApiKey(provider: string): Promise<string | null> {
  // Priority 1: Environment variable
  const providerConfig = PROVIDERS[provider];
  const envKey = process.env[providerConfig.envKey];
  if (envKey) return envKey;

  // Priority 2: Encrypted DB column
  const dbKey = await prisma.apiKey.findUnique({ where: { provider } });
  if (dbKey) return decrypt(dbKey.encryptedKey);

  return null;
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
