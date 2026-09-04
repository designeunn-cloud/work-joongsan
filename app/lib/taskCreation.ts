import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";
import { buildFolderName, resolveUniqueFolderPath } from "./folderNaming";
import { computeDefaultEndDate } from "./dateHelpers";
import { logActivity } from "./activityLog";
import { findOrCreateProjectByName } from "./projects";
import type { InterpretResult } from "./types";

export interface CreateTaskFromInterpretOptions {
  watchFolder: string;
  fileName: string;
  flattenedText: string;
  result: InterpretResult;
  /** mkdir 이후 호출됨 — 원본 엑셀 파일을 폴더에 옮기거나(rename) 써넣는(write) 책임을 호출부가 진다. */
  saveFile: (folderPath: string) => void;
}

export type CreateTaskFromInterpretResultOutcome =
  | { ok: true; taskId: string; folderName: string }
  | { ok: false; reason: string };

export async function createTaskFromInterpretResult(
  opts: CreateTaskFromInterpretOptions
): Promise<CreateTaskFromInterpretResultOutcome> {
  const { watchFolder, fileName, flattenedText, result, saveFile } = opts;

  if (result.status !== "ok" || !result.assignee || !result.requestContent || !result.requestDateISO) {
    const reason = result.reason || "필수 항목(담당자/업무요청내용/요청일) 해석 실패";
    await prisma.unprocessedLog.create({
      data: { sourceFileName: fileName, reason, rawExtractedText: flattenedText },
    });
    return { ok: false, reason };
  }

  const requestDate = new Date(result.requestDateISO);
  const startDate = new Date();
  const folderName = buildFolderName({
    folderDate: startDate,
    requestContent: result.requestContent,
    productName: result.productName,
  });

  const { folderName: finalFolderName, folderPath } = resolveUniqueFolderPath(
    watchFolder,
    folderName,
    (p) => fs.existsSync(p),
    path
  );

  fs.mkdirSync(folderPath, { recursive: true });
  try {
    saveFile(folderPath);
  } catch (err) {
    // 폴더는 만들었지만 원본 파일을 못 옮김 — 대부분 워쳐가 중복 실행되어(예: 재시작 중 이전
    // 인스턴스가 안 죽고 남아있던 경우) 다른 인스턴스가 같은 파일을 먼저 처리해서 원본이 이미
    // 사라진 것이다. 실제 문제가 아니므로 "확인 필요" 목록에 남기지 않고, 방금 만든 빈 폴더만
    // 정리한 뒤 조용히 종료한다.
    try {
      fs.rmdirSync(folderPath);
    } catch {
      // 정리 실패는 무시 — 폴더에 다른 내용이 이미 있는 등 예상 밖 상황이면 그대로 둔다.
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `다른 프로세스가 이미 처리한 파일로 보입니다(중복 실행 감지): ${message}` };
  }

  // 분류 결과(상세페이지/배너/디자인자료 등)를 이름으로 하는 프로젝트에 자동으로 묶는다.
  // 분류가 불확실하면(카테고리를 못 찾음) "기타" 프로젝트로 들어간다.
  const project = await findOrCreateProjectByName(result.category);

  const task = await prisma.task.create({
    data: {
      sourceFileName: fileName,
      folderPath,
      folderName: finalFolderName,
      assignee: result.assignee,
      department: result.department,
      brand: result.brand,
      productName: result.productName || null,
      platform: result.platform || null,
      projectId: project.id,
      requestContent: result.requestContent,
      requestDate,
      dueDate: result.dueDateISO ? new Date(result.dueDateISO) : null,
      startDate,
      endDate: computeDefaultEndDate(startDate, result.department),
      status: "in_progress",
      statusChangedAt: new Date(),
      rawExtractedText: flattenedText,
      aiConfidenceNote: result.confidenceNote,
    },
  });

  await logActivity(`${result.assignee} 담당 "${result.requestContent}" 업무를 등록했습니다.`, task.id);

  return { ok: true, taskId: task.id, folderName: finalFolderName };
}
