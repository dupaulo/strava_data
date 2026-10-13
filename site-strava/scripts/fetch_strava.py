"""
Busca suas atividades no Strava e gera data/strava.json, que o site lê.

Variáveis de ambiente (no GitHub ficam em Settings > Secrets > Actions):
  STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
Opcionais:
  MAX_DETAILS  quantas atividades detalhar por execução (padrão 90)
  TRIM_METERS  quantos metros cortar do início/fim de cada trajeto (padrão 500)
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))
import stravalib_lite as sl  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "activities.json"
OUTPUT = ROOT / "data" / "strava.json"
CONFIG = ROOT / "site.config.json"
TZ = ZoneInfo(os.environ.get("SITE_TZ", "America/Sao_Paulo"))


def main() -> int:
    try:
        cid = os.environ["STRAVA_CLIENT_ID"]
        secret = os.environ["STRAVA_CLIENT_SECRET"]
        refresh = os.environ["STRAVA_REFRESH_TOKEN"]
    except KeyError as e:
        print(f"Falta a variável {e}. Veja o README.", file=sys.stderr)
        return 1
    max_details = int(os.environ.get("MAX_DETAILS", "90"))
    trim_m = float(os.environ.get("TRIM_METERS", "500"))

    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    cache: dict[str, dict] = {}
    if CACHE.exists():
        cache = {str(a["id"]): a for a in json.loads(CACHE.read_text(encoding="utf-8"))}

    tok = sl.refresh_access_token(cid, secret, refresh)
    token = tok["access_token"]
    if tok.get("refresh_token") and tok["refresh_token"] != refresh:
        print("Aviso: o Strava emitiu um novo refresh token. Atualize o secret "
              "STRAVA_REFRESH_TOKEN se as próximas execuções falharem.")

    athlete = sl.get_athlete(token)

    # baixa só o que é novo (com folga de 3 dias para pegar edições recentes)
    after = 0
    if cache:
        newest = max(datetime.fromisoformat(a["start_date_local"][:19]) for a in cache.values())
        after = int((newest - timedelta(days=3)).replace(tzinfo=TZ).timestamp())
    new = 0
    for a in sl.list_activities(token, after=after):
        key = str(a["id"])
        old = cache.get(key)
        slim = sl.slim_activity(a, trim_m)
        if old:
            slim["best_efforts"] = old.get("best_efforts")
        else:
            new += 1
        cache[key] = slim
    print(f"{new} atividades novas, {len(cache)} no total.")

    # detalha corridas sem best_efforts: provas primeiro, depois as mais recentes
    pending = [a for a in cache.values()
               if a["sport_type"] in sl.RUN_TYPES and a["best_efforts"] is None and not a["private"]]
    pending.sort(key=lambda a: a["start_date_local"], reverse=True)
    pending.sort(key=lambda a: a.get("workout_type") != 1)  # sort estável: provas na frente
    done = 0
    for a in pending[:max_details]:
        try:
            detail = sl.get_activity(token, a["id"])
        except sl.RateLimited:
            print("Limite de requisições do Strava atingido; continuo na próxima execução.")
            break
        a["best_efforts"] = sl.slim_efforts(detail)
        done += 1
    left = len(pending) - done
    print(f"{done} corridas detalhadas" + (f", faltam {left} (completa nos próximos dias)." if left else "."))

    CACHE.parent.mkdir(exist_ok=True)
    acts = sorted(cache.values(), key=lambda a: a["start_date_local"], reverse=True)
    CACHE.write_text(json.dumps(acts, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    out = sl.build_output(acts, config, athlete, datetime.now(TZ).date())
    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Gerado {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
