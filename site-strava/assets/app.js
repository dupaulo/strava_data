/* Site de corrida — lê data/strava.json e posts/index.json e monta a página. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- formatação
  const fmtTime = (sec) => {
    if (sec == null) return "—";
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  };
  const fmtPace = (secPerKm) => (secPerKm ? `${fmtTime(secPerKm)}/km` : "—");
  const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const fmtDate = (iso, withYear = true) => {
    if (!iso) return "";
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!d) return iso;
    return `${d} ${MESES[m - 1]}${withYear ? " " + y : ""}`;
  };
  const PR_LABEL = { "5K": "5 km", "10K": "10 km", "Half-Marathon": "Meia maratona", "Marathon": "Maratona" };

  const getJSON = (url) => fetch(url, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  });

  // ---------- tooltip
  const tip = $("#tip");
  const showTip = (html, x, y) => {
    if (!tip) return;
    tip.innerHTML = html;
    const w = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(x, w / 2 + 8), innerWidth - w / 2 - 8) + "px";
    tip.style.top = (y - 12) + "px";
    tip.style.opacity = 1;
  };
  const hideTip = () => tip && (tip.style.opacity = 0);

  // ---------- polyline → caminho SVG
  function decodePolyline(str) {
    const pts = []; let i = 0, lat = 0, lng = 0;
    while (i < str.length) {
      for (let c = 0; c < 2; c++) {
        let shift = 0, result = 0, b;
        do { b = str.charCodeAt(i++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);
        const d = result & 1 ? ~(result >> 1) : result >> 1;
        if (c === 0) lat += d; else lng += d;
      }
      pts.push([lat / 1e5, lng / 1e5]);
    }
    return pts;
  }
  function routeSVG(poly, size = 84) {
    if (!poly) return "";
    const pts = decodePolyline(poly);
    if (pts.length < 2) return "";
    const k = Math.cos((pts[0][0] * Math.PI) / 180);
    const xs = pts.map((p) => p[1] * k), ys = pts.map((p) => -p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1, pad = 6, s = (size - pad * 2) / span;
    const ox = pad + (size - pad * 2 - (maxX - minX) * s) / 2, oy = pad + (size - pad * 2 - (maxY - minY) * s) / 2;
    const d = xs.map((x, i) => `${i ? "L" : "M"}${(ox + (x - minX) * s).toFixed(1)},${(oy + (ys[i] - minY) * s).toFixed(1)}`).join("");
    return `<svg class="route" viewBox="0 0 ${size} ${size}" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  // ---------- seções
  function renderHero(data) {
    const a = data.athlete, t = data.totals;
    document.title = `${a.name} · Corrida`;
    $("#brand-name").textContent = a.name;
    $("#name").innerHTML = `${esc(a.name)}<span class="dot">.</span>`;
    $("#tagline").textContent = a.tagline || "";
    const links = [];
    if (a.strava_url && !a.strava_url.includes("SEU_ID")) links.push(`<a href="${esc(a.strava_url)}" target="_blank" rel="noopener">Strava</a>`);
    if (a.instagram) links.push(`<a href="${esc(a.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
    links.push(`<a href="blog.html">Blog</a>`);
    $("#links").innerHTML = links.join("");
    const up = new Date(data.updated_at);
    $("#updated").textContent = isNaN(up) ? "" :
      `Atualizado em ${up.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}, ${up.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    $("#year").textContent = new Date().getFullYear();
    $("#ytd-km").textContent = nf0.format(t.ytd_km);
    $("#ytd-runs").textContent = t.ytd_runs;
    $("#ytd-hours").textContent = nf0.format(t.ytd_hours);
    $("#week-km").textContent = nf1.format(t.week_km);
    if (data.demo) document.body.insertAdjacentHTML("afterbegin",
      `<div class="demo-banner">Dados de exemplo — o site passa a mostrar seus treinos reais após a primeira sincronização com o Strava.</div>`);
  }

  function renderPRs(prs) {
    $("#prs").innerHTML = prs.map((p) => {
      if (p.seconds == null) {
        return `<article class="pr empty"><div class="pr-dist">${PR_LABEL[p.key]}</div>
          <div class="pr-time">—</div><div class="pr-pace">em breve</div>
          <div class="pr-meta">${p.key === "Marathon" ? "A estreia vem aí." : "Ainda sem registro."}</div></article>`;
      }
      const meta = [p.activity_name, fmtDate(p.date)].filter(Boolean).map(esc).join(" · ");
      const link = p.activity_id && p.source === "strava" ? `https://www.strava.com/activities/${p.activity_id}` : null;
      return `<article class="pr"><div class="pr-dist">${PR_LABEL[p.key]}</div>
        <div class="pr-time">${fmtTime(p.seconds)}</div>
        <div class="pr-pace">${fmtPace(p.seconds / p.km)}</div>
        <div class="pr-meta">${link ? `<a href="${link}" target="_blank" rel="noopener">${meta}</a>` : meta}</div></article>`;
    }).join("");
  }

  const daysTo = (iso) => Math.ceil((new Date(iso + "T07:00:00") - new Date()) / 864e5);
  const fmtKm = (km) => (km === 21.0975 ? "Meia maratona · 21,1 km" : km === 42.195 ? "Maratona · 42,2 km" : `${nf1.format(km).replace(",0", "")} km`);

  function renderRaces(races) {
    const box = $("#races");
    if (!races || !races.length) { box.closest("section").hidden = true; return; }
    box.innerHTML = races.map((r) => {
      const days = r.date ? daysTo(r.date) : null;
      const past = days != null && days < 0;
      const when = r.date_label || (r.date ? fmtDate(r.date) : "Data a definir");
      const count = days == null ? "" : past
        ? `<div class="race-count"><span class="lbl">Prova realizada</span></div>`
        : `<div class="race-count"><span class="num">${r.estimated ? "≈" : ""}${days}</span><span class="lbl">dias</span></div>`;
      const rows = [];
      if (r.target_seconds) rows.push(`<div>Meta<b>${fmtTime(r.target_seconds)}</b></div><div>Pace da meta<b>${fmtPace(r.target_seconds / r.distance_km)}</b></div>`);
      if (r.prediction) {
        const same = { "5K": 5, "10K": 10, "Half-Marathon": 21.0975, "Marathon": 42.195 }[r.prediction.basis] === r.distance_km;
        rows.push(`<div>${same ? "Recorde atual" : "Previsão hoje"}<b>${fmtTime(r.prediction.seconds)}</b></div>`);
      }
      return `<article class="race${r.main ? " main" : ""}${past ? " past" : ""}">
        ${r.main ? '<span class="race-badge">PRINCIPAL</span>' : ""}
        <span class="race-dist">${fmtKm(r.distance_km)}</span>
        <h3 class="race-name">${esc(r.name)}</h3>
        <span class="race-place">${[r.city, when].filter(Boolean).map(esc).join(" · ")}</span>
        ${count}
        ${rows.length ? `<div class="race-rows">${rows.join("")}</div>` : ""}
      </article>`;
    }).join("");
  }

  function renderSub3(s) {
    $("#race-name").textContent = s.race_name || "Maratona sub-3";
    const cd = $("#countdown");
    if (s.race_date) {
      const days = daysTo(s.race_date);
      const when = s.race_date_label || fmtDate(s.race_date);
      cd.innerHTML = days >= 0
        ? `<span class="num">${s.race_date_label ? "≈" : ""}${days}</span><span class="lbl">dias para a largada · ${esc(when)}</span>`
        : `<span class="lbl">Prova realizada em ${fmtDate(s.race_date)}</span>`;
    } else {
      cd.innerHTML = `<span class="lbl">Data da prova a definir</span>`;
    }

    const target = s.target_seconds, pred = s.prediction;
    let gauge = `<div class="gauge-row"><span>Meta</span><strong>${fmtTime(target)}</strong><span>${fmtPace(s.target_pace)}</span></div>`;
    if (pred) {
      // escala de 2:40 a 3:20 — a meta fica no meio
      const lo = target - 1200, hi = target + 1200;
      const pos = (v) => Math.min(100, Math.max(0, ((hi - v) / (hi - lo)) * 100));
      const gap = target - pred.seconds;
      const basis = PR_LABEL[pred.basis].toLowerCase();
      gauge += `<div class="track" role="img" aria-label="Previsão ${fmtTime(pred.seconds)} contra a meta ${fmtTime(target)}">
          <div class="fill" style="width:${pos(pred.seconds)}%"></div>
          <div class="mark" style="left:${pos(target)}%"><span>Sub-3</span></div></div>
        <div class="gauge-row"><span>Previsão</span><strong>${fmtTime(pred.seconds)}</strong><span>${fmtPace(pred.seconds / 42.195)}</span></div>
        <p class="verdict">${gap >= 0
          ? `Pelo recorde na ${basis}, o motor já tem <b>${fmtTime(gap)}</b> de folga. Agora é volume e longões.`
          : `Pelo recorde na ${basis}, faltam <b>${fmtTime(-gap)}</b>. Cada treino conta.`}</p>
        <p class="chart-note">Estimativa pela fórmula de Riegel; não substitui o teste de prova.</p>`;
    }
    $("#gauge").innerHTML = gauge;

    const m = (num, unit, lbl) => `<div class="metric"><span class="num">${num}</span><span class="unit">${unit}</span><span class="lbl">${lbl}</span></div>`;
    $("#sub3-metrics").innerHTML =
      m(nf1.format(s.avg_week_km_8w), "km", "média semanal · 8 sem") +
      m(nf1.format(s.longest_km_8w), "km", "maior longão · 8 sem") +
      m(s.long_runs_30k_12w, "", "longões ≥30 km · 12 sem") +
      m(fmtTime(s.target_pace), "/km", "pace da meta");
  }

  // ---------- gráfico de barras (SVG)
  function renderChart(data, view) {
    const rows = view === "weekly"
      ? data.weekly.map((w, i, arr) => ({ label: fmtDate(w.week, false), full: `Semana de ${fmtDate(w.week)}`, km: w.km, extra: `${w.runs} corrida${w.runs === 1 ? "" : "s"}`, current: i === arr.length - 1 }))
      : data.monthly.map((m, i, arr) => { const [y, mo] = m.month.split("-").map(Number);
          return { label: MESES[mo - 1], full: `${MESES[mo - 1]} ${y}`, km: m.km, extra: "", current: i === arr.length - 1 }; });

    const chart = $("#chart");
    const W = Math.max(300, Math.round(chart.clientWidth - 28)), H = W < 520 ? 220 : 260, L = 34, R = 8, T = 12, B = 26;
    const done = rows.filter((r) => !r.current);
    const avg = done.length ? done.reduce((a, r) => a + r.km, 0) / done.length : 0;
    const maxV = Math.max(...rows.map((r) => r.km), avg, 1);
    const step = maxV > 300 ? 100 : maxV > 120 ? 50 : maxV > 60 ? 20 : 10;
    const top = Math.ceil(maxV / step) * step;
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const bw = (W - L - R) / rows.length, gap = Math.max(2, bw * 0.28);

    let grid = "", axis = "";
    for (let v = 0; v <= top; v += step) {
      grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
      axis += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    const every = Math.max(1, Math.ceil(rows.length / Math.floor((W - L) / 56)));
    const cols = rows.map((r, i) => {
      const x = L + i * bw + gap / 2, w = bw - gap, h = Math.max(0, y(0) - y(r.km)), rad = Math.min(4, w / 2, h);
      const by = y(r.km);
      const path = h > 0
        ? `M${x},${y(0)}V${by + rad}Q${x},${by} ${x + rad},${by}H${x + w - rad}Q${x + w},${by} ${x + w},${by + rad}V${y(0)}Z`
        : "";
      const lbl = i % every === 0 || r.current ? `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${r.label}</text>` : "";
      return `<g class="col" data-i="${i}"><path class="bar${r.current ? " current" : ""}" d="${path}"/>
        <rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}"/><g class="axis">${lbl}</g></g>`;
    }).join("");
    const avgLine = avg ? `<line class="avg" x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}"/>
      <text class="avg-lbl" x="${W - R}" y="${y(avg) - 6}" text-anchor="end">média ${nf1.format(avg)} km</text>` : "";

    chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Quilômetros por ${view === "weekly" ? "semana" : "mês"}">
      <g class="grid">${grid}</g><g class="axis">${axis}</g>${cols}${avgLine}</svg>`;
    chart.querySelectorAll("g.col").forEach((g) => {
      const r = rows[g.dataset.i];
      const html = `${esc(r.full)}${r.current ? " (em andamento)" : ""}<br><b>${nf1.format(r.km)} km</b>${r.extra ? " · " + r.extra : ""}`;
      g.addEventListener("mousemove", (e) => showTip(html, e.clientX, e.clientY));
      g.addEventListener("mouseleave", hideTip);
      g.addEventListener("touchstart", (e) => { const t = e.touches[0]; showTip(html, t.clientX, t.clientY); }, { passive: true });
    });
    $("#chart-note").textContent = view === "weekly"
      ? `Barra clara = semana em andamento`
      : `Mês atual ainda em andamento`;
    $("#chart-table").innerHTML = `<table><tr><th>${view === "weekly" ? "Semana" : "Mês"}</th><th>km</th></tr>${
      rows.map((r) => `<tr><td>${esc(r.full)}</td><td>${nf1.format(r.km)}</td></tr>`).join("")}</table>`;
  }

  function renderActs(acts) {
    $("#acts").innerHTML = acts.slice(0, 9).map((a) => `
      <a class="act" href="https://www.strava.com/activities/${a.id}" target="_blank" rel="noopener">
        <div>
          <div class="act-date">${fmtDate(a.date)}${a.race ? '<span class="race-tag">PROVA</span>' : ""}</div>
          <div class="act-name">${esc(a.name)}</div>
          <div class="act-stats">
            <div><b>${nf1.format(a.km)}</b><small>km</small></div>
            <div><b>${fmtTime(a.pace)}</b><small>pace</small></div>
            <div><b>${fmtTime(a.moving_time)}</b><small>tempo</small></div>
            ${a.hr ? `<div><b>${a.hr}</b><small>bpm</small></div>` : ""}
          </div>
        </div>
        ${routeSVG(a.polyline)}
      </a>`).join("") || `<p class="empty-note">Nenhum treino ainda.</p>`;
  }

  const postCard = (p) => `<a class="post-card" href="post.html?p=${encodeURIComponent(p.slug)}">
      <p class="act-date">${fmtDate(p.date)} · ${p.minutes} min de leitura</p>
      <h3>${esc(p.title)}</h3>${p.summary ? `<p>${esc(p.summary)}</p>` : ""}</a>`;

  // ---------- páginas
  async function home() {
    try {
      const data = await getJSON("data/strava.json");
      renderHero(data); renderPRs(data.prs); renderRaces(data.races); renderSub3(data.sub3); renderActs(data.recent);
      let view = "weekly";
      renderChart(data, view);
      let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => renderChart(data, view), 150); });
      document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
        view = b.dataset.view;
        document.querySelectorAll(".seg button").forEach((x) => {
          x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b);
        });
        renderChart(data, view);
      }));
    } catch (e) {
      console.error(e);
      $("#updated").textContent = "Não foi possível carregar os dados do Strava.";
    }
    try {
      const posts = await getJSON("posts/index.json");
      $("#posts").innerHTML = posts.slice(0, 3).map(postCard).join("") || `<p class="empty-note">Primeiro post em breve.</p>`;
    } catch { $("#posts").innerHTML = `<p class="empty-note">Primeiro post em breve.</p>`; }
  }

  async function blogList() {
    const posts = await getJSON("posts/index.json").catch(() => []);
    $("#post-list").innerHTML = posts.map(postCard).join("") || `<p class="empty-note">Nenhum post ainda.</p>`;
  }

  async function postPage() {
    const slug = new URLSearchParams(location.search).get("p") || "";
    const box = $("#article");
    if (!/^[\w-]+$/.test(slug)) { box.innerHTML = "<p>Post não encontrado.</p>"; return; }
    try {
      const [raw, index] = await Promise.all([
        fetch(`posts/${slug}.md`, { cache: "no-cache" }).then((r) => { if (!r.ok) throw 0; return r.text(); }),
        getJSON("posts/index.json").catch(() => []),
      ]);
      const meta = index.find((p) => p.slug === slug) || { title: slug, date: "", minutes: 1 };
      const body = raw.replace(/^---[\s\S]*?\n---\s*\n/, "");
      document.title = `${meta.title} · Blog`;
      box.innerHTML = `<h1>${esc(meta.title)}</h1>
        <p class="meta">${fmtDate(meta.date)} · ${meta.minutes} min de leitura</p>
        <div class="prose">${window.marked ? marked.parse(body) : esc(body)}</div>`;
    } catch { box.innerHTML = "<h1>Ops.</h1><p>Post não encontrado.</p>"; }
  }

  const page = document.body.dataset.page || "home";
  ({ home, blog: blogList, post: postPage })[page]?.();
})();
