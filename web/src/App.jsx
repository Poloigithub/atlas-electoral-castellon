import { useEffect, useState } from "react";
import { loadIndex, loadParties, loadMunicipios } from "./lib/data.js";
import MapPanel from "./components/MapPanel.jsx";
import EvolutionPanel from "./components/EvolutionPanel.jsx";
import MunicipioPanel from "./components/MunicipioPanel.jsx";
import SocioPanel from "./components/SocioPanel.jsx";
import DiputacionPanel from "./components/DiputacionPanel.jsx";
import AboutPanel from "./components/AboutPanel.jsx";

const TABS = [
  ["mapa", "Mapa"],
  ["evolucion", "Evolución"],
  ["municipio", "Municipios"],
  ["socio", "Socioeconómico"],
  ["diputacion", "Diputación"],
  ["acerca", "Metodología"],
];

export default function App() {
  const [index, setIndex] = useState(null);
  const [parties, setParties] = useState(null);
  const [municipios, setMunicipios] = useState(null);
  const [tab, setTab] = useState("mapa");
  const [munCode, setMunCode] = useState("040"); // Castelló de la Plana

  useEffect(() => {
    Promise.all([loadIndex(), loadParties(), loadMunicipios()]).then(([i, p, m]) => {
      setIndex(i);
      setParties(p);
      setMunicipios(m);
    });
  }, []);

  if (!index || !parties || !municipios) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        Cargando atlas electoral…
      </div>
    );
  }

  function openMunicipio(code) {
    setMunCode(code);
    setTab("municipio");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Atlas electoral de Castelló
          </h1>
          <p className="text-sm text-slate-500">
            Provincia de Castellón · municipales, autonómicas, generales y europeas · 1979–2024
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "mapa" && (
        <MapPanel index={index} parties={parties} municipios={municipios} openMunicipio={openMunicipio} />
      )}
      {tab === "evolucion" && <EvolutionPanel index={index} parties={parties} municipios={municipios} />}
      {tab === "municipio" && (
        <MunicipioPanel index={index} parties={parties} municipios={municipios} code={munCode} setCode={setMunCode} />
      )}
      {tab === "socio" && <SocioPanel index={index} parties={parties} municipios={municipios} />}
      {tab === "diputacion" && <DiputacionPanel index={index} parties={parties} />}
      {tab === "acerca" && <AboutPanel />}

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
        Datos: Ministerio del Interior · Dades Obertes GVA · INE. Elaboración propia; ver pestaña Metodología.
      </footer>
    </div>
  );
}
