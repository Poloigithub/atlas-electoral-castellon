"""Parsea los CSV de la GVA (elecciones a Corts Valencianes) y genera JSON
por elección filtrado a Castellón, con el mismo formato que parse_mir.py.

Fuente: dadesobertes.gva.es (un CSV por convocatoria, nivel mesa).
1983 no está publicado en el portal; queda pendiente de ARGOS.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

RAW = Path(__file__).parent / "raw"
OUT = Path(__file__).parent / "out" / "elections"
OUT.mkdir(parents=True, exist_ok=True)

# año -> mes de celebración
MONTHS = {1987: 6, 1991: 5, 1995: 5, 1999: 6, 2003: 5, 2007: 5,
          2011: 5, 2015: 5, 2019: 4, 2023: 5}


def num(s):
    s = (s or "").strip()
    return int(s) if s.lstrip("-").isdigit() else 0


def rows_for(year):
    path = RAW / f"corts{year}.csv"
    if year == 2023:
        # esquema propio: coma, latin-1
        with open(path, encoding="latin-1") as f:
            for r in csv.DictReader(f):
                if r["CProv"].strip() != "12":
                    continue
                yield {
                    "mun": r["Codimuni"].strip()[-3:].zfill(3),
                    "mun_name": r["Desc_municipi"].strip(),
                    "comarca": num(r["CCom"]),
                    "dist": r["Districte"].strip().zfill(2),
                    "secc": r["Secci\xf3"].strip().zfill(3),
                    "mesa": r["Mesa"].strip(),
                    "censo": num(r["CENS"]),
                    "blanco": num(r["V_BLANC"]),
                    "nulos": num(r["V_NULS"]),
                    "code": r["CODI_CANDIDATURA"].strip(),
                    "sig": r["SIGLES_CANDIDATURA"].strip(),
                    "name": r["DESC_CANDIDATURA"].strip(),
                    "votes": num(r["V_CAND"]),
                }
    else:
        with open(path, encoding="utf-8", errors="replace") as f:
            for r in csv.DictReader(f, delimiter=";"):
                if r["COD_PROV"].strip() != "12":
                    continue
                yield {
                    "mun": r["COD_MUNICIPIO"].strip()[-3:].zfill(3),
                    "mun_name": r["MUNICIPIO"].strip(),
                    "comarca": num(r["COD_COMARCA"]),
                    "dist": r["DISTRITO"].strip().zfill(2),
                    "secc": r["SECCION"].strip().zfill(3),
                    "mesa": r["MESA"].strip(),
                    "censo": num(r["CENSO"]),
                    "blanco": num(r["BLANCOS"]),
                    "nulos": num(r["NULOS"]),
                    "code": r["CANDIDATO_COD"].strip(),
                    "sig": r["CANDIDATO_SIGLAS"].strip(),
                    "name": r["CANDIDATO_DESC"].strip(),
                    "votes": num(r["VOTOS"]),
                }


def parse_year(year):
    month = MONTHS[year]
    eid = f"aut-{year}{month:02d}"
    parties = {}
    municipios = {}
    secciones = {}
    # una mesa aparece en N filas (una por candidatura): los datos comunes
    # (censo, blanco, nulos) solo se suman la primera vez que vemos la mesa
    seen_mesa = set()

    for r in rows_for(year):
        if r["mun"] in ("990", "999"):
            continue  # CERA (residentes ausentes), no es un municipio
        code = r["code"]
        parties.setdefault(code, {"sig": r["sig"], "name": r["name"], "nat": ""})
        m = municipios.setdefault(r["mun"], {
            "name": r["mun_name"], "pj": 0, "comarca": r["comarca"],
            "pob": 0, "censo": 0, "blanco": 0, "nulos": 0, "cand": 0,
            "seats": 0, "votes": {},
        })
        skey = f"{r['mun']}{r['dist']}{r['secc']}"
        s = secciones.setdefault(skey, {"censo": 0, "blanco": 0, "nulos": 0,
                                        "cand": 0, "votes": defaultdict(int)})
        mesa_key = (skey, r["mesa"])
        if mesa_key not in seen_mesa:
            seen_mesa.add(mesa_key)
            for tgt in (m, s):
                tgt["censo"] += r["censo"]
                tgt["blanco"] += r["blanco"]
                tgt["nulos"] += r["nulos"]
        if r["votes"]:
            m["votes"][code] = [m["votes"].get(code, [0, 0])[0] + r["votes"], 0]
            s["votes"][code] += r["votes"]
            m["cand"] += r["votes"]
            s["cand"] += r["votes"]

    for s in secciones.values():
        s["votes"] = dict(s["votes"])
    out = {
        "id": eid, "kind": "autonomicas", "year": year, "month": month,
        "parties": parties, "municipios": municipios, "secciones": secciones,
    }
    dest = OUT / f"{eid}.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{eid}: {len(municipios)} municipios, {len(secciones)} secciones, "
          f"{len(parties)} candidaturas -> {dest.stat().st_size // 1024} KB")


if __name__ == "__main__":
    for year in MONTHS:
        parse_year(year)
