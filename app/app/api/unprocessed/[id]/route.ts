import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.resolved === true) {
    const log = await prisma.unprocessedLog.update({
      where: { id },
      data: { resolved: true },
    });
    return NextResponse.json(log);
  }

  return NextResponse.json({ error: "invalid body" }, { status: 400 });
}
