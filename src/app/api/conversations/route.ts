import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  const conversations = await prisma.conversation.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ conversations });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = body.title || 'New Conversation';

  const conversation = await prisma.conversation.create({
    data: { title },
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
