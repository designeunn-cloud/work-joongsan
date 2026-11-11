"use client";
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import WorkTimeInlineInput from "./WorkTimeInlineInput";
import { koreaDate, roundedHours, splitDays } from "@/lib/workTime";
type Timer = { taskId: string | null; taskName: string; runningSince: string | null; serverNow: string };
type Day = { hours: number | null; seconds: number; source: string | null };
const Context = createContext<{ timer: Timer | null; busy: boolean; version: number; error: string; act: (body: Record<string, unknown>) => Promise<boolean> } | null>(null);
const button = "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50";
export function WorkTimeProvider({ children }: { children: ReactNode }) {
  const [timer, setTimer] = useState<Timer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(async () => {
    try { const res = await fetch("/api/work-time"); if (res.ok) setTimer((await res.json()).timer); } catch { /* Next action displays an actionable error. */ }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const interval = setInterval(() => void refresh(), 10000);
    const update = () => { setVersion(v => v + 1); void refresh(); };
    window.addEventListener("work-time-updated", update);
    window.addEventListener("focus", update);
    return () => { clearTimeout(initial); clearInterval(interval); window.removeEventListener("work-time-updated", update); window.removeEventListener("focus", update); };
  }, [refresh]);
  async function act(body: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/work-time", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTimer(data.timer); window.dispatchEvent(new Event("work-time-updated")); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다. 다시 시도해주세요."); return false; }
    finally { setBusy(false); }
  }
  return <Context.Provider value={{ timer, busy, version, error, act }}>{children}
    {error && <div role="alert" className="fixed bottom-28 left-4 right-4 z-[70] mx-auto flex max-w-xl items-center justify-between gap-3 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700">{error}<button className={button} onClick={() => setError("")}>닫기</button></div>}
    {timer?.taskId && <><aside aria-label="업무 시간 측정 바" className="fixed bottom-0 left-0 right-0 z-40 flex flex-wrap items-center justify-center gap-3 border-t border-indigo-200 bg-white px-4 py-3 shadow-lg">
      <div className="min-w-0 max-w-sm"><p className="text-xs font-medium text-indigo-700">{timer.runningSince ? "측정 중" : "일시정지"} · {koreaDate()}</p><p className="truncate text-sm text-neutral-800">{timer.taskName}</p></div>
      <TimerTotal taskId={timer.taskId} />
      <button className={button} disabled={busy} onClick={() => void act({ action: timer.runningSince ? "pause" : "resume", taskId: timer.taskId })}>{timer.runningSince ? "일시정지" : "재개"}</button>
      <button className={button} disabled={busy} onClick={() => void act({ action: "stop", taskId: timer.taskId })}>종료·저장</button>
    </aside></>}
  </Context.Provider>;
}
function useWorkTime() { const value = useContext(Context); if (!value) throw new Error("WorkTimeProvider is required"); return value; }
function useDay(taskId: string, date: string) {
  const { version } = useWorkTime();
  const [day, setDay] = useState<Day | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/work-time?taskId=${encodeURIComponent(taskId)}&date=${date}`, { signal: controller.signal }).then(async res => { if (!res.ok) throw new Error(); return res.json(); }).then(data => { setDay(data.day); setFailed(false); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [taskId, date, version]);
  return { day, failed };
}
function TimerTotal({ taskId }: { taskId: string }) {
  const { timer } = useWorkTime();
  const date = koreaDate();
  const { day } = useDay(taskId, date);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const seconds = (day?.seconds ?? 0) + (timer?.runningSince ? splitDays(new Date(timer.runningSince), new Date(now)).filter(d => d.dateISO === date).reduce((sum, d) => sum + d.seconds, 0) : 0);
  const total = Math.floor(seconds);
  return <span className="text-sm tabular-nums text-neutral-800">{String(Math.floor(total / 3600)).padStart(2,"0")}:{String(Math.floor(total / 60) % 60).padStart(2,"0")}:{String(total % 60).padStart(2,"0")} <span className="text-xs text-neutral-600">오늘 합계</span></span>;
}
export function WorkTimeEditor({ taskId, taskName = "선택한 업무", date = koreaDate(), compact = false, hours, disabled = false, card = false }: { taskId: string; taskName?: string; date?: string; compact?: boolean; hours?: number | null; disabled?: boolean; card?: boolean }) {
  const { timer, busy: working, error, act } = useWorkTime();
  const busy = working || disabled;
  const { day, failed } = useDay(taskId, date);
  const [open, setOpen] = useState(!compact);
  const [minutes, setMinutes] = useState("");
  const [mode, setMode] = useState("replace");
  const [saved, setSaved] = useState(false);
  const active = timer?.taskId === taskId;
  const valid = minutes.trim() !== "" && Number.isFinite(Number(minutes)) && Number(minutes) >= 0 && Number(minutes) <= 1440;
  const finalSeconds = (mode === "add" ? day?.seconds ?? 0 : 0) + (valid ? Number(minutes) * 60 : 0);
  const displayedHours = hours === undefined ? day?.hours : hours;
  const form = <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-1">{[5,10,30,60,300,480].map(m => <button type="button" key={m} className={button} disabled={busy || active} onClick={() => { setMinutes(String(m)); setSaved(false); }}>{m >= 60 ? `${m / 60}시간` : `${m}분`}</button>)}</div>
      <label className="flex items-center gap-2 text-xs text-neutral-700"><input aria-label="소요시간 분 입력" type="number" min="0" max="1440" step="any" value={minutes} disabled={busy || active} onChange={e => { setMinutes(e.target.value); setSaved(false); }} className="w-20 rounded-lg border border-neutral-300 px-2 py-2" />분 {valid && <span>→ {roundedHours(Number(minutes) * 60)}시간</span>}</label>
      {day?.hours != null && <label className="block text-xs text-neutral-700">기존 {day.hours}시간 <select aria-label="기존 소요시간 처리" className="ml-1 rounded border border-neutral-300 py-1" value={mode} onChange={e => setMode(e.target.value)}><option value="replace">새 값으로 교체</option><option value="add">기존 값에 합산</option></select></label>}
      <button type="button" className={button} disabled={busy || active || !day || !valid || finalSeconds > 86400} onClick={async () => { if (await act({ action: "manual", taskId, date, minutes: Number(minutes), mode })) setSaved(true); }}>시간 즉시 저장</button>
      {valid && <p className="text-sm font-medium text-indigo-800">저장 후 합계: {roundedHours(finalSeconds)}시간{finalSeconds > 86400 && " · 하루 24시간 이내로 입력해주세요"}</p>}
      <p className="text-xs text-neutral-600">이 시간은 앱에 즉시 저장됩니다. 시트 반영은 일지 상단의 동기화 버튼을 눌러주세요.</p>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {saved && <p role="status" className="text-xs text-emerald-700">소요시간을 저장했습니다.</p>}
      {!compact && <><div className="border-t border-neutral-200 pt-3"><button type="button" className={button} disabled={busy || !timer || (!!timer.taskId && !active)} onClick={() => void act({ action: active ? timer?.runningSince ? "pause" : "resume" : "start", taskId })}>{active ? timer?.runningSince ? "일시정지" : "측정 재개" : "시간 측정 시작"}</button>{active && <button type="button" className={`${button} ml-2`} disabled={busy} onClick={() => void act({ action: "stop", taskId })}>종료·저장</button>}</div>
      <p className="text-xs leading-5 text-neutral-600">측정시간은 오늘 기록에 합산됩니다. 상세창을 닫아도 하단에서 조작할 수 있습니다.</p></>}
      {active && compact && <p className="text-xs text-indigo-700">측정 중인 업무입니다. 하단 바에서 종료 후 수정해주세요.</p>}
      <p className="text-[11px] text-neutral-600">누적시간을 0.1시간 단위로 올림합니다.</p>
    </div>;
  return <section aria-label={compact ? "소요시간 빠른 입력" : "오늘 소요시간"} className={compact ? card ? "inline-flex" : "mt-2" : "my-4 rounded-lg border border-neutral-200 p-3"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      {!compact && <h3 className="text-sm font-semibold text-neutral-800">오늘 소요시간 · {day?.hours == null ? "미입력" : `${day.hours}시간`}</h3>}
      {compact ? <WorkTimeInlineInput card={card} taskName={taskName} hours={displayedHours} disabled={busy} active={active} ready={!!day && !failed} onSave={hours=>act({action:"manual",taskId,date,minutes:hours*60,mode:"replace"})}/> : <button type="button" disabled={busy} aria-expanded={open} onClick={()=>setOpen(value=>!value)} className="text-sm text-indigo-700 underline underline-offset-2">{open?"입력 접기":"빠른 입력"}</button>}
    </div>
    {!compact && day?.source && <p className="mt-1 text-[11px] text-neutral-600">{day.source === "manual" ? "직접 입력" : day.source === "mixed" ? "입력 + 측정" : "시간 측정"}</p>}
    {failed && <p role="alert" className="text-xs text-red-700">시간을 불러오지 못했습니다. 다시 열어주세요.</p>}
    {!compact && open && form}
  </section>;
}
