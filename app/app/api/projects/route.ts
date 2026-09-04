import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tasks: true } } },
  });
  return NextResponse.json(
    projects.map((p) => ({
      id: p.id,
      name: p.name,
      department: p.department,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      taskCount: p._count.tasks,
    }))
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "프로젝트 이름은 필수입니다." }, { status: 400 });
  }
  const department = typeof body.department === "string" && body.department ? body.department : null;
  const project = await prisma.project.create({ data: { name, department } });
  return NextResponse.json(project, { status: 201 });
}
