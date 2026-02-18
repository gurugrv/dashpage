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
    // Read existing blueprint to preserve siteFacts and researchPending
    // (these fields live outside blueprintSchema and would be stripped by safeParse)
    const existing = await prisma.blueprint.findUnique({ where: { conversationId } });
    const existingData = existing?.data as Record<string, unknown> | null;
    const preserved: Record<string, unknown> = {};
    if (existingData?.siteFacts) preserved.siteFacts = existingData.siteFacts;
    if (existingData?.researchPending !== undefined) preserved.researchPending = existingData.researchPending;

    await prisma.blueprint.update({
      where: { conversationId },
      data: { data: { ...parsed.data, ...preserved } as unknown as Prisma.InputJsonValue },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
  }
}
