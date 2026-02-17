import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(messages);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { role, content, htmlArtifact } = await req.json();

  if (!role || !content) {
    return NextResponse.json({ error: 'role and content are required' }, { status: 400 });
  }

  // When persisting a complete assistant message with an artifact,
  // clean up any partial messages first (handles Stop + natural completion race)
  const shouldCleanPartials = role === 'assistant' && htmlArtifact;

  const message = shouldCleanPartials
    ? await prisma.$transaction(async (tx) => {
        await tx.message.deleteMany({
          where: { conversationId: id, isPartial: true },
        });
        return tx.message.create({
          data: { conversationId: id, role, content, htmlArtifact: htmlArtifact ?? undefined },
        });
      })
    : await prisma.message.create({
        data: { conversationId: id, role, content, htmlArtifact: htmlArtifact ?? undefined },
      });

  // Touch conversation updatedAt
  await prisma.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(message, { status: 201 });
}
