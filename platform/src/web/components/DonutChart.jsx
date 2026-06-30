import React from "react";

const PALETTE = ["#FFE600", "#2563eb", "#db2777", "#16a34a", "#ca8a04", "#dc2626", "#0891b2", "#7c3aed", "#0d9488", "#94a3b8"];

function fmtUsd(v) {
  return "$" + ((v || 0) < 1 ? (v || 0).toFixed(4) : (v || 0).toFixed(2));
}
function fmtNum(n) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));
}

/**
 * Donut chart (CSS conic-gradient, no chart lib).
 * segments: [{ label, value }]; `unit` "usd" | "num" for legend formatting.
 */
export default function DonutChart({ title, segments, unit = "usd", size = 150 }) {
  const items = (segments || [])
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
  const total = items.reduce((s, x) => s + x.value, 0);
  const fmt = unit === "usd" ? fmtUsd : fmtNum;

  let acc = 0;
  const stops =
    total > 0
      ? items
          .map((s) => {
            const start = (acc / total) * 360;
            acc += s.value;
            const end = (acc / total) * 360;
            return `${s.color} ${start}deg ${end}deg`;
          })
          .join(", ")
      : "var(--b2, #eee) 0deg 360deg";

  return (
    <div>
      {title ? <h3 className="text-[14px] font-bold m-0 mb-3">{title}</h3> : null}
      {items.length === 0 ? (
        <p className="text-ey-gray01 text-[13px] m-0">Aucune donnée.</p>
      ) : (
        <div className="flex items-center gap-5">
          <div
            className="relative shrink-0 rounded-full"
            style={{ width: size, height: size, background: `conic-gradient(${stops})` }}
          >
            <div className="absolute inset-[26%] bg-base-100 rounded-full grid place-items-center text-center leading-tight">
              <div>
                <div className="text-[13px] font-bold">{fmt(total)}</div>
                <div className="text-[10px] text-ey-gray01">total</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 min-w-0">
            {items.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="truncate flex-1">{s.label}</span>
                <span className="text-ey-gray01 whitespace-nowrap">{fmt(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
