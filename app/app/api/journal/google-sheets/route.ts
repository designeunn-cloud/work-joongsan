import { NextResponse } from "next/server";
import { getGoogleSheetsJournalConfig, getGoogleSheetsJournalStatus, GoogleSheetsJournalError, isValidJournalDate } from "@/lib/googleSheetsJournal";
import { flushJournalAutoSync, queueJournalChanges } from "@/lib/journalAutoSync";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getGoogleSheetsJournalStatus());
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "업무프로그램 안에서 등록해주세요." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!isValidJournalDate(body?.dateISO)) {
    return NextResponse.json({ error: "올바른 업무일지 날짜를 선택해주세요." }, { status: 400 });
  }
  try {
    if (!await getGoogleSheetsJournalConfig()) throw new GoogleSheetsJournalError("구글 시트 연결 설정을 먼저 완료해주세요.", 503);
    await queueJournalChanges([{ dateISO: body.dateISO }]);
    const result = await flushJournalAutoSync(body.dateISO);
    if (!result) throw new GoogleSheetsJournalError("자동 동기화가 진행 중입니다. 잠시 후 다시 확인해주세요.", 409);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof GoogleSheetsJournalError ? error.message : "업무일지를 등록하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: error instanceof GoogleSheetsJournalError ? error.status : 500 });
  }
}
