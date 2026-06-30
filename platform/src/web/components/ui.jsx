import React from "react";

const GATE_DISPLAY = {
  PASS: { fg: "#168736", bg: "#EAF7EE", label: "Validé" },
  PASS_WITH_RISK: { fg: "#A15C07", bg: "#FFF3DF", label: "Validé avec risque" },
  FAIL: { fg: "#B42318", bg: "#FDEBEA", label: "Bloqué" },
  UNKNOWN: { fg: "#747480", bg: "#F0F0F4", label: "En cours" },
  NOT_STARTED: { fg: "#747480", bg: "#F0F0F4", label: "Pas démarré" }
};

export function GateBadge({ status }) {
  const d = GATE_DISPLAY[status] || GATE_DISPLAY.NOT_STARTED;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded"
      style={{ color: d.fg, background: d.bg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.fg }} />
      {d.label}
    </span>
  );
}

export function Chip({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded bg-ey-offwhite text-ey-gray01">
      {color ? <span className="w-2 h-2 rounded-full" style={{ background: color }} /> : null}
      {children}
    </span>
  );
}

export function Card({ children, className = "", ...rest }) {
  return (
    <div
      className={`bg-base-100 border border-ey-border rounded-lg shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Stat({ num, label, accent }) {
  return (
    <div className="bg-base-100 border border-ey-border rounded-lg shadow-sm px-5 py-4 relative overflow-hidden">
      {accent ? <span className="absolute left-0 top-0 bottom-0 w-1 bg-ey-yellow" /> : null}
      <div className="text-[26px] font-bold tracking-tight leading-none">{num}</div>
      <div className="text-ey-gray01 text-[12.5px] mt-1.5">{label}</div>
    </div>
  );
}

export function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-ey-offwhite rounded-full overflow-hidden" title={`${pct}%`}>
      <div className="h-full bg-ey-yellow rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="text-center px-6 py-11 text-ey-gray01">
      {Icon ? (
        <div className="flex justify-center">
          <Icon size={30} className="text-ey-gray02" strokeWidth={1.5} />
        </div>
      ) : null}
      <h3 className="mt-3 mb-1 text-base font-semibold text-ey-black">{title}</h3>
      <p className="max-w-md mx-auto text-[13.5px]">{children}</p>
    </div>
  );
}

export function Avatar({ profile, size = 28 }) {
  const initials = (profile?.short || profile?.label || "?").slice(0, 2).toUpperCase();
  return (
    <span
      className="inline-grid place-items-center rounded-full text-white font-bold"
      style={{ background: profile?.color || "#888", width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

export function SectionTitle({ icon: Icon, children }) {
  return (
    <h3 className="text-[15px] font-bold mt-7 mb-3 flex items-center gap-2">
      {Icon ? <Icon size={17} className="text-ey-gray01" strokeWidth={2} /> : null}
      {children}
    </h3>
  );
}
