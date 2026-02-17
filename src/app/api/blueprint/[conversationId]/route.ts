import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { blueprintSchema } from '@/lib/blueprint/types';
import type { Prisma } from '@/generated/prisma/client';

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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;

  let body: { blueprint: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.blueprint) {
    return NextResponse.json({ error: 'blueprint is required' }, { status: 400 });
  }

  const parsed = blueprintSchema.safeParse(body.blueprint);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid blueprint', details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await prisma.blueprint.update({
      where: { conversationId },
      data: { data: parsed.data as unknown as Prisma.InputJsonValue },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
  }
}
