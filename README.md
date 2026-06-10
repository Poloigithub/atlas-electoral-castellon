# Atlas electoral de Castelló

Web estática con los resultados de **todas las elecciones celebradas en la provincia de
Castellón desde 1979** (municipales, autonómicas, generales y europeas), por municipio y
por sección censal, cruzados con variables socioeconómicas del INE.

## Estructura

- `pipeline/` — scripts Python (sin dependencias externas) que descargan y procesan las fuentes:
  - `download.py` — baja los ficheros oficiales del Ministerio del Interior (infoelectoral) a `pipeline/raw/` (no versionado).
  - `parse_mir.py` — parsea los DAT de ancho fijo del MIR (generales, municipales, europeas) y filtra la provincia 12.
  - `parse_gva.py` — parsea los CSV de Dades Obertes GVA (autonómicas a Corts 1987–2023).
  - `parse_argos.py` — autonómicas de 1983 desde el Archivo Histórico Electoral de ARGOS (nivel municipio).
  - `parse_extra.py` — indicadores adicionales: educación y paro censal por sección (Censo anual INE), crecimiento de población (Padrón 1996–2025), paro registrado (SEPE 2006–2025) y distancia a la costa (calculada de la cartografía).
  - `parse_ine.py` — Atlas de Renta de los Hogares del INE (renta, edad, Gini… por sección censal, 2015–2023).
  - `parties.py` / `normalize.py` — tabla canónica de partidos (eje ideológico, bloques, colores), resumen agregado y estimación de la Diputación Provincial.
  - `out/` — JSON resultantes (versionados; son los datos que sirve la web).
- `web/` — SPA con Vite + React + Tailwind (mapa SVG con d3-geo, gráficos con Recharts).

## Desarrollo

```bash
cd web
npm install
npm run data   # copia pipeline/out -> public/data
npm run dev
```

## Regenerar datos

```bash
cd pipeline
python3 download.py    # ~300 MB de ZIPs oficiales
python3 parse_mir.py
python3 parse_gva.py   # requiere los corts*.csv en raw/ (ver parse_gva.py)
python3 parse_argos.py # autonómicas 1983 (descarga de argos.gva.es con caché)
python3 parse_ine.py
python3 normalize.py
python3 parse_extra.py # indicadores extra (INE censo/padrón, SEPE, costa); tras parse_ine
```

La cartografía se genera con mapshaper a partir del seccionado censal 2023 del INE
(ver historial de comandos en los commits; salida `gj2008` para compatibilidad con d3-geo).

## Despliegue

GitHub Actions (`.github/workflows/deploy.yml`) construye y publica en GitHub Pages en cada
push a `main`. Activa Pages en Settings → Pages → Source: GitHub Actions.

## Fuentes y avisos

Ministerio del Interior (infoelectoral), Dades Obertes GVA, ARGOS AHE, INE (ADRH y
seccionado censal). La composición de la Diputación es una **estimación** (D'Hondt por
partido judicial). Las autonómicas de 1983 proceden de ARGOS y solo tienen detalle
municipal. Ver pestaña «Metodología» de la web para el detalle completo.
