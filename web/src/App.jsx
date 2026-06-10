import { useEffect, useState } from "react";
import { loadIndex, loadParties, loadMunicipios } from "./lib/data.js";
import { useHashParam } from "./lib/urlState.js";
import MapPanel from "./components/MapPanel.jsx";
import EvolutionPanel from "./components/EvolutionPanel.jsx";
import RankingPanel from "./components/RankingPanel.jsx";
import MunicipioPanel from "./components/MunicipioPanel.jsx";
import SocioPanel from "./components/SocioPanel.jsx";
import DiputacionPanel from "./components/DiputacionPanel.jsx";
import AboutPanel from "./components/AboutPanel.jsx";

const TABS = [
  ["mapa", "Mapa"],
  ["evolucion", "Evolución"],
  ["ranking", "Ranking"],
  ["municipio", "Municipios"],
  ["socio", "Socioeconómico"],
  ["diputacion", "Diputación"],
  ["acerca", "Metodología"],
];

export default function App() {
  const [index, setIndex] = useState(null);
  const [parties, setParties] = useState(null);
  const [municipios, setMunicipios] = useState(null);
  const [tab, setTab] = useHashParam("tab", "mapa");
  const [munCode, setMunCode] = useHashParam("mun", "040"); // Castelló de la Plana

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

  const activeTab = TABS.some(([id]) => id === tab) ? tab : "mapa";

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
                activeTab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "mapa" && (
        <MapPanel index={index} parties={parties} municipios={municipios} openMunicipio={openMunicipio} />
      )}
      {activeTab === "evolucion" && <EvolutionPanel index={index} parties={parties} municipios={municipios} />}
      {activeTab === "ranking" && (
        <RankingPanel index={index} parties={parties} municipios={municipios} openMunicipio={openMunicipio} />
      )}
      {activeTab === "municipio" && (
        <MunicipioPanel index={index} parties={parties} municipios={municipios} code={munCode} setCode={setMunCode} />
      )}
      {activeTab === "socio" && <SocioPanel index={index} parties={parties} municipios={municipios} />}
      {activeTab === "diputacion" && <DiputacionPanel index={index} parties={parties} />}
      {activeTab === "acerca" && <AboutPanel />}

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
        Datos: Ministerio del Interior · Dades Obertes GVA · INE. Elaboración propia; ver pestaña Metodología.
        La URL refleja la vista actual: copia el enlace para compartirla.
      </footer>
    </div>
  );
}
