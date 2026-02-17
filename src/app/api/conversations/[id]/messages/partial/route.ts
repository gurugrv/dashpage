import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { role: string; content: string; htmlArtifact?: Record<string, string> | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { role, content, htmlArtifact } = body;

  if (!role || !content) {
    return NextResponse.json({ error: 'role and content are required' }, { status: 400 });
  }

  // Delete any existing partial messages first to prevent duplicates
  // (beforeunload + cleanup useEffect can both fire)
  const message = await prisma.$transaction(async (tx) => {
    await tx.message.deleteMany({
      where: { conversationId: id, isPartial: true },
    });

    return tx.message.create({
      data: {
        conversationId: id,
        role,
        content,
        htmlArtifact: htmlArtifact ?? undefined,
        isPartial: true,
      },
    });
  });

  // Track interrupted state for resume detection
  await prisma.generationState.upsert({
    where: { conversationId: id },
    create: {
      conversationId: id,
      mode: 'chat',
      phase: 'interrupted',
    },
    update: {
      mode: 'chat',
      phase: 'interrupted',
    },
  }).catch(() => {}); // Non-critical

  await prisma.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(message, { status: 201 });
}
