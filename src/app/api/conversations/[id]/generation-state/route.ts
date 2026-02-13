import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const state = await prisma.generationState.findUnique({
    where: { conversationId: id },
  });

  if (!state) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(state);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await prisma.generationState.deleteMany({
    where: { conversationId: id },
  });

  return NextResponse.json({ ok: true });
}
