"""Parsea los CSV del Atlas de Renta (ADRH, INE) y genera out/socio.json.

Tablas (provincia de Castellón):
  30962 renta media y mediana / 30970 indicadores demográficos / 37691 Gini y P80/P20

Claves: municipio = 3 dígitos INE; sección = mun(3)+dist(2)+secc(3),
igual que en los JSON electorales.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

RAW = Path(__file__).parent / "raw"
OUT = Path(__file__).parent / "out"

INDICATORS = {
    "Renta neta media por persona": "rentaP",
    "Renta neta media por hogar": "rentaH",
    "Media de la renta por unidad de consumo": "rentaUC",
    "Edad media de la población": "edad",
    "Población": "pob",
    "Porcentaje de hogares unipersonales": "hog1",
    "Porcentaje de población de 65 y más años": "p65",
    "Porcentaje de población menor de 18 años": "p18",
    "Porcentaje de población española": "esp",
    "Tamaño medio del hogar": "hogTam",
    "Índice de Gini": "gini",
    "Distribución de la renta P80/P20": "p80p20",
}

LABELS = {
    "rentaP": "Renta neta media por persona (€)",
    "rentaH": "Renta neta media por hogar (€)",
    "rentaUC": "Renta media por unidad de consumo (€)",
    "edad": "Edad media",
    "pob": "Población",
    "hog1": "% hogares unipersonales",
    "p65": "% población 65+",
    "p18": "% población <18",
    "esp": "% población española",
    "hogTam": "Tamaño medio del hogar",
    "gini": "Índice de Gini",
    "p80p20": "P80/P20",
}


def val(s):
    s = (s or "").strip()
    if not s or s == ".":
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        f = float(s)
    except ValueError:
        return None
    return int(f) if f == int(f) else f


def main():
    municipios = defaultdict(lambda: defaultdict(dict))
    secciones = defaultdict(lambda: defaultdict(dict))
    years = set()

    for fname in ("adrh_renta.csv", "adrh_demo.csv", "adrh_gini.csv"):
        with open(RAW / fname, encoding="utf-8-sig") as f:
            reader = csv.reader(f, delimiter=";")
            header = next(reader)
            for row in reader:
                mun_field, dist_field, sec_field, ind, period, total = row[:6]
                short = INDICATORS.get(ind.strip())
                if not short:
                    continue
                v = val(total)
                if v is None:
                    continue
                year = int(period)
                years.add(year)
                mun = mun_field.split()[0][2:5]  # '12001 X' -> '001'
                if sec_field.strip():
                    key = sec_field.split()[0][2:10]  # '1200101001' -> '00101001'
                    secciones[key][short][year] = v
                elif not dist_field.strip():
                    municipios[mun][short][year] = v

    out = {
        "years": sorted(years),
        "labels": LABELS,
        "municipios": {k: dict(v) for k, v in municipios.items()},
        "secciones": {k: dict(v) for k, v in secciones.items()},
    }
    dest = OUT / "socio.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"socio.json: {len(municipios)} municipios, {len(secciones)} secciones, "
          f"años {min(years)}-{max(years)}, {dest.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
