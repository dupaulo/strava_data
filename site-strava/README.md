# Site de corrida com dados do Strava

Página pessoal com recordes, volume de treino, treinos recentes, painel "Rumo à sub-3" e blog.
Site estático (HTML/CSS/JS puro) + um script Python que roda todo dia no GitHub Actions. **Custo: zero.**

```
index.html            página principal
blog.html / post.html lista de posts e página do post
assets/               estilo, script e ícone
posts/*.md            seus posts (Markdown)
data/strava.json      números que o site mostra (gerado pelo script)
data/activities.json  cache das atividades (gerado pelo script)
site.config.json      nome, frase, links, meta da maratona, recordes manuais
scripts/              Python: sincronização, token, índice do blog, dados de exemplo
.github/workflows/    agendamento diário
```

O site já vem com **dados de exemplo** (faixa laranja no topo) para você ver o visual antes de ligar o Strava.

---

## 1. Personalize o `site.config.json`

- `name`, `tagline`: nome e frase do topo
- `strava_url`: link do seu perfil (`https://www.strava.com/athletes/<seu número>`)
- `instagram`: link completo ou deixe vazio
- `races`: suas provas-alvo, cada uma com `name`, `city`, `date` (formato `2027-05-30`),
  `distance_km` e, se quiser, `target_seconds` (10799 = 2:59:59). Marque a principal com `"main": true`;
  ela alimenta o painel "Rumo à sub-3". Para data ainda não confirmada, use `"estimated": true` e um
  `date_label` com o texto que deve aparecer.
- `manual_prs`: recordes que talvez não estejam no Strava (já está a meia em 1:20:46 = 4846 s).
  O site sempre mostra o mais rápido entre o manual e o do Strava. Chaves aceitas: `5K`, `10K`, `Half-Marathon`, `Marathon`.

## 2. Crie o app no Strava (5 min)

1. Acesse <https://www.strava.com/settings/api>
2. Preencha: nome qualquer (ex.: "Meu site"), categoria "Visualizer", site `http://localhost`,
   **Authorization Callback Domain: `localhost`**
3. Anote o **Client ID** e o **Client Secret**

## 3. Gere o refresh token (uma vez, no seu computador)

```bash
python scripts/get_token.py
```

Ele pede o Client ID e o Secret, mostra um link, você autoriza no navegador e cola a URL de volta.
No fim aparecem os três valores que vão para o GitHub.

## 4. Suba para o GitHub

1. Crie um repositório (pode ser público) e envie esta pasta:
   ```bash
   git init && git add . && git commit -m "Primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
   git push -u origin main
   ```
2. No repositório: **Settings → Secrets and variables → Actions → New repository secret**, crie:
   `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`
3. **Settings → Actions → General → Workflow permissions**: marque **Read and write permissions**
4. Aba **Actions → Atualizar site → Run workflow** para a primeira sincronização

A partir daí roda sozinho todo dia às 06:15. Na primeira vez ele baixa todo o histórico; os recordes
(que exigem uma consulta por corrida) vão sendo preenchidos ao longo de alguns dias, começando pelas
provas e pelas corridas mais recentes, para respeitar o limite da API do Strava. Se quiser acelerar,
rode manualmente com um número maior em "max_details" (até ~95 a cada 15 minutos).

## 5. Publique (escolha um)

**Vercel:** vercel.com → Add New → Project → importe o repositório → Framework Preset: **Other** →
sem build command → Deploy.

**Netlify:** app.netlify.com → Add new site → Import from Git → escolha o repositório →
Build command vazio, Publish directory `.` → Deploy.

Os dois republicam sozinhos a cada commit (inclusive os commits diários do robô). Domínio próprio
(ex.: `paulocorre.com.br`) se configura no painel de qualquer um deles.

---

## Escrever no blog

Crie `posts/meu-post.md`:

```markdown
---
title: Longão de 32 km no ritmo de prova
date: 2026-10-20
summary: Como foi o primeiro longão com blocos a 4:15/km.
---
Texto em Markdown...
```

Commit e push. O índice é refeito automaticamente. Para rascunho, adicione `draft: true`.

## Ver no computador

```bash
python -m http.server 8000
```

Abra <http://localhost:8000>. Para regenerar os dados de exemplo: `python scripts/make_demo.py`.

## Privacidade

- Atividades marcadas como "Somente eu" no Strava ficam fora do site.
- Os primeiros e últimos 500 m de cada trajeto são cortados, para não mostrar onde você mora
  (ajuste com a variável `TRIM_METERS` no workflow).
- O cache guarda só os campos que o site usa.
- Suas chaves ficam nos Secrets do GitHub, nunca nos arquivos do site.
