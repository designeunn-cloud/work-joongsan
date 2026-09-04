import Anthropic from "@anthropic-ai/sdk";
import type { InterpretResult } from "./types";

export type { InterpretResult };

export interface InterpretInput {
  fileName: string;
  fileBaseName: string;
  extractedText: string;
  sheetNames: string[];
  assignees: Array<{ name: string; department: string | null }>; // 노션 담당자 캐시
  products: Array<{ code: string; brand: string | null }>; // 노션 품명 캐시
  platforms: string[]; // 노션 플랫폼 캐시
}

const TOOL_NAME = "submit_task_extraction";

function buildSystemPrompt(input: InterpretInput): string {
  const assigneeList =
    input.assignees.length > 0
      ? input.assignees.map((a) => (a.department ? `${a.name}(${a.department})` : a.name)).join(", ")
      : "(캐시 없음 — 노션 동기화 필요)";
  const productList =
    input.products.length > 0
      ? input.products.map((p) => `${p.code}${p.brand ? `(${p.brand})` : ""}`).join(", ")
      : "(캐시 없음 — 노션 동기화 필요)";

  return `너는 사내 디자인 업무 요청서(엑셀)를 읽고 구조화하는 어시스턴트다.
회사는 마케팅팀(상세페이지 요청), 영업부(배너 요청, 플랫폼: 네이버/쿠팡/마켓컬리/홈쇼핑 등 다양), 무역부(설명서/패키지 요청) 세 부서에서 요청서가 들어온다.
엑셀 양식은 부서/작성자마다 레이아웃이 완전히 다르므로, 셀 위치가 아니라 내용을 보고 의미를 파악해야 한다.

# 참고 마스터데이터
- 담당자 목록 (이름 뒤에 직급이 붙어있을 수 있음, 예: "최민구 차장님"): ${assigneeList}
- 제품명/제품코드 목록 (브랜드: 엑사이더/위즈웰): ${productList}
- 엑셀 시트탭 이름 목록: ${input.sheetNames.join(", ")}
- 플랫폼 목록: ${input.platforms.length > 0 ? input.platforms.join(", ") : "(캐시 없음 — 노션 동기화 필요)"}

# 추출 규칙
1. 담당자: 엑셀에 적힌 이름(직급 없이 성명만 있을 수 있음)을 위 담당자 목록과 매칭해서 목록에 있는 정확한 표기로 반환한다. 목록에 없으면 엑셀에 적힌 이름 그대로 사용한다.
2. 부서: 위 담당자 목록에 표기된 부서를 우선 참고하고("무역부"/"무역팀", "영업부"/"영업팀" 등 표기가 달라도 "무역"/"영업"이 포함되면 그 부서로 판단), 없으면 엑셀 내용(요청부서/협조부서 등)을 보고 마케팅팀/영업부/무역부/기타 중 하나로 판단한다.
3. 제품명: **파일명(${input.fileBaseName})을 우선 확인**해서 위 제품명 목록과 일치하는 코드가 있으면 그걸 쓴다. 파일명에 없을 때만 본문 전체에서 찾는다 — 본문에는 "참고 링크"/"참고 상세페이지"처럼 비교·참고용으로 다른 제품이 언급되는 경우가 많아서, 본문부터 찾으면 실제 요청 제품이 아니라 참고용 제품이 잘못 잡힐 수 있다. 매칭되는 제품이 없거나 애초에 요청서에 특정 제품이 언급되지 않으면 productName은 비워둔다(제품명은 없어도 됨. 억지로 만들지 말 것). 단, 5번(무역부 신규)/9번(마케팅 상세페이지) 규칙에 해당하면 목록에 없어도 엑셀에 적힌 코드/모델명을 그대로 채운다.
4. 업무요청내용: 엑셀마다 이 항목이 아예 없거나 표현이 제각각이라 신뢰할 수 없으므로, 항상 파일명(${input.fileBaseName})을 기준으로 판단한다 (엑셀 셀 내용은 참고하지 않는다). 요청내용에 위 플랫폼 목록에 있는 이름이 파일명이나 본문에 언급되어 있으면 반드시 포함시킨다. 제품명(productName)은 폴더명에 별도 구간으로 이미 붙으므로 업무요청내용 안에 제품명/제품코드를 중복으로 넣지 않는다. 15~25자 내외의 짧은 구로 정리하되 핵심 키워드는 유지한다.
4-1. platform: 파일명이나 본문에 위 플랫폼 목록의 이름이 언급되어 있으면 그 값을 채운다(마케팅팀/영업부 배너 업무에 특히 자주 붙는다). 단, 9번 규칙(마케팅팀 상세페이지)에 해당하면 platform은 항상 비워둔다.
5. 부서가 무역부인 경우 category는 항상 "디자인자료"로 채운다(기타로 바꾸지 않는다). 제품코드가
   위 제품명 목록(DB)에 있는지 여부만으로 신규/수정을 가른다 — "수정"이라는 단어가 본문에
   있는지는 보지 않는다(표현이 제각각이라 신뢰할 수 없음):
   - 제품코드가 목록에 없으면(아직 등록 안 된 신규 제품) 업무요청내용을 "디자인자료(신규)"로 하고, productName/newProductCode에 엑셀에 적힌 코드를 그대로 채운다(신규라 목록엔 없지만 코드 자체는 폴더명에 필요).
   - 제품코드가 목록에 이미 있으면 업무요청내용을 "디자인자료(수정)"로 한다.
6. 요청일: 엑셀에 명시된 요청일자를 ISO 형식(YYYY-MM-DD)으로 변환한다. 엑셀 날짜가 숫자(예: 45712 같은 5자리 정수)로 보이면 엑셀 날짜 일련번호로 간주하고 변환한다 (1899-12-30을 0일로 하는 날짜 체계). 요청일을 전혀 알 수 없으면 status를 "unprocessable"로 설정한다.
7. 마감일(dueDateISO): 엑셀 전체에 등장하는 날짜들 중 가장 늦은(미래) 날짜를 마감일로 판단한다(예: "요청일자 2026-08-27, 요청완료일자 2026-08-31"이면 2026-08-31이 마감일). 날짜가 하나뿐이면 그 날짜를 그대로 마감일로 채운다.
8. 부서가 마케팅팀인 경우: 위 시트탭 이름 목록 중 하나라도 "상품기술서" 또는 "상세페이지"를 포함하면 category를 "상세페이지"로(9번 규칙 적용, 예: "20260827_상세페이지_품명"). 그렇지 않을 때 플랫폼 목록의 이름이 본문/파일명에 언급되어 있으면 category를 "배너"로 하고, 업무요청내용 맨 앞에 그 플랫폼명을 **공백으로** 붙인다(예: 업무요청내용이 "신규 제작"이고 플랫폼이 "네이버"면 "네이버 신규 제작" → 폴더명 "20260827_네이버 신규 제작_품명"). 둘 다 아니면 category를 "기타"로 하고 confidenceNote에 "플랫폼을 찾지 못해 업무명 확인이 필요합니다"를 적는다.
8-1. 부서가 영업부인 경우: 파일명이나 본문에 플랫폼(위 플랫폼 목록 기준)이 있으면 category를 "배너"로 채운다(프로젝트 자동 분류 기준이 됨). 플랫폼을 못 찾으면 category는 비워둔다. 업무요청내용(파일명 기반) 맨 앞에 브랜드(위 제품명 목록에서 매칭된 브랜드)와 플랫폼(위 플랫폼 목록에서 매칭된 이름)을 **이 순서로, 공백으로** 붙인다 — "브랜드 플랫폼 업무명" 형태(마케팅팀/무역부와 달리 밑줄이 아니라 공백). 브랜드나 플랫폼을 못 찾으면 그만큼 생략하고 나머지만 공백으로 붙인다(예: "위즈웰 네이버 신규 배너 제작" → 폴더명 "20260827_위즈웰 네이버 신규 배너 제작_품명"). **브랜드나 플랫폼이 파일명(업무요청내용)에 이미 포함돼 있으면 중복으로 앞에 또 붙이지 않는다** — 브랜드/플랫폼 각각 한 번씩만 나오게 한다. 업무요청내용에는 "디자인요청서"/"디자인 요청서"/"요청서" 같은 문구가 들어가지 않게 한다.
9. category가 "상세페이지"인 경우, 업무요청내용을 "상세페이지"로 고정하고, productName은 그 시트에서 "모델명" 라벨 옆에 적힌 값을 그대로 채운다(품명 목록에 없는 새 모델이어도 그대로 채운다). 이 모델명이 위 제품명 목록에 없는 새 코드라면 newProductCode에도 동일한 값을 채운다(목록에 이미 있으면 newProductCode는 비워둔다). platform은 채우지 않는다(상세페이지 업무에는 플랫폼을 붙이지 않음). 상세페이지 업무는 엑셀에 별도 마감일이 없는 경우가 많다 — dueDateISO가 없거나 요청일과 같은 날짜뿐이라면(즉 실질적으로 마감일이 따로 명시 안 됨) 요청일로부터 3주(21일) 후를 기본 마감일로 채운다.
10. 담당자, 업무요청내용, 요청일 중 하나라도 합리적으로 판단할 수 없으면 status를 "unprocessable"로 설정하고 reason에 구체적인 사유(어떤 필드를 못 찾았는지)를 적는다. 애매하게 추측해서 채우지 말고, 확신이 없으면 unprocessable로 분류하라.
11. status가 "ok"면 반드시 assignee, department, requestContent, requestDateISO를 채운다.

submit_task_extraction 도구를 호출해서 결과를 반환하라. 다른 텍스트는 출력하지 마라.`;
}

export async function interpretExcel(input: InterpretInput): Promise<InterpretResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다 (.env 확인)");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 1024,
    system: buildSystemPrompt(input),
    messages: [
      {
        role: "user",
        content: `파일명: ${input.fileName}\n\n[엑셀 추출 텍스트]\n${input.extractedText || "(텍스트 없음 — 빈 시트이거나 모든 내용이 이미지일 수 있음)"}`,
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "엑셀 업무요청서 해석 결과를 구조화해서 반환한다.",
        input_schema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ok", "unprocessable"] },
            reason: { type: "string", description: "status가 unprocessable일 때 사유" },
            assignee: { type: "string" },
            department: { type: "string", enum: ["마케팅팀", "영업부", "무역부", "기타"] },
            brand: { type: "string", enum: ["엑사이더", "위즈웰"] },
            productName: { type: "string" },
            category: {
              type: "string",
              enum: ["상세페이지", "배너", "디자인자료", "기타"],
              description: "마케팅팀: 상세페이지/배너/기타, 무역부: 디자인자료. 영업부는 category를 비워둔다(세분화 없음).",
            },
            platform: { type: "string", description: "언급된 플랫폼명. 마케팅팀 상세페이지 업무는 항상 비워둠" },
            newProductCode: { type: "string", description: "품명 목록에 없는 새 모델명 — 있으면 노션에 등록됨" },
            requestContent: { type: "string" },
            requestDateISO: { type: "string", description: "YYYY-MM-DD" },
            dueDateISO: { type: "string", description: "YYYY-MM-DD, 엑셀에 등장하는 날짜 중 가장 늦은 날짜" },
            confidenceNote: { type: "string", description: "해석하면서 애매했던 부분에 대한 짧은 메모 (선택)" },
          },
          required: ["status"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    return { status: "unprocessable", reason: "AI가 구조화된 응답을 반환하지 않았습니다." };
  }

  return toolUse.input as InterpretResult;
}
