import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./MapView.jsx";
import { Card, Select, SearchSelect, MiniButton, ResultBar, PartyDot } from "./ui.jsx";
import {
  loadSummary, loadElection, loadGeoMunicipios, loadGeoSecciones,
  rankVotes, winner, partyShare, blocShare, participation, toCanonical,
  margin, enp, pedersen, fmtPct, fmtInt, fmtNum,
} from "../lib/data.js";
import { shareColor, participationColor, divergingColor, tint } from "../lib/colors.js";
import { useHashParam } from "../lib/urlState.js";
import { rowsToCsv, svgToPng } from "../lib/export.js";

const BLOC_COLORS = { izquierda: "#dc2626", derecha: "#1d4ed8" };

// Barra de gradiente para la leyenda del mapa.
function GradientBar({ colorAt, min, max, minLabel, maxLabel, midLabel }) {
  const stops = Array.from({ length: 9 }, (_, i) => colorAt(min + ((max - min) * i) / 8)).join(",");
  return (
    <div className="min-w-44 max-w-60 flex-1">
      <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(to right,${stops})` }} />
      <div className="mt-0.5 flex justify-between text-[10px] text-slate-400">
        <span>{minLabel}</span>
        {midLabel && <span>{midLabel}</span>}
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export default function MapPanel({ index, parties, municipios, openMunicipio }) {
  const defaultId = index[index.length - 1].id;
  const [electionId, setElectionId] = useHashParam("el", defaultId);
  const [cmpId, setCmpId] = useHashParam("cmp", "");
  const [level, setLevel] = useHashParam("lvl", "mun");
  const [metric, setMetric] = useHashParam("met", "winner");
  const [zona, setZona] = useHashParam("zona", "");
  const [summary, setSummary] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailB, setDetailB] = useState(null);
  const [geoMun, setGeoMun] = useState(null);
  const [geoSec, setGeoSec] = useState(null);
  const mapBoxRef = useRef(null);

  const election = index.find((e) => e.id === electionId) ?? index[index.length - 1];
  const electionB = index.find((e) => e.id === cmpId);
  const compare = !!electionB && cmpId !== electionId;

  useEffect(() => {
    loadSummary().then(setSummary);
    loadGeoMunicipios().then(setGeoMun);
  }, []);
  useEffect(() => {
    if (level === "sec") loadGeoSecciones().then(setGeoSec);
  }, [level]);
  useEffect(() => {
    setDetail(null);
    loadElection(election.id).then(setDetail);
  }, [election.id]);
  useEffect(() => {
    setDetailB(null);
    if (compare) loadElection(cmpId).then(setDetailB);
  }, [cmpId, compare]);

  // votos por partido canónico de cada unidad del nivel activo
  function buildUnits(eid, det) {
    if (level === "mun") return summary?.[eid]?.mun ?? null;
    if (!det) return null;
    const out = {};
    for (const [key, s] of Object.entries(det.secciones)) {
      out[key] = { ...s, votes: toCanonical(s.votes, det.pmap) };
    }
    return out;
  }
  const units = useMemo(() => buildUnits(election.id, detail), [level, summary, detail, election.id]);
  const unitsB = useMemo(
    () => (compare ? buildUnits(cmpId, detailB) : null),
    [level, summary, detailB, cmpId, compare]
  );

  const provRows = useMemo(() => {
    if (!summary) return null;
    const s = summary[election.id];
    if (!s) return null;
    const tot = Object.values(s.prov).reduce((a, b) => a + b, 0);
    return {
      total: tot,
      censo: s.censo,
      blanco: s.blanco,
      nulos: s.nulos,
      rows: rankVotes(s.prov)
        .slice(0, 9)
        .map(([pid, v]) => ({
          pid,
          label: parties[pid]?.label ?? pid,
          color: parties[pid]?.color ?? "#999",
          votes: v,
          share: (100 * v) / tot,
        })),
    };
  }, [summary, election.id, parties]);

  const metricOptions = useMemo(() => {
    const tops = provRows ? provRows.rows.slice(0, 8) : [];
    if (compare) {
      const opts = [
        ["winnerchg", "Cambio de partido más votado"],
        ["volat", "Volatilidad (índice de Pedersen)"],
        ["dpart", "Δ participación"],
        ["dbloc:izquierda", "Δ % bloque izquierda"],
        ["dbloc:derecha", "Δ % bloque derecha"],
      ];
      for (const r of tops) opts.push([`dparty:${r.pid}`, `Δ % ${r.label}`]);
      return opts;
    }
    const opts = [
      ["winner", "Partido más votado"],
      ["margin", "Margen de victoria (1º − 2º)"],
      ["part", "Participación"],
      ["nep", "Fragmentación (nº efectivo de partidos)"],
      ["bloc:izquierda", "% bloque izquierda"],
      ["bloc:derecha", "% bloque derecha"],
    ];
    for (const r of tops) opts.push([`party:${r.pid}`, `% ${r.label}`]);
    return opts;
  }, [provRows, compare]);

  // si la métrica activa no existe en el modo actual, vuelve a la básica
  useEffect(() => {
    if (provRows && !metricOptions.some(([v]) => v === metric)) {
      setMetric(compare ? "winnerchg" : "winner");
    }
  }, [metricOptions, provRows, metric, compare]);

  function unitFor(props, set = units) {
    if (!set) return null;
    const key = level === "mun" ? props.CMUN : props.CUSEC?.slice(2);
    return set[key];
  }

  // valor de la métrica para una unidad (modo normal)
  function metricValue(u) {
    if (metric === "part") return participation(u);
    if (metric === "margin") return margin(u.votes);
    if (metric === "nep") return enp(u.votes);
    if (metric.startsWith("party:")) return partyShare(u.votes, metric.slice(6));
    if (metric.startsWith("bloc:")) return blocShare(u.votes, parties, metric.slice(5));
    return null;
  }

  // valor con delta para una unidad (modo comparación) -> {a, b, d}
  function deltaValue(uA, uB) {
    if (!uA || !uB) return null;
    let a, b;
    if (metric === "dpart") {
      a = participation(uA);
      b = participation(uB);
    } else if (metric === "volat") {
      const v = pedersen(uA.votes, uB.votes);
      return v == null ? null : { a: null, b: null, d: v };
    } else if (metric.startsWith("dparty:")) {
      a = partyShare(uA.votes, metric.slice(7));
      b = partyShare(uB.votes, metric.slice(7));
    } else if (metric.startsWith("dbloc:")) {
      a = blocShare(uA.votes, parties, metric.slice(6));
      b = blocShare(uB.votes, parties, metric.slice(6));
    } else return null;
    if (a == null || b == null) return null;
    return { a, b, d: a - b };
  }

  function getFill(props) {
    const u = unitFor(props);
    if (!u || !Object.keys(u.votes).length) return "#e2e8f0";
    if (compare) {
      const uB = unitFor(props, unitsB);
      if (!uB || !Object.keys(uB.votes).length) return "#e2e8f0";
      if (metric === "winnerchg") {
        const wA = winner(u.votes);
        const wB = winner(uB.votes);
        if (!wA || !wB) return "#e2e8f0";
        return wA === wB ? "#e5e7eb" : tint(parties[wA]?.color ?? "#999", 0.8);
      }
      const dv = deltaValue(u, uB);
      if (!dv) return "#e2e8f0";
      if (metric === "volat") return tint("#7c3aed", 0.06 + 0.94 * Math.min(dv.d / 35, 1));
      if (metric === "dpart") return divergingColor(dv.d, 20, "#0369a1", "#b45309");
      const pos = metric.startsWith("dbloc:")
        ? BLOC_COLORS[metric.slice(6)]
        : parties[metric.slice(7)]?.color ?? "#16a34a";
      return divergingColor(dv.d, 12, pos);
    }
    if (metric === "winner") {
      const w = winner(u.votes);
      return shareColor(parties[w]?.color ?? "#999", partyShare(u.votes, w));
    }
    if (metric === "margin") {
      const w = winner(u.votes);
      const m = margin(u.votes);
      if (m == null) return "#e2e8f0";
      return tint(parties[w]?.color ?? "#999", 0.12 + 0.88 * Math.min(m / 30, 1));
    }
    if (metric === "part") return participationColor(participation(u));
    if (metric === "nep") {
      const v = enp(u.votes);
      if (v == null) return "#e2e8f0";
      return tint("#0d9488", 0.08 + 0.92 * Math.max(0, Math.min((v - 1) / 5, 1)));
    }
    if (metric.startsWith("party:")) {
      const pid = metric.slice(6);
      return shareColor(parties[pid]?.color ?? "#999", partyShare(u.votes, pid));
    }
    if (metric.startsWith("bloc:")) {
      const bloc = metric.slice(5);
      return shareColor(BLOC_COLORS[bloc], blocShare(u.votes, parties, bloc));
    }
    return "#e2e8f0";
  }

  function unitName(props) {
    return level === "mun"
      ? municipios[props.CMUN]?.name ?? props.NMUN
      : `${municipios[props.CUSEC?.slice(2, 5)]?.name ?? ""} · sección ${props.CDIS}-${props.CSEC}`;
  }

  function getTooltip(props) {
    const u = unitFor(props);
    const name = unitName(props);
    if (!u || !Object.keys(u.votes).length) {
      return (
        <div>
          <b>{name}</b>
          <br />
          Sin datos en esta elección
        </div>
      );
    }
    if (compare) {
      const uB = unitFor(props, unitsB);
      if (!uB || !Object.keys(uB.votes).length) {
        return (
          <div>
            <b>{name}</b>
            <br />
            Sin datos en la elección de comparación
          </div>
        );
      }
      const wA = winner(u.votes);
      const wB = winner(uB.votes);
      const dv = deltaValue(u, uB);
      const lbl = metricOptions.find(([v]) => v === metric)?.[1] ?? "";
      return (
        <div>
          <div className="mb-1 font-semibold">{name}</div>
          <div>
            Ganador: <span style={{ color: parties[wB]?.color }}>{parties[wB]?.label ?? wB}</span>
            {" → "}
            <span style={{ color: parties[wA]?.color }}>{parties[wA]?.label ?? wA}</span>
          </div>
          {metric === "volat" && dv && <div>Volatilidad: <b>{fmtNum(dv.d)}</b></div>}
          {metric !== "volat" && metric !== "winnerchg" && dv && (
            <div>
              {lbl}: {fmtPct(dv.b)} → {fmtPct(dv.a)} (<b>{dv.d >= 0 ? "+" : ""}{fmtNum(dv.d)}</b> pp)
            </div>
          )}
        </div>
      );
    }
    const top = rankVotes(u.votes).slice(0, 4);
    const tot = Object.values(u.votes).reduce((a, b) => a + b, 0);
    return (
      <div>
        <div className="mb-1 font-semibold">{name}</div>
        {top.map(([pid, v]) => (
          <div key={pid} className="flex justify-between gap-3">
            <span style={{ color: parties[pid]?.color }}>{parties[pid]?.label ?? pid}</span>
            <span className="tabular-nums">{fmtPct((100 * v) / tot)}</span>
          </div>
        ))}
        <div className="mt-1 text-slate-400">
          Participación: {fmtPct(participation(u))} · margen {fmtNum(margin(u.votes))} pp
        </div>
      </div>
    );
  }

  // GeoJSON activo (con filtro de municipio en nivel secciones)
  const geo = useMemo(() => {
    if (level === "mun") return geoMun;
    if (!geoSec) return null;
    if (!zona) return geoSec;
    let features = geoSec.features.filter((f) => f.properties.CUSEC?.slice(2, 5) === zona);
    if (!features.length) return geoSec;
    // al enfocar un municipio, descarta las partes lejanas de los multipolígonos
    // (p. ej. las Columbretes en Castelló) para que el encuadre sea el casco
    const firsts = features.map((f) => {
      const g = f.geometry;
      return g.type === "MultiPolygon" ? g.coordinates[0][0][0] : g.coordinates[0][0];
    });
    const med = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)];
    const cx = med(firsts.map((p) => p[0]));
    const cy = med(firsts.map((p) => p[1]));
    features = features.map((f) => {
      if (f.geometry.type !== "MultiPolygon") return f;
      const keep = f.geometry.coordinates.filter((poly) => {
        const [lon, lat] = poly[0][0];
        return Math.abs(lon - cx) < 0.3 && Math.abs(lat - cy) < 0.3;
      });
      return keep.length ? { ...f, geometry: { ...f.geometry, coordinates: keep } } : f;
    });
    return { ...geoSec, features };
  }, [level, geoMun, geoSec, zona]);

  const munOptions = useMemo(
    () => [
      ["", "Toda la provincia"],
      ...Object.entries(municipios)
        .sort((a, b) => a[1].name.localeCompare(b[1].name, "es"))
        .map(([c, m]) => [c, m.name]),
    ],
    [municipios]
  );

  function exportCsv() {
    if (!units) return;
    const rows = Object.entries(units)
      .map(([key, u]) => {
        if (!Object.keys(u.votes).length) return null;
        const w = winner(u.votes);
        const row = {
          codigo: level === "mun" ? key : `12${key}`,
          nombre: level === "mun" ? municipios[key]?.name ?? key : municipios[key.slice(0, 3)]?.name ?? "",
          censo: u.censo ?? "",
          participacion: participation(u)?.toFixed(2) ?? "",
          ganador: parties[w]?.label ?? w,
          pct_ganador: partyShare(u.votes, w)?.toFixed(2) ?? "",
          margen: margin(u.votes)?.toFixed(2) ?? "",
          nep: enp(u.votes)?.toFixed(2) ?? "",
          pct_izquierda: blocShare(u.votes, parties, "izquierda")?.toFixed(2) ?? "",
          pct_derecha: blocShare(u.votes, parties, "derecha")?.toFixed(2) ?? "",
        };
        if (compare && unitsB?.[key]) {
          const uB = unitsB[key];
          row.volatilidad = pedersen(u.votes, uB.votes)?.toFixed(2) ?? "";
          const dv = deltaValue(u, uB);
          if (dv && metric !== "volat" && metric !== "winnerchg") row.delta_metrica = dv.d.toFixed(2);
        }
        return row;
      })
      .filter(Boolean)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    rowsToCsv(rows, `atlas-${election.id}${compare ? `-vs-${cmpId}` : ""}-${level}.csv`);
  }

  function exportPng() {
    const svg = mapBoxRef.current?.querySelector("svg");
    svgToPng(svg, `mapa-${election.id}${compare ? `-vs-${cmpId}` : ""}-${metric}.png`);
  }

  // leyenda según métrica
  function legend() {
    if (compare) {
      if (metric === "winnerchg") {
        return (
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><PartyDot color="#e5e7eb" /> mismo ganador</span>
            <span>color = nuevo partido más votado</span>
          </div>
        );
      }
      if (metric === "volat") {
        return (
          <GradientBar colorAt={(v) => tint("#7c3aed", 0.06 + 0.94 * Math.min(v / 35, 1))} min={0} max={35} minLabel="0" maxLabel="≥35 (volatilidad)" />
        );
      }
      if (metric === "dpart") {
        return (
          <GradientBar colorAt={(v) => divergingColor(v, 20, "#0369a1", "#b45309")} min={-20} max={20} minLabel="−20 pp" midLabel="0" maxLabel="+20 pp" />
        );
      }
      const pos = metric.startsWith("dbloc:") ? BLOC_COLORS[metric.slice(6)] : parties[metric.slice(7)]?.color ?? "#16a34a";
      return (
        <GradientBar colorAt={(v) => divergingColor(v, 12, pos)} min={-12} max={12} minLabel="−12 pp" midLabel="0" maxLabel="+12 pp" />
      );
    }
    if (metric === "winner") {
      return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {(provRows?.rows ?? []).slice(0, 6).map((r) => (
            <span key={r.pid} className="flex items-center gap-1"><PartyDot color={r.color} /> {r.label}</span>
          ))}
          <span>· intensidad = % de voto</span>
        </div>
      );
    }
    if (metric === "margin") {
      return (
        <GradientBar colorAt={(v) => tint("#475569", 0.12 + 0.88 * Math.min(v / 30, 1))} min={0} max={30} minLabel="0 pp" maxLabel="≥30 pp (color del ganador)" />
      );
    }
    if (metric === "part") {
      return <GradientBar colorAt={participationColor} min={40} max={95} minLabel="40%" maxLabel="95%" />;
    }
    if (metric === "nep") {
      return (
        <GradientBar colorAt={(v) => tint("#0d9488", 0.08 + 0.92 * Math.max(0, Math.min((v - 1) / 5, 1)))} min={1} max={6} minLabel="1 partido" maxLabel="≥6 efectivos" />
      );
    }
    const hex = metric.startsWith("bloc:") ? BLOC_COLORS[metric.slice(5)] : parties[metric.slice(6)]?.color ?? "#999";
    return <GradientBar colorAt={(v) => shareColor(hex, v)} min={0} max={60} minLabel="0%" maxLabel="≥60%" />;
  }

  const secUnavailable =
    level === "sec" && (!election?.secciones || (compare && electionB && !electionB.secciones));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Select label="Elección" value={election.id} onChange={setElectionId} className="min-w-44">
            {[...index].reverse().map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} {e.year}
              </option>
            ))}
          </Select>
          <Select label="Comparar con" value={compare ? cmpId : ""} onChange={setCmpId} className="min-w-44">
            <option value="">— sin comparación</option>
            {[...index].reverse().filter((e) => e.id !== election.id).map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} {e.year}
              </option>
            ))}
          </Select>
          <Select label="Nivel" value={level} onChange={setLevel}>
            <option value="mun">Municipios</option>
            <option value="sec">Secciones censales</option>
          </Select>
          {level === "sec" && (
            <SearchSelect label="Municipio" value={zona} onChange={setZona} options={munOptions} className="min-w-48" />
          )}
          <Select label="Métrica" value={metric} onChange={setMetric} className="min-w-48">
            {metricOptions.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <div className="ml-auto flex gap-1.5">
            <MiniButton onClick={exportPng} title="Descargar el mapa como imagen">PNG</MiniButton>
            <MiniButton onClick={exportCsv} title="Descargar los datos del mapa">CSV</MiniButton>
          </div>
        </div>
        {secUnavailable ? (
          <div className="flex h-[480px] items-center justify-center px-8 text-center text-sm text-slate-400">
            {!election?.secciones
              ? "Esta elección no tiene datos por sección censal (solo municipales de 1979 y 1983)."
              : "La elección de comparación no tiene datos por sección censal: compara a nivel de municipios."}
          </div>
        ) : (
          <div ref={mapBoxRef}>
            <MapView
              geojson={geo}
              getFill={getFill}
              getTooltip={getTooltip}
              getKey={(p) => (level === "mun" ? p.CMUN : p.CUSEC)}
              onSelect={(p) => {
                if (level === "mun") {
                  openMunicipio(p.CMUN);
                } else if (!zona) {
                  // primer clic en nivel secciones: enfoca el municipio
                  const code = p.CUSEC?.slice(2, 5);
                  if (code) setZona(code);
                } else {
                  openMunicipio(zona);
                }
              }}
            />
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          {!secUnavailable && legend()}
          <p className="text-[11px] text-slate-400">
            {compare
              ? `Cambio de ${electionB.label} ${electionB.year} a ${election.label} ${election.year}.`
              : "Rueda o doble clic para hacer zoom; arrastra para moverte."}
            {level === "sec" && !zona && " Clic en una sección para enfocar su municipio."}
          </p>
        </div>
      </Card>
      <div className="space-y-4">
        <Card title={`Resultado provincial · ${election.label} ${election.year}`}>
          {provRows ? (
            <>
              <ResultBar rows={provRows.rows} total={provRows.total} />
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-center text-[11px] text-slate-500">
                <div>
                  <div className="font-semibold text-slate-700">{fmtInt(provRows.censo)}</div>censo
                </div>
                <div>
                  <div className="font-semibold text-slate-700">{fmtInt(provRows.blanco)}</div>en blanco
                </div>
                <div>
                  <div className="font-semibold text-slate-700">{fmtInt(provRows.nulos)}</div>nulos
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-400">Cargando…</div>
          )}
        </Card>
        {compare && summary?.[cmpId] && (
          <Card title={`Comparado con · ${electionB.label} ${electionB.year}`}>
            <ResultBar
              total={Object.values(summary[cmpId].prov).reduce((a, b) => a + b, 0)}
              rows={rankVotes(summary[cmpId].prov)
                .slice(0, 6)
                .map(([pid, v]) => {
                  const tot = Object.values(summary[cmpId].prov).reduce((a, b) => a + b, 0);
                  return {
                    pid,
                    label: parties[pid]?.label ?? pid,
                    color: parties[pid]?.color ?? "#999",
                    votes: v,
                    share: (100 * v) / tot,
                  };
                })}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
