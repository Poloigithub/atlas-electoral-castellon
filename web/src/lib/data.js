// Carga y caché de los JSON estáticos generados por el pipeline.

const BASE = `${import.meta.env.BASE_URL}data`;
const cache = new Map();

export async function loadJSON(name) {
  if (cache.has(name)) return cache.get(name);
  const promise = fetch(`${BASE}/${name}`).then((r) => {
    if (!r.ok) throw new Error(`No se pudo cargar ${name}`);
    return r.json();
  });
  cache.set(name, promise);
  return promise;
}

export const loadIndex = () => loadJSON("index.json");
export const loadParties = () => loadJSON("parties.json");
export const loadMunicipios = () => loadJSON("municipios.json");
export const loadSummary = () => loadJSON("summary.json");
export const loadSocio = () => loadJSON("socio.json");
export const loadDiputacion = () => loadJSON("diputacion.json");
export const loadElection = (id) => loadJSON(`elections/${id}.json`);
export const loadGeoMunicipios = () => loadJSON("municipios.geojson");
export const loadGeoSecciones = () => loadJSON("secciones.geojson");

// ---------- utilidades de resultados ----------

export function electionLabel(e) {
  return `${e.label} ${e.year}`;
}

export function electionDate(e) {
  return e.year + e.month / 12;
}

// votos por partido canónico de una unidad {votes:{pid:v}} -> ordenados
export function rankVotes(votes) {
  return Object.entries(votes).sort((a, b) => b[1] - a[1]);
}

export function totalVotes(unit) {
  const cand = Object.values(unit.votes).reduce((a, b) => a + b, 0);
  return { cand, valid: cand + (unit.blanco || 0), total: cand + (unit.blanco || 0) + (unit.nulos || 0) };
}

export function participation(unit) {
  const { total } = totalVotes(unit);
  return unit.censo ? (100 * total) / unit.censo : null;
}

export function winner(votes) {
  let best = null;
  let bestV = -1;
  for (const [pid, v] of Object.entries(votes)) {
    if (v > bestV) {
      best = pid;
      bestV = v;
    }
  }
  return best;
}

// % de un bloque sobre votos a candidaturas
export function blocShare(votes, parties, bloc) {
  let blocV = 0;
  let tot = 0;
  for (const [pid, v] of Object.entries(votes)) {
    tot += v;
    if (parties[pid]?.bloc === bloc) blocV += v;
  }
  return tot ? (100 * blocV) / tot : null;
}

// margen de victoria: puntos porcentuales entre el 1º y el 2º
export function margin(votes) {
  const r = rankVotes(votes);
  if (!r.length) return null;
  const tot = r.reduce((a, [, v]) => a + v, 0);
  if (!tot) return null;
  const s1 = (100 * r[0][1]) / tot;
  const s2 = r[1] ? (100 * r[1][1]) / tot : 0;
  return s1 - s2;
}

// número efectivo de partidos (Laakso-Taagepera): 1/Σp²
export function enp(votes) {
  const tot = Object.values(votes).reduce((a, b) => a + b, 0);
  if (!tot) return null;
  let s = 0;
  for (const v of Object.values(votes)) s += (v / tot) ** 2;
  return s ? 1 / s : null;
}

// volatilidad de Pedersen entre dos elecciones: ½·Σ|Δ% por partido|
export function pedersen(votesA, votesB) {
  const totA = Object.values(votesA).reduce((a, b) => a + b, 0);
  const totB = Object.values(votesB).reduce((a, b) => a + b, 0);
  if (!totA || !totB) return null;
  const pids = new Set([...Object.keys(votesA), ...Object.keys(votesB)]);
  let sum = 0;
  for (const pid of pids) sum += Math.abs((100 * (votesA[pid] || 0)) / totA - (100 * (votesB[pid] || 0)) / totB);
  return sum / 2;
}

export function partyShare(votes, pid) {
  const tot = Object.values(votes).reduce((a, b) => a + b, 0);
  const v = votes[pid] || 0;
  return tot ? (100 * v) / tot : null;
}

// Convierte los votos por candidatura de una elección detallada a votos por
// partido canónico.
export function toCanonical(votesByCode, pmap) {
  const out = {};
  for (const [code, val] of Object.entries(votesByCode)) {
    const v = Array.isArray(val) ? val[0] : val;
    const pid = pmap[code] || "otros";
    out[pid] = (out[pid] || 0) + v;
  }
  return out;
}

export const fmtInt = (n) => (n == null ? "—" : n.toLocaleString("es-ES"));
export const fmtPct = (n, d = 1) =>
  n == null ? "—" : `${n.toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d })}%`;
export const fmtNum = (n, d = 1) =>
  n == null ? "—" : n.toLocaleString("es-ES", { maximumFractionDigits: d });
