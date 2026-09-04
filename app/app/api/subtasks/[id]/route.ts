import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (typeof body.done === "boolean") {
    data.done = body.done;
    data.completedAt = body.done ? new Date() : null;
  }
  if (typeof body.content === "string") data.content = body.content;
  if (typeof body.assignee === "string") data.assignee = body.assignee || null;
  if (typeof body.dueDateISO === "string") data.dueDate = body.dueDateISO ? new Date(body.dueDateISO) : null;

  const subtask = await prisma.subtask.update({ where: { id }, data });
  return NextResponse.json(subtask);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.subtask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
