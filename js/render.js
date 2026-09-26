/* render.js — canvas renderer: pre-rendered emoji glyphs, tweened sprites,
   pooled particles, score floaters, pointer input. No external deps. */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  var EMOJI = ["💗", "🌸", "⭐", "🎁", "🍫", "💍"];
  var COLORS = ["#ff5d8f", "#ff9ec3", "#ffd43b", "#51cf66", "#a0653f", "#9775fa"];
  var BADGE = { rocketH: "🚀", rocketV: "🚀", bomb: "💣", rainbow: "🌈" };
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var canvas, ctx, fx = null;
  var cssW = 0, cssH = 0, cell = 0, cols = 7, rows = 7;
  var glyphs = {};        // key → offscreen canvas
  var bgCanvas = null;
  var sprites = {};       // id → sprite
  var boxes = {};         // "r,c" → {hp, shakeT}
  var particles = [];     // pooled
  var pCursor = 0;
  var floaters = [];
  var queue = [];         // pending animation steps
  var current = null;     // { until, onDone }
  var selection = null;
  var hammerMode = false;
  var boardShake = 0;
  var hint = null; // {cells:[{r,c}], a, b, t0}
  var inputCb = null;
  var stateRef = null;
  var running = false;

  var EASE = {
    linear: function (t) { return t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inCubic: function (t) { return t * t * t; },
    inBack: function (t) { return 2 * t * t - t; },
    outBack: function (t) { var c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    inOut: function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  };

  var CAP = 220;

  /* ── glyph pre-rendering ──────────────────── */

  function glyphKey(type, special) { return type + "|" + (special || ""); }

  function renderGlyphs() {
    glyphs = {};
    var size = Math.max(24, Math.round(cell * DPR));
    for (var t = 0; t < EMOJI.length; t++) {
      glyphs[glyphKey(t, null)] = drawGlyph(t, null, size);
      glyphs[glyphKey(t, "rocketH")] = drawGlyph(t, "rocketH", size);
      glyphs[glyphKey(t, "rocketV")] = drawGlyph(t, "rocketV", size);
      glyphs[glyphKey(t, "bomb")] = drawGlyph(t, "bomb", size);
      glyphs[glyphKey(t, "rainbow")] = drawGlyph(t, "rainbow", size);
    }
  }

  function drawGlyph(type, special, size) {
    var cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    var g = cv.getContext("2d");
    g.textAlign = "center";
    g.textBaseline = "middle";
    var cx = size / 2, cy = size / 2;

    if (special === "rainbow") {
      // rainbow gets its own glyph — draw glow ring + rainbow emoji
      ring(g, cx, cy, size * 0.44, "#fff", size * 0.06);
      emoji(g, "🌈", cx, cy, size * 0.62, type, cv);
      return cv;
    }

    var fontSize = size * 0.7;
    if (special) {
      // glow ring behind the tile
      g.save();
      g.shadowColor = special === "bomb" ? "#ff6b6b" : "#ffd43b";
      g.shadowBlur = size * 0.14;
      g.fillStyle = "rgba(255,255,255,.9)";
      g.beginPath();
      g.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    var ok = emoji(g, EMOJI[type], cx, cy - (special ? size * 0.04 : 0), fontSize, type, cv);
    if (!ok) fallbackShape(g, type, cx, cy, size);

    if (special) {
      var badge = BADGE[special];
      var bs = size * 0.34;
      var bx = size * 0.74, by = size * 0.76;
      g.save();
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(bx, by, bs * 0.62, 0, Math.PI * 2);
      g.fill();
      g.font = Math.round(bs) + "px system-ui, 'Segoe UI Emoji', sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      var bok = false;
      try {
        g.fillText(badge, bx, by + size * 0.01);
        bok = measureAlpha(g, bs, bs, bx - bs / 2, by - bs / 2, cv) > 4;
      } catch (e) { bok = false; }
      if (!bok) {
        g.fillStyle = special === "bomb" ? "#ff6b6b" : "#f5b942";
        g.beginPath();
        if (special === "bomb") g.arc(bx, by, bs * 0.34, 0, Math.PI * 2);
        else { g.moveTo(bx, by - bs * 0.38); g.lineTo(bx + bs * 0.34, by + bs * 0.3); g.lineTo(bx - bs * 0.34, by + bs * 0.3); g.closePath(); }
        g.fill();
      }
      g.restore();
    }
    return cv;
  }

  // draw emoji; returns false if the font rendered nothing (device fallback)
  function emoji(g, ch, x, y, px, type, host) {
    g.save();
    g.font = Math.round(px) + "px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    try {
      g.fillText(ch, x, y);
      var w = Math.ceil(px), h = Math.ceil(px);
      var alpha = measureAlpha(g, w, h, x - w / 2, y - h / 2, host);
      if (alpha > 6) { g.restore(); return true; }
    } catch (e) { /* fall through */ }
    g.restore();
    return false;
  }

  function measureAlpha(g, w, h, x, y, host) {
    var d;
    try {
      d = g.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), Math.min(w, host.width), Math.min(h, host.height));
    } catch (e) { return 99; } // tainted/unavailable → assume ok
    var sum = 0, data = d.data;
    for (var i = 3; i < data.length; i += 4) sum += data[i];
    return sum / 255;
  }

  function ring(g, cx, cy, r, color, lw) {
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }

  /* vector fallbacks when a device renders no emoji at all (spec §8) */
  function fallbackShape(g, type, cx, cy, size) {
    var r = size * 0.3;
    g.fillStyle = COLORS[type];
    g.strokeStyle = "rgba(255,255,255,.85)";
    g.lineWidth = size * 0.04;
    g.beginPath();
    switch (type) {
      case 0: // heart
        g.moveTo(cx, cy + r);
        g.bezierCurveTo(cx - r * 1.6, cy, cx - r, cy - r * 1.3, cx, cy - r * 0.35);
        g.bezierCurveTo(cx + r, cy - r * 1.3, cx + r * 1.6, cy, cx, cy + r);
        break;
      case 1: // flower: 5 petals
        for (var i = 0; i < 5; i++) {
          var a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          g.moveTo(cx + Math.cos(a) * r * 0.55 + r * 0.45, cy + Math.sin(a) * r * 0.55);
          g.arc(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.45, 0, Math.PI * 2);
        }
        break;
      case 2: // star
        for (var k = 0; k < 10; k++) {
          var ang = (k / 10) * Math.PI * 2 - Math.PI / 2;
          var rad = k % 2 === 0 ? r : r * 0.45;
          var px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        break;
      case 3: // gift box
        g.rect(cx - r, cy - r * 0.7, r * 2, r * 1.6);
        g.moveTo(cx, cy - r * 0.7); g.lineTo(cx, cy + r * 0.9);
        break;
      case 4: // chocolate
        g.roundRect ? g.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.3)
                    : g.rect(cx - r, cy - r, r * 2, r * 2);
        break;
      default: // ring
        g.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
        break;
    }
    if (type === 5) { g.stroke(); g.fillStyle = "#ffd43b"; g.beginPath(); g.moveTo(cx, cy - r * 1.1); g.lineTo(cx + r * 0.4, cy - r * 0.6); g.lineTo(cx, cy - r * 0.2); g.lineTo(cx - r * 0.4, cy - r * 0.6); g.closePath(); g.fill(); return; }
    g.fill();
    if (type !== 1) g.stroke();
  }

  /* ── layout / lifecycle ───────────────────── */

  function resize() {
    var wrap = canvas.parentElement;
    var availW = wrap.clientWidth - 16;
    var availH = wrap.clientHeight - 8;
    if (availW <= 0 || availH <= 0) return;
    cell = Math.max(20, Math.floor(Math.min(availW / cols, availH / rows)));
    cssW = cell * cols;
    cssH = cell * rows;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * DPR);
    canvas.height = Math.round(cssH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    renderGlyphs();
    buildBg();
  }

  function buildBg() {
    bgCanvas = document.createElement("canvas");
    bgCanvas.width = canvas.width;
    bgCanvas.height = canvas.height;
    var b = bgCanvas.getContext("2d");
    b.scale(DPR, DPR);
    roundRect(b, 0, 0, cssW, cssH, 18);
    b.fillStyle = "rgba(255,255,255,.5)";
    b.fill();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if ((r + c) % 2 === 0) {
          b.fillStyle = "rgba(214,51,108,.05)";
          b.fillRect(c * cell, r * cell, cell, cell);
        }
      }
    }
  }

  function roundRect(g, x, y, w, h, rad) {
    g.beginPath();
    g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad);
    g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad);
    g.arcTo(x, y, x + w, y, rad);
    g.closePath();
  }

  function setBoard(state) {
    stateRef = state;
    cols = state.w; rows = state.h;
    sprites = {};
    boxes = {};
    queue = [];
    current = null;
    selection = null;
    resize();
    for (var r = 0; r < state.h; r++) {
      for (var c = 0; c < state.w; c++) {
        var cellObj = state.grid[r][c];
        if (cellObj.blocker > 0) boxes[r + "," + c] = { hp: cellObj.blocker, shakeT: 0 };
        if (cellObj.tile) addSprite(cellObj.tile, r, c);
      }
    }
    start();
  }

  function addSprite(tile, r, c) {
    sprites[tile.id] = {
      id: tile.id, type: tile.type, special: tile.special,
      gx: c, gy: r, scale: 1, alpha: 1,
      move: null, anims: [], dead: false
    };
  }

  /* ── frame loop ───────────────────────────── */

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function frame(now) {
    if (!running) return;
    stepQueue(now);
    draw(now);
    updateParticles(now);
    requestAnimationFrame(frame);
  }

  function stepQueue(now) {
    if (current) {
      if (now >= current.until) {
        var done = current.onDone;
        current = null;
        purgeDead();
        if (done) done();
      }
      return;
    }
    if (!queue.length) return;
    var step = queue.shift();
    if (step._onStart) step._onStart(step);
    var dur = runStep(step, now);
    current = { until: now + dur, onDone: step._onDone };
  }

  function runStep(step, now) {
    var i, sp;
    if (step.type === "swap") {
      // engine already committed the swap: grid[to] holds the tile that visually comes from `from`
      animSwap(step.a, step.b, now, 150, "outCubic");
      animSwap(step.b, step.a, now, 150, "outCubic");
      return 165;
    }
    if (step.type === "invalidSwap") {
      // grid unchanged: tile at a visually moves a→b and back
      moveTile(step.a, step.b, now, 110, "outCubic");
      moveTile(step.b, step.a, now, 110, "outCubic");
      setTimeoutish(function (t) {
        moveTile(step.a, step.b, t, 110, "outBack", true);
        moveTile(step.b, step.a, t, 110, "outBack", true);
      }, now + 200);
      boardShake = now + 260;
      return 340;
    }
    if (step.type === "clear") {
      var count = step.tiles.length;
      for (i = 0; i < count; i++) {
        var t = step.tiles[i];
        sp = sprites[t.id];
        if (!sp) continue;
        sp.dead = true;
        sp.anims.push({ p: "scale", from: 1, to: 0, t0: now, dur: 170, ease: "inBack" });
        sp.anims.push({ p: "alpha", from: 1, to: 0, t0: now + 80, dur: 90, ease: "linear" });
        burstCell(t.r, t.c, t.type, count > 16 ? 3 : 7);
      }
      for (i = 0; i < step.triggered.length; i++) {
        var tg = step.triggered[i];
        ringBurst(tg.r, tg.c, tg.special === "rainbow" ? "#ffd43b" : "#ff8787");
      }
      for (i = 0; i < step.blockers.length; i++) {
        var bk = step.blockers[i];
        var key = bk.r + "," + bk.c;
        boxes[key] = boxes[key] || { hp: 9, shakeT: 0 };
        boxes[key].hp = bk.hp;
        boxes[key].shakeT = now + 320;
        if (bk.hp === 0) {
          delete boxes[key];
          boxBreak(bk.r, bk.c);
        }
      }
      for (i = 0; i < step.created.length; i++) {
        (function (cr) {
          var future = now + 150;
          queueMicrotaskFn(function () {
            addSprite({ id: cr.id, type: cr.type, special: cr.special }, cr.r, cr.c);
            var s2 = sprites[cr.id];
            if (s2) {
              s2.scale = 0;
              s2.anims.push({ p: "scale", from: 0, to: 1, t0: future, dur: 220, ease: "outBack" });
            }
            ringBurst(cr.r, cr.c, "#ffd43b");
          });
        })(step.created[i]);
      }
      if (step.cakes > 0) floaterAt(step, now);
      return 185;
    }
    if (step.type === "fall") {
      var maxDur = 0;
      for (i = 0; i < step.moves.length; i++) {
        var m = step.moves[i];
        sp = sprites[m.id];
        if (!sp) continue;
        var dist = Math.abs(m.toR - m.fromR);
        var dur = Math.min(300, 130 + dist * 34);
        sp.gy = m.fromR;
        sp.gx = m.c;
        sp.move = { fx: m.c, fy: m.fromR, tx: m.c, ty: m.toR, t0: now, dur: dur, ease: "outCubic" };
        sp.anims.push({ p: "squash", from: 1, to: 1, t0: now + dur, dur: 120, ease: "outBack", squash: true });
        maxDur = Math.max(maxDur, dur + 60);
      }
      var colCount = {};
      for (i = 0; i < step.spawns.length; i++) {
        var sn = step.spawns[i];
        colCount[sn.c] = (colCount[sn.c] || 0) + 1;
        var startY = -(colCount[sn.c]);
        addSprite({ id: sn.id, type: sn.type, special: sn.special }, sn.c < 0 ? 0 : 0, sn.c);
        var s3 = sprites[sn.id];
        s3.gx = sn.c; s3.gy = startY;
        var d3 = Math.min(330, 160 + (sn.toR - startY) * 28);
        s3.move = { fx: sn.c, fy: startY, tx: sn.c, ty: sn.toR, t0: now, dur: d3, ease: "outCubic" };
        maxDur = Math.max(maxDur, d3 + 60);
      }
      return maxDur;
    }
    if (step.type === "shuffle") {
      for (i = 0; i < step.remap.length; i++) {
        var rm = step.remap[i];
        sp = sprites[rm.id];
        if (!sp) { continue; }
        sp.move = { fx: sp.gx, fy: sp.gy, tx: rm.c, ty: rm.r, t0: now, dur: 380, ease: "inOut" };
      }
      sparkleRain(now);
      return 430;
    }
    return 0;
  }

  // committed swap: the tile now AT targetPos visually travels here from fromPos
  function animSwap(targetPos, fromPos, now, dur, ease) {
    var id = tileIdAt(targetPos);
    var sp = id != null ? sprites[id] : null;
    if (!sp) return;
    sp.move = { fx: fromPos.c, fy: fromPos.r, tx: targetPos.c, ty: targetPos.r, t0: now, dur: dur, ease: ease };
  }

  // grid unchanged: move the tile sitting AT `from` toward `to` (reverse = return trip)
  function moveTile(from, to, now, dur, ease, reverse) {
    var id = tileIdAt(from);
    var sp = id != null ? sprites[id] : null;
    if (!sp) return;
    var f = reverse ? to : from;
    var t = reverse ? from : to;
    sp.move = { fx: f.c, fy: f.r, tx: t.c, ty: t.r, t0: now, dur: dur, ease: ease };
  }

  function tileIdAt(pos) {
    if (!stateRef) return null;
    var c = stateRef.grid[pos.r] && stateRef.grid[pos.r][pos.c];
    return c && c.tile ? c.tile.id : null;
  }

  // run fn at absolute time inside the rAF loop (no setTimeout drift)
  var delayed = [];
  function setTimeoutish(fn, t) { delayed.push({ t: t, fn: fn }); }
  function queueMicrotaskFn(fn) { fn(); } // creation sprites land immediately (t0 delays the anim)

  function purgeDead() {
    for (var id in sprites) if (sprites[id].dead) delete sprites[id];
  }

  /* ── drawing ──────────────────────────────── */

  function draw(now) {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);
    if (bgCanvas) {
      var sh = boardShake > now ? Math.sin(now / 24) * 3 : 0;
      ctx.save();
      ctx.translate(sh, 0);
      ctx.drawImage(bgCanvas, 0, 0, cssW, cssH);
      drawBoxes(now);
      drawSprites(now);
      drawSelection(now);
      drawHint(now);
      ctx.restore();
    }
    drawParticles();
    drawFloaters(now);
  }

  function tickAnims(sp, now) {
    for (var i = sp.anims.length - 1; i >= 0; i--) {
      var a = sp.anims[i];
      if (now < a.t0) continue;
      var t = Math.min(1, (now - a.t0) / a.dur);
      var v = EASE[a.ease](t);
      if (a.squash) {
        sp.scale = 1 - Math.sin(v * Math.PI) * 0.12;
      } else {
        sp[a.p] = a.from + (a.to - a.from) * v;
      }
      if (t >= 1) {
        if (a.squash) sp.scale = 1;
        sp.anims.splice(i, 1);
      }
    }
    if (sp.move) {
      var m = sp.move;
      if (now >= m.t0 + m.dur) {
        sp.gx = m.tx; sp.gy = m.ty;
        sp.move = null;
      } else if (now >= m.t0) {
        var tt = (now - m.t0) / m.dur;
        var e = EASE[m.ease](tt);
        sp.gx = m.fx + (m.tx - m.fx) * e;
        sp.gy = m.fy + (m.ty - m.fy) * e;
      }
    }
  }

  function drawSprites(now) {
    for (var id in sprites) {
      var sp = sprites[id];
      tickAnims(sp, now);
      if (sp.alpha <= 0.01 && sp.dead) continue;
      var x = (sp.gx + 0.5) * cell;
      var y = (sp.gy + 0.5) * cell;
      var g = glyphs[glyphKey(sp.type, sp.special)];
      if (!g) continue;
      var s = cell * sp.scale;
      ctx.globalAlpha = Math.max(0, Math.min(1, sp.alpha));
      ctx.drawImage(g, x - s / 2, y - s / 2, s, s);
      ctx.globalAlpha = 1;
    }
  }

  function drawBoxes(now) {
    for (var key in boxes) {
      var box = boxes[key];
      var parts = key.split(",");
      var r = +parts[0], c = +parts[1];
      var shake = box.shakeT > now ? Math.sin(now / 20) * 2.5 : 0;
      var x = c * cell + shake, y = r * cell;
      var pad = cell * 0.08;
      var w = cell - pad * 2, h = cell - pad * 2;
      ctx.save();
      ctx.globalAlpha = box.hp >= 2 ? 1 : 0.82;
      // box body
      ctx.fillStyle = box.hp >= 2 ? "#f06595" : "#e599f7";
      roundRect(ctx, x + pad, y + pad + h * 0.12, w, h * 0.8, cell * 0.14);
      ctx.fill();
      // lid
      ctx.fillStyle = box.hp >= 2 ? "#d6336c" : "#9c36b5";
      roundRect(ctx, x + pad - 1, y + pad, w + 2, h * 0.3, cell * 0.1);
      ctx.fill();
      // gold ribbon
      ctx.fillStyle = "#f5b942";
      ctx.fillRect(x + cell / 2 - cell * 0.05, y + pad, cell * 0.1, h * 0.88);
      ctx.fillRect(x + pad, y + pad + h * 0.2, w, cell * 0.09);
      if (box.hp >= 2) {
        ctx.strokeStyle = "rgba(255,255,255,.75)";
        ctx.lineWidth = 2;
        roundRect(ctx, x + pad, y + pad + h * 0.12, w, h * 0.8, cell * 0.14);
        ctx.stroke();
      } else {
        // crack
        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + cell * 0.3, y + cell * 0.35);
        ctx.lineTo(x + cell * 0.45, y + cell * 0.55);
        ctx.lineTo(x + cell * 0.35, y + cell * 0.72);
        ctx.moveTo(x + cell * 0.45, y + cell * 0.55);
        ctx.lineTo(x + cell * 0.68, y + cell * 0.62);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawSelection(now) {
    if (!selection) return;
    var pulse = 0.5 + 0.5 * Math.sin(now / 160);
    ctx.save();
    ctx.strokeStyle = hammerMode ? "rgba(245,185,66," + (0.6 + pulse * 0.4) + ")" : "rgba(255,255,255," + (0.65 + pulse * 0.35) + ")";
    ctx.lineWidth = 4;
    roundRect(ctx, selection.c * cell + 3, selection.r * cell + 3, cell - 6, cell - 6, cell * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  /* idle hint: sequential glow across the matching cells + swipe arrow */
  function drawHint(now) {
    if (!hint || !hint.cells || !hint.cells.length) return;
    if (!hint.t0) hint.t0 = now;
    var age = now - hint.t0;
    if (age < 350) return;
    var wave = (age - 350) / 950; // seconds-ish progress, loops

    ctx.save();
    for (var i = 0; i < hint.cells.length; i++) {
      var p = hint.cells[i];
      var phase = wave - i * 0.18;
      phase = phase - Math.floor(phase);
      var glow = Math.max(0, Math.sin(phase * Math.PI));
      if (glow <= 0.01) continue;
      var cx = (p.c + 0.5) * cell, cy = (p.r + 0.5) * cell;

      var g = ctx.createRadialGradient(cx, cy, cell * 0.12, cx, cy, cell * 0.6);
      g.addColorStop(0, "rgba(255,255,255," + (0.5 * glow) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(p.c * cell, p.r * cell, cell, cell);

      ctx.strokeStyle = "rgba(255,255,255," + (0.8 * glow) + ")";
      ctx.lineWidth = 3.5;
      roundRect(ctx, p.c * cell + 5, p.r * cell + 5, cell - 10, cell - 10, cell * 0.2);
      ctx.stroke();
    }

    // swipe arrow from a → b
    if (hint.a && hint.b) {
      var ax = (hint.a.c + 0.5) * cell, ay = (hint.a.r + 0.5) * cell;
      var bx = (hint.b.c + 0.5) * cell, by = (hint.b.r + 0.5) * cell;
      var dx = bx - ax, dy = by - ay;
      var len = Math.hypot(dx, dy) || 1;
      var ux = dx / len, uy = dy / len;
      var bob = Math.sin(age / 200) * (cell * 0.06);
      var alpha = 0.45 + 0.35 * Math.sin(age / 200);
      var sx = ax + ux * cell * 0.34, sy = ay + uy * cell * 0.34 + bob;
      var ex = bx - ux * cell * 0.3, ey = by - uy * cell * 0.3 + bob;
      ctx.strokeStyle = "rgba(255,255,255," + alpha + ")";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // arrowhead
      var px = -uy, py = ux;
      var hs = cell * 0.14;
      ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
      ctx.beginPath();
      ctx.moveTo(ex + ux * hs, ey + uy * hs);
      ctx.lineTo(ex + px * hs * 0.7, ey + py * hs * 0.7);
      ctx.lineTo(ex - px * hs * 0.7, ey - py * hs * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* ── particles & floaters ─────────────────── */

  function ensureParticles() {
    while (particles.length < CAP) particles.push({ on: false });
  }

  function spawn(x, y, vx, vy, life, size, color, kind, rot, vr) {
    ensureParticles();
    var p = particles[pCursor % CAP];
    pCursor++;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.age = 0; p.size = size; p.color = color;
    p.kind = kind || "dot"; p.rot = rot || 0; p.vr = vr || 0;
  }

  function burstCell(r, c, type, n) {
    var cx = (c + 0.5) * cell, cy = (r + 0.5) * cell;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 40 + Math.random() * 90;
      spawn(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp - 30,
        420 + Math.random() * 220, 3 + Math.random() * 4, COLORS[type], "dot", 0, 0);
    }
    spawn(cx, cy, 0, -40, 500, cell * 0.4, EMOJI[type], "emoji", 0, 0);
  }

  function ringBurst(r, c, color) {
    var cx = (c + 0.5) * cell, cy = (r + 0.5) * cell;
    for (var i = 0; i < 10; i++) {
      var a = (i / 10) * Math.PI * 2;
      spawn(cx, cy, Math.cos(a) * 130, Math.sin(a) * 130, 340, 3.5, color, "dot", 0, 0);
    }
  }

  function boxBreak(r, c) {
    var cx = (c + 0.5) * cell, cy = (r + 0.5) * cell;
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 120;
      spawn(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, 520, 4 + Math.random() * 4,
        i % 2 ? "#f5b942" : "#f06595", "conf", Math.random() * 6, (Math.random() - 0.5) * 12);
    }
  }

  function sparkleRain(now) {
    for (var i = 0; i < 24; i++) {
      spawn(Math.random() * cssW, Math.random() * cssH * 0.7,
        (Math.random() - 0.5) * 40, 30 + Math.random() * 60,
        600, 3, "#ffd43b", "dot", 0, 0);
    }
  }

  function floaterAt(step, now) {
    var x = cssW / 2, y = cssH * 0.3;
    if (step.tiles.length) {
      var sr = 0, sc = 0;
      for (var i = 0; i < step.tiles.length; i++) { sr += step.tiles[i].r; sc += step.tiles[i].c; }
      x = (sc / step.tiles.length + 0.5) * cell;
      y = (sr / step.tiles.length + 0.5) * cell;
    }
    floaters.push({ x: x, y: y, text: "+" + step.cakes + " 🎂", t0: now, life: 900, color: "#d98e04" });
  }

  function updateParticles(now) {
    var dt = 1 / 60;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.on) continue;
      p.age += dt * 1000;
      if (p.age >= p.life) { p.on = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      p.rot += p.vr * dt;
    }
    for (var f = floaters.length - 1; f >= 0; f--) {
      if (now - floaters[f].t0 > floaters[f].life) floaters.splice(f, 1);
    }
    for (var d = delayed.length - 1; d >= 0; d--) {
      if (now >= delayed[d].t) { var fn = delayed[d].fn; delayed.splice(d, 1); fn(now); }
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.on) continue;
      var a = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, a);
      if (p.kind === "emoji") {
        ctx.font = Math.round(p.size) + "px system-ui, 'Segoe UI Emoji', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.color, p.x, p.y);
      } else if (p.kind === "conf") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawFloaters(now) {
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var t = (now - f.t0) / f.life;
      var yy = f.y - t * 46;
      ctx.globalAlpha = 1 - Math.pow(t, 2.2);
      ctx.font = "800 " + Math.round(cell * 0.42) + "px 'Baloo 2', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(f.text, f.x, yy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, yy);
      ctx.globalAlpha = 1;
    }
  }

  /* ── input ────────────────────────────────── */

  function bindInput() {
    var down = null;
    function cellAt(ev) {
      var rect = canvas.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var y = ev.clientY - rect.top;
      var c = Math.floor(x / (rect.width / cols));
      var r = Math.floor(y / (rect.height / rows));
      if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
      return { r: r, c: c };
    }
    canvas.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      down = { cell: cellAt(ev), x: ev.clientX, y: ev.clientY };
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!down || !down.cell || !inputCb) return;
      var dx = ev.clientX - down.x, dy = ev.clientY - down.y;
      var threshold = Math.max(18, (canvas.getBoundingClientRect().width / cols) * 0.4);
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
      var dir;
      if (Math.abs(dx) > Math.abs(dy)) dir = { dr: 0, dc: dx > 0 ? 1 : -1 };
      else dir = { dr: dy > 0 ? 1 : -1, dc: 0 };
      var to = { r: down.cell.r + dir.dr, c: down.cell.c + dir.dc };
      var from = down.cell;
      down = null;
      inputCb({ type: "swipe", from: from, to: to });
    });
    function up(ev) {
      if (!down) return;
      var cellHit = down.cell;
      down = null;
      if (!cellHit || !inputCb) return;
      inputCb({ type: "tap", cell: cellHit });
    }
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", function () { down = null; });
  }

  /* ── public API ───────────────────────────── */

  var Render = {
    init: function (boardCanvas, fxCanvas) {
      canvas = boardCanvas;
      ctx = canvas.getContext("2d");
      fx = fxCanvas || null;
      bindInput();
      window.addEventListener("resize", function () {
        if (stateRef) { resize(); }
      });
      start();
    },

    setBoard: setBoard,

    playSteps: function (steps, opts) {
      opts = opts || {};
      steps.forEach(function (st, i) {
        if (opts.onStep) {
          st._onStart = function () { opts.onStep(st); };
        }
        st._onDone = i === steps.length - 1 ? function () {
          if (opts.onDone) opts.onDone();
        } : null;
        queue.push(st);
      });
      if (!steps.length && opts.onDone) opts.onDone();
      start();
    },

    isBusy: function () { return !!current || queue.length > 0; },

    setInput: function (cb) { inputCb = cb; },

    setSelection: function (pos) { selection = pos; },

    setHint: function (h) {
      hint = h ? { cells: h.match || [], a: h.a, b: h.b, t0: 0 } : null;
    },

    setHammerMode: function (on) { hammerMode = !!on; },

    state: function () { return stateRef; },

    // fullscreen fx-canvas helpers (menus / win / streak)
    burstCenter: function (n) {
      if (!fx) return;
      var g = fx.getContext("2d");
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (fx.width !== window.innerWidth * dpr) {
        fx.width = window.innerWidth * dpr;
        fx.height = window.innerHeight * dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      confettiBurst(fx, g, n || 90);
    },

    confettiOn: function (cv, ms) {
      if (!cv) return;
      var g = cv.getContext("2d");
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = cv.clientWidth || 320, h = cv.clientHeight || 300;
      cv.width = w * dpr; cv.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var bits = [];
      var palette = ["#ff5d8f", "#ffd43b", "#f06595", "#69db7c", "#74c0fc", "#fff"];
      var t0 = performance.now();
      function spawnBits(n) {
        for (var i = 0; i < n; i++) {
          bits.push({
            x: Math.random() * w, y: -10 - Math.random() * h * 0.4,
            vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 120,
            w: 5 + Math.random() * 6, h: 8 + Math.random() * 7,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8,
            color: palette[(Math.random() * palette.length) | 0], life: 0
          });
        }
      }
      spawnBits(60);
      function loop(now) {
        var elapsed = now - t0;
        if (elapsed > ms) { g.clearRect(0, 0, w, h); return; }
        if (elapsed < ms * 0.55 && bits.length < 130 && Math.random() < 0.5) spawnBits(4);
        g.clearRect(0, 0, w, h);
        for (var i = 0; i < bits.length; i++) {
          var b = bits[i];
          b.x += b.vx / 60 * 16;
          b.y += b.vy / 60 * 16;
          b.vy += 22 / 60 * 16;
          b.rot += b.vr / 60 * 16;
          if (b.y > h + 20) { b.y = -15; b.x = Math.random() * w; b.vy = 60 + Math.random() * 90; }
          g.save();
          g.translate(b.x, b.y);
          g.rotate(b.rot);
          g.fillStyle = b.color;
          g.globalAlpha = 0.92;
          g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
          g.restore();
        }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    }
  };

  function confettiBurst(g, ctxg, n) {
    var palette = ["#ff5d8f", "#ffd43b", "#f06595", "#69db7c", "#74c0fc"];
    var W = window.innerWidth, H = window.innerHeight;
    for (var i = 0; i < n; i++) {
      ensureParticles2(ctxg, W, H, palette);
    }
    // draw once via one-shot animation on fx
    var t0 = performance.now();
    (function anim(now) {
      var dt = (now - t0) / 1000; t0 = now;
      ctxg.clearRect(0, 0, W, H);
      var alive = false;
      for (var i = 0; i < fxBits.length; i++) {
        var b = fxBits[i];
        if (!b.on) continue;
        alive = true;
        b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 420 * dt; b.rot += b.vr * dt;
        if (b.y > H + 30) { b.on = false; continue; }
        ctxg.save();
        ctxg.translate(b.x, b.y);
        ctxg.rotate(b.rot);
        ctxg.fillStyle = b.color;
        ctxg.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctxg.restore();
      }
      if (alive) requestAnimationFrame(anim);
      else ctxg.clearRect(0, 0, W, H);
    })(t0);
  }

  var fxBits = [];
  function ensureParticles2(ctxg, W, H, palette) {
    if (fxBits.length > 240) fxBits.shift();
    fxBits.push({
      on: true,
      x: W / 2 + (Math.random() - 0.5) * W * 0.5,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 520,
      vy: -200 - Math.random() * 330,
      w: 6 + Math.random() * 7, h: 9 + Math.random() * 7,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
      color: palette[(Math.random() * palette.length) | 0]
    });
  }

  TGL.Render = Render;
})();
