"""
Lê os posts em posts/*.md e gera:
  - posts/index.json      lista que o site usa
  - posts/<slug>.html     página de cada post, com título, resumo e imagem
                          para a prévia no Facebook, WhatsApp etc.

Cada post começa com um cabeçalho simples:

---
title: Meu primeiro post
date: 2026-10-13
summary: Uma frase sobre o post.
image: posts/minha-foto.jpg      (opcional: imagem da prévia ao compartilhar)
---
Texto em Markdown...
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / "posts"
MARK = "<!-- gerado por build_posts.py -->"

config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
SITE = (config.get("site_url") or "").rstrip("/")
NAME = config.get("name") or "Corrida"


def parse(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    meta = {}
    body = text
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip().lower()] = v.strip().strip('"')
        body = m.group(2)
    if meta.get("draft", "").lower() in ("true", "sim", "yes"):
        return None
    words = len(re.findall(r"\w+", body))
    return {
        "slug": path.stem,
        "title": meta.get("title") or path.stem.replace("-", " ").capitalize(),
        "date": meta.get("date", ""),
        "summary": meta.get("summary", ""),
        "image": meta.get("image", ""),
        "minutes": max(1, round(words / 200)),
    }


def absolute(url: str) -> str:
    if not url or url.startswith("http"):
        return url
    return f"{SITE}/{url.lstrip('/')}" if SITE else url


def page(p: dict) -> str:
    e = lambda s: html.escape(s or "", quote=True)  # noqa: E731
    url = absolute(f"posts/{p['slug']}.html")
    img = absolute(p["image"] or "assets/og-default.png")
    desc = p["summary"] or f"Um post de {NAME} sobre corrida e treinos."
    return f"""<!doctype html>
{MARK}
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="../">
<title>{e(p['title'])} · {e(NAME)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="{e(NAME)} · Corrida">
<meta property="og:title" content="{e(p['title'])}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{e(img)}">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b0d10">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
<link rel="icon" href="assets/icon.svg" type="image/svg+xml">
</head>
<body data-page="post" data-slug="{e(p['slug'])}">
<header class="topbar">
  <a class="brand" href="./"><span class="brand-mark"></span><span>{e(NAME)}</span></a>
  <nav><a href="./">Início</a><a href="blog.html">Blog</a></nav>
</header>
<main class="page article">
  <a class="back" href="blog.html">← Todos os posts</a>
  <article id="article"><h1>{e(p['title'])}</h1><p class="empty-note">Carregando…</p></article>
</main>
<footer class="foot"><span>Escrito entre um treino e outro.</span><span class="powered">Powered by Strava</span></footer>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="assets/app.js"></script>
</body>
</html>
"""


posts = [p for p in (parse(f) for f in POSTS.glob("*.md")) if p]
posts.sort(key=lambda p: p["date"], reverse=True)

# remove páginas geradas de posts que foram apagados ou viraram rascunho
keep = {f"{p['slug']}.html" for p in posts}
for f in POSTS.glob("*.html"):
    if f.name not in keep and MARK in f.read_text(encoding="utf-8", errors="ignore")[:200]:
        f.unlink()

for p in posts:
    (POSTS / f"{p['slug']}.html").write_text(page(p), encoding="utf-8")

(POSTS / "index.json").write_text(json.dumps(posts, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(posts)} posts no índice." + ("" if SITE else " Aviso: defina site_url no site.config.json para a prévia funcionar."))
