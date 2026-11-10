"use strict";

// ================= core (pure logic, no DOM) =================
const RULES = {
  startLives: 3,
  maxLives: 5,
  loseAbove: 0.10,   // error > this loses a life
  gainWithin: 0.02,  // error <= this wins a life
  trickyFrom: 4,     // first round that can be tricky
  trickyChance: 0.2,
};
const TRICKS = ["outlier", "curve", "clusters", "fan"];

const uniform = (a, b) => a + Math.random() * (b - a);
const randint = (a, b) => Math.floor(uniform(a, b + 1));
const sign = () => (Math.random() < 0.5 ? -1 : 1);
const round2 = (v) => Math.round(v * 100) / 100 + 0; // + 0 turns -0 into 0

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

const f2 = (v) => round2(v).toFixed(2).replace("-", "−");

function makeNormal() {
  return { ...correlated(randint(25, 150), uniform(-1, 1)), kind: null };
}

function makeTricky(kind) {
  if (kind === "outlier") {
    const d = correlated(randint(25, 50), uniform(-0.2, 0.2));
    const before = pearson(d.xs, d.ys);
    d.xs.push(uniform(5, 7));
    d.ys.push(sign() * uniform(5, 7));
    const after = pearson(d.xs, d.ys);
    return { ...d, kind, highlight: d.xs.length - 1,
      explain: `One point (orange) pulled r from ${f2(before)} to ${f2(after)}. r is very sensitive to outliers.` };
  }
  if (kind === "curve") {
    const xs = [], ys = [];
    const s = sign();
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
    const a = correlated(randint(20, 40), uniform(-0.3, 0.3));
    const within = pearson(a.xs, a.ys);
    const b = correlated(randint(20, 40), uniform(-0.3, 0.3));
    const dx = uniform(4, 6), dy = sign() * uniform(4, 6);
    const xs = [...a.xs, ...b.xs.map((x) => x + dx)];
    const ys = [...a.ys, ...b.ys.map((y) => y + dy)];
    return { xs, ys, kind,
      explain: `Inside each group r is about ${f2(within)}, but the gap between the two groups makes the overall r ${f2(pearson(xs, ys))}.` };
  }
  // fan: spread grows with x
  const xs = [], ys = [];
  const s = sign();
  for (let i = randint(60, 120); i > 0; i--) {
    const x = uniform(0, 4);
    xs.push(x);
    ys.push(s * 0.6 * x + (0.15 + 0.5 * x) * randn());
  }
  return { xs, ys, kind,
    explain: `The spread grows with x: tight on the left, loose on the right. r = ${f2(pearson(xs, ys))} squeezes both into one number.` };
}

function newRound(roundNo) {
  const tricky = roundNo >= RULES.trickyFrom && Math.random() < RULES.trickyChance;
  let d;
  do {
    d = tricky ? makeTricky(TRICKS[randint(0, TRICKS.length - 1)]) : makeNormal();
    d.r = pearson(d.xs, d.ys);
  } while (!isFinite(d.r));
  d.truth = round2(d.r);
  return d;
}

// Returns { value } or { error }.
function parseGuess(text) {
  const s = String(text).trim().replace(/[−–]/g, "-").replace(",", ".");
  if (s === "") return { error: "Type a number between −1 and 1." };
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return { error: "That's not a number. Try something like 0.63 or -.4" };
  const v = parseFloat(s);
  if (v < -1 || v > 1) return { error: "r is always between −1 and 1." };
  return { value: v };
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
  const svgNS = "http://www.w3.org/2000/svg";

  const loadBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
  const saveBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ } };

  const game = { round: 0, lives: RULES.startLives, score: 0, best: loadBest(), history: [], streak: 0, bestStreak: 0, current: null, phase: "start" };

  function show(screen) {
    for (const id of ["screen-start", "screen-game", "screen-over"]) $(id).hidden = id !== screen;
  }

  function renderHud(pulse = false) {
    $("hud-round").textContent = game.round || "–";
    $("hud-score").textContent = game.score;
    $("hud-best").textContent = game.best;
    const lives = $("hud-lives");
    lives.innerHTML = "♥".repeat(Math.max(0, game.lives)) + `<span class="empty">${"♥".repeat(RULES.maxLives - Math.max(0, game.lives))}</span>`;
    lives.setAttribute("aria-label", `${game.lives} of ${RULES.maxLives} lives`);
    if (pulse) { lives.classList.remove("pulse"); void lives.offsetWidth; lives.classList.add("pulse"); }
  }

  // ---------- scatter plot ----------
  function drawPlot(d, reveal) {
    const P = 24, S = 400, inner = S - 2 * P;
    const ext = (arr) => {
      const lo = Math.min(...arr), hi = Math.max(...arr), pad = (hi - lo || 1) * 0.08;
      return [lo - pad, hi + pad];
    };
    const [x0, x1] = ext(d.xs), [y0, y1] = ext(d.ys);
    const sx = (v) => P + ((v - x0) / (x1 - x0)) * inner;
    const sy = (v) => P + inner - ((v - y0) / (y1 - y0)) * inner;

    let s = `<defs><clipPath id="plot-clip"><rect x="${P}" y="${P}" width="${inner}" height="${inner}"/></clipPath></defs>`;
    s += `<line class="axis" x1="${P}" y1="${P}" x2="${P}" y2="${P + inner}"/>`;
    s += `<line class="axis" x1="${P}" y1="${P + inner}" x2="${P + inner}" y2="${P + inner}"/>`;
    s += `<text class="axis-label" x="${P + inner}" y="${P + inner + 16}" text-anchor="end">x</text>`;
    s += `<text class="axis-label" x="${P - 8}" y="${P + 4}" text-anchor="end">y</text>`;
    const rad = d.xs.length > 100 ? 4 : 5;
    d.xs.forEach((x, i) => {
      const cls = reveal && i === d.highlight ? "dot outlier" : "dot";
      s += `<circle class="${cls}" cx="${sx(x).toFixed(1)}" cy="${sy(d.ys[i]).toFixed(1)}" r="${i === d.highlight && reveal ? rad + 2 : rad}"/>`;
    });
    if (reveal) {
      const { slope, intercept } = fitLine(d.xs, d.ys);
      s += `<g clip-path="url(#plot-clip)"><line class="fit draw" x1="${sx(x0)}" y1="${sy(slope * x0 + intercept)}" x2="${sx(x1)}" y2="${sy(slope * x1 + intercept)}"/></g>`;
    }
    $("plot").innerHTML = s;
    $("plot").setAttribute("aria-label", `Scatter plot with ${d.xs.length} points`);
  }

  // ---------- guess vs truth bar ----------
  function drawBar(guess, truth) {
    const L = 16, R = 304, Y = 36;
    const bx = (v) => L + ((v + 1) / 2) * (R - L);
    let s = `<line class="bar-track" x1="${L}" x2="${R}" y1="${Y}" y2="${Y}"/>`;
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      s += `<line class="bar-tick" x1="${bx(t)}" x2="${bx(t)}" y1="${Y + 6}" y2="${Y + 10}"/>`;
      s += `<text class="bar-text" x="${bx(t)}" y="${Y + 22}" text-anchor="middle">${String(t).replace("-", "−")}</text>`;
    }
    s += `<line class="bar-gap" x1="${bx(guess)}" x2="${bx(truth)}" y1="${Y}" y2="${Y}"/>`;
    const guessLeft = guess <= truth;
    s += `<circle class="mk-guess" cx="${bx(guess)}" cy="${Y}" r="7"/>`;
    s += `<circle class="mk-truth" cx="${bx(truth)}" cy="${Y}" r="7"/>`;
    s += `<text class="mk-label" x="${bx(guess)}" y="${Y - 13}" text-anchor="${guessLeft ? "end" : "start"}">You ${f2(guess)}</text>`;
    s += `<text class="mk-label" x="${bx(truth)}" y="${Y - 13}" text-anchor="${guessLeft ? "start" : "end"}">r ${f2(truth)}</text>`;
    $("bar").innerHTML = s;
  }

  // ---------- flow ----------
  function startGame() {
    Object.assign(game, { round: 0, lives: RULES.startLives, score: 0, history: [], streak: 0, bestStreak: 0 });
    show("screen-game");
    nextRound();
  }

  function nextRound() {
    game.round++;
    game.current = newRound(game.round);
    game.phase = "guess";
    drawPlot(game.current, false);
    $("tricky-badge").hidden = !game.current.kind;
    $("result").hidden = true;
    $("guess-msg").textContent = "";
    const input = $("guess");
    input.value = "";
    input.disabled = false;
    $("guess-btn").disabled = false;
    input.focus();
    renderHud();
  }

  function submitGuess() {
    if (game.phase !== "guess") return;
    const parsed = parseGuess($("guess").value);
    if (parsed.error) { $("guess-msg").textContent = parsed.error; $("guess").focus(); return; }
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
    drawPlot(d, true);
    drawBar(parsed.value, d.truth);

    const v = $("verdict");
    if (res.delta < 0) { v.textContent = "Missed: −1 ♥"; v.className = "verdict bad"; }
    else if (res.spotOn) { v.textContent = res.delta > 0 ? "Spot on! +1 ♥" : "Spot on!"; v.className = "verdict good"; }
    else { v.textContent = "Close enough: safe"; v.className = "verdict good"; }
    $("detail").innerHTML = `True r <b>${f2(d.truth)}</b> · your guess <b>${f2(parsed.value)}</b> · off by <b>${res.err.toFixed(2)}</b>`;
    $("explain").hidden = !d.explain;
    $("explain").textContent = d.explain || "";

    const next = $("next-btn");
    next.innerHTML = game.lives > 0 ? "Next round <kbd>Enter</kbd>" : "See results <kbd>Enter</kbd>";
    $("result").hidden = false;
    next.focus();
    renderHud(res.delta !== 0);
  }

  function gameOver() {
    game.phase = "over";
    const h = game.history;
    const meanErr = h.reduce((a, r) => a + r.err, 0) / h.length;
    const spotOn = h.filter((r) => r.err <= RULES.gainWithin).length;
    const isBest = game.score > 0 && game.score >= game.best;
    $("over-title").textContent = isBest ? "Game over: new best score! 🎉" : "Game over";
    const stats = [
      ["Score", game.score],
      ["Mean error", meanErr.toFixed(3)],
      ["Best streak", game.bestStreak],
      ["Spot-on guesses", spotOn],
    ];
    $("over-stats").innerHTML = stats.map(([k, v]) => `<div class="stat"><div class="stat-label">${k}</div><div class="stat-value">${v}</div></div>`).join("");
    drawHistory(h);
    show("screen-over");
    renderHud();
    $("again-btn").focus();
  }

  function drawHistory(h) {
    const M = { l: 40, r: 10, t: 10, b: 36 }, S = 360;
    const iw = S - M.l - M.r, ih = S - M.t - M.b;
    const hx = (v) => M.l + ((v + 1) / 2) * iw;
    const hy = (v) => M.t + ih - ((v + 1) / 2) * ih;
    let s = "";
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      s += `<line class="gridline" x1="${hx(-1)}" x2="${hx(1)}" y1="${hy(t)}" y2="${hy(t)}"/>`;
      s += `<line class="gridline" x1="${hx(t)}" x2="${hx(t)}" y1="${hy(-1)}" y2="${hy(1)}"/>`;
      const lbl = String(t).replace("-", "−");
      s += `<text class="tick-text" x="${hx(t)}" y="${hy(-1) + 16}" text-anchor="middle">${lbl}</text>`;
      s += `<text class="tick-text" x="${hx(-1) - 6}" y="${hy(t) + 4}" text-anchor="end">${lbl}</text>`;
    }
    // ±0.10 safe band around the perfect-guess line
    const b = RULES.loseAbove;
    s += `<polygon class="band" points="${hx(-1)},${hy(-1 + b)} ${hx(-1)},${hy(-1)} ${hx(-1 + b)},${hy(-1)} ${hx(1)},${hy(1 - b)} ${hx(1)},${hy(1)} ${hx(1 - b)},${hy(1)}"/>`;
    s += `<line class="ref-line" x1="${hx(-1)}" y1="${hy(-1)}" x2="${hx(1)}" y2="${hy(1)}"/>`;
    s += `<text class="tick-text" x="${hx(0)}" y="${S - 4}" text-anchor="middle">True r</text>`;
    s += `<text class="tick-text" transform="translate(11 ${hy(0)}) rotate(-90)" text-anchor="middle">Your guess</text>`;
    for (const r of h) {
      const x = hx(r.truth).toFixed(1), y = hy(r.guess).toFixed(1);
      const title = `<title>Round ${r.round}: true r ${f2(r.truth)}, your guess ${f2(r.guess)}, off by ${r.err.toFixed(2)}${r.kind ? ` (tricky: ${r.kind})` : ""}</title>`;
      s += `<g>${title}`;
      if (r.kind) s += `<circle class="pt-tricky-ring" cx="${x}" cy="${y}" r="9"/>`;
      if (r.err > RULES.loseAbove) s += `<path class="pt-miss" d="M${x - 4.5} ${y - 4.5}l9 9m0 -9l-9 9"/>`;
      else s += `<circle class="pt-hit" cx="${x}" cy="${y}" r="5"/>`;
      s += `<circle cx="${x}" cy="${y}" r="12" fill="transparent"/></g>`;
    }
    $("history").innerHTML = s;
  }

  // ---------- events ----------
  $("start-btn").addEventListener("click", startGame);
  $("again-btn").addEventListener("click", startGame);
  $("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
  $("next-btn").addEventListener("click", () => { if (game.lives > 0) nextRound(); else gameOver(); });
  $("guess").addEventListener("input", () => { $("guess-msg").textContent = ""; });

  renderHud();
  $("start-btn").focus();
}
