import { Card } from "./ui.jsx";

export default function AboutPanel() {
  return (
    <div className="max-w-3xl space-y-4">
      <Card title="Fuentes de datos">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>
            <b>Generales, municipales y europeas (1979–2024):</b> ficheros oficiales de resultados del{" "}
            <a className="text-sky-600 hover:underline" href="https://infoelectoral.interior.gob.es" target="_blank" rel="noreferrer">
              Ministerio del Interior (infoelectoral)
            </a>, a nivel de mesa electoral agregado a sección censal y municipio.
          </li>
          <li>
            <b>Autonómicas a Corts Valencianes (1987–2023):</b>{" "}
            <a className="text-sky-600 hover:underline" href="https://dadesobertes.gva.es" target="_blank" rel="noreferrer">
              Dades Obertes GVA
            </a>, a nivel de mesa agregado a sección censal.
          </li>
          <li>
            <b>Autonómicas de 1983:</b> Archivo Histórico Electoral de{" "}
            <a className="text-sky-600 hover:underline" href="http://www.argos.gva.es/ahe/" target="_blank" rel="noreferrer">
              ARGOS (GVA)
            </a>, a nivel de municipio (sin detalle por sección censal). Gàtova no se incluye porque
            pertenecía a la provincia de València hasta 1995.
          </li>
          <li>
            <b>Variables socioeconómicas (2015–2023):</b> Atlas de Distribución de Renta de los Hogares del{" "}
            <a className="text-sky-600 hover:underline" href="https://www.ine.es" target="_blank" rel="noreferrer">INE</a>{" "}
            por sección censal y municipio (renta, edad, hogares, Gini, P80/P20, nacionalidad).
          </li>
          <li>
            <b>Cartografía:</b> seccionado censal 2023 del INE, simplificado para web.
          </li>
        </ul>
      </Card>
      <Card title="Metodología y avisos">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>
            <b>Partidos canónicos:</b> las más de 600 siglas históricas se agrupan en familias (p. ej. AP/CP → PP;
            BLOC/UPV → Compromís). La clasificación cubre el 97,5% de los votos; el resto figura como «Otros» o
            «Independientes/locales».
          </li>
          <li>
            <b>Eje ideológico:</b> asignación editorial de cada familia a un bloque (izquierda/centro/derecha) y a
            una posición orientativa en el eje. Es una simplificación discutible, sobre todo para coaliciones y
            partidos locales.
          </li>
          <li>
            <b>Diputación Provincial:</b> composición <i>estimada</i> aplicando el procedimiento de la LOREG
            (reparto por partidos judiciales según población y D'Hondt entre partidos con concejal). Las listas de
            independientes quedan fuera del reparto, por lo que puede variar respecto a la composición oficial.
          </li>
          <li>
            <b>Secciones censales:</b> el contorno corresponde a 2023. El seccionado cambia con el tiempo: para
            convocatorias antiguas algunas secciones no casan o no existen.
          </li>
          <li>
            <b>Municipales en municipios pequeños:</b> en los de menos de 250 habitantes (listas abiertas) se toma
            como voto de cada candidatura el de su candidato más votado.
          </li>
          <li>
            <b>Indicadores:</b> el <i>margen</i> es la diferencia en puntos entre la 1ª y la 2ª candidatura; el{" "}
            <i>NEP</i> (número efectivo de partidos, Laakso-Taagepera) mide la fragmentación (1/Σp²); la{" "}
            <i>volatilidad</i> es el índice de Pedersen (½·Σ|Δ%|) entre las dos elecciones comparadas, calculado
            sobre las familias canónicas de partidos.
          </li>
        </ul>
      </Card>
      <Card title="Proyecto">
        <p className="text-sm text-slate-600">
          Web estática (React + Tailwind) pensada para GitHub Pages. Los datos se procesan con un pipeline en
          Python incluido en el repositorio (<code className="rounded bg-slate-100 px-1">pipeline/</code>) que
          descarga, filtra y normaliza las fuentes oficiales.
        </p>
      </Card>
    </div>
  );
}
