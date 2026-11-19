import { isProductionType, type ProductionType } from "./productionTypes";
import { isValidDateISO } from "./shippingNotice";

export type NoticeTemplateInput = {
  name: string;
  source: string;
  projectId: string | null;
  requestContent: string;
  productionType: ProductionType | null;
  productNames?: string[];
  assignee?: string;
  dueDateISO?: string;
  splitByProduct?: boolean;
  dateConfirmed?: boolean;
};
export type NoticeTemplate = Required<NoticeTemplateInput> & { id: string };

export function validateNoticeTemplate(body: unknown): Required<NoticeTemplateInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("저장할 공지 내용을 확인해주세요.");
  const input = body as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100) throw new Error("공지 이름을 1~100자로 입력해주세요.");
  if (typeof input.source !== "string" || input.source.length > 40000) throw new Error("공지 본문은 40,000자 이내로 입력해주세요.");
  if (typeof input.requestContent !== "string" || input.requestContent.length > 1000) throw new Error("업무요청내용은 1,000자 이내로 입력해주세요.");
  if (input.projectId !== null && (typeof input.projectId !== "string" || !input.projectId || input.projectId.length > 200)) throw new Error("프로젝트를 확인해주세요.");
  if (input.productionType !== null && !isProductionType(input.productionType)) throw new Error("작업구분을 목록에서 선택해주세요.");
  const products = input.productNames ?? [];
  if (!Array.isArray(products) || products.length > 50 || products.some(value => typeof value !== "string" || !value.trim() || value.length > 200)) throw new Error("품명은 200자 이내로 최대 50개까지 저장할 수 있습니다.");
  const assignee = input.assignee === undefined ? "" : input.assignee;
  if (typeof assignee !== "string" || assignee.length > 200) throw new Error("담당자는 200자 이내로 입력해주세요.");
  const dueDateISO = input.dueDateISO === undefined ? "" : input.dueDateISO;
  if (typeof dueDateISO !== "string" || (dueDateISO !== "" && !isValidDateISO(dueDateISO))) throw new Error("유효한 요청일을 선택해주세요.");
  const splitByProduct = input.splitByProduct === undefined ? false : input.splitByProduct;
  const dateConfirmed = input.dateConfirmed === undefined ? false : input.dateConfirmed;
  if (typeof splitByProduct !== "boolean" || typeof dateConfirmed !== "boolean") throw new Error("공지 등록 옵션을 확인해주세요.");
  return { name: input.name.trim(), source: input.source, projectId: input.projectId, requestContent: input.requestContent.trim(), productionType: input.productionType, productNames: [...new Set(products.map(value => (value as string).trim()))], assignee: assignee.trim(), dueDateISO, splitByProduct, dateConfirmed };
}
