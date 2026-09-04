"use client";

import Modal from "./Modal";

type Line = { type: "row"; cells: string[] } | { type: "text"; text: string };
type Segment = { type: "table"; rows: string[][] } | { type: "text"; lines: string[] };
interface SheetBlock {
  sheetName: string | null;
  lines: Line[];
}

/**
 * excelReader.ts가 만드는 평탄화 텍스트([시트: 이름] 헤더 + " | "로 이어붙인 행)를 그대로
 * 되돌려 시트별 블록으로 나눈다. 셀 구분자(" | ")가 있는 줄만 표로, 없는 줄(자유 서술문)은
 * 문단으로 남겨서 원래 시트 레이아웃과 다르게 억지로 표에 끼워 맞추지 않는다.
 */
function parseRawText(rawText: string): SheetBlock[] {
  return rawText
    .split("\n\n")
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const lines = block.split("\n");
      const headerMatch = lines[0]?.match(/^\[시트: (.+)\]$/);
      const sheetName = headerMatch ? headerMatch[1] : null;
      const rest = headerMatch ? lines.slice(1) : lines;
      const parsedLines: Line[] = rest.map((line) =>
        line.includes(" | ") ? { type: "row", cells: line.split(" | ") } : { type: "text", text: line }
      );
      return { sheetName, lines: parsedLines };
    });
}

function groupIntoSegments(lines: Line[]): Segment[] {
  const segments: Segment[] = [];
  for (const line of lines) {
    const last = segments[segments.length - 1];
    if (line.type === "row") {
      if (last?.type === "table") last.rows.push(line.cells);
      else segments.push({ type: "table", rows: [line.cells] });
    } else {
      if (line.text.trim() === "") continue;
      if (last?.type === "text") last.lines.push(line.text);
      else segments.push({ type: "text", lines: [line.text] });
    }
  }
  return segments;
}

function SheetTable({ rows }: { rows: string[][] }) {
  return (
    <table className="w-full text-xs border-collapse border border-neutral-200 rounded-lg overflow-hidden">
      <tbody>
        {rows.map((cells, r) => (
          <tr key={r} className={r % 2 === 1 ? "bg-neutral-50" : "bg-white"}>
            {cells.map((cell, c) =>
              c % 2 === 0 ? (
                <td
                  key={c}
                  className="border border-neutral-200 px-2 py-1.5 align-top whitespace-nowrap w-px font-medium text-neutral-500"
                >
                  {cell}
                </td>
              ) : (
                <td key={c} className="border border-neutral-200 px-2 py-1.5 align-top whitespace-pre-wrap text-neutral-800">
                  {cell}
                </td>
              )
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SheetBlockView({ block }: { block: SheetBlock }) {
  const segments = groupIntoSegments(block.lines);
  if (segments.length === 0) return null;
  return (
    <div>
      {block.sheetName && (
        <h3 className="text-xs font-semibold text-indigo-600 mb-1.5">[시트: {block.sheetName}]</h3>
      )}
      <div className="space-y-2">
        {segments.map((seg, i) =>
          seg.type === "table" ? (
            <SheetTable key={i} rows={seg.rows} />
          ) : (
            <p key={i} className="text-sm text-neutral-800 whitespace-pre-wrap">
              {seg.lines.join("\n")}
            </p>
          )
        )}
      </div>
    </div>
  );
}

export default function RawTextModal({
  fileName,
  rawText,
  onClose,
}: {
  fileName: string;
  rawText: string;
  onClose: () => void;
}) {
  const blocks = parseRawText(rawText);

  return (
    <Modal onClose={onClose} widthClassName="max-w-2xl">
      <h2 className="text-sm font-semibold text-neutral-500 mb-1">요청서 원문</h2>
      <p className="text-xs text-neutral-400 mb-3 truncate">{fileName}</p>
      <div className="space-y-5 mb-5">
        {blocks.map((block, i) => (
          <SheetBlockView key={i} block={block} />
        ))}
      </div>
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="text-sm px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100"
        >
          닫기
        </button>
      </div>
    </Modal>
  );
}
