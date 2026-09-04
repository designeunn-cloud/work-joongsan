import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeLeaveDays } from "@/lib/leaveDays";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");

  const leaves = await prisma.leave.findMany({ orderBy: { startDate: "desc" } });
  const filtered = year ? leaves.filter((l) => l.startDate.getFullYear() === Number(year)) : leaves;
  return NextResponse.json(filtered);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { startDateISO, endDateISO, type, memo } = body as {
    startDateISO?: string;
    endDateISO?: string;
    type?: string;
    memo?: string;
  };

  if (!startDateISO || !type) {
    return NextResponse.json({ error: "시작일과 유형은 필수입니다." }, { status: 400 });
  }

  const { endISO, days } = computeLeaveDays(startDateISO, endDateISO, type);

  const leave = await prisma.leave.create({
    data: {
      startDate: new Date(startDateISO),
      endDate: new Date(endISO),
      type,
      days,
      memo: memo || null,
    },
  });

  return NextResponse.json(leave, { status: 201 });
}
