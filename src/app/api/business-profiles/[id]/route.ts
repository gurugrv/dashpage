import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET - Fetch single profile
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.businessProfile.findUnique({ where: { id } });
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(profile);
}

// PATCH - Update profile
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const profile = await prisma.businessProfile.update({
    where: { id },
    data: body,
  });
  return NextResponse.json(profile);
}
