import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeLeaveDays } from "@/lib/leaveDays";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const leave = await prisma.leave.update({
    where: { id },
    data: {
      startDate: new Date(startDateISO),
      endDate: new Date(endISO),
      type,
      days,
      memo: memo || null,
    },
  });

  return NextResponse.json(leave);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.leave.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
