import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";

// Mapa coroplético SVG de la provincia, con zoom (rueda o botones) y arrastre.
// `getFill(props)` decide el color, `getTooltip(props)` el contenido del
// tooltip, `onSelect(props)` el clic.
export default function MapView({ geojson, getFill, getTooltip, onSelect, selectedKey, getKey }) {
  const [tip, setTip] = useState(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const moved = useRef(false);
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

  // al cambiar de capa (nivel o municipio enfocado) se reencuadra y se resetea el zoom
  useEffect(() => setView({ k: 1, x: 0, y: 0 }), [geojson]);

  function svgCoords(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect();
    return [((clientX - rect.left) * W) / rect.width, ((clientY - rect.top) * H) / rect.height];
  }

  function zoomAt(mx, my, factor) {
    setView((v) => {
      const k = Math.max(1, Math.min(16, v.k * factor));
      if (k === 1) return { k: 1, x: 0, y: 0 };
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
    });
  }

  // la rueda necesita un listener no pasivo para poder hacer preventDefault
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) * W) / rect.width;
      const my = ((e.clientY - rect.top) * H) / rect.height;
      zoomAt(mx, my, Math.exp(-e.deltaY * 0.0018));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  function onMouseDown(e) {
    drag.current = { sx: e.clientX, sy: e.clientY, x: view.x, y: view.y };
    moved.current = false;
  }

  function onMouseMove(e) {
    if (!drag.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.sx) * W) / rect.width;
    const dy = ((e.clientY - drag.current.sy) * H) / rect.height;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
    if (moved.current) {
      setTip(null);
      setView((v) => ({ ...v, x: drag.current.x + dx, y: drag.current.y + dy }));
    }
  }

  function endDrag() {
    drag.current = null;
  }

  if (!geojson) {
    return <div className="flex h-[480px] items-center justify-center text-slate-400">Cargando mapa…</div>;
  }

  return (
    <div ref={wrapRef} className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full select-none ${view.k > 1 ? "cursor-grab" : ""}`}
        role="img"
        aria-label="Mapa de la provincia de Castellón"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={() => {
          endDrag();
          setTip(null);
        }}
        onDoubleClick={(e) => {
          const [mx, my] = svgCoords(e.clientX, e.clientY);
          zoomAt(mx, my, 1.8);
        }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {features.map((f, i) => {
            const key = getKey(f.properties);
            const isSel = selectedKey && key === selectedKey;
            return (
              <path
                key={key || i}
                d={path(f)}
                fill={getFill(f.properties) || "#e2e8f0"}
                stroke={isSel ? "#0f172a" : "#ffffff"}
                strokeWidth={(isSel ? 1.8 : 0.5) / view.k}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseMove={(e) => {
                  if (moved.current) return;
                  const rect = wrapRef.current.getBoundingClientRect();
                  setTip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    content: getTooltip(f.properties),
                  });
                }}
                onMouseLeave={() => setTip(null)}
                onClick={() => {
                  if (!moved.current && onSelect) onSelect(f.properties);
                }}
              />
            );
          })}
        </g>
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        {[
          ["+", () => zoomAt(W / 2, H / 2, 1.5), "Acercar"],
          ["−", () => zoomAt(W / 2, H / 2, 1 / 1.5), "Alejar"],
          ["⌂", () => setView({ k: 1, x: 0, y: 0 }), "Vista inicial"],
        ].map(([txt, fn, title]) => (
          <button
            key={txt}
            onClick={fn}
            title={title}
            className="h-7 w-7 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-600 shadow-sm hover:border-sky-400 hover:text-sky-700"
          >
            {txt}
          </button>
        ))}
      </div>
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
