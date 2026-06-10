// Utilidades de color para los mapas coropléticos.

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// mezcla blanco -> color según t en [0,1]
export function tint(hex, t) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(255 + (c - 255) * Math.max(0, Math.min(1, t)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// escala para % de voto: 0% claro, 60%+ saturado
export function shareColor(hex, share) {
  if (share == null) return "#e2e8f0";
  return tint(hex, 0.12 + 0.88 * Math.min(share / 60, 1));
}

// participación: escala de azules 40-95%
export function participationColor(p) {
  if (p == null) return "#e2e8f0";
  const t = Math.max(0, Math.min((p - 40) / 55, 1));
  return tint("#1e40af", 0.1 + 0.9 * t);
}

// indicador socioeconómico genérico (verde) entre min y max
export function indicatorColor(v, min, max) {
  if (v == null) return "#e2e8f0";
  const t = (v - min) / (max - min || 1);
  return tint("#047857", 0.08 + 0.92 * Math.max(0, Math.min(1, t)));
}
