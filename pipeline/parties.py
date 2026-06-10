"""Tabla canónica de partidos: agrupación de siglas históricas, eje ideológico
(-10 izquierda ... +10 derecha), bloque y color para los gráficos.

La asignación se hace con reglas (regex sobre siglas y denominación) evaluadas
en orden. Lo que no casa va a 'otros'.
"""
import re

# pid -> (etiqueta, color, ideología, bloque)
PARTIES = {
    "eu":        ("EU-IU (PCE/EUPV)",        "#8B0000", -8.0, "izquierda"),
    "podemos":   ("Podemos / Unidas Podemos", "#6B2E68", -7.0, "izquierda"),
    "comp-pod":  ("Compromís–Podemos",        "#C0392B", -6.0, "izquierda"),
    "sumar":     ("Compromís–Sumar",          "#E11D74", -6.0, "izquierda"),
    "erpv":      ("ERPV",                     "#FFB232", -6.5, "izquierda"),
    "compromis": ("Compromís (BLOC/UPV)",     "#E65420", -5.5, "izquierda"),
    "verdes":    ("Els Verds / Los Verdes",   "#4CAF50", -4.5, "izquierda"),
    "psoe":      ("PSOE (PSPV)",              "#E30613", -3.5, "izquierda"),
    "pacma":     ("PACMA",                    "#ADBE18", -2.0, "izquierda"),
    "cds":       ("CDS",                      "#1FA588",  0.0, "centro"),
    "upyd":      ("UPyD",                     "#E9008C",  0.5, "centro"),
    "ucd":       ("UCD",                      "#0E7C61",  1.5, "centro"),
    "cs":        ("Ciudadanos",               "#EB6109",  3.0, "centro"),
    "uv":        ("Unió Valenciana",          "#2C7DA0",  5.0, "derecha"),
    "pp":        ("PP (AP/CP)",               "#1E5FA8",  6.0, "derecha"),
    "vox":       ("Vox",                      "#63BE21",  9.0, "derecha"),
    "salf":      ("SALF",                     "#556B2F",  8.0, "derecha"),
    "exder":     ("Extrema derecha (FN/E2000)", "#3B3B6D", 9.5, "derecha"),
    "indep":     ("Independientes/locales",   "#7F8C8D", None, "otros"),
    "otros":     ("Otros",                    "#9CA3AF", None, "otros"),
}

# Reglas en orden: (regex sobre SIGLAS normalizadas, regex sobre DENOMINACIÓN
# normalizada o None, pid). Normalizado = mayúsculas, sin puntos, espacios simples.
RULES = [
    (r"PSOE|PSPV|PSV-", None, "psoe"),
    (None, r"PARTIDO SOCIALISTA OBRERO", "psoe"),
    (r"^VOX$", None, "vox"),
    (r"^UCD$|^U C D$", None, "ucd"),
    (None, r"UNION DE CENTRO DEMOCRATICO", "ucd"),
    (r"^CDS$", None, "cds"),
    (None, r"CENTRO DEMOCRATICO Y SOCIAL", "cds"),
    (r"^UPYD$", None, "upyd"),
    (r"^PACMA$", None, "pacma"),
    (r"^SALF$|SE ACABO LA FIESTA", r"SE ACABO LA FIESTA", "salf"),
    (r"^(FN|FE-JONS|FE JONS|AUN|PFE)$|ESPAÑA 2000|FRENTE NACIONAL", r"FUERZA NUEVA|FALANGE|ESPAÑA 2000|DEMOCRACIA NACIONAL", "exder"),
    # PP y antecesores (antes que UV: las coaliciones AP-PDP-UV son PP)
    (r"^PP$|^AP\b|^AP-|^FAP$|^CP$|^CD$|^PDP\b|^PDP-", r"ALIANZA POPULAR|PARTIDO POPULAR|COALICION POPULAR|COALICION DEMOCRATICA", "pp"),
    (None, r"^PARTIDO POPULAR$|FEDERACION DE PARTIDOS DE ALIANZA POPULAR", "pp"),
    # Ciudadanos
    (r"^C'S$|^CS$|^C´S$|^CIUDADANOS", r"CIUDADANOS-PARTIDO DE LA CIUDADANIA", "cs"),
    # Coaliciones Compromís-Podemos / Sumar (antes que compromis/podemos)
    (r"SUMAR", r"SUMAR", "sumar"),
    (r"PODEM.*(COMPROM|MOMENT|VALENCIANA)|COMPROM.*PODEM", r"ES EL MOMENT|A LA VALENCIANA", "comp-pod"),
    # Podemos / IU confluencias estatales
    (r"PODEM|^UP-EUPV$|^UNIDES PODEM|^UNIDAS PODEM", None, "podemos"),
    # Compromís y antecesores valencianistas
    (r"COMPROM|^BLOC|^UPV\b|^BNV|PRIMAVERA EUROPEA|ACORD PER GUANYAR|^MES\b", r"COMPROMIS|BLOC NACIONALISTA|UNITAT DEL POBLE", "compromis"),
    # Izquierda Unida / PCE / EUPV
    (r"^PCE|^PCPV|^IU\b|^IU-|^IU/|^EU\b|^EU-|^EUPV|ENTESA|^ESQUERRA UNIDA", r"IZQUIERDA UNIDA|ESQUERRA UNIDA|PARTIDO COMUNISTA", "eu"),
    (r"^PTE-UC$|^PCPE$|^PCTE$|^MUC$|^PST$", r"UNIDAD COMUNISTA|COMUNISTA DE LOS PUEBLOS|SOCIALISTA DE LOS TRABAJADORES", "eu"),
    (r"^CASTELLO-EN", r"CASTELLO EN MOVIMENT", "podemos"),
    (r"^CCD$", r"CIUDADANOS DE CENTRO DEMOCRATICO", "cds"),
    (r"^UN$", r"^UNION NACIONAL$", "exder"),
    (r"^ERPV$|^ERC", r"ESQUERRA REPUBLICANA", "erpv"),
    (r"VERDS|VERDES|^LV$", r"ELS VERDS|LOS VERDES", "verdes"),
    (r"^UV\b|^U V$|UNIO VALENCIANA", r"UNION VALENCIANA|UNIO VALENCIANA", "uv"),
    (r"INDEP|AGRUPACION DE ELECTORES|^AE ", r"INDEPENDIENTE|AGRUPACION DE ELECTORES", "indep"),
]


def _norm(s):
    s = s.upper().replace(".", " ").replace("´", "'")
    s = (s.replace("Á", "A").replace("É", "E").replace("Í", "I")
          .replace("Ó", "O").replace("Ú", "U").replace("À", "A")
          .replace("È", "E").replace("Ò", "O").replace("Ï", "I").replace("Ü", "U"))
    return re.sub(r"\s+", " ", s).strip()


def classify(sig, name):
    ns, nn = _norm(sig), _norm(name)
    for sig_re, name_re, pid in RULES:
        if sig_re and re.search(sig_re, ns):
            return pid
        if name_re and re.search(name_re, nn):
            return pid
    return "otros"
