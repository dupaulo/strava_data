"""
Roda UMA vez no seu computador para obter o refresh token do Strava.

  python scripts/get_token.py

Ele mostra um link; você autoriza no navegador, copia a URL para onde foi
redirecionado (http://localhost/?...code=XXXX...) e cola aqui.
"""
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import stravalib_lite as sl  # noqa: E402

cid = input("Client ID: ").strip()
secret = input("Client Secret: ").strip()

url = "https://www.strava.com/oauth/authorize?" + urllib.parse.urlencode({
    "client_id": cid,
    "response_type": "code",
    "redirect_uri": "http://localhost/exchange_token",
    "approval_prompt": "force",
    "scope": "read,activity:read_all",
})
print("\n1) Abra este link e clique em Autorizar:\n\n" + url)
print("\n2) O navegador vai mostrar erro de página (normal). Copie a URL inteira da barra de endereço.")
redirected = input("\nCole a URL aqui: ").strip()

code = urllib.parse.parse_qs(urllib.parse.urlparse(redirected).query).get("code", [redirected])[0]
tok = sl.exchange_code(cid, secret, code)

print("\nPronto! Guarde estes três valores como secrets no GitHub:\n")
print(f"STRAVA_CLIENT_ID      = {cid}")
print(f"STRAVA_CLIENT_SECRET  = {secret}")
print(f"STRAVA_REFRESH_TOKEN  = {tok['refresh_token']}")
