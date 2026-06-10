import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScatterChart, Scatter, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ZAxis,
} from "recharts";
import { Card, Select, MiniButton, PartyDot } from "./ui.jsx";
import MapView from "./MapView.jsx";
import {
  loadSocio, loadSummary, loadElection, loadGeoSecciones, toCanonical,
  partyShare, blocShare, winner, participation, rankVotes, fmtNum, fmtPct,
} from "../lib/data.js";
import { divergingColor, tint } from "../lib/colors.js";
import { useHashParam } from "../lib/urlState.js";
import { rowsToCsv, chartToPng, svgToPng } from "../lib/export.js";

// ---------- estadística ----------

function pearson(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function ols(pairs) {
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  }
  if (!sxx) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

// correlación parcial r(x,y) controlando z
function partialR(rxy, rxz, ryz) {
  if (rxy == null || rxz == null || ryz == null) return null;
  const den = Math.sqrt((1 - rxz ** 2) * (1 - ryz ** 2));
  return den ? (rxy - rxz * ryz) / den : null;
}

const nearestYear = (years, target) =>
  years?.length ? years.reduce((b, y) => (Math.abs(y - target) < Math.abs(b - target) ? y : b)) : null;

const VISTAS = [
  ["dispersion", "Dispersión"],
  ["quintiles", "Quintiles"],
  ["matriz", "Matriz de correlaciones"],
  ["tendencia", "Evolución de la correlación"],
  ["residuos", "Mapa de residuos"],
];

export default function SocioPanel({ index, parties, municipios }) {
  const withSecciones = index.filter((e) => e.secciones);
  const [vista, setVista] = useHashParam("sv", "dispersion");
  const [socio, setSocio] = useState(null);
  const [summary, setSummary] = useState(null);
  const [electionId, setElectionId] = useHashParam("soel", withSecciones[withSecciones.length - 1].id);
  const [detail, setDetail] = useState(null);
  const [geoSec, setGeoSec] = useState(null);
  const [level, setLevel] = useHashParam("snivel", "sec");
  const [indicator, setIndicator] = useHashParam("sx", "rentaP");
  const [target, setTarget] = useHashParam("sy", "bloc:derecha");
  const [sizeF, setSizeF] = useHashParam("stam", "");
  const [twin, setTwin] = useState(null); // clave de sección para "gemelas"
  const chartRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    loadSocio().then(setSocio);
    loadSummary().then(setSummary);
  }, []);
  useEffect(() => {
    setDetail(null);
    if (level === "sec") loadElection(electionId).then(setDetail);
  }, [electionId, level]);
  useEffect(() => {
    if (vista === "residuos") loadGeoSecciones().then(setGeoSec);
  }, [vista]);
  useEffect(() => setTwin(null), [electionId, indicator, target, level, sizeF, vista]);

  // residuos y tendencia trabajan siempre por secciones (es donde el cruce discrimina)
  const effLevel = vista === "residuos" || vista === "tendencia" ? "sec" : level;

  const election = index.find((e) => e.id === electionId) ?? withSecciones[withSecciones.length - 1];
  const elections = effLevel === "sec" ? withSecciones : index;

  // indicadores disponibles en el nivel activo
  const indOptions = useMemo(() => {
    if (!socio) return [];
    const keys = effLevel === "sec" ? socio.secInds ?? Object.keys(socio.labels) : Object.keys(socio.labels);
    return keys.filter((k) => k !== "pob").map((k) => [k, socio.labels[k] ?? k]);
  }, [socio, effLevel]);
  useEffect(() => {
    if (indOptions.length && !indOptions.some(([k]) => k === indicator)) setIndicator(indOptions[0][0]);
  }, [indOptions, indicator]);

  const yearFor = (ind) => {
    const ys = socio?.indYears?.[ind];
    return ys ? nearestYear(ys, election.year) : null;
  };
  const valueOf = (store, key, ind) => {
    const y = yearFor(ind);
    return y == null ? null : store?.[key]?.[ind]?.[String(y)] ?? store?.[key]?.[ind]?.["0"] ?? null;
  };

  // población municipal (para el filtro de tamaño)
  const munPob = useMemo(() => {
    if (!socio) return {};
    const out = {};
    for (const [mun, ind] of Object.entries(socio.municipios)) {
      const ys = ind.pob ? Object.keys(ind.pob) : [];
      out[mun] = ys.length ? ind.pob[ys[ys.length - 1]] : null;
    }
    return out;
  }, [socio]);

  function sizeOk(munCode) {
    if (!sizeF) return true;
    const pob = munPob[munCode];
    if (pob == null) return false;
    if (sizeF === "cap") return munCode === "040";
    if (sizeF === "g") return pob >= 20000 && munCode !== "040";
    if (sizeF === "m") return pob >= 5000 && pob < 20000;
    if (sizeF === "p") return pob < 5000;
    return true;
  }

  // unidades del nivel activo: [{key, name, votes (canónico), unit}]
  const units = useMemo(() => {
    if (effLevel === "sec") {
      if (!detail) return [];
      return Object.entries(detail.secciones)
        .filter(([key]) => sizeOk(key.slice(0, 3)))
        .map(([key, s]) => ({
          key,
          mun: key.slice(0, 3),
          name: `${municipios[key.slice(0, 3)]?.name ?? ""} · ${key.slice(3, 5)}-${key.slice(5)}`,
          votes: toCanonical(s.votes, detail.pmap),
          unit: s,
        }))
        .filter((u) => Object.keys(u.votes).length);
    }
    if (!summary?.[electionId]) return [];
    return Object.entries(summary[electionId].mun)
      .filter(([key]) => sizeOk(key))
      .map(([key, m]) => ({
        key,
        mun: key,
        name: municipios[key]?.name ?? key,
        votes: m.votes,
        unit: m,
      }))
      .filter((u) => Object.keys(u.votes).length);
  }, [effLevel, detail, summary, electionId, municipios, sizeF, munPob]);

  // opciones del eje Y (partidos relevantes de la elección + bloques + participación)
  const targetOptions = useMemo(() => {
    const opts = [
      ["bloc:izquierda", "% bloque izquierda"],
      ["bloc:derecha", "% bloque derecha"],
      ["part", "Participación"],
    ];
    const prov = {};
    for (const u of units) for (const [c, v] of Object.entries(u.votes)) prov[c] = (prov[c] || 0) + v;
    for (const [pid] of rankVotes(prov).slice(0, 8)) {
      if (pid !== "otros") opts.push([`party:${pid}`, `% ${parties[pid]?.label ?? pid}`]);
    }
    return opts;
  }, [units, parties]);

  function yValue(u, tgt = target) {
    if (tgt === "part") return participation(u.unit);
    if (tgt.startsWith("bloc:")) return blocShare(u.votes, parties, tgt.slice(5));
    return partyShare(u.votes, tgt.slice(6));
  }

  const store = effLevel === "sec" ? socio?.secciones : socio?.municipios;

  // puntos del scatter / base de quintiles y residuos
  const points = useMemo(() => {
    if (!socio || !units.length) return [];
    const pts = [];
    for (const u of units) {
      const x = valueOf(store, u.key, indicator);
      if (x == null) continue;
      const y = yValue(u);
      if (y == null) continue;
      const w = winner(u.votes);
      pts.push({
        ...u,
        x,
        y: +y.toFixed(2),
        fill: parties[w]?.color ?? "#999",
        pob: (effLevel === "sec" ? socio.secciones[u.key]?.pob?.[String(yearFor("pob"))] : munPob[u.key]) ?? 800,
      });
    }
    return pts;
  }, [socio, units, store, indicator, target, parties, effLevel, munPob]);

  const r = useMemo(() => pearson(points.map((p) => [p.x, p.y])), [points]);

  // r parcial controlando la edad media
  const rPartial = useMemo(() => {
    if (!socio || indicator === "edad" || points.length < 4) return null;
    const triples = points
      .map((p) => [p.x, p.y, valueOf(store, p.key, "edad")])
      .filter((t) => t[2] != null);
    if (triples.length < 4) return null;
    const rxy = pearson(triples.map((t) => [t[0], t[1]]));
    const rxz = pearson(triples.map((t) => [t[0], t[2]]));
    const ryz = pearson(triples.map((t) => [t[1], t[2]]));
    return partialR(rxy, rxz, ryz);
  }, [points, socio, store, indicator]);

  const regLine = useMemo(() => {
    const fit = ols(points.map((p) => [p.x, p.y]));
    if (!fit) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    let x1 = Math.min(...xs), x2 = Math.max(...xs);
    const ymin = Math.min(0, ...ys), ymax = Math.max(...ys);
    const yAt = (x) => fit.slope * x + fit.intercept;
    const xAt = (y) => (y - fit.intercept) / (fit.slope || 1e-9);
    let y1 = yAt(x1), y2 = yAt(x2);
    if (y1 < ymin) { x1 = xAt(ymin); y1 = ymin; }
    if (y1 > ymax) { x1 = xAt(ymax); y1 = ymax; }
    if (y2 < ymin) { x2 = xAt(ymin); y2 = ymin; }
    if (y2 > ymax) { x2 = xAt(ymax); y2 = ymax; }
    return { fit, seg: [{ x: x1, y: y1 }, { x: x2, y: y2 }] };
  }, [points]);

  const indLabel = socio?.labels?.[indicator] ?? indicator;
  const targetLabel = targetOptions.find(([v]) => v === target)?.[1] ?? "";
  const yearUsed = yearFor(indicator);

  // ---------- gemelas ----------
  const TWIN_VARS = ["rentaP", "edad", "esp", "gini", "hog1", "p65", "edu", "paroC", "costa"];
  const twins = useMemo(() => {
    if (!twin || effLevel !== "sec" || !socio) return null;
    const vecs = {};
    for (const u of units) {
      const v = TWIN_VARS.map((ind) => valueOf(socio.secciones, u.key, ind));
      vecs[u.key] = v;
    }
    // estandarizar por variable
    const dims = TWIN_VARS.map((_, i) => {
      const vals = Object.values(vecs).map((v) => v[i]).filter((x) => x != null);
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) || 1;
      return { m, sd };
    });
    const z = (key) => vecs[key]?.map((v, i) => (v == null ? null : (v - dims[i].m) / dims[i].sd));
    const zt = z(twin);
    if (!zt) return null;
    const dist = [];
    for (const u of units) {
      if (u.key === twin) continue;
      const zu = z(u.key);
      let s = 0, n = 0;
      for (let i = 0; i < zt.length; i++) {
        if (zt[i] != null && zu[i] != null) { s += (zt[i] - zu[i]) ** 2; n++; }
      }
      if (n >= 5) dist.push({ u, d: Math.sqrt(s / n) });
    }
    dist.sort((a, b) => a.d - b.d);
    const self = units.find((u) => u.key === twin);
    return { self, list: dist.slice(0, 10) };
  }, [twin, units, socio, effLevel]);

  // ---------- quintiles ----------
  const quintiles = useMemo(() => {
    if (vista !== "quintiles" || points.length < 10) return null;
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const prov = {};
    for (const p of points) for (const [c, v] of Object.entries(p.votes)) prov[c] = (prov[c] || 0) + v;
    const tops = rankVotes(prov).filter(([pid]) => pid !== "otros").slice(0, 6).map(([pid]) => pid);
    const rows = [];
    for (let q = 0; q < 5; q++) {
      const slice = sorted.slice(Math.round((q * sorted.length) / 5), Math.round(((q + 1) * sorted.length) / 5));
      const votes = {};
      for (const p of slice) for (const [c, v] of Object.entries(p.votes)) votes[c] = (votes[c] || 0) + v;
      const tot = Object.values(votes).reduce((a, b) => a + b, 0);
      const row = {
        q: `Q${q + 1}`,
        rango: `${fmtNum(slice[0]?.x)} – ${fmtNum(slice[slice.length - 1]?.x)}`,
        n: slice.length,
      };
      for (const pid of tops) row[pid] = tot ? +((100 * (votes[pid] || 0)) / tot).toFixed(2) : 0;
      rows.push(row);
    }
    return { rows, tops };
  }, [vista, points]);

  // ---------- matriz ----------
  const matrix = useMemo(() => {
    if (vista !== "matriz" || !socio || !units.length) return null;
    const cols = targetOptions.slice(0, 9);
    const rows = indOptions.map(([ind, label]) => {
      const cells = cols.map(([tgt]) => {
        const pairs = [];
        for (const u of units) {
          const x = valueOf(store, u.key, ind);
          if (x == null) continue;
          const y = yValue(u, tgt);
          if (y != null) pairs.push([x, y]);
        }
        return pearson(pairs);
      });
      return { ind, label, cells };
    });
    return { cols, rows };
  }, [vista, socio, units, indOptions, targetOptions, store]);

  // ---------- evolución de la correlación (por secciones censales) ----------
  const [trendDetails, setTrendDetails] = useState(null);
  useEffect(() => {
    if (vista !== "tendencia") return;
    let alive = true;
    (async () => {
      const els = withSecciones.filter((e) => e.year >= 2015);
      const out = {};
      for (const e of els) out[e.id] = await loadElection(e.id);
      if (alive) setTrendDetails(out);
    })();
    return () => { alive = false; };
  }, [vista]);

  const trend = useMemo(() => {
    if (vista !== "tendencia" || !socio || !trendDetails) return null;
    const rows = [];
    for (const e of withSecciones.filter((el) => el.year >= 2015)) {
      const det = trendDetails[e.id];
      if (!det) continue;
      const ys = socio.indYears?.[indicator];
      const y0 = ys ? nearestYear(ys, e.year) : null;
      if (y0 == null) continue;
      const pairs = [];
      for (const [key, s] of Object.entries(det.secciones)) {
        const x = socio.secciones?.[key]?.[indicator]?.[String(y0)] ?? socio.secciones?.[key]?.[indicator]?.["0"];
        if (x == null) continue;
        const votes = toCanonical(s.votes, det.pmap);
        if (!Object.keys(votes).length) continue;
        const y = yValue({ votes, unit: s });
        if (y != null) pairs.push([x, y]);
      }
      const rv = pearson(pairs);
      if (rv == null) continue;
      rows.push({ x: e.year + e.month / 12, name: `${e.label} ${e.year}`, kind: e.kind, r: +rv.toFixed(3) });
    }
    const kinds = [...new Set(rows.map((r0) => r0.kind))];
    const xs = [...new Set(rows.map((r0) => r0.x))].sort((a, b) => a - b);
    const data = xs.map((x) => {
      const d = { x };
      for (const row of rows) if (row.x === x) { d[row.kind] = row.r; d.name = row.name; }
      return d;
    });
    return { data, kinds };
  }, [vista, socio, trendDetails, indicator, target, parties]);

  // ---------- residuos ----------
  const residuals = useMemo(() => {
    if (vista !== "residuos" || !regLine || !points.length) return null;
    const out = {};
    for (const p of points) {
      out[p.key] = { resid: p.y - (regLine.fit.slope * p.x + regLine.fit.intercept), real: p.y, x: p.x, name: p.name };
    }
    return out;
  }, [vista, regLine, points]);

  const KIND_COLOR = { generales: "#0369a1", municipales: "#b45309", autonomicas: "#7c3aed", europeas: "#0d9488" };
  const KIND_LABEL = { generales: "Generales", municipales: "Municipales", autonomicas: "Autonòmiques", europeas: "Europeas" };

  function exportCsvVista() {
    if (vista === "quintiles" && quintiles) {
      rowsToCsv(
        quintiles.rows.map((row) => {
          const out = { quintil: row.q, rango: row.rango, secciones: row.n };
          for (const pid of quintiles.tops) out[parties[pid]?.label ?? pid] = row[pid];
          return out;
        }),
        `quintiles-${electionId}-${indicator}.csv`
      );
    } else if (vista === "matriz" && matrix) {
      rowsToCsv(
        matrix.rows.map((row) => {
          const out = { indicador: row.label };
          matrix.cols.forEach(([, l], i) => { out[l] = row.cells[i] == null ? "" : row.cells[i].toFixed(3); });
          return out;
        }),
        `matriz-correlaciones-${electionId}.csv`
      );
    } else if (vista === "tendencia" && trend) {
      rowsToCsv(
        trend.data.map((d) => {
          const out = { eleccion: d.name, año: Math.floor(d.x) };
          for (const k of trend.kinds) out[KIND_LABEL[k]] = d[k] ?? "";
          return out;
        }),
        `tendencia-r-${indicator}.csv`
      );
    } else if (vista === "residuos" && residuals) {
      rowsToCsv(
        Object.entries(residuals).map(([key, v]) => ({
          seccion: `12${key}`, zona: v.name, [indLabel]: v.x, observado: v.real, residuo: +v.resid.toFixed(2),
        })),
        `residuos-${electionId}-${indicator}.csv`
      );
    } else {
      rowsToCsv(
        points.map((p) => ({ codigo: effLevel === "sec" ? `12${p.key}` : p.key, zona: p.name, [indLabel]: p.x, [targetLabel]: p.y })),
        `socio-${electionId}-${indicator}.csv`
      );
    }
  }

  function exportPngVista() {
    if (vista === "residuos") {
      svgToPng(mapRef.current?.querySelector("svg"), `residuos-${electionId}-${indicator}.png`);
    } else {
      chartToPng(chartRef.current, `socio-${vista}-${electionId}-${indicator}.png`);
    }
  }

  const showTarget = vista !== "matriz";
  const showLevel = vista === "dispersion" || vista === "quintiles" || vista === "matriz";

  return (
    <Card
      title="Voto y variables socioeconómicas"
      subtitle="Fuentes: Atlas de Renta (INE) 2015-2023, Censo anual (INE) 2021-2024, Padrón 1996-2025, SEPE 2006-2025. El año del indicador se elige automáticamente: el más cercano a la elección."
    >
      <div className="mb-3 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {VISTAS.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              vista === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label="Elección" value={electionId} onChange={setElectionId} className="min-w-44">
          {[...elections].reverse().map((e) => (
            <option key={e.id} value={e.id}>{e.label} {e.year}</option>
          ))}
        </Select>
        {showLevel && (
          <Select label="Nivel" value={level} onChange={setLevel}>
            <option value="sec">Secciones censales</option>
            <option value="mun">Municipios</option>
          </Select>
        )}
        {vista !== "matriz" && (
          <Select label="Indicador (eje X)" value={indicator} onChange={setIndicator} className="min-w-56">
            {indOptions.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        )}
        {showTarget && (
          <Select label="Voto (eje Y)" value={target} onChange={setTarget} className="min-w-48">
            {targetOptions.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        )}
        {(vista === "dispersion" || vista === "quintiles") && (
          <Select label="Municipios" value={sizeF} onChange={setSizeF} className="min-w-40">
            <option value="">Todos</option>
            <option value="cap">Castelló de la Plana</option>
            <option value="g">&gt;20.000 hab (sin capital)</option>
            <option value="m">5.000–20.000 hab</option>
            <option value="p">&lt;5.000 hab</option>
          </Select>
        )}
        <div className="ml-auto flex items-center gap-2">
          {vista === "dispersion" && (
            <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
              r = <b>{r == null ? "—" : r.toFixed(2)}</b> · r² = <b>{r == null ? "—" : (r * r).toFixed(2)}</b>
              {rPartial != null && <> · r parcial (edad) = <b>{rPartial.toFixed(2)}</b></>}
              {" "}· {points.length} {effLevel === "sec" ? "secciones" : "municipios"}
              {yearUsed ? ` · indicador de ${yearUsed === 0 ? "—" : yearUsed}` : ""}
            </div>
          )}
          <MiniButton onClick={exportPngVista} title="Descargar como imagen">PNG</MiniButton>
          <MiniButton onClick={exportCsvVista} title="Descargar los datos">CSV</MiniButton>
        </div>
      </div>

      {/* ---------- dispersión ---------- */}
      {vista === "dispersion" && (
        <>
          <div className="h-[440px]" ref={chartRef}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="x" type="number" domain={["auto", "auto"]} tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.toLocaleString("es-ES")}
                  label={{ value: indLabel, position: "insideBottom", offset: -10, fontSize: 12 }}
                />
                <YAxis
                  dataKey="y" type="number" tick={{ fontSize: 11 }} unit="%"
                  label={{ value: targetLabel, angle: -90, position: "insideLeft", fontSize: 12 }}
                />
                <ZAxis dataKey="pob" range={[15, 90]} />
                <Tooltip
                  cursor={{ strokeDasharray: "4 4" }}
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload;
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                        <div className="font-semibold">{p.name}</div>
                        <div>{indLabel}: <b>{fmtNum(p.x)}</b></div>
                        <div>{targetLabel}: <b>{fmtNum(p.y)}%</b></div>
                        {effLevel === "sec" && <div className="text-slate-400">clic: secciones gemelas</div>}
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={points} fillOpacity={0.75} isAnimationActive={false}
                  onClick={(p) => effLevel === "sec" && setTwin(p?.key ?? null)}
                />
                {regLine && (
                  <Scatter
                    data={regLine.seg}
                    line={{ stroke: "#0f172a", strokeWidth: 1.5, strokeDasharray: "6 4" }}
                    shape={() => null} isAnimationActive={false} legendType="none" tooltipType="none"
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          {twins && (
            <div className="mt-2 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold text-slate-700">
                  Secciones gemelas de {twins.self?.name} (perfil socioeconómico más parecido)
                </h3>
                <button onClick={() => setTwin(null)} className="text-xs text-slate-400 hover:text-slate-700">cerrar ×</button>
              </div>
              <table className="w-full text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-1 text-left font-medium">Sección</th>
                    <th className="py-1 text-right font-medium">Similitud</th>
                    <th className="py-1 text-right font-medium">{targetLabel}</th>
                    <th className="py-1 pl-4 text-left font-medium">Ganador</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100 bg-sky-50/50 font-medium">
                    <td className="py-1">{twins.self?.name}</td>
                    <td className="py-1 text-right">—</td>
                    <td className="py-1 text-right tabular-nums">{fmtNum(yValue(twins.self))}%</td>
                    <td className="py-1 pl-4">
                      <span className="flex items-center gap-1.5">
                        <PartyDot color={parties[winner(twins.self?.votes)]?.color ?? "#999"} />
                        {parties[winner(twins.self?.votes)]?.label}
                      </span>
                    </td>
                  </tr>
                  {twins.list.map(({ u, d }) => (
                    <tr key={u.key} className="border-t border-slate-100">
                      <td className="py-1">{u.name}</td>
                      <td className="py-1 text-right tabular-nums text-slate-400">{d.toFixed(2)}</td>
                      <td className="py-1 text-right tabular-nums">{fmtNum(yValue(u))}%</td>
                      <td className="py-1 pl-4">
                        <span className="flex items-center gap-1.5">
                          <PartyDot color={parties[winner(u.votes)]?.color ?? "#999"} />
                          {parties[winner(u.votes)]?.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[10px] text-slate-400">
                Distancia euclídea sobre renta, edad, nacionalidad, Gini, hogares, educación, paro censal y costa (estandarizadas).
                Si votan muy distinto de su gemela, hay un efecto local que la sociología no explica.
              </p>
            </div>
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            El tamaño del punto refleja la población. Color = partido más votado. La recta es la regresión lineal;
            la r parcial descuenta el efecto de la edad media. Correlación no implica causalidad.
          </p>
        </>
      )}

      {/* ---------- quintiles ---------- */}
      {vista === "quintiles" && quintiles && (
        <>
          <div className="h-[420px]" ref={chartRef}>
            <ResponsiveContainer>
              <BarChart data={quintiles.rows} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="q" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  formatter={(v, k) => [fmtPct(v), parties[k]?.label ?? k]}
                  labelFormatter={(q, payload) => {
                    const row = payload?.[0]?.payload;
                    return `${q} · ${indLabel}: ${row?.rango} · ${row?.n} ${effLevel === "sec" ? "secciones" : "municipios"}`;
                  }}
                />
                <Legend formatter={(k) => <span className="text-xs">{parties[k]?.label ?? k}</span>} />
                {quintiles.tops.map((pid) => (
                  <Bar key={pid} dataKey={pid} fill={parties[pid]?.color ?? "#999"} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Las {effLevel === "sec" ? "secciones" : "municipios"} se ordenan por «{indLabel}» y se parten en cinco grupos
            iguales (Q1 = valores más bajos, Q5 = más altos). Barras = % de voto agregado de cada quintil.
          </p>
        </>
      )}

      {/* ---------- matriz ---------- */}
      {vista === "matriz" && matrix && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-1.5 text-left font-medium text-slate-500">Indicador</th>
                  {matrix.cols.map(([v, l]) => (
                    <th key={v} className="p-1.5 text-center font-medium text-slate-500" style={{ minWidth: 64 }}>
                      {l.replace("% bloque ", "").replace("% ", "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.ind} className="border-t border-slate-100">
                    <td className="p-1.5 font-medium text-slate-600">{row.label}</td>
                    {row.cells.map((c, i) => (
                      <td
                        key={i}
                        onClick={() => {
                          if (c == null) return;
                          setIndicator(row.ind);
                          setTarget(matrix.cols[i][0]);
                          setVista("dispersion");
                        }}
                        className="cursor-pointer p-1.5 text-center tabular-nums transition hover:ring-2 hover:ring-sky-400"
                        style={{
                          background: c == null ? "#f8fafc" : divergingColor(c, 0.8, "#b91c1c", "#1d4ed8"),
                          color: c != null && Math.abs(c) > 0.45 ? "#fff" : "#334155",
                        }}
                      >
                        {c == null ? "—" : c.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Correlación de Pearson entre cada indicador y cada voto, sobre las {units.length}{" "}
            {effLevel === "sec" ? "secciones" : "municipios"} de {election.label} {election.year}.
            Rojo = correlación positiva, azul = negativa. Clic en una celda para abrir su dispersión.
          </p>
        </>
      )}

      {/* ---------- tendencia ---------- */}
      {vista === "tendencia" && trend && (
        <>
          <div className="h-[420px]" ref={chartRef}>
            <ResponsiveContainer>
              <LineChart data={trend.data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="x" type="number" domain={["dataMin - 0.5", "dataMax + 0.5"]} tickFormatter={(v) => Math.floor(v)} tick={{ fontSize: 11 }} />
                <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, k) => [v, KIND_LABEL[k] ?? k]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                />
                <Legend formatter={(k) => <span className="text-xs">{KIND_LABEL[k] ?? k}</span>} />
                {trend.kinds.map((k) => (
                  <Line key={k} dataKey={k} stroke={KIND_COLOR[k]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Correlación por sección censal entre «{indLabel}» y «{targetLabel}» en cada elección desde 2015.
            Si la línea se aleja de 0 con el tiempo, ese eje social está polarizando más el voto.
          </p>
        </>
      )}

      {/* ---------- residuos ---------- */}
      {vista === "residuos" && (
        <>
          {residuals && geoSec ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <div ref={mapRef}>
                <MapView
                  geojson={geoSec}
                  getKey={(p) => p.CUSEC}
                  getFill={(p) => {
                    const v = residuals[p.CUSEC?.slice(2)];
                    return v ? divergingColor(v.resid, 15, "#15803d", "#7c3aed") : "#e2e8f0";
                  }}
                  getTooltip={(p) => {
                    const v = residuals[p.CUSEC?.slice(2)];
                    if (!v) return <div>Sin datos</div>;
                    const esperado = v.real - v.resid;
                    return (
                      <div>
                        <div className="mb-1 font-semibold">{v.name}</div>
                        <div>{targetLabel} real: <b>{fmtNum(v.real)}%</b></div>
                        <div>Esperado por «{indLabel}»: <b>{fmtNum(esperado)}%</b></div>
                        <div>Residuo: <b>{v.resid >= 0 ? "+" : ""}{fmtNum(v.resid)} pp</b></div>
                      </div>
                    );
                  }}
                />
              </div>
              <div className="space-y-3 text-xs text-slate-600">
                <div>
                  <div className="mb-1 font-semibold text-slate-700">Cómo leerlo</div>
                  Verde: el voto «{targetLabel}» es <b>mayor</b> de lo que predice «{indLabel}» en esa sección
                  (sobre-rendimiento). Morado: menor de lo esperado. Es el efecto local que la variable no explica.
                </div>
                <div className="min-w-44">
                  <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(to right,${Array.from({ length: 9 }, (_, i) => divergingColor(-15 + (30 * i) / 8, 15, "#15803d", "#7c3aed")).join(",")})` }} />
                  <div className="mt-0.5 flex justify-between text-[10px] text-slate-400">
                    <span>−15 pp</span><span>0</span><span>+15 pp</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">
                  Regresión: {targetLabel} ~ {indLabel} sobre {points.length} secciones · r² = {r == null ? "—" : (r * r).toFixed(2)}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-[420px] items-center justify-center text-sm text-slate-400">Cargando mapa…</div>
          )}
        </>
      )}
    </Card>
  );
}
