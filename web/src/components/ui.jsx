// Pequeños componentes de interfaz compartidos.

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
