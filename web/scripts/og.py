"""Genera public/og.png (1200x630) para la tarjeta de previsualización
(og:image): silueta de los municipios coloreada por el ganador de las
últimas municipales. Requiere Pillow.

    python3 scripts/og.py
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"

geo = json.loads((DATA / "municipios.geojson").read_text())
summary = json.loads((DATA / "summary.json").read_text())
parties = json.loads((DATA / "parties.json").read_text())

W, H = 1200, 630
SS = 2  # supersampling para suavizar bordes

# --- proyección mercator ajustada al hueco derecho de la tarjeta ---
def merc(lon, lat):
    return math.radians(lon), -math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

pts = []
for f in geo["features"]:
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    for poly in polys:
        for lon, lat in poly[0]:
            pts.append(merc(lon, lat))
xs = [p[0] for p in pts]
ys = [p[1] for p in pts]
box = (620, 16, 1184, 614)  # x0, y0, x1, y1 dentro de la tarjeta
sx = (box[2] - box[0]) / (max(xs) - min(xs))
sy = (box[3] - box[1]) / (max(ys) - min(ys))
s = min(sx, sy)
ox = box[0] + ((box[2] - box[0]) - s * (max(xs) - min(xs))) / 2 - s * min(xs)
oy = box[1] + ((box[3] - box[1]) - s * (max(ys) - min(ys))) / 2 - s * min(ys)

def project(lon, lat):
    x, y = merc(lon, lat)
    return (s * x + ox) * SS, (s * y + oy) * SS

# --- ganador de las últimas municipales por municipio ---
last = sorted(k for k in summary if k.startswith("mun-"))[-1]
mun = summary[last]["mun"]

def winner(votes):
    return max(votes, key=votes.get) if votes else None

def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))

img = Image.new("RGB", (W * SS, H * SS), hex_rgb("f8fafc"))
draw = ImageDraw.Draw(img)

for f in geo["features"]:
    u = mun.get(f["properties"]["CMUN"])
    w = winner(u["votes"]) if u and u["votes"] else None
    color = hex_rgb(parties.get(w, {}).get("color", "#cbd5e1") if w else "#cbd5e1")
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    for poly in polys:
        ring = [project(lon, lat) for lon, lat in poly[0]]
        if len(ring) >= 3:
            draw.polygon(ring, fill=color, outline=hex_rgb("ffffff"), width=SS)

font = lambda size, bold=False: ImageFont.truetype(
    "/System/Library/Fonts/Helvetica.ttc", size * SS, index=1 if bold else 0
)
ink = hex_rgb("0f172a")
gray = hex_rgb("475569")
light = hex_rgb("94a3b8")
draw.text((64 * SS, 180 * SS), "Atlas electoral", font=font(64, True), fill=ink)
draw.text((64 * SS, 256 * SS), "de Castelló", font=font(64, True), fill=ink)
draw.text((64 * SS, 352 * SS), "Todas las elecciones de la provincia · 1979–2024", font=font(28), fill=gray)
draw.text((64 * SS, 392 * SS), "por municipio y sección censal", font=font(28), fill=gray)
draw.text((64 * SS, 540 * SS), "Ministerio del Interior · Dades Obertes GVA · INE", font=font(20), fill=light)

img = img.resize((W, H), Image.LANCZOS)
img.save(ROOT / "public" / "og.png")
print("public/og.png generado", img.size)
