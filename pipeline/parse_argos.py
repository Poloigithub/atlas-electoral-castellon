"""Autonómicas (Corts Valencianes) de 1983 desde el Archivo Histórico
Electoral de ARGOS (argos.gva.es/ahe), que es la única fuente pública con
detalle municipal: dadesobertes.gva.es solo cubre 1987 en adelante.

Descarga el informe detallado de cada municipio (HTML, latin-1), lo cachea en
raw/argos/ y genera out/elections/aut-198305.json con el mismo formato que el
resto de elecciones. No hay datos por sección censal.

    python3 parse_argos.py
"""
import json
import re
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "raw" / "argos"
OUT = HERE / "out"

URL = ("http://www.argos.gva.es/ahe/pls/argos_elec/"
       "DMEDB_Elecmunicipios.informeElecDetallado"
       "?aNMuniId=12{mun}&aNNumElec=1&aVTipoElec=A17&aVFechaElec=1983&aVLengua=c")


def fetch(mun):
    RAW.mkdir(parents=True, exist_ok=True)
    cached = RAW / f"a1983_{mun}.html"
    if cached.exists():
        return cached.read_text(encoding="latin-1")
    req = urllib.request.Request(URL.format(mun=mun), headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("latin-1")
    cached.write_text(html, encoding="latin-1")
    time.sleep(0.4)  # cortesía con el servidor
    return html


def num(s):
    s = s.replace(".", "").replace("&nbsp;", "").strip()
    return int(s) if s.isdigit() else 0


def parse(html):
    """-> (censo, votantes, validos, cand, blancos, [(nombre, siglas, votos)]) o None"""
    text = re.sub(r"<[^>]+>", "|", html)
    text = text.replace("&nbsp;", " ")
    text = re.sub(r"\|+", "|", text)
    text = re.sub(r"\s+", " ", text)

    def field(label):
        m = re.search(rf"{label}\s*\|\s*\|\s*([\d.]+)", text)
        return num(m.group(1)) if m else None

    censo = field("Censo")
    votantes = field("Votantes")
    validos = field(r"V\xe1lidos")
    cand = field("A candidatura")
    blancos = field("Blancos")
    if censo is None or votantes is None:
        return None

    # filas de candidaturas: |Nombre| |SIGLAS| | 1.234| | 12,34|
    rows = []
    tail = text[text.find("Siglas"):]
    for m in re.finditer(r"\|([^|]{4,120})\| \|([^|]{1,40})\| \| ([\d.]+)\| \| [\d,]+\|", tail):
        name, sig, v = m.group(1).strip(), m.group(2).strip(), num(m.group(3))
        if name and sig and not name.startswith("Candidatura"):
            rows.append((name, sig, v))
    return censo, votantes, validos or 0, cand or 0, blancos or 0, rows


def main():
    municipios = json.load(open(OUT / "municipios.json"))
    parties = {}   # (sig, name) -> code
    out_mun = {}
    missing = []

    for mun, meta in sorted(municipios.items()):
        try:
            html = fetch(mun)
            parsed = parse(html)
        except Exception as e:
            print(f"  {mun} {meta['name']}: ERROR {e}")
            missing.append(mun)
            continue
        if not parsed:
            missing.append(mun)
            continue
        censo, votantes, validos, cand, blancos, rows = parsed
        votes = {}
        for name, sig, v in rows:
            key = (sig, name)
            if key not in parties:
                parties[key] = str(len(parties) + 1)
            votes[parties[key]] = [v, 0]
        out_mun[mun] = {
            "name": meta["name"], "pj": 0, "comarca": 0, "pob": 0,
            "censo": censo, "blanco": blancos, "nulos": votantes - validos,
            "cand": cand, "seats": 0, "votes": votes,
        }

    data = {
        "id": "aut-198305",
        "kind": "autonomicas",
        "year": 1983,
        "month": 5,
        "parties": {code: {"sig": sig, "name": name, "nat": ""} for (sig, name), code in parties.items()},
        "municipios": out_mun,
        "secciones": {},
    }
    (OUT / "elections" / "aut-198305.json").write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")))

    total = sum(v[0] for m in out_mun.values() for v in m["votes"].values())
    print(f"aut-198305: {len(out_mun)} municipios, {len(parties)} candidaturas, "
          f"{total} votos a candidatura")
    if missing:
        print(f"  sin datos: {missing}")


if __name__ == "__main__":
    main()
