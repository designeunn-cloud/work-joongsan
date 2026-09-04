import { NextResponse } from "next/server";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { extractExcelBuffer } from "@/lib/excelReader";
import { interpretExcel } from "@/lib/interpret";
import { interpretExcelRules } from "@/lib/ruleBasedInterpret";
import { createTaskFromInterpretResult } from "@/lib/taskCreation";
import { createProductInNotion } from "@/lib/notionSync";
import type { InterpretResult } from "@/lib/types";

const INTERPRET_MODE = (process.env.INTERPRET_MODE || "rules").toLowerCase();

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "엑셀 파일이 필요합니다." }, { status: 400 });
  }
  if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
    return NextResponse.json({ error: "xlsx/xls/xlsm 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  const WATCH_FOLDER = process.env.WATCH_FOLDER_PATH;
  if (!WATCH_FOLDER || !fs.existsSync(WATCH_FOLDER)) {
    return NextResponse.json(
      { error: "WATCH_FOLDER_PATH가 설정되지 않았거나 존재하지 않습니다." },
      { status: 500 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extract = await extractExcelBuffer(buffer, file.name);

  const [assignees, products, platformRows] = await Promise.all([
    prisma.assigneeCache.findMany({ select: { name: true, department: true } }),
    prisma.productCache.findMany({ select: { code: true, brand: true } }),
    prisma.platformCache.findMany({ select: { name: true } }),
  ]);
  const platforms = platformRows.map((p) => p.name);

  const result: InterpretResult =
    INTERPRET_MODE === "ai"
      ? await interpretExcel({
          fileName: extract.fileName,
          fileBaseName: extract.fileBaseName,
          extractedText: extract.flattenedText,
          sheetNames: extract.sheetNames,
          assignees,
          products,
          platforms,
        })
      : interpretExcelRules({
          fileBaseName: extract.fileBaseName,
          flattenedText: extract.flattenedText,
          rows: extract.rows,
          sheetNames: extract.sheetNames,
          assignees,
          products,
          platforms,
        });

  if (result.status === "ok" && result.newProductCode) {
    try {
      await createProductInNotion(result.newProductCode);
    } catch (err) {
      console.error(`[upload] 신규 품명 노션 등록 실패 (${result.newProductCode}):`, err);
    }
  }

  const outcome = await createTaskFromInterpretResult({
    watchFolder: WATCH_FOLDER,
    fileName: extract.fileName,
    flattenedText: extract.flattenedText,
    result,
    saveFile: (folderPath) => fs.writeFileSync(`${folderPath}/${extract.fileName}`, buffer),
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { error: `자동 해석에 실패했습니다: ${outcome.reason} (확인 필요 목록에 등록되었습니다.)` },
      { status: 422 }
    );
  }

  return NextResponse.json({ taskId: outcome.taskId, folderName: outcome.folderName }, { status: 201 });
}
