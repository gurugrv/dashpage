import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  const dbBlueprint = await prisma.blueprint.findUnique({
    where: { conversationId },
  });

  if (!dbBlueprint) {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
  }

  return NextResponse.json({ blueprint: dbBlueprint.data });
}
