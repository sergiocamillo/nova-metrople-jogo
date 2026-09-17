#!/usr/bin/env python3
"""Converte dados do OpenStreetMap (Midtown Manhattan) para o formato do jogo.

Uso: python3 tools/build_map.py <buildings.json> <roads.json> > manhattan.js

Projeção: Mercator local centrado em Bryant Park, metros -> unidades do jogo (1:1).
Fonte dos dados: OpenStreetMap, licença ODbL (https://www.openstreetmap.org/copyright).
"""
import json, math, sys

# Centro do mapa: Bryant Park / 42nd St
LAT0, LON0 = 40.7536, -73.9832
M_PER_DEG_LAT = 111320.0

# Recorte final do jogo (metros a partir do centro)
HALF_X, HALF_Z = 620, 760


def project(lat, lon):
    x = (lon - LON0) * M_PER_DEG_LAT * math.cos(math.radians(LAT0))
    z = -(lat - LAT0) * M_PER_DEG_LAT
    return x, z


def parse_height(tags):
    h = tags.get("height")
    if h:
        try:
            return max(4.0, float(str(h).replace("m", "").strip()))
        except ValueError:
            pass
    lv = tags.get("building:levels")
    if lv:
        try:
            return max(4.0, float(str(lv).split(";")[0].strip()) * 3.6)
        except ValueError:
            pass
    return None


def ring_area_centroid(pts):
    """Área com sinal e centroide de um polígono."""
    a = cx = cz = 0.0
    n = len(pts)
    for i in range(n):
        x0, z0 = pts[i]
        x1, z1 = pts[(i + 1) % n]
        cross = x0 * z1 - x1 * z0
        a += cross
        cx += (x0 + x1) * cross
        cz += (z0 + z1) * cross
    a *= 0.5
    if abs(a) < 1e-9:
        return 0.0, pts[0][0], pts[0][1]
    return abs(a), cx / (6 * a), cz / (6 * a)


def oriented_box(pts):
    """Menor retângulo rotacionado que cobre o polígono (rotating calipers simplificado).

    Prédios de Manhattan são quase todos retangulares e alinhados à malha viária,
    então um box orientado representa a pegada muito melhor que um AABB.
    """
    best = None
    n = len(pts)
    for i in range(n):
        x0, z0 = pts[i]
        x1, z1 = pts[(i + 1) % n]
        ex, ez = x1 - x0, z1 - z0
        L = math.hypot(ex, ez)
        if L < 0.5:
            continue
        ux, uz = ex / L, ez / L
        vx, vz = -uz, ux
        us = [p[0] * ux + p[1] * uz for p in pts]
        vs = [p[0] * vx + p[1] * vz for p in pts]
        w, d = max(us) - min(us), max(vs) - min(vs)
        area = w * d
        if best is None or area < best[0]:
            mu, mv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
            best = (area, mu * ux + mv * vx, mu * uz + mv * vz, w, d, math.atan2(uz, ux))
    return best


def main():
    with open(sys.argv[1]) as f:
        bdata = json.load(f)
    with open(sys.argv[2]) as f:
        rdata = json.load(f)

    buildings = []
    for el in bdata["elements"]:
        geom = el.get("geometry")
        if not geom or len(geom) < 4:
            continue
        pts = [project(g["lat"], g["lon"]) for g in geom]
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) < 3:
            continue

        area, cx, cz = ring_area_centroid(pts)
        if area < 60:  # descarta anexos e galpões minúsculos
            continue
        if abs(cx) > HALF_X or abs(cz) > HALF_Z:
            continue

        box = oriented_box(pts)
        if not box:
            continue
        _, bx, bz, w, d, rot = box
        if w < 4 or d < 4:
            continue

        tags = el.get("tags", {})
        h = parse_height(tags)
        if h is None:
            # Estimativa por porte da pegada: torres ocupam lotes maiores
            h = 24.0 if area > 1200 else (16.0 if area > 500 else 11.0)
        h = min(h, 450.0)

        name = tags.get("name")
        buildings.append({
            "x": round(bx, 1), "z": round(bz, 1),
            "w": round(w, 1), "d": round(d, 1),
            "h": round(h, 1), "r": round(rot, 3),
            **({"n": name} if name else {}),
        })

    # Ruas: polilinhas simplificadas, com nome para placas
    roads = []
    for el in rdata["elements"]:
        geom = el.get("geometry")
        if not geom or len(geom) < 2:
            continue
        tags = el.get("tags", {})
        name = tags.get("name")
        pts = []
        for g in geom:
            x, z = project(g["lat"], g["lon"])
            pts.append([round(x, 1), round(z, 1)])
        inside = [p for p in pts if abs(p[0]) <= HALF_X and abs(p[1]) <= HALF_Z]
        if len(inside) < 2:
            continue
        hw = tags.get("highway")
        width = 22 if hw in ("primary", "trunk") else (16 if hw == "secondary" else 11)
        roads.append({
            "pts": pts, "w": width,
            **({"n": name} if name else {}),
        })

    buildings.sort(key=lambda b: -b["h"])
    out = {
        "attribution": "© OpenStreetMap contributors (ODbL)",
        "center": {"lat": LAT0, "lon": LON0},
        "halfX": HALF_X, "halfZ": HALF_Z,
        "buildings": buildings,
        "roads": roads,
    }

    sys.stdout.write("window.MANHATTAN_MAP = ")
    json.dump(out, sys.stdout, separators=(",", ":"), ensure_ascii=False)
    sys.stdout.write(";\n")

    tall = [b for b in buildings if b["h"] > 100]
    sys.stderr.write(
        f"predios: {len(buildings)} (>100m: {len(tall)}) | ruas: {len(roads)}\n"
    )
    for b in buildings[:8]:
        sys.stderr.write(f"  {b['h']:6.1f}m  {b.get('n','(sem nome)')}\n")


if __name__ == "__main__":
    main()
