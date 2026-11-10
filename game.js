"use strict";

// ================= core (pure logic, no DOM) =================
const RULES = {
  startLives: 3,
  maxLives: 5,
  loseAbove: 0.10,   // error > this loses a life
  gainWithin: 0.02,  // error <= this wins a life
  trickyFrom: 4,     // first round that can be tricky
  trickyChance: 0.2,
  maxR: 0.99,        // r runs 0 … 0.99 (typed as the digits after "0.")
};
const TRICKS = ["outlier", "curve", "clusters", "fan"];

const uniform = (a, b) => a + Math.random() * (b - a);
const randint = (a, b) => Math.floor(uniform(a, b + 1));
const round2 = (v) => Math.round(v * 100) / 100 + 0; // + 0 turns -0 into 0
const f2 = (v) => round2(v).toFixed(2);

function randn() { // Box–Muller
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

function moments(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  return { mx, my, sxx, syy, sxy };
}
function pearson(xs, ys) {
  const m = moments(xs, ys);
  return m.sxy / Math.sqrt(m.sxx * m.syy);
}
function fitLine(xs, ys) {
  const m = moments(xs, ys);
  const slope = m.sxy / m.sxx;
  return { slope, intercept: m.my - slope * m.mx };
}

function correlated(n, rho) {
  const xs = [], ys = [];
  for (let i = 0; i < n; i++) {
    const x = randn();
    xs.push(x);
    ys.push(rho * x + Math.sqrt(1 - rho * rho) * randn());
  }
  return { xs, ys };
}

function makeNormal() {
  return { ...correlated(randint(25, 150), uniform(0, RULES.maxR)), kind: null };
}

function makeTricky(kind) {
  if (kind === "outlier") {
    const d = correlated(randint(25, 50), uniform(0, 0.2));
    const before = pearson(d.xs, d.ys);
    d.xs.push(uniform(5, 7));
    d.ys.push(uniform(5, 7));
    const after = pearson(d.xs, d.ys);
    return { ...d, kind, highlight: d.xs.length - 1,
      explain: `One point (orange, outlined) pulled r from ${f2(Math.max(0, before))} up to ${f2(after)}. r is very sensitive to outliers.` };
  }
  if (kind === "curve") {
    const xs = [], ys = [];
    const s = Math.random() < 0.5 ? -1 : 1;
    // mirrored x values keep the parabola symmetric, so r stays near 0
    for (let i = randint(30, 60); i > 0; i--) {
      const x = uniform(0, 2);
      for (const sx of [x, -x]) {
        xs.push(sx);
        ys.push(s * sx * sx + 0.35 * randn());
      }
    }
    return { xs, ys, kind,
      explain: `A strong pattern, but not a straight line, so r is only ${f2(pearson(xs, ys))}. r measures straight-line association only.` };
  }
  if (kind === "clusters") {
    const a = correlated(randint(20, 40), uniform(0, 0.25));
    const within = pearson(a.xs, a.ys);
    const b = correlated(randint(20, 40), uniform(0, 0.25));
    const dx = uniform(4, 6), dy = uniform(4, 6);
    const xs = [...a.xs, ...b.xs.map((x) => x + dx)];
    const ys = [...a.ys, ...b.ys.map((y) => y + dy)];
    return { xs, ys, kind,
      explain: `Inside each group r is only about ${f2(Math.max(0, within))}, but the gap between the two groups makes the overall r ${f2(pearson(xs, ys))}.` };
  }
  // fan: spread grows with x
  const xs = [], ys = [];
  for (let i = randint(60, 120); i > 0; i--) {
    const x = uniform(0, 4);
    xs.push(x);
    ys.push(0.6 * x + (0.15 + 0.5 * x) * randn());
  }
  return { xs, ys, kind,
    explain: `The spread grows with x: tight on the left, loose on the right. r = ${f2(pearson(xs, ys))} squeezes both into one number.` };
}

function newRound(roundNo) {
  const tricky = roundNo >= RULES.trickyFrom && Math.random() < RULES.trickyChance;
  const kind = tricky ? TRICKS[randint(0, TRICKS.length - 1)] : null;
  let d;
  do {
    d = kind ? makeTricky(kind) : makeNormal();
    d.r = pearson(d.xs, d.ys);
    d.truth = round2(d.r);
  } while (!isFinite(d.r) || d.truth < 0 || d.truth > RULES.maxR);
  return d;
}

// The player types only the digits after "0.": "6" → 0.6, "63" → 0.63, "05" → 0.05.
function parseGuess(text) {
  const s = String(text).trim();
  if (!/^\d{1,2}$/.test(s)) return { error: "Type one or two digits, like 6 or 63." };
  return { value: s.length === 1 ? Number(s) / 10 : Number(s) / 100 };
}

function scoreGuess(guess, truth, lives) {
  const err = round2(Math.abs(guess - truth));
  let delta = 0;
  if (err > RULES.loseAbove) delta = -1;
  else if (err <= RULES.gainWithin && lives < RULES.maxLives) delta = 1;
  return { err, delta, lives: lives + delta, spotOn: err <= RULES.gainWithin };
}

// ================= UI =================
if (typeof document !== "undefined") {
  const BEST_KEY = "r-guesser:best";
  const $ = (id) => document.getElementById(id);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const play = (name, delay = 0) => (delay ? setTimeout(() => Sound.play(name), delay) : Sound.play(name));

  const loadBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
  const saveBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ } };

  const game = { round: 0, lives: RULES.startLives, score: 0, best: loadBest(), bestAtStart: 0, history: [], streak: 0, bestStreak: 0, current: null, phase: "start" };

  // restart a CSS animation class on an element
  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.getBoundingClientRect();
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }

  // animate a number from 0 to `to` over `ms` (easeOutCubic), calling step(value)
  function countUp(to, ms, step) {
    if (reduced()) { step(to); return; }
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      step(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function show(screen) {
    for (const id of ["screen-start", "screen-game", "screen-over"]) {
      const el = $(id);
      el.hidden = id !== screen;
      if (id === screen) retrigger(el, "enter");
    }
  }

  // ---------- HUD ----------
  const HEART_PATH = "M1 0h2v1h1V0h2v1h1v2h-1v1h-1v1h-1v1H3V5H2V4H1V3H0V1h1z";
  function renderHud(delta = 0) {
    $("hud-round").textContent = game.round || "–";
    $("hud-score").textContent = game.score;
    $("hud-best").textContent = game.best;
    const lives = Math.max(0, game.lives);
    const changed = delta < 0 ? lives : delta > 0 ? lives - 1 : -1;
    let s = "";
    for (let i = 0; i < RULES.maxLives; i++) {
      const cls = `heart ${i < lives ? "is-full" : "is-empty"}${i === changed ? (delta < 0 ? " lost" : " gained") : ""}`;
      s += `<svg class="${cls}" viewBox="-0.5 -0.5 8 7" width="16" height="14" shape-rendering="crispEdges" aria-hidden="true"><path d="${HEART_PATH}"/></svg>`;
    }
    const el = $("hud-lives");
    el.innerHTML = s;
    el.setAttribute("aria-label", `${lives} of ${RULES.maxLives} lives`);
    const tile = $("hud-lives-tile");
    if (delta < 0) retrigger(tile, "hit");
    if (delta > 0) {
      const plus = document.createElement("span");
      plus.className = "plus-one";
      plus.textContent = "+1";
      tile.appendChild(plus);
      setTimeout(() => plus.remove(), 700);
    }
  }

  // ---------- scatter plot ----------
  function drawPlot(svg, d, { reveal = false, animate = false } = {}) {
    const P = 24, S = 400, inner = S - 2 * P;
    const ext = (arr) => {
      const lo = Math.min(...arr), hi = Math.max(...arr), pad = (hi - lo || 1) * 0.08;
      return [lo - pad, hi + pad];
    };
    const [x0, x1] = ext(d.xs), [y0, y1] = ext(d.ys);
    const sx = (v) => P + ((v - x0) / (x1 - x0)) * inner;
    const sy = (v) => P + inner - ((v - y0) / (y1 - y0)) * inner;
    const clipId = `${svg.id}-clip`;

    let s = `<defs><clipPath id="${clipId}"><rect x="${P}" y="${P}" width="${inner}" height="${inner}"/></clipPath></defs>`;
    s += `<line class="axis" x1="${P}" y1="${P}" x2="${P}" y2="${P + inner}"/>`;
    s += `<line class="axis" x1="${P}" y1="${P + inner}" x2="${P + inner}" y2="${P + inner}"/>`;
    s += `<text class="axis-label" x="${P + inner}" y="${P + inner + 17}" text-anchor="end">x</text>`;
    s += `<text class="axis-label" x="${P - 8}" y="${P + 4}" text-anchor="end">y</text>`;
    const rad = d.xs.length > 100 ? 4 : 5;
    const stagger = Math.min(6, 400 / d.xs.length);
    d.xs.forEach((x, i) => {
      const hot = reveal && i === d.highlight;
      const cls = `dot${hot ? " outlier" : ""}${animate ? " pop" : ""}`;
      const style = animate ? ` style="animation-delay:${(i * stagger).toFixed(0)}ms"` : "";
      s += `<circle class="${cls}"${style} cx="${sx(x).toFixed(1)}" cy="${sy(d.ys[i]).toFixed(1)}" r="${hot ? rad + 2 : rad}"/>`;
    });
    if (reveal) {
      const { slope, intercept } = fitLine(d.xs, d.ys);
      s += `<g clip-path="url(#${clipId})"><line class="fit draw" pathLength="1" x1="${sx(x0)}" y1="${sy(slope * x0 + intercept)}" x2="${sx(x1)}" y2="${sy(slope * x1 + intercept)}"/></g>`;
    }
    svg.innerHTML = s;
    svg.setAttribute("aria-label", `Scatter plot with ${d.xs.length} points`);
  }

  // ---------- guess vs truth bar (0 … 1) ----------
  function drawBar(guess, truth) {
    const L = 16, R = 304, Y = 34;
    const bx = (v) => L + v * (R - L);
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const anchor = (x) => (x < 40 ? "start" : x > R - 24 ? "end" : "middle");
    const band = (w, cls) => {
      const a = bx(clamp01(truth - w)), b = bx(clamp01(truth + w));
      return `<rect class="${cls}" x="${a.toFixed(1)}" y="${Y - 7}" width="${(b - a).toFixed(1)}" height="14" rx="2"/>`;
    };
    let s = band(RULES.loseAbove, "bar-band") + band(RULES.gainWithin, "bar-band-strong");
    s += `<line class="bar-track" x1="${L}" x2="${R}" y1="${Y}" y2="${Y}"/>`;
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      s += `<line class="bar-tick" x1="${bx(t)}" x2="${bx(t)}" y1="${Y + 9}" y2="${Y + 13}"/>`;
      s += `<text class="bar-text" x="${bx(t)}" y="${Y + 44}" text-anchor="middle">${t}</text>`;
    }
    const gx = bx(guess);
    s += `<line class="bar-gap" id="bar-gap" x1="${gx}" x2="${gx}" y1="${Y}" y2="${Y}"/>`;
    s += `<path class="mk-guess" d="M${gx - 7} ${Y - 15}h14l-7 11z"/>`;
    s += `<text class="lbl-guess" x="${gx}" y="${Y - 20}" text-anchor="${anchor(gx)}">You ${f2(guess)}</text>`;
    s += `<path class="mk-truth" id="mk-truth" d="M0 -7l7 7l-7 7l-7 -7z" transform="translate(${bx(0)} ${Y})"/>`;
    s += `<text class="lbl-truth" id="lbl-truth" x="${bx(0)}" y="${Y + 26}" text-anchor="start">r 0.00</text>`;
    $("bar").innerHTML = s;

    // the true r counts up from 0 while its diamond slides into place
    const mk = $("mk-truth"), lbl = $("lbl-truth"), gap = $("bar-gap");
    countUp(truth, 600, (v) => {
      const x = bx(v);
      mk.setAttribute("transform", `translate(${x.toFixed(1)} ${Y})`);
      lbl.setAttribute("x", x.toFixed(1));
      lbl.setAttribute("text-anchor", anchor(x));
      lbl.textContent = `r ${f2(v)}`;
      gap.setAttribute("x2", x.toFixed(1));
    });
  }

  function confetti() {
    if (reduced()) return;
    const fx = $("fx"), chip = $("verdict").querySelector(".verdict-chip");
    if (!chip) return;
    const pr = fx.getBoundingClientRect(), cr = chip.getBoundingClientRect();
    const cx = cr.left - pr.left + cr.width / 2, cy = cr.top - pr.top + cr.height / 2;
    const colors = ["var(--accent)", "var(--point)", "var(--fit)", "var(--heart)"];
    for (let i = 0; i < 14; i++) {
      const p = document.createElement("span");
      p.className = "confetti";
      const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 40 + Math.random() * 50;
      p.style.cssText = `left:${cx}px;top:${cy}px;background:${colors[i % 4]};--dx:${(Math.cos(ang) * dist).toFixed(0)}px;--dy:${(Math.sin(ang) * dist - 20).toFixed(0)}px;--rot:${randint(90, 360)}deg`;
      fx.appendChild(p);
      setTimeout(() => p.remove(), 750);
    }
  }

  // ---------- flow ----------
  function startGame() {
    Sound.unlock();
    play("start");
    Object.assign(game, { round: 0, lives: RULES.startLives, score: 0, history: [], streak: 0, bestStreak: 0, bestAtStart: game.best });
    show("screen-game");
    nextRound();
  }

  function nextRound() {
    game.round++;
    game.current = newRound(game.round);
    game.phase = "guess";
    drawPlot($("plot"), game.current, { animate: true });
    const badge = $("tricky-badge");
    badge.hidden = !game.current.kind;
    if (game.current.kind) { retrigger(badge, "blink"); play("tricky", 150); }
    else play("blip");
    $("result").hidden = true;
    $("result").classList.remove("show");
    $("guess-msg").textContent = "";
    $("guess-hint").textContent = "Type 1–2 digits · 6 = 0.60";
    const input = $("guess");
    input.value = "";
    lastLen = 0;
    input.disabled = false;
    $("guess-btn").disabled = false;
    input.focus();
    renderHud();
  }

  function submitGuess() {
    if (game.phase !== "guess") return;
    const parsed = parseGuess($("guess").value);
    if (parsed.error) {
      $("guess-msg").textContent = parsed.error;
      retrigger($("guess-field"), "invalid");
      play("invalid");
      $("guess").focus();
      return;
    }
    $("guess-msg").textContent = "";

    const d = game.current;
    const res = scoreGuess(parsed.value, d.truth, game.lives);
    game.lives = res.lives;
    if (res.delta >= 0) { game.streak++; game.bestStreak = Math.max(game.bestStreak, game.streak); } else game.streak = 0;
    if (game.lives > 0) game.score++;
    if (game.score > game.best) { game.best = game.score; saveBest(game.best); }
    game.history.push({ round: game.round, truth: d.truth, guess: parsed.value, err: res.err, kind: d.kind });
    game.phase = "reveal";

    $("guess").disabled = true;
    $("guess-btn").disabled = true;
    drawPlot($("plot"), d, { reveal: true });
    drawBar(parsed.value, d.truth);

    let chip;
    if (res.delta < 0) chip = `<span class="verdict-chip bad">✕ Miss −1 ♥</span>`;
    else if (res.spotOn) chip = `<span class="verdict-chip good">★ Spot on${res.delta > 0 ? " +1 ♥" : ""}</span>`;
    else chip = `<span class="verdict-chip safe">✓ Safe</span>`;
    $("verdict").innerHTML = chip;
    $("detail").innerHTML = `True r <b>${f2(d.truth)}</b> · you <b>${f2(parsed.value)}</b> · off by <b>${res.err.toFixed(2)}</b>`;
    $("explain").hidden = !d.explain;
    $("explain-text").textContent = d.explain || "";

    const next = $("next-btn");
    next.innerHTML = game.lives > 0 ? "Next round <kbd>Enter</kbd>" : "See results <kbd>Enter</kbd>";
    $("result").hidden = false;
    retrigger($("result"), "show");
    next.focus();
    $("result").scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
    renderHud(res.delta);

    play("submit");
    if (res.delta < 0) {
      retrigger($("plot-wrap"), "shake");
      play("miss", 180);
    } else if (res.spotOn) {
      retrigger($("plot-wrap"), "flash-good");
      confetti();
      play("spotOn", 180);
    } else {
      play("safe", 180);
    }
  }

  function gameOver() {
    game.phase = "over";
    const h = game.history;
    const meanErr = h.reduce((a, r) => a + r.err, 0) / h.length;
    const spotOn = h.filter((r) => r.err <= RULES.gainWithin).length;
    const newBest = game.score > game.bestAtStart;

    const title = $("over-title");
    title.textContent = "Game over";
    retrigger(title, "type");
    $("over-sub").textContent = `You survived ${game.score} round${game.score === 1 ? "" : "s"}${newBest ? " · a new best score!" : ""}`;

    const stats = [
      { label: newBest ? "New best" : "Score", value: game.score, digits: 0, best: newBest },
      { label: "Mean error", value: meanErr, digits: 3 },
      { label: "Best streak", value: game.bestStreak, digits: 0 },
      { label: "Spot-on", value: spotOn, digits: 0 },
    ];
    $("over-stats").innerHTML = stats.map((s, i) =>
      `<div class="stat${s.best ? " best" : ""}"><div class="stat-label">${s.label}</div><div class="stat-value" id="stat-${i}">0</div></div>`).join("");
    stats.forEach((s, i) => countUp(s.value, 500, (v) => { $(`stat-${i}`).textContent = v.toFixed(s.digits); }));

    drawHistory(h);
    show("screen-over");
    renderHud();
    $("again-btn").focus();
    play("gameOver");
    if (newBest) play("fanfare");
  }

  // ---------- history chart (0 … 1) ----------
  function drawHistory(h) {
    const M = { l: 44, r: 12, t: 10, b: 40 }, S = 360;
    const iw = S - M.l - M.r, ih = S - M.t - M.b;
    const hx = (v) => M.l + v * iw;
    const hy = (v) => M.t + ih - v * ih;
    let s = "";
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      s += `<line class="gridline" x1="${hx(0)}" x2="${hx(1)}" y1="${hy(t)}" y2="${hy(t)}"/>`;
      s += `<line class="gridline" x1="${hx(t)}" x2="${hx(t)}" y1="${hy(0)}" y2="${hy(1)}"/>`;
      s += `<text class="tick-text" x="${hx(t)}" y="${hy(0) + 16}" text-anchor="middle">${t}</text>`;
      s += `<text class="tick-text" x="${hx(0) - 6}" y="${hy(t) + 4}" text-anchor="end">${t}</text>`;
    }
    const b = RULES.loseAbove;
    s += `<polygon class="band" points="${hx(0)},${hy(b)} ${hx(0)},${hy(0)} ${hx(b)},${hy(0)} ${hx(1)},${hy(1 - b)} ${hx(1)},${hy(1)} ${hx(1 - b)},${hy(1)}"/>`;
    s += `<line class="ref-line" x1="${hx(0)}" y1="${hy(0)}" x2="${hx(1)}" y2="${hy(1)}"/>`;
    s += `<text class="axis-title" x="${hx(0.5)}" y="${S - 6}" text-anchor="middle">True r</text>`;
    s += `<text class="axis-title" transform="translate(12 ${hy(0.5)}) rotate(-90)" text-anchor="middle">Your guess</text>`;
    const stagger = Math.min(40, 800 / Math.max(1, h.length));
    h.forEach((r, i) => {
      const x = hx(r.truth), y = hy(r.guess);
      const delay = ` style="animation-delay:${(i * stagger).toFixed(0)}ms"`;
      s += `<g class="pt pop"${delay}><title>Round ${r.round}: true r ${f2(r.truth)}, your guess ${f2(r.guess)}, off by ${r.err.toFixed(2)}${r.kind ? ` (tricky: ${r.kind})` : ""}</title>`;
      if (r.kind) s += `<circle class="pt-tricky-ring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/>`;
      if (r.err > RULES.loseAbove) s += `<path class="pt-miss" d="M${(x - 4.5).toFixed(1)} ${(y - 4.5).toFixed(1)}l9 9m0 -9l-9 9"/>`;
      else s += `<circle class="pt-hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>`;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="transparent"/></g>`;
    });
    $("history").innerHTML = s;
  }

  // ---------- mute ----------
  function syncMute() {
    const m = Sound.isMuted();
    const btn = $("mute-btn");
    btn.setAttribute("aria-pressed", String(m));
    btn.setAttribute("aria-label", "Mute sound");
    btn.title = m ? "Sound off (M to turn on)" : "Mute sound (M)";
  }
  function toggleMute() {
    Sound.setMuted(!Sound.isMuted());
    syncMute();
    if (!Sound.isMuted()) { Sound.unlock(); Sound.play("blip"); }
  }

  // ---------- events ----------
  $("start-btn").addEventListener("click", startGame);
  $("again-btn").addEventListener("click", startGame);
  $("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
  $("next-btn").addEventListener("click", () => { if (game.lives > 0) nextRound(); else gameOver(); });
  $("mute-btn").addEventListener("click", toggleMute);

  let lastLen = 0;
  $("guess").addEventListener("input", (e) => {
    const clean = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (clean !== e.target.value) e.target.value = clean;
    $("guess-msg").textContent = "";
    $("guess-hint").textContent = clean ? `reads as 0.${clean.length === 1 ? clean + "0" : clean}` : "Type 1–2 digits · 6 = 0.60";
    if (clean.length > lastLen) play("tick");
    lastLen = clean.length;
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "m" || e.key === "M") { e.preventDefault(); toggleMute(); }
  });

  // start screen demo plot
  const demo = correlated(80, 0.72);
  drawPlot($("demo-plot"), { ...demo, kind: null }, { reveal: true });
  $("demo-caption").textContent = `Example: r = ${f2(pearson(demo.xs, demo.ys))}`;

  syncMute();
  renderHud();
  $("start-btn").focus();
}
