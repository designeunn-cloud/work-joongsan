export function buildManualRequestFileContent(params: {
  assignee: string;
  department?: string | null;
  brand?: string | null;
  productName?: string | null;
  requestContent: string;
  requestDateISO: string;
  startDateISO?: string;
}): string {
  const lines = [
    "업무 요청서 (수동 등록)",
    "",
    `담당자: ${params.assignee}`,
    `부서: ${params.department || "-"}`,
    `브랜드: ${params.brand || "-"}`,
    `제품명: ${params.productName || "-"}`,
    `요청일: ${params.requestDateISO}`,
    `시작일: ${params.startDateISO || "-"}`,
    `요청내용: ${params.requestContent}`,
    "",
    `등록 시각: ${new Date().toLocaleString("ko-KR")}`,
  ];
  return lines.join("\n");
}
