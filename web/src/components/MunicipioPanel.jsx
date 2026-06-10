import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, Select, SearchSelect, ResultBar, MiniButton } from "./ui.jsx";
import { chartToPng } from "../lib/export.js";
import {
  loadSummary, loadSocio, loadElection, rankVotes, participation, fmtInt, fmtNum, fmtPct,
} from "../lib/data.js";
import { useHashParam } from "../lib/urlState.js";

export default function MunicipioPanel({ index, parties, municipios, code, setCode }) {
  const [summary, setSummary] = useState(null);
  const [socio, setSocio] = useState(null);
  const chartRef = useRef(null);
  const [kind, setKind] = useHashParam("mtipo", "municipales");
  const [council, setCouncil] = useState(null); // {year: {pid: concejales}}

  useEffect(() => {
    loadSummary().then(setSummary);
    loadSocio().then(setSocio);
  }, []);

  // concejales: carga perezosa de los JSON de municipales
  useEffect(() => {
    let alive = true;
    async function run() {
      const muns = index.filter((e) => e.kind === "municipales");
      const out = {};
      for (const e of muns) {
        const d = await loadElection(e.id);
        const m = d.municipios[code];
        if (!m) continue;
        const seats = {};
        for (const [ccode, val] of Object.entries(m.votes)) {
          const electos = Array.isArray(val) ? val[1] : 0;
          if (!electos) continue;
          const pid = d.pmap[ccode] || "otros";
          seats[pid] = (seats[pid] || 0) + electos;
        }
        out[e.year] = seats;
      }
      if (alive) setCouncil(out);
    }
    setCouncil(null);
    run();
    return () => { alive = false; };
  }, [code, index]);

  const muni = municipios[code];

  const munOptions = useMemo(
    () =>
      Object.entries(municipios)
        .sort((a, b) => a[1].name.localeCompare(b[1].name, "es"))
        .map(([c, m]) => [c, m.name]),
    [municipios]
  );

  const history = useMemo(() => {
    if (!summary) return [];
    return index
      .filter((e) => e.kind === kind)
      .map((e) => {
        const m = summary[e.id]?.mun?.[code];
        if (!m) return null;
        const tot = Object.values(m.votes).reduce((a, b) => a + b, 0);
        return { e, m, tot };
      })
      .filter(Boolean);
  }, [summary, index, kind, code]);

  const latest = history[history.length - 1];

  const councilRows = useMemo(() => {
    if (!council) return [];
    const pids = new Set();
    Object.values(council).forEach((s) => Object.keys(s).forEach((p) => pids.add(p)));
    return {
      rows: Object.entries(council).map(([year, seats]) => ({ year, ...seats })),
      pids: [...pids].sort((a, b) => (parties[a]?.ideol ?? 99) - (parties[b]?.ideol ?? 99)),
    };
  }, [council, parties]);

  const socioRow = socio?.municipios?.[code];
  const lastSocioYear = socio ? Math.max(...socio.years) : null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <SearchSelect label="Municipio" value={code} onChange={setCode} options={munOptions} className="min-w-60" />
          <Select label="Tipo de elección" value={kind} onChange={setKind}>
            <option value="municipales">Municipales</option>
            <option value="generales">Generales</option>
            <option value="autonomicas">Autonòmiques</option>
            <option value="europeas">Europeas</option>
          </Select>
          <MiniButton onClick={() => chartToPng(chartRef.current, `concejales-${code}.png`)} title="Descargar el gráfico de concejales">PNG</MiniButton>
          {socioRow && (
            <div className="ml-auto flex gap-4 text-center text-[11px] text-slate-500">
              <div><div className="text-sm font-semibold text-slate-700">{fmtInt(socioRow.pob?.[lastSocioYear])}</div>habitantes ({lastSocioYear})</div>
              <div><div className="text-sm font-semibold text-slate-700">{fmtInt(socioRow.rentaP?.[lastSocioYear])} €</div>renta/persona</div>
              <div><div className="text-sm font-semibold text-slate-700">{fmtNum(socioRow.edad?.[lastSocioYear])}</div>edad media</div>
              <div><div className="text-sm font-semibold text-slate-700">{socioRow.esp?.[lastSocioYear] != null ? fmtNum(100 - socioRow.esp[lastSocioYear]) + "%" : "—"}</div>pobl. extranjera</div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={latest ? `Último resultado · ${latest.e.label} ${latest.e.year}` : "Último resultado"}
          subtitle={latest ? `Participación ${fmtPct(participation(latest.m))} · censo ${fmtInt(latest.m.censo)}` : ""}
        >
          {latest ? (
            <ResultBar
              total={latest.tot}
              rows={rankVotes(latest.m.votes)
                .slice(0, 9)
                .map(([pid, v]) => ({
                  pid,
                  label: parties[pid]?.label ?? pid,
                  color: parties[pid]?.color ?? "#999",
                  votes: v,
                  share: (100 * v) / latest.tot,
                }))}
            />
          ) : (
            <div className="text-sm text-slate-400">Sin datos</div>
          )}
        </Card>

        <Card title="Histórico (% voto)" subtitle={`${muni?.name ?? ""} · ${kind}`}>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {[...history].reverse().map(({ e, m, tot }) => {
                  const top = rankVotes(m.votes).slice(0, 3);
                  return (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 font-medium text-slate-600">{e.year}</td>
                      {top.map(([pid, v]) => (
                        <td key={pid} className="py-1.5 pr-3 tabular-nums">
                          <span style={{ color: parties[pid]?.color }} className="font-semibold">
                            {parties[pid]?.label?.split(" ")[0] ?? pid}
                          </span>{" "}
                          {((100 * v) / tot).toFixed(1)}%
                        </td>
                      ))}
                      <td className="py-1.5 tabular-nums text-slate-400">part. {fmtPct(participation(m))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Composición del ayuntamiento" subtitle="Concejales por elección municipal">
        {council == null ? (
          <div className="py-8 text-center text-sm text-slate-400">Cargando concejales…</div>
        ) : councilRows.rows?.length ? (
          <div className="h-72" ref={chartRef}>
            <ResponsiveContainer>
              <BarChart data={councilRows.rows} margin={{ top: 8, right: 16, bottom: 4, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v, k) => [v, parties[k]?.label ?? k]} />
                <Legend formatter={(k) => <span className="text-xs">{parties[k]?.label ?? k}</span>} />
                {councilRows.pids.map((pid) => (
                  <Bar key={pid} dataKey={pid} stackId="a" fill={parties[pid]?.color ?? "#999"} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-400">Sin datos de concejales</div>
        )}
      </Card>
    </div>
  );
}
