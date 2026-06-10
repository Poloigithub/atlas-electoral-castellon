import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, Select, PartyDot } from "./ui.jsx";
import { loadDiputacion } from "../lib/data.js";

export default function DiputacionPanel({ index, parties }) {
  const [dip, setDip] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    loadDiputacion().then((d) => {
      setDip(d);
      setSel(Object.keys(d).sort().pop());
    });
  }, []);

  const { rows, pids } = useMemo(() => {
    if (!dip) return { rows: [], pids: [] };
    const pids = new Set();
    const rows = Object.entries(dip)
      .map(([eid, d]) => {
        const year = +eid.slice(4, 8);
        Object.keys(d.composicion).forEach((p) => pids.add(p));
        return { eid, year, ...d.composicion };
      })
      .sort((a, b) => a.year - b.year);
    return {
      rows,
      pids: [...pids].sort((a, b) => (parties[a]?.ideol ?? 99) - (parties[b]?.ideol ?? 99)),
    };
  }, [dip, parties]);

  const selData = dip && sel ? dip[sel] : null;

  return (
    <div className="space-y-4">
      <Card
        title="Diputación Provincial de Castellón · composición estimada"
        subtitle="Estimación propia aplicando la LOREG: reparto de diputados entre partidos judiciales por población y D'Hondt sobre los votos de las municipales. Puede diferir en ±1 escaño de la composición oficial."
      >
        <div className="h-80">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v, k) => [v, parties[k]?.label ?? k]} />
              <Legend formatter={(k) => <span className="text-xs">{parties[k]?.label ?? k}</span>} />
              {pids.map((pid) => (
                <Bar key={pid} dataKey={pid} stackId="a" fill={parties[pid]?.color ?? "#999"} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Detalle por partido judicial">
        <div className="mb-3">
          <Select label="Elección municipal" value={sel ?? ""} onChange={setSel} className="w-44">
            {dip &&
              Object.keys(dip)
                .sort()
                .map((eid) => (
                  <option key={eid} value={eid}>{eid.slice(4, 8)}</option>
                ))}
          </Select>
        </div>
        {selData && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(selData.pjs)
              .sort((a, b) => b.seats - a.seats)
              .map((pj) => (
                <div key={pj.name} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-slate-700">{pj.name}</span>
                    <span className="text-xs text-slate-400">{pj.seats} {pj.seats === 1 ? "diputado" : "diputados"}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(pj.won)
                      .sort((a, b) => b[1] - a[1])
                      .map(([pid, s]) => (
                        <span key={pid} className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs">
                          <PartyDot color={parties[pid]?.color ?? "#999"} />
                          {parties[pid]?.label ?? pid}: <b>{s}</b>
                        </span>
                      ))}
                    {!Object.keys(pj.won).length && <span className="text-xs text-slate-400">sin reparto</span>}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}
