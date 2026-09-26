/* audio.js — WebAudio SFX, zero audio files. Music toggle gates jingles. */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  var ctx = null;
  var soundOn = true;
  var musicOn = true;
  var master = null;

  function ensure() {
    if (!ctx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === "suspended") {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
    return ctx;
  }

  function tone(freq, dur, opts) {
    opts = opts || {};
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.slide), t0 + dur);
    var vol = opts.vol != null ? opts.vol : 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  var Audio = {
    init: function () {
      var kick = function () {
        ensure();
        window.removeEventListener("pointerdown", kick);
      };
      window.addEventListener("pointerdown", kick);
    },

    setSound: function (on) { soundOn = !!on; },
    setMusic: function (on) { musicOn = !!on; },

    play: function (name, level) {
      if (!soundOn) return;
      switch (name) {
        case "tap":
          tone(720, 0.07, { type: "sine", vol: 0.18 });
          break;
        case "swap":
          tone(340, 0.09, { type: "triangle", slide: 520, vol: 0.2 });
          break;
        case "invalid":
          tone(170, 0.14, { type: "square", slide: 120, vol: 0.14 });
          break;
        case "clear": {
          var lvl = Math.min(level || 0, 8);
          tone(420 * Math.pow(1.14, lvl), 0.13, { type: "sine", vol: 0.26 });
          tone(640 * Math.pow(1.14, lvl), 0.1, { type: "triangle", vol: 0.12, delay: 0.02 });
          break;
        }
        case "special":
          tone(520, 0.1, { type: "triangle", vol: 0.24 });
          tone(780, 0.12, { type: "triangle", vol: 0.22, delay: 0.07 });
          tone(1040, 0.14, { type: "sine", vol: 0.2, delay: 0.14 });
          break;
        case "cake":
          tone(1180, 0.09, { type: "sine", vol: 0.16 });
          tone(1560, 0.1, { type: "sine", vol: 0.12, delay: 0.05 });
          break;
        case "shuffle":
          tone(500, 0.28, { type: "sawtooth", slide: 160, vol: 0.1 });
          break;
        case "box":
          tone(240, 0.12, { type: "square", slide: 90, vol: 0.2 });
          break;
        case "win":
          if (!musicOn) return;
          [523, 659, 784, 1047].forEach(function (f, i) {
            tone(f, 0.24, { type: "triangle", vol: 0.3, delay: i * 0.12 });
          });
          break;
        case "star":
          if (!musicOn) return;
          tone(880, 0.16, { type: "sine", vol: 0.26 });
          tone(1175, 0.2, { type: "sine", vol: 0.22, delay: 0.1 });
          break;
        case "fail":
          if (!musicOn) return;
          tone(392, 0.3, { type: "triangle", vol: 0.26 });
          tone(311, 0.4, { type: "triangle", vol: 0.24, delay: 0.22 });
          tone(262, 0.55, { type: "sine", vol: 0.22, delay: 0.46 });
          break;
        case "fanfare":
          if (!musicOn) return;
          [523, 659, 784, 1047, 1319].forEach(function (f, i) {
            tone(f, 0.3, { type: "square", vol: 0.14, delay: i * 0.1 });
            tone(f / 2, 0.3, { type: "triangle", vol: 0.2, delay: i * 0.1 });
          });
          break;
        case "secret":
          if (!musicOn) return;
          [392, 523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) {
            tone(f, 0.34, { type: "triangle", vol: 0.26, delay: i * 0.09 });
          });
          break;
        case "wish":
          tone(660, 0.14, { type: "sine", vol: 0.22 });
          tone(990, 0.2, { type: "sine", vol: 0.2, delay: 0.1 });
          break;
      }
    }
  };

  TGL.Audio = Audio;
})();
