import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getProductIssues } from "@/lib/productPolicy";
import { buildFolderName, resolveUniqueFolderPath } from "@/lib/folderNaming";
import { computeDefaultEndDate } from "@/lib/dateHelpers";
import { buildManualRequestFileContent } from "@/lib/manualRequestFile";
import { logActivity } from "@/lib/activityLog";
import { findOrCreateProjectByName } from "@/lib/projects";

export async function GET() {
  const tasks = await prisma.task.findMany({
    where: { source: { not: "journal" } },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { name: true } },
      relatedTask: { select: { id: true, requestContent: true, status: true } },
      followUps: { select: { id: true, requestContent: true, status: true } },
      subtasks: true,
    },
  });
  const products = await prisma.productCache.findMany({ select: { code: true } });
  return NextResponse.json(tasks.map((task) => ({ ...task, productIssues: getProductIssues(task, products) })));
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    assignee,
    department,
    brand,
    productName,
    platform,
    tags,
    memo,
    projectId,
    requestContent,
    requestDateISO,
    startDateISO,
    relatedTaskId,
  } = body as {
    assignee?: string;
    department?: string;
    brand?: string;
    productName?: string;
    platform?: string;
    tags?: string;
    memo?: string;
    projectId?: string;
    requestContent?: string;
    requestDateISO?: string;
    startDateISO?: string;
    relatedTaskId?: string;
  };

  if (!assignee?.trim() || !requestContent?.trim() || !requestDateISO) {
    return NextResponse.json(
      { error: "담당자, 업무요청내용, 요청일은 필수입니다." },
      { status: 400 }
    );
  }

  const WATCH_FOLDER = process.env.WATCH_FOLDER_PATH;
  if (!WATCH_FOLDER || !fs.existsSync(WATCH_FOLDER)) {
    return NextResponse.json(
      { error: "WATCH_FOLDER_PATH가 설정되지 않았거나 존재하지 않습니다." },
      { status: 500 }
    );
  }

  const requestDate = new Date(requestDateISO);
  const startDate = startDateISO ? new Date(startDateISO) : new Date();
  const folderName = buildFolderName({ folderDate: new Date(), requestContent, productName });
  const { folderName: finalFolderName, folderPath } = resolveUniqueFolderPath(
    WATCH_FOLDER,
    folderName,
    (p) => fs.existsSync(p),
    path
  );

  fs.mkdirSync(folderPath, { recursive: true });
  const requestFileName = "요청서.txt";
  const fileContent = buildManualRequestFileContent({
    assignee,
    department,
    brand,
    productName,
    requestContent,
    requestDateISO,
    startDateISO: startDate.toISOString(),
  });
  fs.writeFileSync(path.join(folderPath, requestFileName), fileContent, "utf-8");

  // 프로젝트를 직접 고르지 않았으면 "기타"로 자동 배정한다.
  const finalProjectId = projectId || (await findOrCreateProjectByName(undefined)).id;

  // 후속작업(수정요청)으로 등록되는 경우, 원본 업무가 실제로 존재하는지 확인한다.
  const relatedTask = relatedTaskId
    ? await prisma.task.findUnique({ where: { id: relatedTaskId } })
    : null;

  const task = await prisma.task.create({
    data: {
      source: "manual",
      sourceFileName: requestFileName,
      folderPath,
      folderName: finalFolderName,
      assignee,
      department: department || null,
      brand: brand || null,
      productName: productName || null,
      platform: platform || null,
      tags: tags || null,
      memo: memo || null,
      projectId: finalProjectId,
      requestContent,
      requestDate,
      startDate,
      endDate: computeDefaultEndDate(startDate, department || null),
      status: "in_progress",
      statusChangedAt: new Date(),
      rawExtractedText: "",
      relatedTaskId: relatedTask?.id ?? null,
    },
  });

  await logActivity(`${assignee} 담당 "${requestContent}" 업무를 등록했습니다.`, task.id);
  if (relatedTask) {
    await logActivity(
      `"${relatedTask.requestContent}" 업무의 후속작업으로 "${requestContent}"가 등록되었습니다.`,
      relatedTask.id
    );
  }

  return NextResponse.json(task, { status: 201 });
}
