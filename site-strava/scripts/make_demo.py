"""
Gera data/strava.json com dados FICTÍCIOS para ver o site antes de ligar o Strava.
Não grava o cache, então a primeira execução real substitui tudo.
"""
import json
import math
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import stravalib_lite as sl  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
random.seed(42)
today = date.today()


def loop(km: float) -> str:
    """Trajeto fictício em forma de laço irregular."""
    cx, cy = -23.5, -46.6
    r = km / 2 / math.pi / 111
    k = random.uniform(0.6, 1.4)
    pts = []
    for i in range(120):
        t = 2 * math.pi * i / 119
        wob = 1 + 0.25 * math.sin(3 * t + k) + 0.1 * math.cos(5 * t)
        pts.append((cx + r * wob * math.sin(t) * k, cy + r * wob * math.cos(t)))
    return sl.encode_polyline(pts)


def demo_laps(plan, km, pace):
    if plan == "int":  # 2 km aquecimento, 6x800 com 400 de trote, desaquecimento
        laps = [{"d": 2000, "t": int(2 * 300), "hr": 135}]
        for _ in range(6):
            laps.append({"d": 800, "t": int(0.8 * random.uniform(222, 230)), "hr": random.randint(168, 176)})
            laps.append({"d": 400, "t": int(0.4 * random.uniform(330, 360)), "hr": random.randint(145, 152)})
        rest = km * 1000 - 2000 - 6 * 1200
        if rest > 200:
            laps.append({"d": int(rest), "t": int(rest / 1000 * 305), "hr": 140})
        return laps
    n = int(km)
    laps = [{"d": 1000, "t": int(pace + random.uniform(-8, 8)), "hr": random.randint(140, 158)} for _ in range(n)]
    if km - n > 0.05:
        laps.append({"d": int((km - n) * 1000), "t": int((km - n) * pace), "hr": 150})
    return laps


names = {
    "easy": ["Regenerativo", "Rodagem leve", "Trote pela manhã", "Corrida tranquila"],
    "tempo": ["Tempo run", "Ritmo de maratona", "Progressivo"],
    "int": ["Tiros de 1 km", "Intervalado 6x800", "Fartlek"],
    "long": ["Longão de domingo", "Longo progressivo"],
}
acts, aid = [], 1
d = today - timedelta(days=400)
while d <= today:
    wd = d.weekday()
    plan = {0: None, 1: "int", 2: "easy", 3: "tempo", 4: "easy", 5: "easy", 6: "long"}[wd]
    if plan and random.random() > 0.08:
        progress = 1 - (today - d).days / 400
        km = {"easy": random.uniform(10, 14), "tempo": random.uniform(12, 16),
              "int": random.uniform(11, 14), "long": random.uniform(22, 26) + 9 * progress}[plan]
        pace = {"easy": 290, "tempo": 245, "int": 255, "long": 275}[plan] - 8 * progress + random.uniform(-6, 6)
        acts.append({
            "id": aid, "name": random.choice(names[plan]), "sport_type": "Run",
            "start_date_local": datetime(d.year, d.month, d.day, *random.choice([(5, 10), (5, 40), (5, 50), (6, 5), (6, 30), (18, 20), (19, 0)] if wd != 6 else [(6, 0), (6, 30), (7, 0)])).isoformat() + "Z",
            "distance": km * 1000, "moving_time": int(km * pace), "elapsed_time": int(km * pace) + 60,
            "total_elevation_gain": random.uniform(20, 160), "average_heartrate": random.uniform(138, 162),
            "workout_type": None, "private": False, "polyline": loop(km),
            "best_efforts": [{"name": "5K", "elapsed_time": int(5 * (pace - 22))},
                             {"name": "10K", "elapsed_time": int(10 * (pace - 15))}],
            "laps": demo_laps(plan, km, pace),
        })
        aid += 1
    d += timedelta(days=1)

# uma prova de 10K recente
race_day = today - timedelta(days=24)
acts.append({
    "id": aid, "name": "Prova 10K", "sport_type": "Run",
    "start_date_local": datetime(race_day.year, race_day.month, race_day.day, 7, 0).isoformat() + "Z",
    "distance": 10050, "moving_time": 2205, "elapsed_time": 2210, "total_elevation_gain": 45,
    "average_heartrate": 176, "workout_type": 1, "private": False, "polyline": loop(10),
    "best_efforts": [{"name": "5K", "elapsed_time": 1092}, {"name": "10K", "elapsed_time": 2193}],
})

config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
out = sl.build_output(acts, config, None, today)
out["demo"] = True
(ROOT / "data" / "strava.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("Dados de exemplo gerados em data/strava.json")
