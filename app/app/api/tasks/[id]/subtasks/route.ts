import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const subtasks = await prisma.subtask.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(subtasks);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { content, assignee, dueDateISO } = body as {
    content?: string;
    assignee?: string;
    dueDateISO?: string;
  };

  if (!content?.trim()) {
    return NextResponse.json({ error: "세부할일 내용은 필수입니다." }, { status: 400 });
  }

  const subtask = await prisma.subtask.create({
    data: {
      taskId: id,
      content,
      assignee: assignee || null,
      dueDate: dueDateISO ? new Date(dueDateISO) : null,
    },
  });

  return NextResponse.json(subtask, { status: 201 });
}
