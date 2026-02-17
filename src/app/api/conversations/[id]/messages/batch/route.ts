import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

interface BatchMessage {
  role: string;
  content: string;
  htmlArtifact?: Record<string, string> | null;
}

interface BatchRequest {
  finishId: string;
  messages: BatchMessage[];
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: BatchRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { finishId, messages } = body;

  if (!finishId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'finishId and non-empty messages array are required' },
      { status: 400 },
    );
  }

  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return NextResponse.json(
        { error: 'Each message must have role and content' },
        { status: 400 },
      );
    }
  }

  // Idempotency check: if messages with this finishId already exist, return them
  const existing = await prisma.message.findMany({
    where: { conversationId: id, finishId },
    orderBy: { createdAt: 'asc' },
  });

  if (existing.length > 0) {
    return NextResponse.json(existing);
  }

  // Atomic transaction: delete partials + create all messages
  try {
    const created = await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({
        where: { conversationId: id, isPartial: true },
      });

      const results = [];
      for (const msg of messages) {
        const row = await tx.message.create({
          data: {
            conversationId: id,
            role: msg.role,
            content: msg.content,
            htmlArtifact: msg.htmlArtifact ?? undefined,
            finishId,
          },
        });
        results.push(row);
      }

      await tx.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      return results;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    // Handle unique constraint violation (concurrent request with same finishId)
    const isUniqueViolation =
      error instanceof Error &&
      error.message.includes('Unique constraint');

    if (isUniqueViolation) {
      const existing = await prisma.message.findMany({
        where: { conversationId: id, finishId },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json(existing);
    }

    throw error;
  }
}
