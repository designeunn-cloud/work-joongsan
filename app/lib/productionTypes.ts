/** 사용자가 직접 지정하는 제작 구분. 작업시간 측정용 workType과는 별개다. */
export const PRODUCTION_TYPES = ["신규제작", "수정", "부분 신규제작"] as const;

export type ProductionType = typeof PRODUCTION_TYPES[number];

export function isProductionType(value: unknown): value is ProductionType {
  return typeof value === "string" && PRODUCTION_TYPES.some((type) => type === value);
}
