import { useEffect, useMemo, useState } from "react";
import MapView from "./MapView.jsx";
import { Card, Select, ResultBar } from "./ui.jsx";
import {
  loadSummary, loadElection, loadGeoMunicipios, loadGeoSecciones,
  rankVotes, winner, partyShare, blocShare, participation, toCanonical, fmtPct, fmtInt,
} from "../lib/data.js";
import { shareColor, participationColor } from "../lib/colors.js";

export default function MapPanel({ index, parties, municipios, openMunicipio }) {
  const [electionId, setElectionId] = useState(index[index.length - 1].id);
  const [level, setLevel] = useState("mun");
  const [metric, setMetric] = useState("winner");
  const [summary, setSummary] = useState(null);
  const [detail, setDetail] = useState(null);
  const [geoMun, setGeoMun] = useState(null);
  const [geoSec, setGeoSec] = useState(null);

  const election = index.find((e) => e.id === electionId);

  useEffect(() => {
    loadSummary().then(setSummary);
    loadGeoMunicipios().then(setGeoMun);
  }, []);
  useEffect(() => {
    if (level === "sec") loadGeoSecciones().then(setGeoSec);
  }, [level]);
  useEffect(() => {
    setDetail(null);
    loadElection(electionId).then(setDetail);
  }, [electionId]);

  // votos por partido canónico de cada unidad del nivel activo
  const units = useMemo(() => {
    if (level === "mun") {
      if (!summary) return null;
      return summary[electionId]?.mun ?? null;
    }
    if (!detail) return null;
    const out = {};
    for (const [key, s] of Object.entries(detail.secciones)) {
      out[key] = { ...s, votes: toCanonical(s.votes, detail.pmap) };
    }
    return out;
  }, [level, summary, detail, electionId]);

  const provRows = useMemo(() => {
    if (!summary) return null;
    const s = summary[electionId];
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
  }, [summary, electionId, parties]);

  const metricOptions = useMemo(() => {
    const opts = [
      ["winner", "Partido más votado"],
      ["part", "Participación"],
      ["bloc:izquierda", "% bloque izquierda"],
      ["bloc:derecha", "% bloque derecha"],
    ];
    if (provRows) {
      for (const r of provRows.rows.slice(0, 8)) opts.push([`party:${r.pid}`, `% ${r.label}`]);
    }
    return opts;
  }, [provRows]);

  function unitFor(props) {
    if (!units) return null;
    const key = level === "mun" ? props.CMUN : props.CUSEC?.slice(2);
    return units[key];
  }

  function getFill(props) {
    const u = unitFor(props);
    if (!u || !Object.keys(u.votes).length) return "#e2e8f0";
    if (metric === "winner") {
      const w = winner(u.votes);
      return shareColor(parties[w]?.color ?? "#999", partyShare(u.votes, w));
    }
    if (metric === "part") return participationColor(participation(u));
    if (metric.startsWith("party:")) {
      const pid = metric.slice(6);
      return shareColor(parties[pid]?.color ?? "#999", partyShare(u.votes, pid));
    }
    if (metric.startsWith("bloc:")) {
      const bloc = metric.slice(5);
      const color = bloc === "izquierda" ? "#dc2626" : "#1d4ed8";
      return shareColor(color, blocShare(u.votes, parties, bloc));
    }
    return "#e2e8f0";
  }

  function getTooltip(props) {
    const u = unitFor(props);
    const name =
      level === "mun"
        ? municipios[props.CMUN]?.name ?? props.NMUN
        : `${municipios[props.CUSEC?.slice(2, 5)]?.name ?? ""} · sección ${props.CDIS}-${props.CSEC}`;
    if (!u || !Object.keys(u.votes).length) {
      return <div><b>{name}</b><br />Sin datos en esta elección</div>;
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
        <div className="mt-1 text-slate-400">Participación: {fmtPct(participation(u))}</div>
      </div>
    );
  }

  const geo = level === "mun" ? geoMun : geoSec;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Select label="Elección" value={electionId} onChange={setElectionId} className="min-w-44">
            {[...index].reverse().map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} {e.year}
              </option>
            ))}
          </Select>
          <Select label="Nivel" value={level} onChange={setLevel}>
            <option value="mun">Municipios</option>
            {election?.secciones && <option value="sec">Secciones censales</option>}
          </Select>
          <Select label="Métrica" value={metric} onChange={setMetric} className="min-w-48">
            {metricOptions.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        {level === "sec" && !election?.secciones ? (
          <div className="flex h-[480px] items-center justify-center text-sm text-slate-400">
            Esta elección no tiene datos por sección censal (solo municipales de 1979 y 1983).
          </div>
        ) : (
          <MapView
            geojson={geo}
            getFill={getFill}
            getTooltip={getTooltip}
            getKey={(p) => (level === "mun" ? p.CMUN : p.CUSEC)}
            onSelect={(p) => {
              const code = level === "mun" ? p.CMUN : p.CUSEC?.slice(2, 5);
              if (code) openMunicipio(code);
            }}
          />
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Contorno de secciones censales de 2023 (INE): en elecciones antiguas el seccionado puede no coincidir
          exactamente. Clic en un municipio para abrir su ficha.
        </p>
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
      </div>
    </div>
  );
}
