"""Descarga los ZIP de resultados del MIR a pipeline/raw/.

Uso: python3 download.py
Reintenta y omite los que ya existen. Los que devuelvan 404 se apuntan en
raw/missing.txt para revisarlos.
"""
import subprocess
import sys
from pathlib import Path

from elections import BASE_URL, ELECTIONS, zip_name

RAW = Path(__file__).parent / "raw"
RAW.mkdir(exist_ok=True)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"


def fetch(name: str) -> str:
    dest = RAW / name
    if dest.exists() and dest.stat().st_size > 0:
        return "ok (cached)"
    url = f"{BASE_URL}/{name}"
    tmp = dest.with_suffix(".part")
    cmd = [
        "curl", "-sS", "-L", "--fail", "--max-time", "300", "--retry", "2",
        "-A", UA, "-o", str(tmp), url,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        tmp.unlink(missing_ok=True)
        return f"FAIL ({res.stderr.strip().splitlines()[-1] if res.stderr else res.returncode})"
    tmp.rename(dest)
    return f"ok ({dest.stat().st_size // 1024} KB)"


def main():
    missing = []
    for tipo, kind, year, month in ELECTIONS:
        # El ZIP de MESA incluye también los ficheros de municipio (05/06),
        # así que solo bajamos MUNI si no existe el de MESA.
        name = zip_name(tipo, year, month, "MESA")
        status = fetch(name)
        print(f"{kind:12s} {year}-{month:02d} MESA: {status}", flush=True)
        if status.startswith("FAIL"):
            name = zip_name(tipo, year, month, "MUNI")
            status = fetch(name)
            print(f"{kind:12s} {year}-{month:02d} MUNI: {status}", flush=True)
            if status.startswith("FAIL"):
                missing.append(name)
    (RAW / "missing.txt").write_text("\n".join(missing))
    print(f"\n{len(missing)} ficheros no descargados", file=sys.stderr)


if __name__ == "__main__":
    main()
