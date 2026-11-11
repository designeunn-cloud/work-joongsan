export type ProductTask = { department?: string | null; productName?: string | null; platform?: string | null; requestContent: string; productTitleSource?: string | null };
export type ProductIssues = { unregistered: string[]; titleCodes: string[]; products: string[]; mismatch: boolean };
/** Keep compound identifiers such as WM6915B/W intact; separate explicit list delimiters only. */
export function splitProducts(value?: string | null): string[] {
  const seen = new Set<string>();
  return (value ?? "").split(/[,，;；\r\n]+|\s+\/\s+/).map(part => part.trim()).filter(part => {
    const key = part.normalize("NFKC").toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
const upper = (value: string) => value.normalize("NFKC").toUpperCase();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function extractProductCodes(text: string, ignored: string[] = []): string[] {
  for (const word of ignored.filter(Boolean)) text = text.replaceAll(word, " ");
  return [...new Set(text.match(/(?<![a-z0-9])[a-z]{2,8}-?\d{1,8}[a-z0-9]*(?:\([a-z0-9]+\))?(?![a-z0-9])/gi) ?? [])];
}

/** Read only product fields and numbered model lists, never codes in general prose/reference rows. */
export function extractRequestProducts(source: string | ReadonlyArray<ReadonlyArray<string>>): string[] {
  const rows = typeof source === "string" ? source.split(/\r?\n/).map(line => line.split(/\s*\|\s*/)) : source;
  const labels = new Set(["품명", "제품명", "상품명", "모델명", "제품코드", "상품코드", "모델코드", "제품", "제품명(모델명)", "품명(모델명)"]);
  const fieldBoundary = /^(?:요청(?:자|일|일자|완료일|완료일자|부서)|담당자|작성자|협조부서|부서|브랜드|플랫폼|수량|납기일|참고.*|업무.*|내용|규격|비고|요청사항|요청내용)[:：]?$/;
  const found: string[] = [];
  let referenceSection = false;
  const fieldProducts = (value: string, namesAllowed: boolean) => {
    let prefix = "";
    for (const token of splitProducts(value)) {
      const codes = extractProductCodes(token);
      if (codes.length) {
        const compound = codes.length === 1 && /^[a-z0-9()/-]+$/i.test(token) ? [token] : codes;
        found.push(...compound);
        prefix = compound.at(-1)?.match(/^([a-z]{2,8}-?)\d/i)?.[1] ?? prefix;
      } else if (prefix && /^\d{2,8}[a-z0-9]*(?:\([a-z0-9]+\))?$/i.test(token)) {
        found.push(prefix + token);
      } else if (namesAllowed && !/^\d+$/.test(token) && !/https?:\/\/|[<>]|(?:수정|변경|참고|요청|디자인|라벨|스티커)/.test(token)) {
        found.push(token);
      }
    }
  };
  for (const row of rows) {
    if (row.some(cell => /참고/.test(cell))) {
      if (row.some(cell => /^(?:참고|참조)(?:자료|품명|제품|모델|이미지|URL|링크|상세페이지)?\s*[:：]?$/i.test(cell.trim()))) referenceSection = true;
      continue;
    }
    if (row.some(cell => labels.has(cell.replace(/\s+/g, "").replace(/[:：]$/, ""))) || row.some(cell => /^\[시트:/.test(cell))) referenceSection = false;
    if (referenceSection) continue;
    for (let index = 0; index < row.length; index++) {
      const cell = row[index].trim();
      const labelParts = cell.match(/^([^:：]+)[:：]([\s\S]*)$/);
      const label = (labelParts?.[1] ?? cell).replace(/\s+/g, "");
      if (labels.has(label)) {
        if (labelParts?.[2].trim()) fieldProducts(labelParts[2], label !== "제품");
        for (let next = index + 1; next < row.length; next++) {
          const value = row[next].trim();
          const normalized = value.replace(/\s+/g, "");
          if (labels.has(normalized) || fieldBoundary.test(normalized)) break;
          fieldProducts(value, label !== "제품");
        }
      }
      for (const line of cell.split(/\r?\n/)) {
        const numbered = line.match(/^\s*(?:\(\d+\)|\d+[.)])\s*([a-z]{2,8}-?\d{1,8}[a-z0-9]*(?:\([a-z0-9]+\))?(?:\/[a-z]+)?)\s*$/i);
        if (numbered) found.push(numbered[1]);
      }
    }
  }
  return splitProducts(found.join(", "));
}

/** Preserve every explicitly requested target alongside an extractor's existing selection. */
export function mergeRequestProducts(productName: string | null | undefined, source: string | ReadonlyArray<ReadonlyArray<string>>, fileName = "", ignored: string[] = []): string {
  const filenameCodes = extractProductCodes(fileName, ignored);
  // A single conflicting filename code still needs confirmation; an explicit multi-model filename is a target list.
  const filenameProducts = filenameCodes.length > 1 ? filenameCodes : [];
  return splitProducts([...extractRequestProducts(source), ...splitProducts(productName), ...filenameProducts].join(", ")).join(", ");
}
export function removeProductNames(text: string, products: string[]): string {
  for (const code of [...products].sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(`(?<![a-z0-9])${escape(code)}(?![a-z0-9])`, "gi"), " ");
  }
  return text.replace(/\([\s,;/_-]*\)|\[[\s,;/_-]*\]/g, " ").replace(/^[\s,;/_-]+|[\s,;/_-]+$/g, "").replace(/\s+/g, " ").trim();
}
export function getProductIssues(task: ProductTask, dictionary: Array<{ code: string }>): ProductIssues {
  const empty = { unregistered: [], titleCodes: [], products: splitProducts(task.productName), mismatch: false };
  if (!task.department?.includes("영업")) return empty;
  const products = splitProducts(task.productName), known = new Set(dictionary.map((p) => upper(p.code)));
  const evidence = `${task.productTitleSource ?? ""} ${task.requestContent}`;
  const titleCodes = extractProductCodes(evidence, [task.platform ?? ""]);
  const remaining = extractProductCodes(removeProductNames(evidence, products), [task.platform ?? ""]);
  const candidates = [...products, ...remaining], seen = new Set<string>();
  return { products, titleCodes, mismatch: remaining.length > 0,
    unregistered: candidates.filter((code) => !known.has(upper(code)) && !seen.has(upper(code)) && Boolean(seen.add(upper(code)))) };
}
export function normalizeSalesTitle(task: ProductTask): string {
  if (!task.department?.includes("영업")) return task.requestContent;
  return removeProductNames(task.requestContent, [...splitProducts(task.productName), ...extractProductCodes(task.requestContent, [task.platform ?? ""])]) || task.requestContent;
}
export function salesTitleData(task: ProductTask) {
  const requestContent = normalizeSalesTitle(task);
  const productTitleSource = task.productTitleSource || (requestContent !== task.requestContent ? task.requestContent : null);
  return { requestContent, productTitleSource };
}
/** AI가 제목의 상충 코드를 생략해도 파일명의 근거는 확인 표시까지 보존한다. */
export function preserveSalesTitleCodes<T extends ProductTask>(task: T, sourceTitle: string): T {
  if (!task.department?.includes("영업")) return task;
  const unmatched = extractProductCodes(removeProductNames(sourceTitle, splitProducts(task.productName)), [task.platform ?? ""]);
  const inTitle = new Set(extractProductCodes(task.requestContent).map(upper));
  const omitted = unmatched.filter((code) => !inTitle.has(upper(code)));
  return omitted.length ? { ...task, requestContent: `${task.requestContent} ${omitted.join(", ")}` } : task;
}
export function isSalesBanner(task: { department?: string | null; projectName?: string | null }): boolean {
  return Boolean(task.department?.includes("영업") && ["영업부 배너", "배너"].includes(task.projectName ?? ""));
}
