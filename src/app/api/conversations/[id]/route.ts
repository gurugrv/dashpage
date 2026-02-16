import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      _count: { select: { messages: true } },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  return NextResponse.json(conversation);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, string | null> = {};
  if (typeof body.title === 'string' && body.title) data.title = body.title;
  if (typeof body.provider === 'string') data.provider = body.provider;
  if (typeof body.model === 'string') data.model = body.model;
  if (typeof body.businessProfileId === 'string') data.businessProfileId = body.businessProfileId;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data,
  });

  return NextResponse.json(conversation);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await prisma.conversation.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
