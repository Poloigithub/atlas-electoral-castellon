"""Indicadores socioeconómicos adicionales, integrados en out/socio.json
(ejecutar después de parse_ine.py):

  - edu    % población 15+ con educación superior (Censo anual INE, secciones,
           tabla 66693, 2021-2024)
  - paroC  tasa de paro censal: parados/activos (Censo anual INE, secciones,
           tabla 66695, 2021-2024)
  - crec   crecimiento de población desde 1996 en % (Padrón INE, municipios,
           tabla 2865, 1996-2025)
  - paro   paro registrado por 100 habitantes (SEPE mensual por municipio,
           mayo de cada año 2006-2025, sobre población del padrón)
  - costa  distancia del centroide a la costa en km (calculada de la
           cartografía; estática)

Añade además "indYears" (años disponibles por indicador) para que la web
elija el año más cercano a cada elección.

    python3 parse_extra.py
"""
import csv
import json
import math
import urllib.request
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw"
OUT = HERE / "out"

INE_CSV = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/{t}.csv"
SEPE_CSV = ("https://sede.sepe.gob.es/es/portaltrabaja/resources/sede/"
            "datos_abiertos/datos/Paro_por_municipios_{y}_csv.csv")

LABELS = {
    "edu": "% con educación superior (15+)",
    "paroC": "Tasa de paro censal (%)",
    "crec": "Crecimiento de población desde 1996 (%)",
    "paro": "Paro registrado por 100 hab.",
    "costa": "Distancia a la costa (km)",
}

# municipios con litoral (para extraer la línea de costa de la cartografía)
COASTAL = {"009", "027", "031", "032", "040", "046", "077", "082", "084",
           "085", "089", "126", "128", "135"}


def fetch(url, name, encoding=None):
    RAW.mkdir(exist_ok=True)
    cached = RAW / name
    if not cached.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        cached.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    return cached


def num(s):
    s = s.strip().replace(".", "").replace(",", ".")
    if s in ("", "..", "<5"):
        return 2.0 if s == "<5" else None
    try:
        return float(s)
    except ValueError:
        return None


def censo_table(t, fname):
    """tabla INE censo anual -> {('sec'|'mun', clave, cat, año): valor}"""
    path = fetch(INE_CSV.format(t=t), fname)
    out = {}
    with open(path, encoding="utf-8-sig") as fh:
        for r in csv.reader(fh, delimiter=";"):
            if len(r) < 7 or r[0].startswith("Provincias"):
                continue
            prov, mun, sec, sexo, cat, per, tot = r[:7]
            if sexo != "Total":
                continue
            v = num(tot)
            if v is None:
                continue
            if sec:
                key = ("sec", sec.split()[0][2:10], cat, per)
            elif mun:
                key = ("mun", mun.split()[0][2:5], cat, per)
            else:
                continue
            out[key] = v
    return out


def main():
    socio = json.load(open(OUT / "socio.json"))
    municipios = json.load(open(OUT / "municipios.json"))

    def put(level, key, ind, year, value):
        store = socio["municipios"] if level == "mun" else socio["secciones"]
        store.setdefault(key, {}).setdefault(ind, {})[str(year)] = round(value, 2)

    # --- censo anual: educación superior y tasa de paro censal por sección ---
    edu = censo_table(66693, "censo_edu.csv")
    for (lvl, key, cat, per), v in edu.items():
        if cat != "Educación superior":
            continue
        tot = edu.get((lvl, key, "Total", per))
        if tot:
            put(lvl, key, "edu", per, 100 * v / tot)

    act = censo_table(66695, "censo_act.csv")
    for (lvl, key, cat, per), v in act.items():
        if cat != "Parado/a":
            continue
        ocup = act.get((lvl, key, "Ocupado/a", per))
        if ocup is not None and (v + ocup) > 0:
            put(lvl, key, "paroC", per, 100 * v / (v + ocup))

    # --- padrón 1996-2025: crecimiento de población municipal ---
    path = fetch(INE_CSV.format(t=2865), "padron_2865.csv")
    pob = defaultdict(dict)  # mun3 -> {año: pob}
    with open(path, encoding="utf-8-sig") as fh:
        for r in csv.reader(fh, delimiter=";"):
            if len(r) < 4 or not r[0][:5].isdigit() or r[1] != "Total":
                continue
            if not r[0].startswith("12"):
                continue
            v = num(r[3])
            if v is not None:
                pob[r[0][2:5]][int(r[2])] = v
    for mun, series in pob.items():
        base = series.get(1996)
        if not base:
            continue
        for year, v in series.items():
            if year > 1996:
                put("mun", mun, "crec", year, 100 * (v / base - 1))

    # --- SEPE: paro registrado municipal (mayo de cada año) ---
    for year in range(2006, 2026):
        try:
            path = fetch(SEPE_CSV.format(y=year), f"sepe_{year}.csv")
        except Exception as e:
            print(f"  SEPE {year}: no disponible ({e})")
            continue
        month_rows = defaultdict(dict)  # mes -> {mun3: parados}
        with open(path, encoding="latin-1") as fh:
            for r in csv.reader(fh, delimiter=";"):
                if len(r) < 9 or not r[0].strip().isdigit():
                    continue
                if r[4].strip() != "12":
                    continue
                v = num(r[8])
                if v is not None:
                    month_rows[r[0].strip()[-2:]][r[6].strip()[2:5]] = v
        if not month_rows:
            continue
        mes = "05" if "05" in month_rows else sorted(month_rows)[-1]
        for mun, parados in month_rows[mes].items():
            p = pob.get(mun, {}).get(year) or pob.get(mun, {}).get(year - 1)
            if p:
                put("mun", mun, "paro", year, 100 * parados / p)

    # --- distancia a la costa desde la cartografía ---
    geo_mun = json.load(open(OUT / "municipios.geojson"))
    geo_sec = json.load(open(OUT / "secciones.geojson"))

    def rings(geom):
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        for poly in polys:
            yield poly[0]

    # vértices que aparecen una sola vez = contorno exterior de la provincia;
    # los de municipios costeros son (casi todos) la línea de costa
    count = defaultdict(int)
    for f in geo_mun["features"]:
        for ring in rings(f["geometry"]):
            for x, y in ring:
                count[(round(x, 5), round(y, 5))] += 1
    coast = []
    for f in geo_mun["features"]:
        if f["properties"]["CMUN"] not in COASTAL:
            continue
        for ring in rings(f["geometry"]):
            for x, y in ring:
                if count[(round(x, 5), round(y, 5))] == 1:
                    coast.append((x, y))

    def centroid(geom):
        pts = [p for ring in rings(geom) for p in ring]
        return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)

    def dist_km(lon1, lat1):
        best = 1e9
        for lon2, lat2 in coast:
            dx = (lon2 - lon1) * 111.32 * math.cos(math.radians((lat1 + lat2) / 2))
            dy = (lat2 - lat1) * 110.57
            d = dx * dx + dy * dy
            if d < best:
                best = d
        return math.sqrt(best)

    for f in geo_mun["features"]:
        lon, lat = centroid(f["geometry"])
        put("mun", f["properties"]["CMUN"], "costa", 0, dist_km(lon, lat))
    for f in geo_sec["features"]:
        lon, lat = centroid(f["geometry"])
        put("sec", f["properties"]["CUSEC"][2:], "costa", 0, dist_km(lon, lat))

    # --- etiquetas y años disponibles por indicador ---
    socio["labels"].update(LABELS)
    ind_years = defaultdict(set)
    for store in (socio["municipios"], socio["secciones"]):
        for inds in store.values():
            for ind, series in inds.items():
                for y in series:
                    ind_years[ind].add(int(y))
    socio["indYears"] = {ind: sorted(ys) for ind, ys in ind_years.items()}
    # indicadores con datos por sección (la web filtra el selector según nivel)
    sec_inds = set()
    for inds in socio["secciones"].values():
        sec_inds.update(inds)
    socio["secInds"] = sorted(sec_inds)

    (OUT / "socio.json").write_text(json.dumps(socio, ensure_ascii=False, separators=(",", ":")))
    n_costa = sum(1 for s in socio["secciones"].values() if "costa" in s)
    n_edu = sum(1 for s in socio["secciones"].values() if "edu" in s)
    print(f"socio.json ampliado: edu en {n_edu} secciones, costa en {n_costa}, "
          f"indicadores: {sorted(ind_years)}")


if __name__ == "__main__":
    main()
