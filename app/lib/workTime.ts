export function roundedHours(seconds: number) {
  return Math.ceil(seconds / 360) / 10;
}
export function koreaDate(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export function splitDays(start: Date, end: Date) {
  const days: Array<{ dateISO: string; seconds: number }> = [];
  let cursor = start.getTime();
  while (cursor < end.getTime()) {
    const dateISO = koreaDate(new Date(cursor));
    const midnight = new Date(`${dateISO}T00:00:00+09:00`).getTime() + 86400000;
    const next = Math.min(midnight, end.getTime());
    days.push({ dateISO, seconds: (next - cursor) / 1000 });
    cursor = next;
  }
  return days;
}
