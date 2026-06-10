import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, Select, SearchSelect, MiniButton } from "./ui.jsx";
import { loadSummary, participation, fmtPct } from "../lib/data.js";
import { useHashParam } from "../lib/urlState.js";
import { rowsToCsv } from "../lib/export.js";

const KINDS = [
  ["todas", "Todas"],
  ["generales", "Generales"],
  ["municipales", "Municipales"],
  ["autonomicas", "Autonòmiques"],
  ["europeas", "Europeas"],
];

export default function EvolutionPanel({ index, parties, municipios }) {
  const [summary, setSummary] = useState(null);
  const [kind, setKind] = useHashParam("ek", "generales");
  const [scope, setScope] = useHashParam("eamb", "prov");
  const [mode, setMode] = useHashParam("emodo", "partidos");

  useEffect(() => {
    loadSummary().then(setSummary);
  }, []);

  const elections = useMemo(
    () => index.filter((e) => kind === "todas" || e.kind === kind),
    [index, kind]
  );

  const { rows, lineKeys } = useMemo(() => {
    if (!summary) return { rows: [], lineKeys: [] };
    const rows = [];
    const seen = new Map(); // pid -> max share, para elegir líneas relevantes
    for (const e of elections) {
      const s = summary[e.id];
      if (!s) continue;
      let votes, unit;
      if (scope === "prov") {
        votes = s.prov;
        unit = { votes: s.prov, censo: s.censo, blanco: s.blanco, nulos: s.nulos };
      } else {
        const m = s.mun[scope];
        if (!m) continue;
        votes = m.votes;
        unit = m;
      }
      const tot = Object.values(votes).reduce((a, b) => a + b, 0);
      if (!tot) continue;
      const row = { x: e.year + e.month / 12, name: `${e.label} ${e.year}` };
      if (mode === "partidos") {
        for (const [pid, v] of Object.entries(votes)) {
          const share = (100 * v) / tot;
          row[pid] = +share.toFixed(2);
          if (share > (seen.get(pid) ?? 0)) seen.set(pid, share);
        }
      } else if (mode === "bloques") {
        let izq = 0, der = 0, cen = 0;
        for (const [pid, v] of Object.entries(votes)) {
          const b = parties[pid]?.bloc;
          if (b === "izquierda") izq += v;
          else if (b === "derecha") der += v;
          else if (b === "centro") cen += v;
        }
        row.izquierda = +((100 * izq) / tot).toFixed(2);
        row.derecha = +((100 * der) / tot).toFixed(2);
        row.centro = +((100 * cen) / tot).toFixed(2);
      } else {
        row.participacion = +(participation(unit) ?? 0).toFixed(2);
      }
      rows.push(row);
    }
    let lineKeys;
    if (mode === "partidos") {
      lineKeys = [...seen.entries()]
        .filter(([pid, mx]) => mx >= 3 && pid !== "otros")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([pid]) => pid);
    } else if (mode === "bloques") {
      lineKeys = ["izquierda", "centro", "derecha"];
    } else {
      lineKeys = ["participacion"];
    }
    return { rows, lineKeys };
  }, [summary, elections, scope, mode, parties]);

  const lineColor = (k) =>
    mode === "partidos"
      ? parties[k]?.color ?? "#999"
      : { izquierda: "#dc2626", centro: "#f59e0b", derecha: "#1d4ed8", participacion: "#0369a1" }[k];

  const lineLabel = (k) =>
    mode === "partidos"
      ? parties[k]?.label ?? k
      : { izquierda: "Izquierda", centro: "Centro", derecha: "Derecha", participacion: "Participación" }[k];

  const munOptions = useMemo(
    () => [
      ["prov", "Provincia de Castellón"],
      ...Object.entries(municipios)
        .sort((a, b) => a[1].name.localeCompare(b[1].name, "es"))
        .map(([code, m]) => [code, m.name]),
    ],
    [municipios]
  );

  function exportCsv() {
    rowsToCsv(
      rows.map((r) => {
        const out = { eleccion: r.name };
        for (const k of lineKeys) out[lineLabel(k)] = r[k] != null ? r[k] : "";
        return out;
      }),
      `evolucion-${kind}-${scope}-${mode}.csv`
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label="Tipo de elección" value={kind} onChange={setKind}>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <SearchSelect label="Ámbito" value={scope} onChange={setScope} options={munOptions} className="min-w-52" />
        <Select label="Ver" value={mode} onChange={setMode}>
          <option value="partidos">% voto por partido</option>
          <option value="bloques">% voto por bloque ideológico</option>
          <option value="participacion">Participación</option>
        </Select>
        <div className="ml-auto">
          <MiniButton onClick={exportCsv} title="Descargar la serie como CSV">CSV</MiniButton>
        </div>
      </div>
      <div className="h-[460px]">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin - 1", "dataMax + 1"]}
              tickFormatter={(v) => Math.floor(v)}
              tick={{ fontSize: 11 }}
              tickCount={12}
            />
            <YAxis tick={{ fontSize: 11 }} unit="%" />
            <Tooltip
              formatter={(v, k) => [fmtPct(v), lineLabel(k)]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
            />
            <Legend formatter={(k) => <span className="text-xs">{lineLabel(k)}</span>} />
            {lineKeys.map((k) => (
              <Line
                key={k}
                dataKey={k}
                stroke={lineColor(k)}
                strokeWidth={2}
                dot={{ r: 2.5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {kind === "todas" && (
        <p className="mt-1 text-[11px] text-slate-400">
          Mezcla tipos de elección distintos: las series alternan convocatorias generales, municipales,
          autonómicas y europeas.
        </p>
      )}
    </Card>
  );
}
