import { useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";

// Mapa coroplético SVG de la provincia. `getFill(props)` decide el color,
// `getTooltip(props)` el contenido del tooltip, `onSelect(props)` el clic.
export default function MapView({ geojson, getFill, getTooltip, onSelect, selectedKey, getKey }) {
  const [tip, setTip] = useState(null);
  const wrapRef = useRef(null);
  const W = 640;
  const H = 660;

  const { features, path } = useMemo(() => {
    if (!geojson) return { features: [], path: null };
    const projection = geoMercator().fitExtent(
      [
        [8, 8],
        [W - 8, H - 8],
      ],
      geojson
    );
    return { features: geojson.features, path: geoPath(projection) };
  }, [geojson]);

  if (!geojson) {
    return <div className="flex h-[480px] items-center justify-center text-slate-400">Cargando mapa…</div>;
  }

  function handleMove(e, f) {
    const rect = wrapRef.current.getBoundingClientRect();
    setTip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      content: getTooltip(f.properties),
    });
  }

  return (
    <div ref={wrapRef} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Mapa de la provincia de Castellón">
        {features.map((f, i) => {
          const key = getKey(f.properties);
          const isSel = selectedKey && key === selectedKey;
          return (
            <path
              key={key || i}
              d={path(f)}
              fill={getFill(f.properties) || "#e2e8f0"}
              stroke={isSel ? "#0f172a" : "#ffffff"}
              strokeWidth={isSel ? 1.8 : 0.5}
              className="cursor-pointer transition-opacity hover:opacity-80"
              onMouseMove={(e) => handleMove(e, f)}
              onMouseLeave={() => setTip(null)}
              onClick={() => onSelect && onSelect(f.properties)}
            />
          );
        })}
      </svg>
      {tip && tip.content && (
        <div
          className="pointer-events-none absolute z-10 max-w-60 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(tip.x + 12, 420), top: tip.y + 12 }}
        >
          {tip.content}
        </div>
      )}
    </div>
  );
}
