export function StatIcon({ name }: { name: "calendar" | "alert" | "check" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "calendar") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }
  if (name === "alert") {
    return (
      <svg {...common}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m22 4-10 10.01-3-3" />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "indigo" | "red" | "emerald" | "blue" | "orange";
  icon: "calendar" | "alert" | "check";
}) {
  const chipClass =
    tone === "red"
      ? "bg-red-50 text-red-600"
      : tone === "emerald"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "blue"
      ? "bg-blue-50 text-blue-600"
      : tone === "orange"
      ? "bg-orange-50 text-orange-600"
      : "bg-indigo-50 text-indigo-600";
  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-sm px-4 py-4">
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${chipClass}`}>
        <StatIcon name={icon} />
      </div>
      <div className="text-xs text-neutral-500 mt-3">{label}</div>
      <div className="text-2xl font-bold mt-0.5 text-neutral-900">{value}건</div>
    </div>
  );
}

export function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-sm font-medium pb-3 border-b-2 -mb-px flex items-center gap-1.5 ${
        active ? "border-indigo-600 text-indigo-600" : "border-transparent text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {children}
      {typeof count === "number" && (
        <span
          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
            active ? "bg-indigo-50 text-indigo-600" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function Pill({ dot, text, className }: { dot: string; text: string; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
