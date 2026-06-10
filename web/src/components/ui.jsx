// Pequeños componentes de interfaz compartidos.

import { useEffect, useMemo, useRef, useState } from "react";

export function Select({ label, value, onChange, children, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-slate-500 ${className}`}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-800 shadow-sm focus:border-sky-500 focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

// Desplegable con buscador para listas largas (135 municipios).
// options: [[value, label], ...]
export function SearchSelect({ label, value, onChange, options, className = "" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const current = options.find(([v]) => v === value)?.[1] ?? "";

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = useMemo(
    () => (q ? options.filter(([, l]) => norm(l).includes(norm(q))) : options),
    [q, options]
  );

  return (
    <div ref={ref} className={`relative flex flex-col gap-1 text-xs font-medium text-slate-500 ${className}`}>
      {label}
      <input
        value={open ? q : current}
        placeholder={current || "Buscar…"}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length) {
            onChange(filtered[0][0]);
            setOpen(false);
            e.target.blur();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-800 shadow-sm focus:border-sky-500 focus:outline-none"
      />
      {open && (
        <ul className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.map(([v, l]) => (
            <li key={v}>
              <button
                onMouseDown={() => {
                  onChange(v);
                  setOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-sm font-normal hover:bg-sky-50 ${
                  v === value ? "bg-sky-50 font-medium text-sky-700" : "text-slate-700"
                }`}
              >
                {l}
              </button>
            </li>
          ))}
          {!filtered.length && <li className="px-3 py-2 text-sm font-normal text-slate-400">Sin resultados</li>}
        </ul>
      )}
    </div>
  );
}

// Botón pequeño de acción (exportar PNG/CSV…).
export function MiniButton({ onClick, children, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-sky-400 hover:text-sky-700"
    >
      {children}
    </button>
  );
}

export function Card({ title, subtitle, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
      {subtitle && <p className="mb-2 mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      {children}
    </section>
  );
}

export function PartyDot({ color }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />;
}

export function ResultBar({ rows, total }) {
  // rows: [{pid,label,color,votes,share,extra}]
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.pid} className="text-xs">
          <div className="mb-0.5 flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <PartyDot color={r.color} /> {r.label}
              {r.extra != null && (
                <span className="rounded bg-slate-100 px-1 py-px text-[10px] font-semibold text-slate-500">{r.extra}</span>
              )}
            </span>
            <span className="tabular-nums text-slate-500">
              {r.votes.toLocaleString("es-ES")} · {r.share.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(100 * r.votes) / total}%`, background: r.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
