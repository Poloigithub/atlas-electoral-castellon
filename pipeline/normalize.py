"""Normaliza los JSON de elecciones:
  - añade pmap (código de candidatura -> partido canónico) a cada elección
  - genera parties.json (catálogo canónico)
  - genera index.json (lista de elecciones)
  - genera municipios.json (nombres actuales, comarca, partido judicial)
  - genera diputacion.json (estimación de composición por D'Hondt en cada PJ)
"""
import json
import glob
from collections import defaultdict
from pathlib import Path

from parties import PARTIES, classify

OUT = Path(__file__).parent / "out"
ELEC = OUT / "elections"

PJ_NAMES = {
    3: "Albocàsser", 40: "Castelló de la Plana", 72: "Llucena",
    80: "Morella", 82: "Nules", 100: "Sant Mateu", 104: "Segorbe",
    138: "Vinaròs", 140: "Viver",
}

KIND_LABEL = {
    "generales": "Generales", "municipales": "Municipales",
    "autonomicas": "Autonòmiques (Corts)", "europeas": "Europeas",
}


def dhondt(votes_by_party, seats):
    """votes_by_party: {pid: votos} -> {pid: escaños}"""
    res = defaultdict(int)
    if seats <= 0 or not votes_by_party:
        return dict(res)
    quotients = []
    for pid, v in votes_by_party.items():
        for d in range(1, seats + 1):
            quotients.append((v / d, pid))
    quotients.sort(reverse=True)
    for _, pid in quotients[:seats]:
        res[pid] += 1
    return dict(res)


def largest_remainder(weights, total, minimum=1):
    """Reparte `total` proporcionalmente a weights con mínimo por clave."""
    keys = list(weights)
    base = {k: minimum for k in keys}
    rest = total - minimum * len(keys)
    wsum = sum(weights.values())
    quota = {k: rest * weights[k] / wsum for k in keys}
    for k in keys:
        base[k] += int(quota[k])
    remaining = total - sum(base.values())
    fracs = sorted(keys, key=lambda k: quota[k] - int(quota[k]), reverse=True)
    for k in fracs[:remaining]:
        base[k] += 1
    return base


def main():
    files = sorted(glob.glob(str(ELEC / "*.json")))
    index = []
    all_votes = defaultdict(int)
    otros_top = defaultdict(int)
    latest_muni_names = {}
    muni_meta = {}
    pj_1987 = {}

    elections = {}
    for f in files:
        d = json.load(open(f))
        elections[d["id"]] = d

    # pmap por elección + estadística de cobertura
    for eid, d in elections.items():
        pmap = {}
        for code, p in d["parties"].items():
            pid = classify(p["sig"], p["name"])
            pmap[code] = pid
        d["pmap"] = pmap
        for m in d["municipios"].values():
            for code, (v, _) in m["votes"].items():
                pid = pmap.get(code, "otros")
                all_votes[pid] += v
                if pid == "otros":
                    otros_top[d["parties"][code]["sig"]] += v

    # nombres de municipio más recientes y partido judicial de referencia (1987)
    for eid in sorted(elections):
        d = elections[eid]
        for code, m in d["municipios"].items():
            latest_muni_names[code] = m["name"]
            muni_meta.setdefault(code, {})
            if m.get("comarca"):
                muni_meta[code]["comarca"] = m["comarca"]
        if eid == "mun-198706":
            pj_1987 = {c: m["pj"] for c, m in d["municipios"].items()}

    municipios = {
        code: {
            "name": latest_muni_names[code],
            "pj": pj_1987.get(code, 0),
            "comarca": muni_meta.get(code, {}).get("comarca", 0),
        }
        for code in latest_muni_names
    }

    # Diputación provincial: estimación por elección municipal
    diputacion = {}
    for eid, d in elections.items():
        if d["kind"] != "municipales":
            continue
        pob_pj = defaultdict(int)
        votes_pj = defaultdict(lambda: defaultdict(int))
        electos_pj = defaultdict(lambda: defaultdict(int))
        for code, m in d["municipios"].items():
            pj = m["pj"] or pj_1987.get(code, 0)
            if not pj:
                continue
            pob_pj[pj] += m["pob"] or m["censo"]
            for ccode, (v, e) in m["votes"].items():
                pid = d["pmap"].get(ccode, "otros")
                votes_pj[pj][pid] += v
                electos_pj[pj][pid] += e
        if not pob_pj:
            continue
        total_pob = sum(pob_pj.values())
        total_seats = 25 if total_pob <= 500_000 else 27
        seats_pj = largest_remainder(pob_pj, total_seats)
        comp = defaultdict(int)
        detail = {}
        for pj, seats in seats_pj.items():
            # solo partidos con algún concejal en el partido judicial (LOREG 205)
            eligible = {p: v for p, v in votes_pj[pj].items()
                        if electos_pj[pj].get(p, 0) > 0 and p not in ("otros", "indep")}
            # los independientes/locales no se federan: cada lista iría aparte;
            # aproximamos excluyéndolos del reparto provincial
            won = dhondt(eligible, seats)
            detail[pj] = {"name": PJ_NAMES.get(pj, str(pj)), "seats": seats, "won": won}
            for p, s in won.items():
                comp[p] += s
        diputacion[eid] = {
            "total": total_seats,
            "composicion": dict(comp),
            "pjs": detail,
            "nota": "Estimación: D'Hondt por partido judicial sobre votos municipales "
                    "de partidos con al menos un concejal en el PJ (excluye listas "
                    "independientes). La asignación oficial puede variar.",
        }

    # escribir todo
    for eid, d in elections.items():
        (ELEC / f"{eid}.json").write_text(
            json.dumps(d, ensure_ascii=False, separators=(",", ":")))
        index.append({
            "id": eid, "kind": d["kind"], "label": KIND_LABEL[d["kind"]],
            "year": d["year"], "month": d["month"],
            "secciones": bool(d["secciones"]),
        })
    index.sort(key=lambda e: (e["year"], e["month"], e["kind"]))

    catalog = {
        pid: {"label": lab, "color": col, "ideol": ideol, "bloc": bloc}
        for pid, (lab, col, ideol, bloc) in PARTIES.items()
    }
    (OUT / "parties.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1))
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
    (OUT / "municipios.json").write_text(json.dumps(municipios, ensure_ascii=False, separators=(",", ":")))
    (OUT / "diputacion.json").write_text(json.dumps(diputacion, ensure_ascii=False, separators=(",", ":")))

    total = sum(all_votes.values())
    otros = all_votes.get("otros", 0) + all_votes.get("indep", 0)
    print(f"{len(index)} elecciones | cobertura clasificación: "
          f"{100 * (total - otros) / total:.1f}% de los votos")
    print("Top sin clasificar:")
    for sig, v in sorted(otros_top.items(), key=lambda kv: -kv[1])[:15]:
        print(f"  {sig[:40]:40s} {v}")


if __name__ == "__main__":
    main()
