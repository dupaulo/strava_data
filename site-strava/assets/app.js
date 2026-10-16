/* Site de corrida — lê data/strava.json e posts/index.json e monta a página. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const MOTTO_HTML = (cls) => `<p class="${cls}" lang="la" title="Epicteto"><span class="motto-la">Sustine et abstine</span><span class="motto-pt" lang="pt-BR">suporta e abstém-te</span></p>`;

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
    if (!$(".motto")) $("#tagline").insertAdjacentHTML("afterend", MOTTO_HTML("motto"));
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

  const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h3a1 1 0 0 1 1 1v2a5 5 0 0 1-4.6 5A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 7.6 13 5 5 0 0 1 3 8V6a1 1 0 0 1 1-1h3zm0 4H5v1a3 3 0 0 0 2 2.8zm10 0v3.8A3 3 0 0 0 19 8V7z"/></svg>';
  function renderPRs(prs) {
    $("#prs").innerHTML = prs.map((p) => {
      if (p.seconds == null) {
        return `<article class="pr empty"><div class="pr-dist">${PR_LABEL[p.key]}</div>
          <div class="pr-time">—</div><div class="pr-pace">em breve</div>
          <div class="pr-meta">${p.key === "Marathon" ? "A estreia vem aí." : "Ainda sem registro."}</div></article>`;
      }
      const meta = [p.activity_name, fmtDate(p.date)].filter(Boolean).map(esc).join(" · ");
      const link = p.activity_id && p.source === "strava" ? `https://www.strava.com/activities/${p.activity_id}` : null;
      return `<article class="pr"><span class="pr-trophy" title="Recorde pessoal" aria-label="Recorde pessoal">${TROPHY}</span>
        <div class="pr-dist">${PR_LABEL[p.key]}</div>
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
    const list = acts.slice(0, 9);
    $("#acts").innerHTML = list.map((a, i) => `
      <article class="act">
        <div>
          <div class="act-date">${fmtDate(a.date)}${a.race ? '<span class="race-tag">PROVA</span>' : ""}</div>
          <a class="act-name act-link" href="https://www.strava.com/activities/${a.id}" target="_blank" rel="noopener">${esc(a.name)}</a>
          <div class="act-stats">
            <div><b>${nf1.format(a.km)}</b><small>km</small></div>
            <div><b>${fmtTime(a.pace)}</b><small>pace</small></div>
            <div><b>${fmtTime(a.moving_time)}</b><small>tempo</small></div>
            ${a.hr ? `<div><b>${a.hr}</b><small>bpm</small></div>` : ""}
          </div>
        </div>
        ${routeSVG(a.polyline)}
        <button class="act-share" type="button" data-i="${i}" aria-label="Compartilhar ${esc(a.name)} nos Stories">${ICON.share}<span>Stories</span></button>
      </article>`).join("") || `<p class="empty-note">Nenhum treino ainda.</p>`;
    $("#acts").querySelectorAll(".act-share").forEach((b) =>
      b.addEventListener("click", () => shareActivity(list[b.dataset.i], b)));
  }

  // ---------- imagem para Stories (1080×1920)
  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  async function storyImage(a) {
    const W = 1080, H = 1920, P = 90;
    const C = { bg: "#0b0d10", text: "#eef1f4", text2: "#b4bcc6", muted: "#7d8794", line: "#262b33", accent: "#c6f24e", hot: "#ff6a3d" };
    const D = '"Barlow Condensed", "Arial Narrow", sans-serif', B = '"Barlow", system-ui, sans-serif';
    try { await Promise.all(["800 100px", "700 100px", "600 100px"].map((w) => document.fonts.load(`${w} "Barlow Condensed"`))); } catch {}
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const font = (w, px, fam = D) => (g.font = `${w} ${px}px ${fam}`);
    const spaced = (txt, x, y, sp) => { // texto com espaçamento entre letras
      if ("letterSpacing" in g) { g.letterSpacing = `${sp}px`; g.fillText(txt, x, y); g.letterSpacing = "0px"; return; }
      for (const ch of txt) { g.fillText(ch, x, y); x += g.measureText(ch).width + sp; }
    };

    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W - 60, H - 120, 0, W - 60, H - 120, 760);
    glow.addColorStop(0, "rgba(198,242,78,.16)"); glow.addColorStop(1, "rgba(198,242,78,0)");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);

    // marca + nome
    const name = ($("#brand-name")?.textContent || "").trim();
    g.fillStyle = C.accent; g.beginPath(); g.moveTo(P + 10, 112); g.lineTo(P + 40, 112); g.lineTo(P + 30, 142); g.lineTo(P, 142); g.fill();
    g.fillStyle = C.text; font(700, 46); g.textBaseline = "middle"; spaced(name.toUpperCase(), P + 58, 128, 3);

    // data
    const [y, m, d] = a.date.slice(0, 10).split("-").map(Number);
    const when = `${DIAS[new Date(y, m - 1, d).getDay()]} · ${d} ${MESES[m - 1]} ${y}`.toUpperCase();
    g.textBaseline = "alphabetic"; g.fillStyle = C.muted; font(600, 40); spaced(when, P, 290, 5);
    if (a.race) {
      const wx = P + g.measureText(when).width + when.length * 5 + 24;
      g.fillStyle = C.hot; g.beginPath(); g.roundRect(wx, 252, 150, 50, 8); g.fill();
      g.fillStyle = "#fff"; font(700, 32); spaced("PROVA", wx + 24, 289, 3);
    }

    // título (até 3 linhas)
    font(800, 150); g.fillStyle = C.text;
    const words = a.name.toUpperCase().split(/\s+/), lines = [];
    let tpx = 150; // diminui se alguma palavra sozinha não couber na largura
    while (Math.max(...words.map((w) => g.measureText(w).width)) > W - P * 2 && tpx > 90) font(800, (tpx -= 10));
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (g.measureText(t).width > W - P * 2 && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].replace(/\s*\S*$/, "…"); }
    let ty = 300;
    lines.forEach((l) => { ty += tpx * 0.92; g.fillText(l, P - 4, ty); });

    // trajeto
    const top = ty + 70, bottom = 1290;
    if (a.polyline) {
      const pts = decodePolyline(a.polyline);
      const k = Math.cos((pts[0][0] * Math.PI) / 180);
      const xs = pts.map((p) => p[1] * k), ys = pts.map((p) => -p[0]);
      const mnx = Math.min(...xs), mxx = Math.max(...xs), mny = Math.min(...ys), mxy = Math.max(...ys);
      const bw = W - P * 2 - 80, bh = bottom - top;
      const s = Math.min(bw / (mxx - mnx || 1), bh / (mxy - mny || 1));
      const ox = (W - (mxx - mnx) * s) / 2, oy = top + (bh - (mxy - mny) * s) / 2;
      g.strokeStyle = C.accent; g.lineWidth = 9; g.lineJoin = g.lineCap = "round";
      g.beginPath(); xs.forEach((x, i) => g[i ? "lineTo" : "moveTo"](ox + (x - mnx) * s, oy + (ys[i] - mny) * s)); g.stroke();
    }

    // distância
    const kmTxt = nf1.format(a.km);
    let kpx = 300; font(800, kpx);
    while (g.measureText(kmTxt).width > W - P * 2 - 160 && kpx > 160) font(800, (kpx -= 10));
    g.fillStyle = C.accent; g.fillText(kmTxt, P - 8, 1570);
    const kw = g.measureText(kmTxt).width;
    font(700, 76); g.fillStyle = C.text2; g.fillText("km", P + kw + 10, 1570);

    // linha + números
    g.fillStyle = C.line; g.fillRect(P, 1615, W - P * 2, 2);
    const stats = [[fmtTime(a.pace), "PACE /KM"], [fmtTime(a.moving_time), "TEMPO"],
      a.hr ? [String(a.hr), "BPM MÉDIO"] : [`${a.elevation} m`, "ELEVAÇÃO"]];
    const colW = (W - P * 2) / 3;
    stats.forEach(([v, l], i) => {
      const x = P + i * colW;
      let px = 92; font(700, px);
      while (g.measureText(v).width > colW - 24 && px > 50) font(700, (px -= 4));
      g.fillStyle = C.text; g.fillText(v, x, 1730);
      font(600, 30); g.fillStyle = C.muted; spaced(l, x, 1782, 4);
    });

    // rodapé
    font(500, 32, B); g.fillStyle = C.muted; g.fillText(location.host, P, 1858);
    font(700, 34); const tag = "RUMO À SUB-3"; const tw = g.measureText(tag).width + tag.length * 2 + 44;
    g.fillStyle = C.accent; g.beginPath(); g.roundRect(W - P - tw, 1814, tw, 64, 10); g.fill();
    g.fillStyle = C.bg; spaced(tag, W - P - tw + 22, 1858, 2);

    return new Promise((res) => cv.toBlob(res, "image/png"));
  }

  // navegadores internos de apps (Instagram, Facebook...) bloqueiam compartilhar e baixar arquivos
  const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|FB4A|Line\/|TikTok|musical_ly|Snapchat/i.test(navigator.userAgent);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const toDataURL = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

  async function showImageSheet(blob, fname) {
    const src = await toDataURL(blob);
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const sheet = document.createElement("div");
    sheet.className = "img-sheet";
    sheet.innerHTML = `<div class="img-sheet-box" role="dialog" aria-modal="true" aria-label="Imagem para Stories">
        <button class="img-sheet-close" type="button" aria-label="Fechar">×</button>
        <p class="img-sheet-tip"><b>Toque e segure a imagem</b> e escolha <b>${ios ? "Salvar em Fotos" : "Baixar imagem"}</b>. Depois é só postar nos Stories.</p>
        <img src="${src}" alt="Imagem do treino para Stories">
        ${IN_APP ? `<p class="img-sheet-note">Se a opção de salvar não aparecer, abra o site no navegador: toque em <b>⋯</b> no canto da tela e escolha <b>Abrir no navegador</b>. Lá o botão abre direto o Instagram.</p>` : ""}
        <a class="share-btn" href="${src}" download="${fname}">Baixar imagem</a>
      </div>`;
    const close = () => { sheet.remove(); document.body.style.overflow = ""; };
    sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest(".img-sheet-close")) close(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
    document.body.appendChild(sheet); document.body.style.overflow = "hidden";
  }

  async function shareImage(makeBlob, fname, title, btn) {
    const label = btn.querySelector("span"), old = label.textContent;
    label.textContent = "Gerando…"; btn.disabled = true;
    try {
      const blob = await makeBlob();
      const file = new File([blob], fname, { type: "image/png" });
      let done = false;
      if (!IN_APP && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title }); done = true; }
        catch (e) { done = e && e.name === "AbortError"; } // cancelado pelo usuário = ok
      }
      if (!done) {
        if (IN_APP || isMobile) {
          await showImageSheet(blob, fname); // mostra a imagem na tela para salvar
        } else {
          const url = URL.createObjectURL(blob);
          const link = Object.assign(document.createElement("a"), { href: url, download: fname });
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
          label.textContent = "Imagem salva!";
          await new Promise((r) => setTimeout(r, 1800));
        }
      }
    } catch (e) { console.error(e); }
    label.textContent = old; btn.disabled = false;
  }
  const shareActivity = (a, btn) => shareImage(() => storyImage(a), `treino-${a.date.slice(0, 10)}.png`, a.name, btn);

  // ---------- imagem de post do blog para Stories
  async function postStoryImage(meta, excerpt, isQuote) {
    const W = 1080, H = 1920, P = 90;
    const C = { bg: "#0b0d10", text: "#eef1f4", text2: "#c9d0d8", muted: "#7d8794", line: "#262b33", accent: "#c6f24e" };
    const D = '"Barlow Condensed", "Arial Narrow", sans-serif', B = '"Barlow", system-ui, sans-serif';
    try {
      await Promise.all([...["800", "700", "600"].map((w) => document.fonts.load(`${w} 100px "Barlow Condensed"`)),
        document.fonts.load('500 40px "Barlow"'), document.fonts.load('italic 500 40px "Barlow"')]);
    } catch {}
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const font = (w, px, fam = D) => (g.font = `${w} ${px}px ${fam}`);
    const spaced = (txt, x, y, sp) => {
      if ("letterSpacing" in g) { g.letterSpacing = `${sp}px`; g.fillText(txt, x, y); g.letterSpacing = "0px"; return; }
      for (const ch of txt) { g.fillText(ch, x, y); x += g.measureText(ch).width + sp; }
    };
    const wrap = (text, maxW, maxLines) => {
      const words = text.split(/\s+/).filter(Boolean), out = [];
      let cur = "";
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = w; if (out.length === maxLines) break; } else cur = t;
      }
      if (out.length < maxLines && cur) out.push(cur);
      const used = out.join(" ").split(/\s+/).length;
      if (used < words.length) out[out.length - 1] = out[out.length - 1].replace(/[\s,.;:!?—-]*\S*$/, "") + "…";
      return out;
    };

    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W - 40, 220, 0, W - 40, 220, 760);
    glow.addColorStop(0, "rgba(198,242,78,.14)"); glow.addColorStop(1, "rgba(198,242,78,0)");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);

    // marca + nome
    const name = (document.querySelector(".brand span:last-child")?.textContent || "").trim();
    g.fillStyle = C.accent; g.beginPath(); g.moveTo(P + 10, 112); g.lineTo(P + 40, 112); g.lineTo(P + 30, 142); g.lineTo(P, 142); g.fill();
    g.fillStyle = C.text; font(700, 46); g.textBaseline = "middle"; spaced(name.toUpperCase(), P + 58, 128, 3);
    g.textBaseline = "alphabetic";

    // selo "do blog" + data
    font(700, 34); const tag = "DO BLOG"; const tw = g.measureText(tag).width + tag.length * 4 + 40;
    g.fillStyle = C.accent; g.beginPath(); g.roundRect(P, 250, tw, 60, 10); g.fill();
    g.fillStyle = C.bg; spaced(tag, P + 20, 293, 4);
    g.fillStyle = C.muted;
    const info = `${fmtDate(meta.date)} · ${meta.minutes} MIN DE LEITURA`.toUpperCase();
    let ipx = 38; font(600, ipx);
    while (g.measureText(info).width + info.length * 4 > W - P * 2 - tw - 28 && ipx > 24) font(600, (ipx -= 2));
    spaced(info, P + tw + 28, 293, 4);

    // título
    let tpx = 150; font(800, tpx);
    const tWords = meta.title.toUpperCase().split(/\s+/);
    while (Math.max(...tWords.map((w) => g.measureText(w).width)) > W - P * 2 && tpx > 90) font(800, (tpx -= 10));
    let tl = wrap(meta.title.toUpperCase(), W - P * 2, 4);
    if (tl.length >= 4 && tpx > 120) { font(800, (tpx = 120)); tl = wrap(meta.title.toUpperCase(), W - P * 2, 4); }
    let y = 330;
    g.fillStyle = C.text; tl.forEach((l) => { y += tpx * 0.92; g.fillText(l, P - 4, y); });

    // trecho
    y += 110;
    const exTop = y;
    let epx = isQuote ? 56 : 48; font(isQuote ? "italic 500" : "500", epx, B);
    const lh = epx * 1.45, maxLines = Math.max(3, Math.floor((1600 - exTop) / lh));
    const ex = wrap(isQuote ? `“${excerpt}”` : excerpt, W - P * 2 - 50, maxLines);
    const ey = exTop + Math.max(0, (1620 - exTop - ex.length * lh) / 2); // centraliza no espaço livre
    g.fillStyle = C.text2;
    ex.forEach((l, i) => g.fillText(l, P + 50, ey + epx + i * lh));
    g.fillStyle = C.accent; g.fillRect(P, ey + 8, 8, ex.length * lh);

    // chamada
    g.fillStyle = C.line; g.fillRect(P, 1690, W - P * 2, 2);
    font(700, 52); g.fillStyle = C.accent; spaced("LEIA O TEXTO COMPLETO →", P, 1780, 2);
    font(500, 34, B); g.fillStyle = C.muted; g.fillText(`${location.host}/blog`, P, 1840);

    return new Promise((res) => cv.toBlob(res, "image/png"));
  }

  const postCard = (p) => `<a class="post-card" href="posts/${encodeURIComponent(p.slug)}.html">
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

  // ---------- compartilhar post
  const postURL = (slug) => new URL(`posts/${slug}.html`, document.baseURI).href;
  const ICON = {
    fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v9h4v-9H17l.6-4h-4.1V8.8c0-.5.3-.8.5-.8z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.1 1.1 1.4 1.4 1.1-1.1a2 2 0 0 1 2.9 2.9l-3 3a2 2 0 0 1-2.9 0zm2.8-2.8a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.1-1.1-1.4-1.4-1.1 1.1a2 2 0 0 1-2.9-2.9l3-3a2 2 0 0 1 2.9 0z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l4 4-1.4 1.4L13 6.8V15h-2V6.8L9.4 8.4 8 7zM5 12h2v7h10v-7h2v9H5z"/></svg>',
  };
  function shareBar(meta) {
    const url = encodeURIComponent(postURL(meta.slug));
    const text = encodeURIComponent(`${meta.title} — ${postURL(meta.slug)}`);
    return `<div class="share">
      <span class="share-lbl">Compartilhar</span>
      <a class="share-btn" href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener">${ICON.fb}Facebook</a>
      <a class="share-btn" href="https://wa.me/?text=${text}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>
      <button class="share-btn" type="button" data-story>${ICON.share}<span>Stories</span></button>
      <button class="share-btn" type="button" data-copy>${ICON.link}<span>Copiar link</span></button>
      ${navigator.share ? `<button class="share-btn" type="button" data-native>${ICON.share}Mais…</button>` : ""}
    </div>`;
  }
  const p_in_quote = (t, prose) => [...prose.querySelectorAll("blockquote p")].some((q) => q.textContent.trim() === t);
  function wireShare(meta) {
    const url = postURL(meta.slug);
    const copy = document.querySelector("[data-copy]");
    copy?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(url); copy.querySelector("span").textContent = "Link copiado!"; }
      catch { prompt("Copie o link:", url); }
      setTimeout(() => (copy.querySelector("span").textContent = "Copiar link"), 2000);
    });
    const story = document.querySelector("[data-story]");
    story?.addEventListener("click", () => {
      const prose = document.querySelector(".prose");
      const quote = prose?.querySelector("blockquote")?.textContent.trim();
      const firstText = [...(prose?.querySelectorAll("p") || [])].map((p) => p.textContent.trim())
        .filter((t) => t && !p_in_quote(t, prose)).join(" ");
      const excerpt = quote || firstText || meta.summary || "";
      shareImage(() => postStoryImage(meta, excerpt.replace(/\s+/g, " "), !!quote), `post-${meta.slug}.png`, meta.title, story);
    });
    document.querySelector("[data-native]")?.addEventListener("click", () =>
      navigator.share({ title: meta.title, text: meta.summary || meta.title, url }).catch(() => {}));
  }

  async function postPage() {
    const slug = document.body.dataset.slug || new URLSearchParams(location.search).get("p") || "";
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
        <div class="prose">${window.marked ? marked.parse(body) : esc(body)}</div>
        ${shareBar(meta)}`;
      wireShare(meta);
    } catch { box.innerHTML = "<h1>Ops.</h1><p>Post não encontrado.</p>"; }
  }

  // lema no rodapé de todas as páginas
  document.querySelector(".foot")?.insertAdjacentHTML("afterbegin", MOTTO_HTML("foot-motto"));

  const page = document.body.dataset.page || "home";
  ({ home, blog: blogList, post: postPage })[page]?.();
})();
