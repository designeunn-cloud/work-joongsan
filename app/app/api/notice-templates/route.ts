import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { validateNoticeTemplate, type NoticeTemplate } from "@/lib/noticeTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await prisma.$queryRaw<(Omit<NoticeTemplate, "productNames"> & { productNames: string })[]>`SELECT id, name, source, projectId, requestContent, productionType, productNames, assignee, dueDateISO, splitByProduct, dateConfirmed FROM NoticeTemplate ORDER BY updatedAt DESC, id DESC`;
    return NextResponse.json(templates.map(template => ({ ...template, productNames: JSON.parse(template.productNames), splitByProduct: Boolean(template.splitByProduct), dateConfirmed: Boolean(template.dateConfirmed) })));
  } catch { return NextResponse.json({ error: "저장한 공지를 불러오지 못했습니다. 다시 시도해주세요." }, { status: 500 }); }
}

async function mutate(request: Request, method: "POST" | "PUT" | "DELETE") {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "업무프로그램에서 다시 시도해주세요." }, { status: 403 });
  const body = await request.json().catch(() => null);
  let input: ReturnType<typeof validateNoticeTemplate> | undefined;
  const id = method === "POST" ? randomUUID() : body?.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) return NextResponse.json({ error: "저장한 공지를 선택해주세요." }, { status: 400 });
  if (method !== "DELETE") {
    try { input = validateNoticeTemplate(body); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "입력값을 확인해주세요." }, { status: 400 }); }
  }
  try {
    if (input?.projectId && !await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } })) {
      return NextResponse.json({ error: "삭제된 프로젝트입니다. 프로젝트를 다시 선택해주세요." }, { status: 400 });
    }
    if (method === "DELETE") {
      const count = await prisma.$executeRaw`DELETE FROM NoticeTemplate WHERE id = ${id}`;
      if (!count) return NextResponse.json({ error: "이미 삭제된 공지입니다. 목록을 새로고침해주세요." }, { status: 404 });
      return NextResponse.json({ deleted: true });
    }
    const value = input!;
    const products = JSON.stringify(value.productNames ?? []);
    const now = new Date();
    if (method === "POST") {
      await prisma.$executeRaw`INSERT INTO NoticeTemplate (id, name, source, projectId, requestContent, productionType, productNames, assignee, dueDateISO, splitByProduct, dateConfirmed, createdAt, updatedAt) VALUES (${id}, ${value.name}, ${value.source}, ${value.projectId}, ${value.requestContent}, ${value.productionType}, ${products}, ${value.assignee}, ${value.dueDateISO}, ${value.splitByProduct}, ${value.dateConfirmed}, ${now}, ${now})`;
    } else {
      const count = await prisma.$executeRaw`UPDATE NoticeTemplate SET name = ${value.name}, source = ${value.source}, projectId = ${value.projectId}, requestContent = ${value.requestContent}, productionType = ${value.productionType}, productNames = ${products}, assignee = ${value.assignee}, dueDateISO = ${value.dueDateISO}, splitByProduct = ${value.splitByProduct}, dateConfirmed = ${value.dateConfirmed}, updatedAt = ${now} WHERE id = ${id}`;
      if (!count) return NextResponse.json({ error: "이미 삭제된 공지입니다. 목록을 새로고침해주세요." }, { status: 404 });
    }
    return NextResponse.json({ id, ...value }, { status: method === "POST" ? 201 : 200 });
  } catch { return NextResponse.json({ error: "공지 저장 내용을 변경하지 못했습니다. 다시 시도해주세요." }, { status: 500 }); }
}
export async function POST(request: Request) { return mutate(request, "POST"); }
export async function PUT(request: Request) { return mutate(request, "PUT"); }
export async function DELETE(request: Request) { return mutate(request, "DELETE"); }
