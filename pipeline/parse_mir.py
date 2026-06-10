"""Parsea los ZIP del MIR y genera JSON por elección filtrado a Castellón (prov 12).

Salida en pipeline/out/elections/{id}.json con:
  - meta (id, tipo, fecha)
  - parties: codigo -> {sig, name}
  - municipios: ine3 -> datos comunes + votos por candidatura (+ electos en municipales)
  - secciones: "mun-dist-secc" -> datos comunes + votos por candidatura (agregado de mesas)

Uso: python3 parse_mir.py [patrón de zip opcional, p.ej. 0420]
"""
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

from elections import ELECTIONS, zip_name, election_id

RAW = Path(__file__).parent / "raw"
OUT = Path(__file__).parent / "out" / "elections"
OUT.mkdir(parents=True, exist_ok=True)

PROV = "12"  # Castellón
ENC = "latin-1"


def num(s):
    s = s.strip()
    return int(s) if s.isdigit() else 0


def read_lines(zf, member):
    try:
        data = zf.read(member)
    except KeyError:
        return []
    return data.decode(ENC, errors="replace").splitlines()


def parse_election(tipo, kind, year, month):
    eid = election_id(kind, year, month)
    zpath = RAW / zip_name(tipo, year, month, "MESA")
    has_mesa = zpath.exists()
    if not has_mesa:
        zpath = RAW / zip_name(tipo, year, month, "MUNI")
    if not zpath.exists():
        print(f"{eid}: sin ZIP, omitida")
        return None

    suffix = f"{tipo}{str(year)[2:]}{month:02d}.DAT"
    zf = zipfile.ZipFile(zpath)
    members = {n[:2]: n for n in zf.namelist() if n.endswith(suffix)}
    # ficheros 11/12 (municipios <250 hab) llevan tipo de municipio 08/09 en el
    # nombre solo para municipales: 1104aamm.DAT / 1204aamm.DAT
    small_suffix = f"04{str(year)[2:]}{month:02d}.DAT"
    names = zf.namelist()

    parties = {}
    for ln in read_lines(zf, members.get("03", "")):
        code = ln[8:14]
        parties[code] = {
            "sig": ln[14:64].strip(),
            "name": ln[64:214].strip(),
            "nat": ln[226:232].strip(),  # cabecera de acumulación nacional
        }

    municipios = {}
    for ln in read_lines(zf, members.get("05", "")):
        if ln[11:13] != PROV or ln[16:18] != "99":
            continue  # solo total municipal de la provincia 12
        mun = ln[13:16]
        municipios[mun] = {
            "name": ln[18:118].strip(),
            "pj": num(ln[119:122]),       # partido judicial
            "comarca": num(ln[125:128]),
            "pob": num(ln[128:136]),
            "censo": num(ln[149:157]),
            "blanco": num(ln[189:197]),
            "nulos": num(ln[197:205]),
            "cand": num(ln[205:213]),
            "seats": num(ln[213:216]),
            "votes": {},
        }

    for ln in read_lines(zf, members.get("06", "")):
        if ln[9:11] != PROV or ln[14:16] != "99":
            continue
        mun = ln[11:14]
        if mun not in municipios:
            continue
        code, votes, electos = ln[16:22], num(ln[22:30]), num(ln[30:33])
        if votes or electos:
            municipios[mun]["votes"][code] = [votes, electos]

    # Municipios <250 hab (solo municipales): ficheros 11 y 12
    if tipo == "04":
        f11 = "11" + small_suffix
        f12 = "12" + small_suffix
        if f11 in names:
            for ln in read_lines(zf, f11):
                if ln[11:13] != PROV:
                    continue
                mun = ln[13:16]
                municipios[mun] = {
                    "name": ln[16:116].strip(),
                    "pj": num(ln[116:119]),
                    "comarca": num(ln[122:125]),
                    "pob": num(ln[125:128]),
                    "censo": num(ln[133:136]),
                    "blanco": num(ln[148:151]),
                    "nulos": num(ln[151:154]),
                    "cand": num(ln[154:157]),
                    "seats": num(ln[157:159]),
                    "votes": {},
                }
        if f12 in names:
            # Listas abiertas: un registro por candidato con sus votos.
            # Como votos de la candidatura usamos los del candidato más votado.
            seen = defaultdict(lambda: [0, 0])
            for ln in read_lines(zf, f12):
                if ln[9:11] != PROV:
                    continue
                mun = ln[11:14]
                if mun not in municipios:
                    continue
                code, votes, electos = ln[14:20], num(ln[20:23]), num(ln[23:25])
                key = (mun, code)
                seen[key][0] = max(seen[key][0], votes)
                seen[key][1] = max(seen[key][1], electos)
            for (mun, code), (votes, electos) in seen.items():
                municipios[mun]["votes"][code] = [votes, electos]

    # Mesas -> secciones
    secciones = {}
    if has_mesa and "09" in members:
        for ln in read_lines(zf, members["09"]):
            if ln[11:13] != PROV or ln[13:16] == "999":
                continue
            key = f"{ln[13:16]}{ln[16:18]}{ln[18:22].strip().zfill(3)}"
            s = secciones.setdefault(key, {"censo": 0, "blanco": 0, "nulos": 0, "cand": 0, "votes": defaultdict(int)})
            s["censo"] += num(ln[30:37])
            s["blanco"] += num(ln[65:72])
            s["nulos"] += num(ln[72:79])
            s["cand"] += num(ln[79:86])
        for ln in read_lines(zf, members["10"]):
            if ln[11:13] != PROV or ln[13:16] == "999":
                continue
            key = f"{ln[13:16]}{ln[16:18]}{ln[18:22].strip().zfill(3)}"
            if key not in secciones:
                continue
            code, votes = ln[23:29], num(ln[29:36])
            if votes:
                secciones[key]["votes"][code] += votes

    # Solo partidos con presencia en la provincia
    used = set()
    for m in municipios.values():
        used.update(m["votes"])
    for s in secciones.values():
        used.update(s["votes"])
    parties = {c: p for c, p in parties.items() if c in used}

    for s in secciones.values():
        s["votes"] = dict(s["votes"])

    out = {
        "id": eid,
        "kind": kind,
        "year": year,
        "month": month,
        "parties": parties,
        "municipios": municipios,
        "secciones": secciones,
    }
    dest = OUT / f"{eid}.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{eid}: {len(municipios)} municipios, {len(secciones)} secciones, "
          f"{len(parties)} candidaturas -> {dest.stat().st_size // 1024} KB")
    return eid


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else ""
    done = []
    for tipo, kind, year, month in ELECTIONS:
        if pattern and not f"{tipo}{year}{month:02d}".startswith(pattern):
            continue
        eid = parse_election(tipo, kind, year, month)
        if eid:
            done.append(eid)
    print(f"\n{len(done)} elecciones procesadas")


if __name__ == "__main__":
    main()
