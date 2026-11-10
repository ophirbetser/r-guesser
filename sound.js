"use strict";

// Retro-arcade sound effects, synthesized with the Web Audio API (no audio files).
const Sound = (() => {
  const KEY = "r-guesser:muted";
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === "1"; } catch { /* storage unavailable */ }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // One note: square/triangle/sawtooth oscillator with a short envelope and optional pitch slide.
  function tone({ freq, to = null, type = "square", start = 0, dur = 0.1, vol = 0.6, attack = 0.005 }) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + start;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  const NOTE = { A4: 440, Bb4: 466.16, B4: 493.88, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.51, G6: 1567.98, C7: 2093 };
  const seq = (notes, step, opts = {}) => notes.forEach((f, i) => tone({ freq: f, start: (opts.offset || 0) + i * step, dur: opts.dur || step * 1.1, vol: opts.vol || 0.6, type: opts.type || "square" }));

  const sfx = {
    // game start: rising C-E-G-C arpeggio
    start: () => seq([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.08),
    // new round: soft blip
    blip: () => tone({ freq: 880, dur: 0.06, vol: 0.3, type: "triangle" }),
    // typing a digit: tiny tick
    tick: () => tone({ freq: 1800, dur: 0.025, vol: 0.12 }),
    // invalid input: low double buzz
    invalid: () => {
      tone({ freq: 110, dur: 0.08, vol: 0.5, type: "sawtooth" });
      tone({ freq: 110, start: 0.11, dur: 0.1, vol: 0.5, type: "sawtooth" });
    },
    // submit: quick falling "pew"
    submit: () => tone({ freq: 1200, to: 300, dur: 0.12, vol: 0.45 }),
    // safe: two-note ding-ding up
    safe: () => {
      tone({ freq: NOTE.G5, dur: 0.08, vol: 0.55 });
      tone({ freq: NOTE.C6, start: 0.09, dur: 0.15, vol: 0.55 });
    },
    // spot on (+1 life): 1-up jingle with a sparkle
    spotOn: () => {
      seq([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6], 0.05, { dur: 0.08 });
      tone({ freq: NOTE.C7, start: 0.32, dur: 0.3, vol: 0.3, type: "triangle" });
    },
    // miss (-1 life): descending wah-wah
    miss: () => {
      tone({ freq: 392, to: 330, dur: 0.18, vol: 0.5, type: "sawtooth" });
      tone({ freq: 311, to: 220, start: 0.2, dur: 0.38, vol: 0.5, type: "sawtooth" });
    },
    // tricky round: warning boop-boop
    tricky: () => {
      tone({ freq: 660, dur: 0.09, vol: 0.45 });
      tone({ freq: 440, start: 0.13, dur: 0.12, vol: 0.45 });
    },
    // game over: slow sad descending tune
    gameOver: () => {
      [NOTE.C5, NOTE.B4, NOTE.Bb4, NOTE.A4].forEach((f, i) =>
        tone({ freq: f, start: i * 0.24, dur: i === 3 ? 0.7 : 0.22, vol: 0.55, type: "triangle" }));
    },
    // new best score: fanfare (plays after the game-over tune)
    fanfare: () => {
      seq([NOTE.G5, NOTE.G5, NOTE.G5], 0.11, { offset: 1.25, dur: 0.09 });
      tone({ freq: NOTE.C6, start: 1.6, dur: 0.5, vol: 0.6 });
      tone({ freq: NOTE.E6, start: 1.6, dur: 0.5, vol: 0.35 });
    },
  };

  return {
    play(name) {
      if (muted || !sfx[name]) return;
      try { sfx[name](); } catch { /* audio unavailable */ }
    },
    isMuted: () => muted,
    setMuted(value) {
      muted = value;
      try { localStorage.setItem(KEY, value ? "1" : "0"); } catch { /* ignore */ }
    },
    unlock: () => { try { ensure(); } catch { /* ignore */ } },
  };
})();
