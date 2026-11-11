"use client";

import { useState } from "react";
import { toISODate } from "@/lib/dateHelpers";
import type { MasterData, Project, Task } from "@/lib/clientTypes";
import { Field } from "./Primitives";
import Modal from "./Modal";
import Combobox from "./Combobox";

const DEPARTMENTS = ["마케팅팀", "영업부", "무역부", "기타"];
const BRANDS = ["엑사이더", "위즈웰"];

export interface EditTaskInput {
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
}

export default function EditTaskModal({
  task,
  master,
  projects,
  onCancel,
  onSubmit,
}: {
  task: Task;
  master: MasterData;
  projects: Project[];
  onCancel: () => void;
  onSubmit: (data: EditTaskInput) => void;
}) {
  const [assignee, setAssignee] = useState(task.assignee);
  const [department, setDepartment] = useState(task.department ?? "");
  const [brand, setBrand] = useState(task.brand ?? "");
  const [productName, setProductName] = useState(task.productName ?? "");
  const [platform, setPlatform] = useState(task.platform ?? "");
  const [tags, setTags] = useState(task.tags ?? "");
  const [memo, setMemo] = useState(task.memo ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [requestContent, setRequestContent] = useState(task.requestContent);
  const [requestDateISO, setRequestDateISO] = useState(task.requestDate ? toISODate(new Date(task.requestDate)) : "");
  const [submitting, setSubmitting] = useState(false);

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
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onCancel} widthClassName="max-w-md">
      <h2 className="text-lg font-bold mb-4">업무 수정</h2>
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
                list="edit-department-list"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
              />
              <datalist id="edit-department-list">
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

          <Field label="요청일">
            <input
              type="date"
              value={requestDateISO}
              onChange={(e) => setRequestDateISO(e.target.value)}
              className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
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
              disabled={submitting}
              className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
    </Modal>
  );
}
