import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year")) || new Date().getFullYear();

  const quota = await prisma.leaveQuota.findUnique({ where: { year } });
  return NextResponse.json({ year, totalDays: quota?.totalDays ?? 0 });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { year, totalDays } = body as { year?: number; totalDays?: number };

  if (!year || totalDays === undefined || totalDays === null) {
    return NextResponse.json({ error: "연도와 총 연차일수는 필수입니다." }, { status: 400 });
  }

  const quota = await prisma.leaveQuota.upsert({
    where: { year },
    create: { year, totalDays },
    update: { totalDays },
  });

  return NextResponse.json(quota);
}
