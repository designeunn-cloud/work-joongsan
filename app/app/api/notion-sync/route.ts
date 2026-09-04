import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAll } from "@/lib/notionSync";

export async function GET() {
  const states = await prisma.syncState.findMany();
  const [assigneeCount, productCount, platformCount] = await Promise.all([
    prisma.assigneeCache.count(),
    prisma.productCache.count(),
    prisma.platformCache.count(),
  ]);
  return NextResponse.json({ states, assigneeCount, productCount, platformCount });
}

export async function POST() {
  try {
    const result = await syncAll();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
