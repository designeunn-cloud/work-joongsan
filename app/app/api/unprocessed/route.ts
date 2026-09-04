import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const logs = await prisma.unprocessedLog.findMany({
    where: { resolved: false },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(logs);
}
