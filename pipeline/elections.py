"""Catálogo de elecciones a descargar del Ministerio del Interior (infoelectoral).

Códigos de tipo de elección del MIR:
  02 = Congreso (generales)
  04 = Municipales
  07 = Parlamento Europeo

Las autonómicas (Corts Valencianes) no están en el MIR; se obtienen de ARGOS/GVA
en un paso aparte.
"""

GENERALES = [
    (1979, 3), (1982, 10), (1986, 6), (1989, 10), (1993, 6), (1996, 3),
    (2000, 3), (2004, 3), (2008, 3), (2011, 11), (2015, 12), (2016, 6),
    (2019, 4), (2019, 11), (2023, 7),
]

MUNICIPALES = [
    (1979, 4), (1983, 5), (1987, 6), (1991, 5), (1995, 5), (1999, 6),
    (2003, 5), (2007, 5), (2011, 5), (2015, 5), (2019, 5), (2023, 5),
]

EUROPEAS = [
    (1987, 6), (1989, 6), (1994, 6), (1999, 6), (2004, 6), (2009, 6),
    (2014, 5), (2019, 5), (2024, 6),
]

ELECTIONS = (
    [("02", "generales", y, m) for y, m in GENERALES]
    + [("04", "municipales", y, m) for y, m in MUNICIPALES]
    + [("07", "europeas", y, m) for y, m in EUROPEAS]
)

BASE_URL = "https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr"


def zip_name(tipo: str, year: int, month: int, level: str) -> str:
    """level: 'MUNI' o 'MESA'."""
    return f"{tipo}{year}{month:02d}_{level}.zip"


def election_id(kind: str, year: int, month: int) -> str:
    return f"{kind[:3]}-{year}{month:02d}"
