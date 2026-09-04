export interface InterpretResult {
  status: "ok" | "unprocessable";
  reason?: string;
  assignee?: string;
  department?: string;
  brand?: string;
  productName?: string;
  category?: string;
  platform?: string;
  /** 품명 DB에 없는 신규 제품 코드 — 있으면 호출부가 노션 품명 DB에 등록해야 함 */
  newProductCode?: string;
  requestContent?: string;
  requestDateISO?: string;
  dueDateISO?: string;
  confidenceNote?: string;
}
