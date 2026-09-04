/**
 * 결과 폴더명을 생성한다: 날짜_업무요청내용_제품명 (제품명 없으면 생략)
 * 날짜는 폴더가 생성되는 시점(오늘 날짜)을 쓴다 — 엑셀의 요청일자와는 별개로 모든 폴더에 동일하게 적용.
 * macOS 파일시스템에서 문제되는 문자(: / \ 등)와 앞뒤 공백을 정리한다.
 */
export function buildFolderName(params: {
  folderDate: Date;
  requestContent: string;
  productName?: string | null;
}): string {
  const { folderDate, requestContent, productName } = params;

  const y = folderDate.getFullYear();
  const m = String(folderDate.getMonth() + 1).padStart(2, "0");
  const d = String(folderDate.getDate()).padStart(2, "0");
  const dateStr = `${y}${m}${d}`;

  const parts = [dateStr, sanitize(requestContent)];
  if (productName && productName.trim().length > 0) {
    parts.push(sanitize(productName));
  }

  return parts.join("_");
}

function sanitize(text: string): string {
  return text
    .replace(/[/\\:*?"<>|]/g, "") // macOS/공유폴더에서 문제되는 문자 제거
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 동일한 폴더명이 이미 존재하면 " (2)", " (3)" ... 을 붙여 충돌을 피한다.
 */
export function resolveUniqueFolderPath(
  parentDir: string,
  folderName: string,
  existsFn: (p: string) => boolean,
  path: { join: (...s: string[]) => string }
): { folderName: string; folderPath: string } {
  let candidate = folderName;
  let counter = 2;
  let folderPath = path.join(parentDir, candidate);

  while (existsFn(folderPath)) {
    candidate = `${folderName} (${counter})`;
    folderPath = path.join(parentDir, candidate);
    counter += 1;
  }

  return { folderName: candidate, folderPath };
}
