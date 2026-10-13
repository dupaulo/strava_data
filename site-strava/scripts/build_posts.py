"""
Lê os posts em posts/*.md e gera posts/index.json (lista que o site usa).

Cada post começa com um cabeçalho simples:

---
title: Meu primeiro post
date: 2026-10-13
summary: Uma frase sobre o post.
---
Texto em Markdown...
"""
import json
import re
from pathlib import Path

POSTS = Path(__file__).resolve().parent.parent / "posts"


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
        "minutes": max(1, round(words / 200)),
    }


posts = [p for p in (parse(f) for f in POSTS.glob("*.md")) if p]
posts.sort(key=lambda p: p["date"], reverse=True)
(POSTS / "index.json").write_text(json.dumps(posts, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(posts)} posts no índice.")
