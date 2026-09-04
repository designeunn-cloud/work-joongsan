import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [assignees, products, platformRows] = await Promise.all([
    prisma.assigneeCache.findMany({ select: { name: true, department: true }, orderBy: { name: "asc" } }),
    prisma.productCache.findMany({
      select: { code: true, brand: true },
      orderBy: { code: "asc" },
    }),
    prisma.platformCache.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);

  const platforms = Array.from(new Set(platformRows.map((p) => p.name)));

  return NextResponse.json({
    assignees,
    products,
    platforms,
  });
}
