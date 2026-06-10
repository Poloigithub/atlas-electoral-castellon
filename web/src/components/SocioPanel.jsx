import { useEffect, useMemo, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis,
} from "recharts";
import { Card, Select, MiniButton } from "./ui.jsx";
import {
  loadSocio, loadElection, toCanonical, partyShare, blocShare, winner,
  participation, rankVotes, fmtNum,
} from "../lib/data.js";
import { useHashParam } from "../lib/urlState.js";
import { rowsToCsv } from "../lib/export.js";

// regresión lineal simple por mínimos cuadrados
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

export default function SocioPanel({ index, parties, municipios }) {
  const withSecciones = index.filter((e) => e.secciones);
  const [socio, setSocio] = useState(null);
  const [electionId, setElectionId] = useHashParam("soel", withSecciones[withSecciones.length - 1].id);
  const [detail, setDetail] = useState(null);
  const [indicator, setIndicator] = useHashParam("sx", "rentaP");
  const [target, setTarget] = useHashParam("sy", "bloc:derecha");
  const [sizeF, setSizeF] = useHashParam("stam", "");

  useEffect(() => {
    loadSocio().then(setSocio);
  }, []);
  useEffect(() => {
    setDetail(null);
    loadElection(electionId).then(setDetail);
  }, [electionId]);

  const election = index.find((e) => e.id === electionId) ?? withSecciones[withSecciones.length - 1];
  // año del indicador: el más cercano a la elección dentro del rango ADRH
  const socioYear = useMemo(() => {
    if (!socio) return null;
    const ys = socio.years;
    return ys.reduce((best, y) =>
      Math.abs(y - election.year) < Math.abs(best - election.year) ? y : best
    );
  }, [socio, election]);

  const targetOptions = useMemo(() => {
    const opts = [
      ["bloc:izquierda", "% bloque izquierda"],
      ["bloc:derecha", "% bloque derecha"],
      ["part", "Participación"],
    ];
    if (detail) {
      const prov = {};
      for (const s of Object.values(detail.secciones)) {
        for (const [c, v] of Object.entries(s.votes)) prov[c] = (prov[c] || 0) + v;
      }
      const canon = toCanonical(prov, detail.pmap);
      for (const [pid] of rankVotes(canon).slice(0, 8)) {
        if (pid !== "otros") opts.push([`party:${pid}`, `% ${parties[pid]?.label ?? pid}`]);
      }
    }
    return opts;
  }, [detail, parties]);

  // filtro por tamaño del municipio (población del último año ADRH)
  const munPob = useMemo(() => {
    if (!socio) return {};
    const last = Math.max(...socio.years);
    const out = {};
    for (const [mun, ind] of Object.entries(socio.municipios)) out[mun] = ind.pob?.[last];
    return out;
  }, [socio]);

  function sizeOk(key) {
    if (!sizeF) return true;
    const mun = key.slice(0, 3);
    const pob = munPob[mun];
    if (pob == null) return false;
    if (sizeF === "cap") return mun === "040";
    if (sizeF === "g") return pob >= 20000 && mun !== "040";
    if (sizeF === "m") return pob >= 5000 && pob < 20000;
    if (sizeF === "p") return pob < 5000;
    return true;
  }

  const points = useMemo(() => {
    if (!socio || !detail || !socioYear) return [];
    const pts = [];
    for (const [key, s] of Object.entries(detail.secciones)) {
      if (!sizeOk(key)) continue;
      const ind = socio.secciones[key]?.[indicator]?.[socioYear];
      if (ind == null) continue;
      const votes = toCanonical(s.votes, detail.pmap);
      if (!Object.keys(votes).length) continue;
      let y;
      if (target === "part") y = participation(s);
      else if (target.startsWith("bloc:")) y = blocShare(votes, parties, target.slice(5));
      else y = partyShare(votes, target.slice(6));
      if (y == null) continue;
      const w = winner(votes);
      pts.push({
        x: ind,
        y: +y.toFixed(2),
        key,
        name: `${municipios[key.slice(0, 3)]?.name ?? ""} · ${key.slice(3, 5)}-${key.slice(5)}`,
        fill: parties[w]?.color ?? "#999",
        pob: socio.secciones[key]?.pob?.[socioYear] ?? 800,
      });
    }
    return pts;
  }, [socio, detail, socioYear, indicator, target, parties, municipios, sizeF, munPob]);

  const r = useMemo(() => pearson(points.map((p) => [p.x, p.y])), [points]);

  // recta de regresión, recortada al rango visible de Y
  const regLine = useMemo(() => {
    const fit = ols(points.map((p) => [p.x, p.y]));
    if (!fit) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    let x1 = Math.min(...xs);
    let x2 = Math.max(...xs);
    const ymin = Math.min(0, ...ys);
    const ymax = Math.max(...ys);
    const yAt = (x) => fit.slope * x + fit.intercept;
    const xAt = (y) => (y - fit.intercept) / (fit.slope || 1e-9);
    let y1 = yAt(x1);
    let y2 = yAt(x2);
    if (y1 < ymin) { x1 = xAt(ymin); y1 = ymin; }
    if (y1 > ymax) { x1 = xAt(ymax); y1 = ymax; }
    if (y2 < ymin) { x2 = xAt(ymin); y2 = ymin; }
    if (y2 > ymax) { x2 = xAt(ymax); y2 = ymax; }
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }, [points]);
  const targetLabel = targetOptions.find(([v]) => v === target)?.[1] ?? "";
  const indLabel = socio?.labels?.[indicator] ?? indicator;

  return (
    <Card
      title="Voto y variables socioeconómicas por sección censal"
      subtitle="Cada punto es una sección censal de la provincia, coloreada por el partido más votado en ella. Fuente: Atlas de Renta (INE) 2015-2023."
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label="Elección" value={electionId} onChange={setElectionId} className="min-w-44">
          {[...withSecciones].reverse().map((e) => (
            <option key={e.id} value={e.id}>{e.label} {e.year}</option>
          ))}
        </Select>
        <Select label="Indicador (eje X)" value={indicator} onChange={setIndicator} className="min-w-56">
          {socio &&
            Object.entries(socio.labels).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
        </Select>
        <Select label="Voto (eje Y)" value={target} onChange={setTarget} className="min-w-48">
          {targetOptions.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <Select label="Municipios" value={sizeF} onChange={setSizeF} className="min-w-44">
          <option value="">Todos</option>
          <option value="cap">Castelló de la Plana</option>
          <option value="g">&gt;20.000 hab (sin capital)</option>
          <option value="m">5.000–20.000 hab</option>
          <option value="p">&lt;5.000 hab</option>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
            r = <b>{r == null ? "—" : r.toFixed(2)}</b> · r² = <b>{r == null ? "—" : (r * r).toFixed(2)}</b> ·{" "}
            {points.length} secciones · indicador de {socioYear}
          </div>
          <MiniButton
            onClick={() =>
              rowsToCsv(
                points.map((p) => ({ seccion: `12${p.key}`, zona: p.name, [indLabel]: p.x, [targetLabel]: p.y })),
                `socio-${electionId}-${indicator}.csv`
              )
            }
            title="Descargar los puntos como CSV"
          >
            CSV
          </MiniButton>
        </div>
      </div>
      <div className="h-[460px]">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="x"
              type="number"
              domain={["auto", "auto"]}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => v.toLocaleString("es-ES")}
              label={{ value: indLabel, position: "insideBottom", offset: -10, fontSize: 12 }}
            />
            <YAxis
              dataKey="y"
              type="number"
              tick={{ fontSize: 11 }}
              unit="%"
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
                  </div>
                );
              }}
            />
            <Scatter data={points} fillOpacity={0.75} isAnimationActive={false} />
            {regLine && (
              <Scatter
                data={regLine}
                line={{ stroke: "#0f172a", strokeWidth: 1.5, strokeDasharray: "6 4" }}
                shape={() => null}
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        El tamaño del punto refleja la población de la sección. Las secciones censales usadas son las de 2023:
        para elecciones anteriores a ~2011 el cruce pierde precisión. Correlación no implica causalidad.
      </p>
    </Card>
  );
}
