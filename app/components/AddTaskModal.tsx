"use client";

import { useState } from "react";
import { toISODate } from "@/lib/dateHelpers";
import type { MasterData, Project } from "@/lib/clientTypes";
import { Field } from "./Primitives";
import Modal from "./Modal";
import Combobox from "./Combobox";
import QuickDatePicker from "./QuickDatePicker";

const DEPARTMENTS = ["마케팅팀", "영업부", "무역부", "기타"];
const BRANDS = ["엑사이더", "위즈웰"];

export interface NewTaskInput {
  assignee: string;
  department: string;
  brand: string;
  productName: string;
  platform: string;
  tags: string;
  memo: string;
  projectId: string;
  requestContent: string;
  requestDateISO: string;
  startDateISO: string;
}

export default function AddTaskModal({
  master,
  projects,
  onCancel,
  onSubmit,
  onUpload,
}: {
  master: MasterData;
  projects: Project[];
  onCancel: () => void;
  onSubmit: (data: NewTaskInput) => void;
  onUpload: (file: File) => void;
}) {
  const today = toISODate(new Date());
  const [mode, setMode] = useState<"manual" | "excel">("manual");
  const [assignee, setAssignee] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [brand, setBrand] = useState("");
  const [productName, setProductName] = useState("");
  const [platform, setPlatform] = useState("");
  const [tags, setTags] = useState("");
  const [memo, setMemo] = useState("");
  const [projectId, setProjectId] = useState("");
  const [requestContent, setRequestContent] = useState("");
  const [requestDateISO, setRequestDateISO] = useState(today);
  const [startDateISO, setStartDateISO] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);

  function handleAssigneeChange(value: string) {
    setAssignee(value);
    const match = master.assignees.find((a) => a.name === value);
    if (match?.department) setDepartment(match.department);
  }

  function handleProductNameChange(value: string) {
    setProductName(value);
    const match = master.products.find((p) => p.code === value);
    if (match?.brand) setBrand(match.brand);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignee.trim() || !requestContent.trim() || !requestDateISO) return;
    setSubmitting(true);
    try {
      await onSubmit({
        assignee,
        department,
        brand,
        productName,
        platform,
        tags,
        memo,
        projectId,
        requestContent,
        requestDateISO,
        startDateISO: startDateISO || today,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!excelFile) return;
    setSubmitting(true);
    try {
      await onUpload(excelFile);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onCancel} widthClassName="max-w-md">
      <h2 className="text-lg font-bold mb-4">새 업무 등록</h2>
        <div className="flex gap-4 border-b border-neutral-200 mb-4 -mt-1">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`text-sm font-medium pb-2 border-b-2 -mb-px ${
              mode === "manual" ? "border-indigo-600 text-indigo-600" : "border-transparent text-neutral-500"
            }`}
          >
            직접 입력
          </button>
          <button
            type="button"
            onClick={() => setMode("excel")}
            className={`text-sm font-medium pb-2 border-b-2 -mb-px ${
              mode === "excel" ? "border-indigo-600 text-indigo-600" : "border-transparent text-neutral-500"
            }`}
          >
            엑셀 업로드
          </button>
        </div>

        {mode === "excel" ? (
          <form onSubmit={handleUploadSubmit} className="space-y-3">
            <Field label="엑셀 파일 (xlsx/xls/xlsm)">
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm"
                onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
                required
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="text-sm px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || !excelFile}
                className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {submitting ? "업로드 중..." : "업로드"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">

            <Field label="프로젝트 (선택)">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">-</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex gap-2">
              <Field label="시작일">
                <QuickDatePicker valueISO={startDateISO} onChange={setStartDateISO} />
              </Field>
              <Field label="요청일">
                <QuickDatePicker valueISO={requestDateISO} onChange={setRequestDateISO} />
              </Field>
            </div>

            <div className="flex gap-2">

            <Field label="담당자">
              <Combobox
                value={assignee}
                onChange={handleAssigneeChange}
                options={master.assignees.map((a) => a.name)}
                required
              />
            </Field>

            <Field label="부서">
              <input
                list="department-list"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
              />
              <datalist id="department-list">
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </Field>
            </div>

           <div className="flex gap-2 w-full">

            <Field label="제품명 (선택)">
              <Combobox
                value={productName}
                onChange={handleProductNameChange}
                options={Array.from(new Set(master.products.map((p) => p.code)))}
              />
            </Field>
            <Field label="브랜드 (선택)">
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="">-</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            </div>


            <Field label="플랫폼 (선택)">
              <Combobox value={platform} onChange={setPlatform} options={master.platforms} />
            </Field>

            <Field label="태그 (콤마로 구분, 선택)">
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="예: 급함, 재작업"
                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
              />
            </Field>


            <Field label="업무요청내용">
              <input
                value={requestContent}
                onChange={(e) => setRequestContent(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                required
              />
            </Field>

            <Field label="메모 (선택)">
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm resize-none"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="text-sm px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {submitting ? "등록 중..." : "등록"}
              </button>
            </div>
          </form>
        )}
    </Modal>
  );
}
