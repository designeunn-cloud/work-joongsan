"use client";

import { useMemo, useRef, useState } from "react";
import type { MasterData, Project } from "@/lib/clientTypes";
import { toISODate } from "@/lib/dateHelpers";
import { parseShippingNotice } from "@/lib/shippingNotice";
import type { NewTaskInput } from "./AddTaskModal";
import Combobox from "./Combobox";
import MultiCombobox, { type MultiComboboxHandle } from "./MultiCombobox";
import { Field } from "./Primitives";
import { getTaskWorkCategory } from "@/lib/workCategories";
import { type ProductionType } from "@/lib/productionTypes";
import ProductionTypeField from "./ProductionTypeField";
import NoticeTemplatePicker from "./NoticeTemplatePicker";

const ASSIGNEE_STORAGE_KEY = "shipping-notice:last-assignee";

function rememberedAssignee() {
  try {
    return typeof window === "undefined" ? "" : window.localStorage.getItem(ASSIGNEE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function NoticeQuickRegistration({ master, projects, onCancel, onSubmit }: {
  master: MasterData;
  projects: Project[];
  onCancel: () => void;
  onSubmit: (data: NewTaskInput) => Promise<void>;
}) {
  const [source, setSource] = useState("");
  const [productNames, setProductNames] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [productionType, setProductionType] = useState<ProductionType | "">("");
  const [requestContent, setRequestContent] = useState("");
  const [assignee, setAssignee] = useState(rememberedAssignee);
  const [dueDateISO, setDueDateISO] = useState("");
  const [splitByProduct, setSplitByProduct] = useState(false);
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [templateLoadVersion, setTemplateLoadVersion] = useState(0);
  const productNamesRef = useRef<MultiComboboxHandle>(null);
  const productsEdited = useRef(false);
  const project = projects.find((item) => item.id === projectId);
  const codes = useMemo(() => [...new Set(master.products.map((product) => product.code))], [master.products]);
  const year = new Date().getFullYear();
  const parsed = useMemo(() => parseShippingNotice(source, codes, year), [source, codes, year]);
  const needsDateConfirmation = parsed.dates.length > 0 && parsed.needsDateConfirmation;
  const today = toISODate(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = toISODate(tomorrow);
  const unknownProducts = productNames.filter((code) => !codes.some((known) => known.toUpperCase() === code.toUpperCase()));

  function updateSource(value: string) {
    setSource(value);
    if (!productsEdited.current) setProductNames(parseShippingNotice(value, codes, year).productNames);
    setDateConfirmed(false);
    setError("");
  }

  function selectProject(id: string) {
    const previousProjectName = projects.find(item => item.id === projectId)?.name ?? "";
    setProjectId(id);
    if (!requestContent.trim() || requestContent === previousProjectName) {
      setRequestContent(projects.find((item) => item.id === id)?.name ?? "");
    }
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const pending = productNamesRef.current?.flushPending();
    const finalProducts = [...new Set([...productNames, ...(pending ? [pending] : [])].map((name) =>
      codes.find((code) => code.toUpperCase() === name.trim().toUpperCase()) ?? name.trim()
    ).filter(Boolean))];
    if (!project || !source.trim() || !assignee.trim() || !requestContent.trim() || !dueDateISO) return;
    if (needsDateConfirmation && !dateConfirmed) { setError("원문에 포함된 일정을 확인해주세요."); return; }
    setError("");
    setSubmitting(true);
    const department = master.assignees.find((person) => person.name === assignee)?.department ?? project.department ?? "기타";
    const brands = [...new Set(master.products.filter((product) => finalProducts.includes(product.code)).map((product) => product.brand).filter(Boolean))];
    try {
      await onSubmit({
        assignee: assignee.trim(), department, brand: brands.length === 1 ? brands[0]! : "",
        productName: finalProducts.join(", "), platform: "", tags: "", memo: "", referenceMemo: source,
        projectId: project.id, requestContent: requestContent.trim(),
        productionType: productionType || null,
        requestDateISO: dueDateISO, dueDateISO,
        noticeRegistration: true, splitByProduct: splitByProduct && finalProducts.length > 1,
      });
      try { window.localStorage.setItem(ASSIGNEE_STORAGE_KEY, assignee.trim()); } catch { /* 저장이 막혀도 업무 등록은 유지한다. */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "업무 등록에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const templateDraft = {
    source, projectId: projectId || null, requestContent, productionType: productionType || null,
    productNames, assignee, dueDateISO, splitByProduct, dateConfirmed,
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <NoticeTemplatePicker
        disabled={submitting}
        draft={templateDraft}
        getDraft={() => {
          const pending = productNamesRef.current?.flushPending();
          return { ...templateDraft,
            productNames: [...new Set([...productNames, ...(pending ? [pending] : [])])] };
        }}
        hasDraft={!!(source.trim() || projectId || requestContent.trim() || assignee.trim() || dueDateISO || productNames.length || productionType || splitByProduct || dateConfirmed)}
        onLoad={template => {
          productsEdited.current = true;
          updateSource(template.source);
          setProductNames([...(template.productNames ?? [])]);
          setTemplateLoadVersion(version => version + 1);
          setProjectId(projects.some(item => item.id === template.projectId) ? template.projectId! : "");
          setRequestContent(template.requestContent);
          setProductionType(template.productionType ?? "");
          setAssignee(template.assignee ?? "");
          setDueDateISO(template.dueDateISO ?? "");
          setSplitByProduct(template.splitByProduct ?? false);
          setDateConfirmed(template.dateConfirmed ?? false);
          if (template.projectId && !projects.some(item => item.id === template.projectId)) setError("저장된 프로젝트가 삭제되었습니다. 프로젝트를 다시 선택해주세요.");
        }}
      />
      {!projects.length && <p role="alert" className="text-sm text-red-600">프로젝트를 먼저 등록해주세요.</p>}
      <fieldset disabled={submitting} className="space-y-4 disabled:opacity-70">
        <Field label="프로젝트">
          <select aria-label="공지 프로젝트" value={projectId} onChange={(event) => selectProject(event.target.value)} required className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
            <option value="">프로젝트 선택</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <p className="text-xs text-neutral-600">업무분류 · {getTaskWorkCategory({ project, department: master.assignees.find((person) => person.name === assignee)?.department }) ?? "미지정"}</p>
        <ProductionTypeField value={productionType} onChange={setProductionType} />
        <textarea
          value={source} onChange={(event) => updateSource(event.target.value)} rows={4} required
          aria-label="공지 원문" placeholder="공지 내용을 붙여넣어주세요. 품명이나 날짜가 없어도 등록할 수 있습니다."
          className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm leading-6 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <p className="-mt-2 text-xs text-neutral-500">붙여넣은 원문은 메모에 그대로 저장됩니다.</p>

          <div className="space-y-3">
            <Field label="품명 (선택)">
              <MultiCombobox key={templateLoadVersion} inputLabel="품명" ref={productNamesRef} values={productNames} onChange={values => { productsEdited.current = true; setProductNames(values); }} options={codes} placeholder="목록에 없으면 품명을 직접 입력" />
            </Field>
            {unknownProducts.length > 0 && <p className="text-xs text-neutral-500">직접 입력한 품명으로 저장됩니다: {unknownProducts.join(", ")}</p>}
            <Field label="업무요청내용">
              <input value={requestContent} onChange={(event) => setRequestContent(event.target.value)} placeholder="프로젝트를 선택하면 프로젝트명이 입력됩니다" required className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm" />
            </Field>
            {parsed.dates.length > 0 && <div>
              <p className="text-xs font-medium text-neutral-600 mb-1">원문에 포함된 날짜</p>
              <div className="flex flex-wrap gap-1.5">
                {parsed.dates.length ? parsed.dates.map((date, index) => (
                  <span key={index} className={`rounded-lg px-2 py-1 text-xs ${date.iso ? "bg-white text-neutral-700" : "bg-amber-50 text-amber-700"}`}>
                    {date.iso ? date.iso.replaceAll("-", ".") : `${date.raw} · 날짜 확인 필요`}
                  </span>
                )) : null}
              </div>
              <p className="text-xs text-neutral-500 mt-1.5">원문 날짜는 참고용이며, 업무의 요청일은 아래에서 따로 선택합니다.{parsed.dates.some((date) => date.inferredYear) && ` 연도가 없는 날짜는 ${year}년 기준으로 표시해요.`}</p>
              {needsDateConfirmation && (
                <label className="mt-2 flex items-start gap-2 text-xs text-amber-800">
                  <input type="checkbox" checked={dateConfirmed} onChange={(event) => setDateConfirmed(event.target.checked)} required className="mt-0.5 accent-indigo-600" />
                  <span>{parsed.dates.length > 1 ? "날짜가 여러 개 있어요. 원문 일정을 확인했습니다." : "불분명한 원문 일정을 확인했습니다."}</span>
                </label>
              )}
            </div>}
          </div>

        <Field label="담당자">
          <Combobox inputLabel="담당자" value={assignee} onChange={setAssignee} options={master.assignees.map((person) => person.name)} placeholder="담당자 선택 · 다음 등록에도 기억해요" required />
        </Field>
        <div>
          <p className="text-xs text-neutral-600 mb-1">요청일</p>
          <div className="flex flex-wrap items-center gap-2">
            {[{ label: "오늘", value: today }, { label: "내일", value: tomorrowISO }].map((option) => (
              <button type="button" key={option.label} onClick={() => setDueDateISO(option.value)} className={`rounded-lg border px-3 py-1.5 text-sm ${dueDateISO === option.value ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-neutral-300 hover:bg-neutral-50"}`}>{option.label}</button>
            ))}
            <label className="text-xs text-neutral-500">직접 선택
              <input aria-label="공지 작업 요청일" type="date" value={dueDateISO} onChange={(event) => setDueDateISO(event.target.value)} required className="ml-2 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-800" />
            </label>
          </div>
        </div>
        {productNames.length > 1 && <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={splitByProduct} onChange={(event) => setSplitByProduct(event.target.checked)} className="accent-indigo-600" />제품별로 나누어 등록
        </label>}
        {source.trim() && <p className="text-xs text-neutral-500">{splitByProduct && productNames.length > 1 ? `품명별 업무 ${productNames.length}개를 등록합니다. 담당자·요청일·원문은 함께 적용됩니다.` : productNames.length ? "선택한 품명을 하나의 업무로 묶어 등록합니다." : "품명 없이 업무 1건으로 등록합니다."}</p>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
        <button type="button" onClick={onCancel} disabled={submitting} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50">취소</button>
        <button type="submit" disabled={submitting || !project || !requestContent.trim() || !source.trim() || !assignee.trim() || !dueDateISO || (needsDateConfirmation && !dateConfirmed)} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">{submitting ? "등록 중..." : "업무 등록"}</button>
      </div>
    </form>
  );
}
