"""
Funções compartilhadas: API do Strava, polyline e cálculo das estatísticas.
Só usa a biblioteca padrão do Python (nenhum pip install necessário).
"""
from __future__ import annotations

import json
import math
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

API = "https://www.strava.com/api/v3"
TOKEN_URL = "https://www.strava.com/oauth/token"

RUN_TYPES = {"Run", "TrailRun", "VirtualRun"}
PR_NAMES = ["5K", "10K", "Half-Marathon", "Marathon"]
PR_DIST_KM = {"5K": 5.0, "10K": 10.0, "Half-Marathon": 21.0975, "Marathon": 42.195}
MARATHON_KM = 42.195


class RateLimited(Exception):
    pass


# ---------------------------------------------------------------- HTTP / API
def _request(url: str, data: dict | None = None, token: str | None = None):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise RateLimited(url) from e
        detail = e.read().decode(errors="replace")[:300]
        raise RuntimeError(f"Strava respondeu {e.code} em {url}: {detail}") from e


def refresh_access_token(client_id: str, client_secret: str, refresh_token: str) -> dict:
    return _request(TOKEN_URL, {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })


def exchange_code(client_id: str, client_secret: str, code: str) -> dict:
    return _request(TOKEN_URL, {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
    })


def get_athlete(token: str) -> dict:
    return _request(f"{API}/athlete", token=token)


def list_activities(token: str, after: int = 0):
    page = 1
    while True:
        qs = urllib.parse.urlencode({"after": after, "per_page": 200, "page": page})
        batch = _request(f"{API}/athlete/activities?{qs}", token=token)
        if not batch:
            return
        yield from batch
        page += 1


def get_activity(token: str, activity_id: int) -> dict:
    return _request(f"{API}/activities/{activity_id}?include_all_efforts=false", token=token)


# ---------------------------------------------------------------- polyline
def decode_polyline(s: str) -> list[tuple[float, float]]:
    pts, idx, lat, lng = [], 0, 0, 0
    while idx < len(s):
        for coord in range(2):
            shift = result = 0
            while True:
                b = ord(s[idx]) - 63
                idx += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if coord == 0:
                lat += delta
            else:
                lng += delta
        pts.append((lat / 1e5, lng / 1e5))
    return pts


def encode_polyline(pts: list[tuple[float, float]]) -> str:
    out, plat, plng = [], 0, 0
    for lat, lng in pts:
        ilat, ilng = round(lat * 1e5), round(lng * 1e5)
        for d in (ilat - plat, ilng - plng):
            v = ~(d << 1) if d < 0 else d << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        plat, plng = ilat, ilng
    return "".join(out)


def _haversine_m(a, b) -> float:
    r = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def trim_polyline(encoded: str | None, meters: float = 500) -> str | None:
    """Remove o começo e o fim do trajeto para não expor onde você mora."""
    if not encoded:
        return None
    pts = decode_polyline(encoded)

    def cut(points):
        acc = 0.0
        for i in range(1, len(points)):
            acc += _haversine_m(points[i - 1], points[i])
            if acc >= meters:
                return points[i:]
        return []

    pts = cut(pts)
    pts = list(reversed(cut(list(reversed(pts)))))
    if len(pts) < 2:
        return None
    # reduz pontos para o arquivo ficar leve (o desenho é pequeno)
    step = max(1, len(pts) // 250)
    pts = pts[::step] + ([pts[-1]] if (len(pts) - 1) % step else [])
    return encode_polyline(pts)


# ---------------------------------------------------------------- cache
def slim_activity(a: dict, trim_m: float) -> dict:
    """Guarda só os campos que o site usa (o cache vai para um repositório público)."""
    return {
        "id": a["id"],
        "name": a.get("name", ""),
        "sport_type": a.get("sport_type") or a.get("type"),
        "start_date_local": a.get("start_date_local"),
        "distance": a.get("distance", 0),
        "moving_time": a.get("moving_time", 0),
        "elapsed_time": a.get("elapsed_time", 0),
        "total_elevation_gain": a.get("total_elevation_gain", 0),
        "average_heartrate": a.get("average_heartrate"),
        "workout_type": a.get("workout_type"),
        "private": bool(a.get("private")) or a.get("visibility") == "only_me",
        "polyline": trim_polyline((a.get("map") or {}).get("summary_polyline"), trim_m),
        "best_efforts": None,  # preenchido depois com o detalhe da atividade
    }


def slim_efforts(detail: dict) -> list[dict]:
    return [
        {"name": e["name"], "elapsed_time": e["elapsed_time"]}
        for e in detail.get("best_efforts") or []
        if e.get("name") in PR_NAMES
    ]


# ---------------------------------------------------------------- estatísticas
def _dt(a: dict) -> datetime:
    return datetime.fromisoformat(a["start_date_local"][:19])


def riegel(seconds: float, from_km: float, to_km: float = MARATHON_KM) -> float:
    return seconds * (to_km / from_km) ** 1.06


def build_output(activities: list[dict], config: dict, athlete: dict | None, today: date) -> dict:
    runs = [a for a in activities if a.get("sport_type") in RUN_TYPES and not a.get("private")]
    runs.sort(key=_dt, reverse=True)

    # --- recordes: melhor esforço do Strava ou valor manual do config (o mais rápido)
    prs: dict[str, dict] = {}
    for a in runs:
        for e in a.get("best_efforts") or []:
            cur = prs.get(e["name"])
            if cur is None or e["elapsed_time"] < cur["seconds"]:
                prs[e["name"]] = {
                    "seconds": e["elapsed_time"],
                    "date": a["start_date_local"][:10],
                    "activity_id": a["id"],
                    "activity_name": a["name"],
                    "source": "strava",
                }
    for name, manual in (config.get("manual_prs") or {}).items():
        cur = prs.get(name)
        if cur is None or manual["seconds"] < cur["seconds"]:
            prs[name] = {**manual, "source": "manual"}
    pr_list = [
        {"key": k, "km": PR_DIST_KM[k], **prs[k]} if k in prs else {"key": k, "km": PR_DIST_KM[k], "seconds": None}
        for k in PR_NAMES
    ]

    # --- volume semanal (últimas 16 semanas, semana começa na segunda)
    this_monday = today - timedelta(days=today.weekday())
    weeks = [this_monday - timedelta(weeks=i) for i in range(15, -1, -1)]
    week_km = {w: 0.0 for w in weeks}
    week_runs = {w: 0 for w in weeks}
    for a in runs:
        d = _dt(a).date()
        w = d - timedelta(days=d.weekday())
        if w in week_km:
            week_km[w] += a["distance"] / 1000
            week_runs[w] += 1
    weekly = [{"week": w.isoformat(), "km": round(week_km[w], 1), "runs": week_runs[w]} for w in weeks]

    # --- volume mensal (últimos 12 meses)
    months = []
    y, m = today.year, today.month
    for _ in range(12):
        months.append((y, m))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    months.reverse()
    month_km = {k: 0.0 for k in months}
    for a in runs:
        d = _dt(a)
        if (d.year, d.month) in month_km:
            month_km[(d.year, d.month)] += a["distance"] / 1000
    monthly = [{"month": f"{y}-{m:02d}", "km": round(month_km[(y, m)], 1)} for y, m in months]

    # --- totais
    ytd = [a for a in runs if _dt(a).year == today.year]
    totals = {
        "ytd_km": round(sum(a["distance"] for a in ytd) / 1000, 1),
        "ytd_runs": len(ytd),
        "ytd_hours": round(sum(a["moving_time"] for a in ytd) / 3600, 1),
        "all_km": round(sum(a["distance"] for a in runs) / 1000, 1),
        "all_runs": len(runs),
        "week_km": weekly[-1]["km"],
    }

    # --- atividades recentes
    recent = []
    for a in runs[:12]:
        km = a["distance"] / 1000
        recent.append({
            "id": a["id"],
            "name": a["name"],
            "date": a["start_date_local"][:16],
            "km": round(km, 2),
            "moving_time": a["moving_time"],
            "pace": round(a["moving_time"] / km) if km > 0 else None,
            "elevation": round(a.get("total_elevation_gain") or 0),
            "hr": round(a["average_heartrate"]) if a.get("average_heartrate") else None,
            "race": a.get("workout_type") == 1,
            "polyline": a.get("polyline"),
        })

    # --- previsão para qualquer distância: usa o recorde de distância mais próxima
    def predict(km: float):
        known = [(abs(math.log(km / PR_DIST_KM[n])), n) for n in PR_DIST_KM if n in prs]
        if not known:
            return None
        basis = min(known)[1]
        return {"seconds": round(riegel(prs[basis]["seconds"], PR_DIST_KM[basis], km)), "basis": basis}

    # --- provas-alvo (lista no site.config.json)
    races = []
    for r in config.get("races") or []:
        km = float(r.get("distance_km") or MARATHON_KM)
        races.append({
            "name": r.get("name", "Prova"),
            "date": r.get("date", ""),
            "date_label": r.get("date_label", ""),
            "city": r.get("city", ""),
            "distance_km": km,
            "target_seconds": r.get("target_seconds"),
            "main": bool(r.get("main")),
            "estimated": bool(r.get("estimated")),
            "prediction": predict(km),
        })
    races.sort(key=lambda r: r["date"] or "9999")

    # --- rumo à sub-3
    goal = config.get("goal") or {}
    main = next((r for r in races if r["main"]), None) or next((r for r in races if r["distance_km"] == MARATHON_KM), None)
    target = (main or {}).get("target_seconds") or goal.get("target_seconds", 10799)
    prediction = predict(MARATHON_KM)
    last8 = today - timedelta(weeks=8)
    last12 = today - timedelta(weeks=12)
    recent8 = [a for a in runs if _dt(a).date() >= last8]
    recent12 = [a for a in runs if _dt(a).date() >= last12]
    sub3 = {
        "target_seconds": target,
        "target_pace": round(target / MARATHON_KM),
        "race_name": (main or {}).get("name") or goal.get("race_name") or "",
        "race_date": (main or {}).get("date") or goal.get("race_date") or "",
        "race_date_label": (main or {}).get("date_label", ""),
        "prediction": prediction,
        "avg_week_km_8w": round(sum(a["distance"] for a in recent8) / 1000 / 8, 1),
        "longest_km_8w": round(max((a["distance"] for a in recent8), default=0) / 1000, 1),
        "long_runs_30k_12w": sum(1 for a in recent12 if a["distance"] >= 30000),
    }

    name = config.get("name") or (athlete or {}).get("firstname") or "Atleta"
    return {
        "updated_at": datetime.now().astimezone().isoformat(timespec="minutes"),
        "athlete": {
            "name": name,
            "tagline": config.get("tagline", ""),
            "strava_url": config.get("strava_url", ""),
            "instagram": config.get("instagram", ""),
            "photo": config.get("photo") or (athlete or {}).get("profile"),
        },
        "totals": totals,
        "prs": pr_list,
        "weekly": weekly,
        "monthly": monthly,
        "recent": recent,
        "sub3": sub3,
        "races": races,
    }
