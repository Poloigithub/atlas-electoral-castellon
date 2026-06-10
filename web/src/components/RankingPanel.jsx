import { useEffect, useMemo, useState } from "react";
import { Card, Select, MiniButton, PartyDot } from "./ui.jsx";
import {
  loadSummary, winner, partyShare, blocShare, participation,
  margin, enp, pedersen, fmtInt,
} from "../lib/data.js";
import { useHashParam } from "../lib/urlState.js";
import { rowsToCsv } from "../lib/export.js";

const COLS = [
  ["name", "Municipio", "str"],
  ["censo", "Censo", "num"],
  ["part", "Part. %", "num"],
  ["winner", "Ganador", "str"],
  ["pctWinner", "% gan.", "num"],
  ["margin", "Margen", "num"],
  ["izq", "% izq.", "num"],
  ["der", "% der.", "num"],
  ["nep", "NEP", "num"],
  ["volat", "Volat.", "num"],
];

export default function RankingPanel({ index, parties, municipios, openMunicipio }) {
  const defaultId = index[index.length - 1].id;
  const [electionId, setElectionId] = useHashParam("rel", defaultId);
  const [summary, setSummary] = useState(null);
  const [sortKey, setSortKey] = useState("censo");
  const [asc, setAsc] = useState(false);

  useEffect(() => {
    loadSummary().then(setSummary);
  }, []);

  const election = index.find((e) => e.id === electionId) ?? index[index.length - 1];
  // elección anterior del mismo tipo, para la volatilidad
  const prev = useMemo(() => {
    const same = index.filter((e) => e.kind === election.kind);
    const i = same.findIndex((e) => e.id === election.id);
    return i > 0 ? same[i - 1] : null;
  }, [index, election]);

  const rows = useMemo(() => {
    if (!summary) return [];
    const cur = summary[election.id]?.mun ?? {};
    const old = prev ? summary[prev.id]?.mun ?? {} : {};
    return Object.entries(cur)
      .map(([code, m]) => {
        if (!Object.keys(m.votes).length) return null;
        const w = winner(m.votes);
        const o = old[code];
        return {
          code,
          name: municipios[code]?.name ?? code,
          censo: m.censo ?? null,
          part: participation(m),
          winner: parties[w]?.label ?? w,
          winnerColor: parties[w]?.color ?? "#999",
          pctWinner: partyShare(m.votes, w),
          margin: margin(m.votes),
          izq: blocShare(m.votes, parties, "izquierda"),
          der: blocShare(m.votes, parties, "derecha"),
          nep: enp(m.votes),
          volat: o && Object.keys(o.votes).length ? pedersen(m.votes, o.votes) : null,
        };
      })
      .filter(Boolean);
  }, [summary, election.id, prev, municipios, parties]);

  const sorted = useMemo(() => {
    const type = COLS.find(([k]) => k === sortKey)?.[2] ?? "num";
    const s = [...rows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      return type === "str" ? String(va).localeCompare(String(vb), "es") : va - vb;
    });
    return asc ? s : s.reverse();
  }, [rows, sortKey, asc]);

  function clickHeader(key) {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(key === "name" || key === "winner");
    }
  }

  function exportCsv() {
    rowsToCsv(
      sorted.map((r) => ({
        codigo: r.code,
        municipio: r.name,
        censo: r.censo ?? "",
        participacion: r.part?.toFixed(2) ?? "",
        ganador: r.winner,
        pct_ganador: r.pctWinner?.toFixed(2) ?? "",
        margen: r.margin?.toFixed(2) ?? "",
        pct_izquierda: r.izq?.toFixed(2) ?? "",
        pct_derecha: r.der?.toFixed(2) ?? "",
        nep: r.nep?.toFixed(2) ?? "",
        volatilidad: r.volat?.toFixed(2) ?? "",
      })),
      `ranking-${election.id}.csv`
    );
  }

  const fmt = (v, d = 1) => (v == null ? "—" : v.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d }));

  return (
    <Card
      title="Ranking de municipios"
      subtitle={`Ordena por cualquier columna. Volatilidad (índice de Pedersen) calculada frente a ${
        prev ? `${prev.label} ${prev.year}` : "— (no hay elección anterior del mismo tipo)"
      }. NEP = número efectivo de partidos.`}
    >
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select label="Elección" value={election.id} onChange={setElectionId} className="min-w-44">
          {[...index].reverse().map((e) => (
            <option key={e.id} value={e.id}>
              {e.label} {e.year}
            </option>
          ))}
        </Select>
        <div className="ml-auto">
          <MiniButton onClick={exportCsv} title="Descargar la tabla completa">CSV</MiniButton>
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto rounded-lg border border-slate-100">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              {COLS.map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => clickHeader(key)}
                  className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 font-semibold hover:text-sky-700 ${
                    key === "name" || key === "winner" ? "text-left" : "text-right"
                  }`}
                >
                  {label}
                  {sortKey === key && <span className="ml-0.5">{asc ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.code}
                onClick={() => openMunicipio(r.code)}
                className="cursor-pointer border-t border-slate-100 hover:bg-sky-50/60"
              >
                <td className="px-2 py-1.5 font-medium text-slate-700">{r.name}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(r.censo)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.part)}</td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <PartyDot color={r.winnerColor} />
                    {r.winner}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.pctWinner)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.margin)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-red-700">{fmt(r.izq)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-blue-700">{fmt(r.der)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.nep, 2)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.volat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Clic en un municipio para abrir su ficha.</p>
    </Card>
  );
}
