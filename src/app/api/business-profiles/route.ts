import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// GET - List all business profiles
export async function GET() {
  const profiles = await prisma.businessProfile.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json(profiles);
}

// POST - Create a new business profile
export async function POST(req: Request) {
  const body = await req.json();
  const { name, ...rest } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
  }

  const profile = await prisma.businessProfile.create({
    data: { name: name.trim(), ...rest },
  });

  return NextResponse.json(profile);
}
