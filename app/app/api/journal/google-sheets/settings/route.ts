import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { GOOGLE_JOURNAL_CONFIG_PATH, GOOGLE_JOURNAL_SPREADSHEET_ID, GOOGLE_JOURNAL_SPREADSHEET_URL, isValidGoogleJournalWebAppUrl } from "@/lib/googleSheetsJournal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "업무프로그램 화면에서 연결해주세요." }, { status: 403 });
  }
  try {
    const body = await request.json();
    let saved: { token?: string; webAppUrl?: string } = {};
    try { saved = JSON.parse(await readFile(GOOGLE_JOURNAL_CONFIG_PATH, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const token = process.env.GOOGLE_SHEETS_JOURNAL_TOKEN || saved.token || randomBytes(32).toString("hex");

    if (body.action === "prepare") {
      await writeFile(GOOGLE_JOURNAL_CONFIG_PATH, JSON.stringify({ ...saved, token }, null, 2), { mode: 0o600 });
      const source = await readFile(path.join(process.cwd(), "scripts/google-sheets-journal.gs"), "utf8");
      const setup = `// 처음 한 번 configureJournalSync 함수를 선택하여 실행하세요.\nfunction configureJournalSync() {\n  PropertiesService.getScriptProperties().setProperty("JOURNAL_SYNC_TOKEN", ${JSON.stringify(token)});\n}\n\n`;
      return NextResponse.json({ source: setup + source }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action !== "connect" || typeof body.webAppUrl !== "string" || !isValidGoogleJournalWebAppUrl(body.webAppUrl.trim())) {
      return NextResponse.json({ error: "구글에서 배포한 웹 앱 URL(/exec로 끝나는 주소)을 입력해주세요." }, { status: 400 });
    }
    const webAppUrl = body.webAppUrl.trim();
    const response = await fetch(webAppUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ping", token }), signal: AbortSignal.timeout(20000), cache: "no-store",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true || result.protocolVersion !== 2 || result.spreadsheetId !== GOOGLE_JOURNAL_SPREADSHEET_ID) {
      return NextResponse.json({ error: "연결을 확인하지 못했습니다. 연결 코드를 저장하고 configureJournalSync 실행 및 웹 앱 배포를 마쳤는지 확인해주세요." }, { status: 400 });
    }
    await writeFile(GOOGLE_JOURNAL_CONFIG_PATH, JSON.stringify({ webAppUrl, token }, null, 2), { mode: 0o600 });
    return NextResponse.json({ configured: true, spreadsheetUrl: GOOGLE_JOURNAL_SPREADSHEET_URL });
  } catch (error) {
    console.error("Google journal connection:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "구글 연결 설정을 처리하지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }
}
