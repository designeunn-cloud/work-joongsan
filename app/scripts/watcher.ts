import "dotenv/config";
import chokidar from "chokidar";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { extractExcelText } from "../lib/excelReader";
import { interpretExcel } from "../lib/interpret";
import { interpretExcelRules } from "../lib/ruleBasedInterpret";
import type { InterpretResult } from "../lib/types";
import { createTaskFromInterpretResult } from "../lib/taskCreation";
import { createProductInNotion } from "../lib/notionSync";
import { finalizePastDays } from "../lib/dailyJournalSnapshot";

// "ai" = Claude API로 해석 (ANTHROPIC_API_KEY 필요, 유료), "rules" = 라벨/캐시 매칭 기반 무료 해석 (기본값)
const INTERPRET_MODE = (process.env.INTERPRET_MODE || "rules").toLowerCase();

const WATCH_FOLDER = process.env.WATCH_FOLDER_PATH;

if (!WATCH_FOLDER) {
  console.error("[watcher] WATCH_FOLDER_PATH가 .env에 설정되지 않았습니다.");
  process.exit(1);
}

if (!fs.existsSync(WATCH_FOLDER)) {
  console.error(`[watcher] 감시 폴더가 존재하지 않습니다: ${WATCH_FOLDER}`);
  process.exit(1);
}

// 같은 감시 폴더를 대상으로 watcher가 두 번 이상 뜨면(예: `npm run watcher`를 `npm run dev:all`과
// 별도로 또 실행) 같은 파일 이벤트를 여러 인스턴스가 동시에 처리해서 결과 폴더가 중복 생성된다.
// PID를 담은 락 파일로 이미 살아있는 인스턴스가 있으면 새 인스턴스를 즉시 종료한다.
const LOCK_FILE = path.join(
  os.tmpdir(),
  `task-watcher-${Buffer.from(path.resolve(WATCH_FOLDER)).toString("base64url")}.lock`
);

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const existingPid = Number(fs.readFileSync(LOCK_FILE, "utf-8").trim());
    if (existingPid && isProcessAlive(existingPid)) {
      console.error(
        `[watcher] 이미 이 폴더를 감시 중인 watcher 인스턴스(PID ${existingPid})가 있습니다. 중복 실행을 방지하기 위해 종료합니다.`
      );
      process.exit(1);
    }
    // PID가 죽어있으면(비정상 종료로 락 파일만 남은 경우) 이어서 잠금을 새로 잡는다.
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE) && Number(fs.readFileSync(LOCK_FILE, "utf-8").trim()) === process.pid) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // 종료 중 정리 실패는 무시 — 다음 시작 시 PID 생존 여부로 다시 판단된다.
  }
}

acquireLock();
process.on("exit", releaseLock);

console.log(`[watcher] 감시 시작: ${WATCH_FOLDER}`);

// 최상위 파일만 감시 (depth: 0) — 자동 생성된 하위 결과 폴더는 재귀 감시하지 않음
const watcher = chokidar.watch(WATCH_FOLDER, {
  depth: 0,
  ignoreInitial: false,
  awaitWriteFinish: {
    stabilityThreshold: 1500,
    pollInterval: 300,
  },
});

const processing = new Set<string>();

// 자정이 지나 새 날짜가 시작되면 어제치 업무일지를 그 날짜의 오전 9시 기준으로 고정한다.
// 오늘 것은 하루가 끝나야 고정되므로 여기서 다루지 않는다(실시간 조회는 API에서 처리).
void finalizePastDays().catch((err) => console.error("[watcher] 업무일지 고정 실패:", err));
setInterval(() => {
  void finalizePastDays().catch((err) => console.error("[watcher] 업무일지 고정 실패:", err));
}, 10 * 60 * 1000);

watcher.on("add", (filePath) => {
  if (!/\.(xlsx|xls|xlsm)$/i.test(filePath)) return;
  if (path.basename(filePath).startsWith("~$")) return; // 엑셀 임시 잠금 파일 무시
  void handleNewFile(filePath);
});

async function handleNewFile(filePath: string) {
  if (processing.has(filePath)) return;
  processing.add(filePath);

  const fileName = path.basename(filePath).normalize("NFC");
  console.log(`[watcher] 새 파일 감지: ${fileName}`);

  try {
    if (!fs.existsSync(filePath)) return; // 이미 이동/삭제됨

    const extract = await extractExcelText(filePath);

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
        console.log(`[watcher] 신규 품명 노션 등록 완료: ${result.newProductCode}`);
      } catch (err) {
        console.error(`[watcher] 신규 품명 노션 등록 실패 (${result.newProductCode}):`, err);
      }
    }

    const outcome = await createTaskFromInterpretResult({
      watchFolder: WATCH_FOLDER as string,
      fileName,
      flattenedText: extract.flattenedText,
      result,
      saveFile: (folderPath) => fs.renameSync(filePath, path.join(folderPath, fileName)),
    });

    if (!outcome.ok) {
      console.warn(`[watcher] 처리 보류(확인 필요): ${fileName} — ${outcome.reason}`);
      return;
    }

    console.log(`[watcher] 등록 완료: ${outcome.folderName}`);
  } catch (err) {
    console.error(`[watcher] 처리 중 오류 (${fileName}):`, err);
    try {
      await prisma.unprocessedLog.create({
        data: {
          sourceFileName: fileName,
          reason: `처리 중 오류: ${err instanceof Error ? err.message : String(err)}`,
          rawExtractedText: "",
        },
      });
    } catch {
      // DB 기록조차 실패하면 콘솔 로그만 남김
    }
  } finally {
    processing.delete(filePath);
  }
}

async function shutdown() {
  await watcher.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
