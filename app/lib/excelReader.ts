import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import JSZip from "jszip";

export interface ExcelExtract {
  fileName: string;
  fileBaseName: string; // 확장자 제외
  flattenedText: string; // AI 프롬프트/전체 텍스트 검색에 쓰는 텍스트 덤프
  rows: string[][]; // 규칙 기반 파싱용 — 셀 값이 채워진 행만, 빈 셀은 제거하지 않고 순서 유지
  sheetNames: string[]; // 워크북의 시트탭 이름 목록
}

/**
 * 부서마다 레이아웃이 다르므로 셀 위치를 가정하지 않고,
 * 시트의 모든 텍스트 셀을 "행 단위 | 구분" 텍스트로 평탄화한다.
 * 날짜 서식이 적용된 셀은 dateNF로 사람이 읽을 수 있는 문자열로 변환된다.
 */
export async function extractExcelText(filePath: string): Promise<ExcelExtract> {
  // macOS는 파일명을 유니코드 분해형(NFD)으로 반환하는데, 소스 코드의 한글 리터럴은
  // 조합형(NFC)이라 정규화하지 않으면 같은 글자인데도 정규식/문자열 매칭이 실패한다.
  const fileName = path.basename(filePath).normalize("NFC");
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    cellText: false,
  });
  return extractFromWorkbook(fileName, workbook, buffer);
}

/** 업로드된 파일(Buffer)에서 직접 읽을 때 사용 — 디스크에 먼저 쓸 필요 없음. */
export async function extractExcelBuffer(buffer: Buffer, fileName: string): Promise<ExcelExtract> {
  const normalizedName = fileName.normalize("NFC");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellText: false,
  });
  return extractFromWorkbook(normalizedName, workbook, buffer);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * 드로잉 XML(xl/drawings/drawingN.xml) 안의 도형(텍스트 상자)마다 문단을 이어붙여 하나의 문자열로
 * 만들고, 시트 위 배치 위치(위→아래, 같은 줄이면 왼→오른쪽) 순서로 정렬해서 반환한다. 도형은
 * XML 문서 순서(만든/붙여넣은 순서)로 저장돼 있어서 그대로 뽑으면 화면에서 읽히는 순서와
 * 뒤죽박죽 섞인다 — 각 도형을 감싸는 `<xdr:twoCellAnchor>`/`<xdr:oneCellAnchor>`의
 * `<xdr:from><xdr:row>/<xdr:col>`(도형이 걸쳐 있는 셀 좌표)를 읽어 그 순서로 정렬한다.
 */
function extractShapeTexts(drawingXml: string): string[] {
  const items: Array<{ row: number; col: number; text: string }> = [];
  for (const anchorMatch of drawingXml.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
    const anchorXml = anchorMatch[0];
    const shapeMatch = anchorXml.match(/<xdr:sp\b[\s\S]*?<\/xdr:sp>/);
    if (!shapeMatch) continue; // 그림(<xdr:pic>) 등 텍스트가 없는 도형은 스킵

    const paragraphs: string[] = [];
    for (const paraMatch of shapeMatch[0].matchAll(/<a:p>[\s\S]*?<\/a:p>/g)) {
      const runs = [...paraMatch[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
      const line = runs.join("").trim();
      if (line) paragraphs.push(line);
    }
    const text = paragraphs.join(" ").trim();
    if (!text) continue;

    const fromMatch = anchorXml.match(/<xdr:from>[\s\S]*?<\/xdr:from>/);
    const row = Number(fromMatch?.[0].match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? 0);
    const col = Number(fromMatch?.[0].match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1] ?? 0);
    items.push({ row, col, text });
  }
  items.sort((a, b) => a.row - b.row || a.col - b.col);
  return items.map((it) => it.text);
}

/**
 * 셀 값만 읽는 xlsx 라이브러리는 텍스트 상자(도형) 안의 텍스트를 놓친다 — 그 내용은 시트가 아니라
 * 드로잉(DrawingML) XML에 별도로 저장돼 있다. workbook.xml의 시트 순서(=workbook.SheetNames와
 * 동일)를 따라 각 시트에 연결된 drawingN.xml을 찾아 도형 텍스트를 뽑는다. 실패해도(구조가 예상과
 * 다르거나 드로잉이 없는 파일) 조용히 빈 배열을 반환 — 이 부가 정보 하나 때문에 전체 처리가
 * 막히면 안 된다.
 */
async function extractDrawingTextsBySheetIndex(buffer: Buffer, sheetCount: number): Promise<string[][]> {
  const empty = Array.from({ length: sheetCount }, () => [] as string[]);
  try {
    const zip = await JSZip.loadAsync(buffer);
    const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
    const wbRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
    if (!workbookXml || !wbRelsXml) return empty;

    const relMap = new Map<string, string>();
    for (const m of wbRelsXml.matchAll(/<Relationship Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
      relMap.set(m[1], m[2]);
    }

    const sheetRIds = [...workbookXml.matchAll(/<sheet\b[^>]*?\/>/g)].map((m) => {
      const idMatch = m[0].match(/r:id="(rId\d+)"/);
      return idMatch ? idMatch[1] : null;
    });

    const result: string[][] = [];
    for (const rId of sheetRIds) {
      const target = rId ? relMap.get(rId) : undefined;
      if (!target) {
        result.push([]);
        continue;
      }
      const sheetFileName = target.split("/").pop()!;
      const sheetRelsXml = await zip.file(`xl/worksheets/_rels/${sheetFileName}.rels`)?.async("text");
      const drawingMatch = sheetRelsXml?.match(/Target="([^"]*drawings\/drawing\d+\.xml)"/);
      if (!drawingMatch) {
        result.push([]);
        continue;
      }
      const drawingPath = `xl/${drawingMatch[1].replace(/^(\.\.\/)+/, "")}`;
      const drawingXml = await zip.file(drawingPath)?.async("text");
      result.push(drawingXml ? extractShapeTexts(drawingXml) : []);
    }
    return result.length === sheetCount ? result : empty;
  } catch {
    return empty;
  }
}

async function extractFromWorkbook(fileName: string, workbook: XLSX.WorkBook, buffer: Buffer): Promise<ExcelExtract> {
  const fileBaseName = fileName.replace(/\.(xlsx|xls|xlsm)$/i, "");

  const drawingTextsBySheet = await extractDrawingTextsBySheetIndex(buffer, workbook.SheetNames.length);

  // 숨김(1)/매우 숨김(2) 시트는 엑셀 탭에 아예 안 보이는 채로 남아있는 경우가 많다 — 보통
  // 이전 요청 건을 지우지 않고 숨겨둔 것이라 현재 작업과 무관한 내용이다. 원문 추출에서 제외한다.
  const hiddenSheetNames = new Set(
    (workbook.Workbook?.Sheets ?? [])
      .filter((s) => (s.Hidden ?? 0) !== 0)
      .map((s) => s.name)
  );

  const sheetBlocks: string[] = [];
  const allRows: string[][] = [];

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    if (hiddenSheetNames.has(sheetName)) return;
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      dateNF: "yyyy-mm-dd",
      defval: "",
    });

    const lines: string[] = [];
    for (const row of rawRows) {
      const cells = (row as unknown[])
        .map((c) => (c === null || c === undefined ? "" : String(c).trim()))
        .filter((c) => c.length > 0);
      if (cells.length === 0) continue;
      lines.push(cells.join(" | "));
      allRows.push(cells);
    }

    const shapeTexts = drawingTextsBySheet[sheetIndex] ?? [];
    if (shapeTexts.length > 0) {
      lines.push("[텍스트 상자]", ...shapeTexts);
    }

    if (lines.length > 0) {
      sheetBlocks.push(`[시트: ${sheetName}]\n${lines.join("\n")}`);
    }
  });

  const flattenedText = sheetBlocks.join("\n\n");

  return { fileName, fileBaseName, flattenedText, rows: allRows, sheetNames: workbook.SheetNames };
}
