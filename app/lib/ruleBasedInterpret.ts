import type { InterpretResult } from "./types";

export interface RuleBasedInput {
  fileBaseName: string;
  flattenedText: string;
  rows: string[][];
  sheetNames: string[];
  assignees: Array<{ name: string; department: string | null }>; // 노션 담당자 캐시
  products: Array<{ code: string; brand: string | null }>; // 노션 품명 캐시
  platforms: string[]; // 노션 플랫폼 캐시
}

const ASSIGNEE_LABELS = ["요청자", "담당자", "성명", "작성자", "신청자"];
const DEPT_LABELS_PRIMARY = ["요청부서"];
const DEPT_LABELS_FALLBACK = ["부서", "소속부서", "협조부서"];
const DATE_LABELS = ["요청일자", "요청일", "신청일자", "신청일", "작성일자", "작성일"];
// 아직 품명 DB에 없는 신규 제품의 코드를 엑셀 텍스트에서 직접 추출하기 위한 패턴 (예: WOP121)
const PRODUCT_CODE_PATTERN = /\b[A-Za-z]{2,6}\d{2,6}\b/;

/**
 * 주어진 텍스트 안에서 품명 DB와 일치하는 코드 중 가장 긴(=가장 구체적인) 것을 찾는다.
 * 예: 본문에 "WM5005W"가 있으면 "WM5005"도 부분 일치하지만 더 긴 "WM5005W"를 우선한다.
 */
/**
 * 한 요청서 안에 품목이 여러 개 언급될 수 있어서(예: 합포장 발주), 텍스트에 등장하는 모든 품명
 * DB 매칭 코드를 찾는다. "WM5005"가 "WM5005W"에 부분 포함되는 것처럼 더 긴 코드에 포함되는
 * 짧은 코드는 오탐이므로 제외하고, 본문에 먼저 등장하는 순서대로 정렬해서 반환한다.
 */
function findAllProductMatches(
  products: Array<{ code: string; brand: string | null }>,
  text: string
): Array<{ code: string; brand: string | null }> {
  const upperText = text.toUpperCase();
  const candidates = products.filter(
    (p) => p.code.length >= 3 && upperText.includes(p.code.toUpperCase())
  );
  // 더 긴 코드에 포함되는 짧은 코드(부분일치 오탐)는 제외한다.
  const filtered = candidates.filter(
    (p) =>
      !candidates.some(
        (other) => other.code !== p.code && other.code.length > p.code.length && other.code.toUpperCase().includes(p.code.toUpperCase())
      )
  );
  const seen = new Set<string>();
  const unique = filtered.filter((p) => (seen.has(p.code) ? false : (seen.add(p.code), true)));
  unique.sort((a, b) => upperText.indexOf(a.code.toUpperCase()) - upperText.indexOf(b.code.toUpperCase()));
  return unique;
}

/**
 * 제품코드 매칭에 쓸 본문 텍스트에서 "참고 URL/참고 링크"처럼 비교·참고용으로만 다른 제품이
 * 언급되는 행을 제외한다 — 그런 행까지 그대로 매칭하면 실제 요청 품목이 아닌 참고용 제품
 * 코드가 productName에 섞여 들어간다.
 */
const REFERENCE_LABEL_PATTERN = /참고/;

function buildProductMatchText(rows: string[][]): string {
  return rows
    .filter((row) => !row.some((cell) => REFERENCE_LABEL_PATTERN.test(cell)))
    .map((row) => row.join(" | "))
    .join("\n");
}

/** "최민구 차장님" -> "최민구" (직급/존칭 제거) */
export function baseName(name: string): string {
  const noNim = name.replace(/님\s*$/, "");
  const match = noNim.match(/^([가-힣]{2,4})/);
  return match ? match[1] : noNim.trim();
}

/**
 * rows에서 라벨(예: "요청자")이 있는 셀을 찾아 바로 다음 셀 값을 반환한다.
 * 한 행에 "요청부서 | 영업부 | 요청자 | 최민구" 처럼 라벨:값 쌍이 여러 개
 * 나란히 있을 수 있으므로, 행 전체가 아니라 셀 단위로 스캔해서 다음 셀만 값으로 취급한다.
 */
function findLabelValue(rows: string[][], labels: string[]): string | null {
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) {
      const cellNorm = row[i].replace(/[:：]\s*$/, "").trim();
      if (labels.some((l) => cellNorm.includes(l))) {
        const value = row[i + 1]?.trim();
        if (value) return value;
      }
    }
  }
  return null;
}

function parseDateValue(raw: string): string | null {
  const iso = raw.match(/(\d{4})\s*[-.\/]\s*(\d{1,2})\s*[-.\/]\s*(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // 엑셀 날짜 일련번호 (1899-12-30 기준) 폴백
  const serialMatch = raw.match(/\b(\d{5})\b/);
  if (serialMatch) {
    const serial = parseInt(serialMatch[1], 10);
    if (serial > 20000 && serial < 60000) {
      const ms = (serial - 25569) * 86400 * 1000;
      const date = new Date(ms);
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      const d = String(date.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

function findDateAnywhere(fullText: string): string | null {
  const iso = fullText.match(/(\d{4})\s*[-.\/]\s*(\d{1,2})\s*[-.\/]\s*(\d{1,2})/);
  if (!iso) return null;
  const [, y, m, d] = iso;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** 엑셀 전체 텍스트에 등장하는 날짜(YYYY-MM-DD 형식) 중 가장 늦은 날짜를 마감일로 본다. */
function findLatestDateAnywhere(fullText: string): string | null {
  const matches = fullText.matchAll(/(\d{4})\s*[-.\/]\s*(\d{1,2})\s*[-.\/]\s*(\d{1,2})/g);
  let latestISO: string | null = null;
  let latestTime = -Infinity;
  for (const [, y, m, d] of matches) {
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const time = new Date(iso).getTime();
    if (!Number.isNaN(time) && time > latestTime) {
      latestTime = time;
      latestISO = iso;
    }
  }
  return latestISO;
}

/** ISO 날짜(YYYY-MM-DD)에 일수를 더한다. */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 글자 사이에 공백이 섞여 있어도("상 품 기 술 서") 찾을 수 있도록 느슨하게 포함 여부를 검사한다.
 * phrase의 각 글자 사이에 임의 개수의 공백을 허용하는 정규식을 만들어 검사한다.
 */
function looseIncludes(text: string, phrase: string): boolean {
  const pattern = phrase
    .split("")
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
  return new RegExp(pattern).test(text);
}

function inferDepartment(fullText: string): string {
  if (fullText.includes("상세페이지")) return "마케팅팀";
  if (fullText.includes("배너")) return "영업부";
  if (fullText.includes("설명서") || fullText.includes("패키지") || fullText.includes("카탈로그")) return "무역부";
  return "기타";
}

/**
 * AI(API 키) 없이, 라벨 텍스트 인식 + 노션 캐시(담당자/제품명) 전체 텍스트 매칭으로
 * 엑셀 요청서를 구조화한다. 완전히 다른 라벨 표현이나 이미지로만 있는 항목은 놓칠 수 있음
 * — 이 경우 status: "unprocessable"로 반환되어 대시보드 "확인 필요"에 남는다.
 */
export function interpretExcelRules(input: RuleBasedInput): InterpretResult {
  const { fileBaseName, flattenedText, rows, sheetNames, assignees, products, platforms } = input;
  const notes: string[] = [];

  // 1. 담당자: 노션 캐시 전체 텍스트 매칭 우선, 없으면 라벨 기반 값을 그대로 사용
  let assignee: string | null = null;
  let matchedDepartment: string | null = null;
  const cacheMatches = assignees.filter((a) => flattenedText.includes(baseName(a.name)));
  if (cacheMatches.length === 1) {
    assignee = cacheMatches[0].name;
    matchedDepartment = cacheMatches[0].department;
  } else if (cacheMatches.length > 1) {
    assignee = cacheMatches[0].name;
    matchedDepartment = cacheMatches[0].department;
    notes.push(`담당자 후보 복수(${cacheMatches.map((a) => a.name).join(", ")}) 중 첫 번째로 선택`);
  } else {
    const labelValue = findLabelValue(rows, ASSIGNEE_LABELS);
    if (labelValue) {
      assignee = labelValue.split(/\s+/)[0];
      notes.push("노션 담당자 목록에 없는 이름 — 엑셀 표기 그대로 사용");
    }
  }

  // 2. 부서: 매칭된 담당자의 캐시 부서(노션 "부서" DB) 우선, 없으면 엑셀 라벨/키워드 추론
  let department =
    matchedDepartment || findLabelValue(rows, DEPT_LABELS_PRIMARY) || findLabelValue(rows, DEPT_LABELS_FALLBACK);
  if (!department) department = inferDepartment(flattenedText);

  // 3. 요청일
  let requestDateISO: string | null = null;
  const dateLabelValue = findLabelValue(rows, DATE_LABELS);
  if (dateLabelValue) requestDateISO = parseDateValue(dateLabelValue);
  if (!requestDateISO) requestDateISO = findDateAnywhere(flattenedText);

  // 3-1. 마감일: 엑셀에 등장하는 날짜 중 가장 늦은 날짜(예: 요청완료일자)를 마감일로 본다.
  let dueDateISO = findLatestDateAnywhere(flattenedText);

  // 4. 제품명 (선택 — 노션 품명 캐시와 매칭) — 파일명을 먼저 보고, 파일명에 없을 때만 본문 전체를
  // 본다. 본문에는 "참고 링크"처럼 비교/참고용으로 다른 제품이 언급되는 경우가 있어서, 본문부터
  // 뒤지면 엉뚱한(참고용) 제품이 잘못 매칭될 수 있다 — 파일명엔 보통 실제 요청 제품 코드만 있다.
  let productName: string | null = null;
  let brand: string | null = null;
  let category: string | null = null;
  let newProductCode: string | null = null;
  const fileNameMatches = findAllProductMatches(products, fileBaseName);
  const productMatches =
    fileNameMatches.length > 0 ? fileNameMatches : findAllProductMatches(products, buildProductMatchText(rows));
  if (productMatches.length > 0) {
    // 품목이 여러 개면 전부 DB(Task.productName)에는 저장하고, 화면 표시에서만 줄여 보여준다
    // (칸반 카드는 TaskCard.tsx에서 2개까지 이름 + 3개부터 "N종"으로 축약).
    productName = productMatches.map((p) => p.code).join(", ");
    brand = productMatches[0].brand;
  }

  // 5. 업무요청내용 — 엑셀마다 이 항목이 아예 없거나 표현이 제각각이라 신뢰할 수 없으므로,
  // 항상 파일명을 기준으로 만든다 (담당자/제품명은 계속 엑셀에서 추출).
  // "디자인요청서"/"요청서"는 제품코드 뒤가 아니라 중간에 낄 수도 있으므로(예: "..._디자인요청서_WC5023")
  // 끝이 아니라 어디에 있든 전부 제거한다.
  let requestContent = fileBaseName
    .replace(/^\d{6,8}[_\-\s]*/, "")
    .replace(/(디자인)?요청서/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 제품명은 폴더명에 별도 구간(날짜_요청내용_제품명)으로 이미 붙으므로,
  // 요청내용 안에 제품명이 중복으로 들어가 있으면 제거한다 (품목이 여러 개면 각각 제거).
  if (productName) {
    for (const code of productName.split(",").map((c) => c.trim()).filter(Boolean)) {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      requestContent = requestContent.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "");
    }
    requestContent = requestContent.replace(/\s+/g, " ").trim();
  }

  // 플랫폼명이 언급되어 있으면(노션 플랫폼 DB 기준) platform 필드에 채운다. 엑셀 본문뿐 아니라
  // 파일명 자체에 플랫폼명이 있는 경우도 있어서 둘 다 검사한다.
  // 요청내용에 어떻게/얼마나 포함시킬지는 부서별로 다르므로 아래 각 분기에서 처리한다.
  const mentionedPlatform = platforms.find((p) => flattenedText.includes(p) || fileBaseName.includes(p));
  let platform: string | null = mentionedPlatform || null;

  // 무역(무역부/무역팀): 담당자 부서가 무역부로 확인되면 category는 항상 "디자인자료"다.
  // 품명(제품코드)이 DB에 있는지 여부만으로 신규/수정을 가른다("수정"이라는 단어 유무는 보지
  // 않는다 — 실제로 표현이 제각각이라 신뢰할 수 없었음). 기타로 떨어지는 경우는 없다.
  // - 신규: 품명 DB에 없는 코드 → 엑셀에서 코드를 뽑아 채우고 노션에 등록 대상으로 표시(newProductCode).
  //   예) 20260827_디자인자료(신규)_품명
  // - 수정: 품명 DB에 이미 등록되어 있음. 예) 20260827_디자인자료(수정)_품명
  if (department?.includes("무역")) {
    category = "디자인자료";
    if (!productName) {
      // 새 제품코드도 파일명을 먼저 본다(본문의 참고/비교 문구에서 엉뚱한 코드가 잡히는 것 방지).
      const codeMatch = fileBaseName.match(PRODUCT_CODE_PATTERN) ?? buildProductMatchText(rows).match(PRODUCT_CODE_PATTERN);
      if (codeMatch) {
        const code = codeMatch[0].toUpperCase();
        const alreadyRegistered = products.some((p) => p.code.toUpperCase() === code);
        productName = code;
        if (!alreadyRegistered) newProductCode = code;
      }
      requestContent = "디자인자료(신규)";
    } else {
      requestContent = "디자인자료(수정)";
    }
  } else if (department?.includes("마케팅")) {
    // 마케팅팀: 업무는 상세페이지/배너 두 가지.
    // - 상세페이지: 시트탭(여러 개일 수 있음) 중 하나라도 "상품기술서" 또는 "상세페이지"를 포함하거나,
    //   시트 본문 어딘가에 "상품기술서"라는 문구가 있으면 해당. 담당자마다 양식이 달라 글자 사이에
    //   공백이 섞여 있을 수 있어(예: "상 품 기 술 서") looseIncludes로 느슨하게 검사한다.
    //   예) 20260827_상세페이지_품명
    // - 배너: 상세페이지가 아니면서 플랫폼(노션 플랫폼 DB)이 언급됨. 플랫폼은 요청내용 앞에
    //   공백으로 붙인다. 예) 20260827_플랫폼 업무내용_품명 (품명 없으면 그 구간 생략)
    // - 기타: 어느 쪽도 아님 — 업무명 확인이 필요하다는 메모를 남긴다.
    const isDetailPage =
      sheetNames.some((name) => looseIncludes(name, "상품기술서") || looseIncludes(name, "상세페이지")) ||
      looseIncludes(flattenedText, "상품기술서");
    if (isDetailPage) {
      category = "상세페이지";
      // 품명은 상품기술서 시트의 "모델명" 라벨 옆 셀 값을 쓴다.
      const modelName = findLabelValue(rows, ["모델명"]);
      if (modelName) {
        const alreadyRegistered = products.some((p) => p.code.toUpperCase() === modelName.toUpperCase());
        productName = modelName;
        if (!alreadyRegistered) newProductCode = modelName;
      }
      requestContent = "상세페이지";
      platform = null; // 마케팅팀 상세페이지 업무에는 플랫폼을 붙이지 않는다
      // 상세페이지 업무에는 별도 마감일이 없는 경우가 많다(날짜가 요청일 하나뿐이거나 아예 없음).
      // 이 경우 요청일로부터 3주 후를 기본 마감일로 잡는다.
      if (requestDateISO && (!dueDateISO || dueDateISO === requestDateISO)) {
        dueDateISO = addDaysISO(requestDateISO, 21);
      }
    } else if (mentionedPlatform) {
      category = "배너";
      if (!requestContent.includes(mentionedPlatform)) {
        requestContent = `${mentionedPlatform} ${requestContent}`;
      }
    } else {
      category = "기타";
      notes.push("플랫폼을 찾지 못해 업무명 확인이 필요합니다");
    }
  } else if (department?.includes("영업")) {
    // 영업부/영업팀: 폴더명은 파일명 기반 업무명 위주로 진행한다(신규/수정 등 별도 세분화 없음).
    // 앞에 브랜드(품명 DB 기준 brand)·플랫폼(플랫폼 DB 기준)을 순서대로 공백으로 붙인다.
    // 형식: 날짜_브랜드 플랫폼 업무명_품명 (브랜드/플랫폼이 없으면 그만큼 생략, 공백 join).
    // 업무명 자체(디자인요청서/요청서 제거, 언더바→공백)는 이미 위에서 공통으로 처리됨.
    // 업무명에 브랜드/플랫폼이 이미 들어있으면(파일명 자체에 이미 있었던 경우) 중복으로
    // 또 붙이지 않는다 — 브랜드/플랫폼 각각 없을 때만 앞에 추가해서 항상 1개씩만 나오게 한다.
    // 예) 20260827_위즈웰 네이버 신규 배너 제작_WSC820
    // 파일명이나 본문에 플랫폼(플랫폼 DB 기준)이 있으면 category를 "배너"로 채운다 — 이게
    // 프로젝트 자동 배정 기준이 되어 "배너" 프로젝트로 묶인다(없으면 계속 미지정 → "기타").
    if (mentionedPlatform) category = "배너";
    const prefixParts = [brand, mentionedPlatform]
      .filter((v): v is string => Boolean(v))
      .filter((v) => !requestContent.includes(v));
    if (prefixParts.length > 0) {
      requestContent = `${prefixParts.join(" ")} ${requestContent}`.trim();
    }
  } else if (mentionedPlatform && requestContent && !requestContent.includes(mentionedPlatform)) {
    // 위 세 부서에 해당하지 않는 경우의 기존 동작(플랫폼이 언급되면 요청내용 앞에 붙임)을 유지한다.
    requestContent = `${mentionedPlatform} ${requestContent}`;
  }

  if (requestContent && requestContent.length > 50) {
    requestContent = requestContent.slice(0, 50).trim();
  }

  // 요청일을 끝내 찾지 못해도 폴더/업무 생성 자체는 막지 않고 오늘 날짜로 대체해서 진행한다.
  if (!requestDateISO) {
    requestDateISO = new Date().toISOString().slice(0, 10);
    notes.push("요청일을 찾지 못해 오늘 날짜로 대체했습니다");
  }

  if (!assignee || !requestContent) {
    const missing = [!assignee && "담당자", !requestContent && "업무요청내용"].filter(Boolean).join(", ");
    return {
      status: "unprocessable",
      reason: `필수 항목을 찾지 못함: ${missing}`,
      confidenceNote: notes.join(" / ") || undefined,
    };
  }

  return {
    status: "ok",
    assignee,
    department: department || undefined,
    brand: brand || undefined,
    productName: productName || undefined,
    category: category || undefined,
    platform: platform || undefined,
    newProductCode: newProductCode || undefined,
    requestContent,
    requestDateISO,
    dueDateISO: dueDateISO || undefined,
    confidenceNote: notes.join(" / ") || undefined,
  };
}
