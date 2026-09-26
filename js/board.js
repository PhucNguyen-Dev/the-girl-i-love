/* board.js — pure match-3 engine. No DOM. Testable under node. */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  var TILE_COUNT = 6;

  /* ── helpers ────────────────────────────────── */

  function inBounds(s, r, c) {
    return r >= 0 && r < s.h && c >= 0 && c < s.w;
  }

  function key(r, c) { return r * 1000 + c; }
  function unkey(k) { return { r: Math.floor(k / 1000), c: k % 1000 }; }

  function randInt(n) { return Math.floor(Math.random() * n); }

  /* ── creation ───────────────────────────────── */

  function create(level, opts) {
    opts = opts || {};
    var s = {
      w: level.w,
      h: level.h,
      level: level,
      grid: [],
      nextId: 1,
      movesLeft: level.moves + (opts.extraMoves || 0),
      startMoves: level.moves + (opts.extraMoves || 0),
      cakes: 0,
      stats: { cleared: 0, byType: [0,0,0,0,0,0], blockersBroken: 0, blockersTotal: 0 }
    };

    for (var r = 0; r < s.h; r++) {
      s.grid[r] = [];
      for (var c = 0; c < s.w; c++) s.grid[r][c] = { blocker: 0, tile: null };
    }

    // blockers from level data
    (level.blockers || []).forEach(function (b) {
      if (inBounds(s, b[0], b[1])) {
        s.grid[b[0]][b[1]].blocker = b[2];
        s.stats.blockersTotal++;
      }
    });

    fillWithoutMatches(s);

    // pre-level boosters
    if (opts.startBomb) {
      var p1 = randomCell(s, true);
      if (p1) s.grid[p1.r][p1.c].tile.special = "bomb";
    }
    if (opts.rainbowInHand) {
      var p2 = randomCell(s, true);
      if (p2) s.grid[p2.r][p2.c].tile.special = "rainbow";
    }

    if (!hasAnyMove(s)) fillWithoutMatches(s);
    return s;
  }

  function randomCell(s, center) {
    var tries = 0;
    while (tries++ < 60) {
      var r = center ? 2 + randInt(s.h - 4) : randInt(s.h);
      var c = center ? 2 + randInt(s.w - 4) : randInt(s.w);
      r = Math.max(0, Math.min(s.h - 1, r));
      c = Math.max(0, Math.min(s.w - 1, c));
      return { r: r, c: c };
    }
    return null;
  }

  function newTile(s, type) {
    return { id: s.nextId++, type: type, special: null };
  }

  function pickTypeAvoiding(s, r, c) {
    var t;
    var guard = 0;
    do {
      t = randInt(TILE_COUNT);
      guard++;
    } while (guard < 40 && (
      (c >= 2 && s.grid[r][c-1].tile && s.grid[r][c-2].tile &&
        s.grid[r][c-1].tile.type === t && s.grid[r][c-2].tile.type === t) ||
      (r >= 2 && s.grid[r-1][c].tile && s.grid[r-2][c].tile &&
        s.grid[r-1][c].tile.type === t && s.grid[r-2][c].tile.type === t)
    ));
    return t;
  }

  function fillWithoutMatches(s) {
    for (var r = 0; r < s.h; r++) {
      for (var c = 0; c < s.w; c++) {
        if (!s.grid[r][c].tile) s.grid[r][c].tile = newTile(s, pickTypeAvoiding(s, r, c));
      }
    }
    var guard = 0;
    while (!hasAnyMove(s) && guard++ < 30) fillOnceReseed(s);
  }

  function fillOnceReseed(s) {
    // re-roll random subset until a move exists
    for (var r = 0; r < s.h; r++) {
      for (var c = 0; c < s.w; c++) {
        if (Math.random() < 0.5) s.grid[r][c].tile = newTile(s, pickTypeAvoiding(s, r, c));
      }
    }
    if (findMatchGroups(s).length) fillWithoutMatches(s);
  }

  /* ── match detection ────────────────────────── */

  function isMatchable(tile) {
    return tile && tile.special !== "rainbow";
  }

  function findMatchGroups(s) {
    var groups = {}; // key -> true
    var runs = [];

    for (var r = 0; r < s.h; r++) {
      var c = 0;
      while (c < s.w) {
        var t = s.grid[r][c].tile;
        if (!isMatchable(t)) { c++; continue; }
        var start = c;
        while (c + 1 < s.w && isMatchable(s.grid[r][c+1].tile) &&
               s.grid[r][c+1].tile.type === t.type) c++;
        if (c - start + 1 >= 3) {
          var cells = [];
          for (var i = start; i <= c; i++) {
            groups[key(r, i)] = true;
            cells.push({ r: r, c: i });
          }
          runs.push({ cells: cells, dir: "h" });
        }
        c++;
      }
    }

    for (var col = 0; col < s.w; col++) {
      var row = 0;
      while (row < s.h) {
        var t2 = s.grid[row][col].tile;
        if (!isMatchable(t2)) { row++; continue; }
        var startR = row;
        while (row + 1 < s.h && isMatchable(s.grid[row+1][col].tile) &&
               s.grid[row+1][col].tile.type === t2.type) row++;
        if (row - startR + 1 >= 3) {
          var cells2 = [];
          for (var j = startR; j <= row; j++) {
            groups[key(j, col)] = true;
            cells2.push({ r: j, c: col });
          }
          runs.push({ cells: cells2, dir: "v" });
        }
        row++;
      }
    }

    if (!runs.length) return [];

    // group matched cells into connected components
    var comps = [];
    var seen = {};
    var k, kk;
    for (k in groups) {
      kk = +k;
      if (seen[kk]) continue;
      var comp = [];
      var stack = [kk];
      seen[kk] = true;
      while (stack.length) {
        var cur = stack.pop();
        var p = unkey(cur);
        comp.push(p);
        var neigh = [[p.r-1,p.c],[p.r+1,p.c],[p.r,p.c-1],[p.r,p.c+1]];
        for (var n = 0; n < 4; n++) {
          var nr = neigh[n][0], nc = neigh[n][1];
          if (nr < 0 || nr >= s.h || nc < 0 || nc >= s.w) continue;
          var nk = key(nr, nc);
          if (groups[nk] && !seen[nk]) { seen[nk] = true; stack.push(nk); }
        }
      }
      comps.push(comp);
    }

    // attach runs to components for shape analysis
    comps.forEach(function (comp) {
      var set = {};
      comp.forEach(function (p) { set[key(p.r, p.c)] = true; });
      comp.runs = runs.filter(function (run) {
        return set[key(run.cells[0].r, run.cells[0].c)];
      });
    });

    return comps;
  }

  function analyzeComp(comp, swapPos) {
    var hRun = null, vRun = null, maxLen = 0, maxRun = null;
    comp.runs.forEach(function (run) {
      if (run.cells.length > maxLen) { maxLen = run.cells.length; maxRun = run; }
      if (run.dir === "h" && (!hRun || run.cells.length > hRun.cells.length)) hRun = run;
      if (run.dir === "v" && (!vRun || run.cells.length > vRun.cells.length)) vRun = run;
    });

    var special = null;
    if (maxLen >= 5) special = "rainbow";
    else if (hRun && vRun) special = "bomb";            // L / T shape
    else if (maxLen === 4) special = (maxRun.dir === "h" ? "rocketH" : "rocketV");

    var at = null;
    if (swapPos) {
      for (var i = 0; i < comp.length; i++) {
        if (comp[i].r === swapPos.r && comp[i].c === swapPos.c) { at = { r: swapPos.r, c: swapPos.c }; break; }
      }
    }
    if (!at && maxRun) at = maxRun.cells[Math.floor(maxRun.cells.length / 2)];
    if (!at && comp.length) at = comp[Math.floor(comp.length / 2)];

    return { special: special, at: at };
  }

  /* ── special effects ────────────────────────── */

  function mostCommonType(s) {
    var counts = [0,0,0,0,0,0];
    forEachTile(s, function (t) { if (t.special !== "rainbow") counts[t.type]++; });
    var best = 0;
    for (var i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
    return best;
  }

  function forEachTile(s, fn) {
    for (var r = 0; r < s.h; r++)
      for (var c = 0; c < s.w; c++)
        if (s.grid[r][c].tile) fn(s.grid[r][c].tile, r, c);
  }

  function specialSeed(s, pos, special) {
    var out = [];
    var r, c, i;
    if (special === "rocketH") {
      for (c = 0; c < s.w; c++) out.push({ r: pos.r, c: c });
    } else if (special === "rocketV") {
      for (r = 0; r < s.h; r++) out.push({ r: r, c: pos.c });
    } else if (special === "bomb") {
      for (r = pos.r - 1; r <= pos.r + 1; r++)
        for (c = pos.c - 1; c <= pos.c + 1; c++)
          if (inBounds(s, r, c)) out.push({ r: r, c: c });
    } else if (special === "rainbow") {
      var type = mostCommonType(s);
      forEachTile(s, function (t, rr, cc) { if (t.type === type) out.push({ r: rr, c: cc }); });
      out.push({ r: pos.r, c: pos.c });
    }
    return out;
  }

  function comboSeed(s, a, ta, b, tb) {
    var out = [];
    var r, c;
    function push(r0, c0) { if (inBounds(s, r0, c0)) out.push({ r: r0, c: c0 }); }

    var kinds = [ta.special, tb.special].filter(Boolean).sort().join("+");

    if (ta.special === "rainbow" && tb.special === "rainbow" ||
        kinds === "rainbow+rainbow") {
      forEachTile(s, function (t, rr, cc) { push(rr, cc); });
      return { seed: out, consumed: [a, b], cakes: 5 };
    }
    if (ta.special === "rainbow" || tb.special === "rainbow") {
      var other = ta.special === "rainbow" ? tb : ta;
      var posOther = ta.special === "rainbow" ? b : a;
      if (other.special === "rainbow") { /* handled above */ }
      else if (other.special) {
        // rainbow + line/bomb → grand slam (spec: all rows/columns)
        forEachTile(s, function (t, rr, cc) { push(rr, cc); });
        return { seed: out, consumed: [a, b], cakes: 5 };
      } else {
        // rainbow + plain tile → clear every tile of that type
        forEachTile(s, function (t, rr, cc) { if (t.type === other.type) push(rr, cc); });
        push(posOther.r, posOther.c);
        return { seed: out, consumed: [a, b], cakes: 3 };
      }
    }
    if (ta.special && tb.special) {
      var center = a;
      if (ta.special === "bomb" && tb.special === "bomb") {
        for (r = center.r - 2; r <= center.r + 2; r++)
          for (c = center.c - 2; c <= center.c + 2; c++) push(r, c);
      } else if ((ta.special === "rocketH" || ta.special === "rocketV") &&
                 (tb.special === "rocketH" || tb.special === "rocketV")) {
        push(a.r, a.c); push(b.r, b.c);
        for (c = 0; c < s.w; c++) push(a.r, c);
        for (r = 0; r < s.h; r++) push(a.c === b.c ? r : a.r, a.c);
        for (r = 0; r < s.h; r++) push(r, b.c);
        for (c = 0; c < s.w; c++) push(b.r, c);
      } else {
        // bomb + rocket → 3 rows × 3 cols cross
        push(a.r, a.c); push(b.r, b.c);
        for (c = 0; c < s.w; c++) for (r = center.r - 1; r <= center.r + 1; r++) push(r, c);
        for (r = 0; r < s.h; r++) for (c = center.c - 1; c <= center.c + 1; c++) push(r, c);
      }
      return { seed: out, consumed: [a, b], cakes: 4 };
    }
    return null;
  }

  /* ── clearing with special chain ────────────── */

  function expandClear(s, seed, preConsumed) {
    var visited = {};
    var consumed = {};
    var triggered = [];
    var queue = [];

    (preConsumed || []).forEach(function (p) { consumed[key(p.r, p.c)] = true; });
    seed.forEach(function (p) { queue.push(p); });

    while (queue.length) {
      var p = queue.shift();
      var k = key(p.r, p.c);
      if (visited[k]) continue;
      if (!inBounds(s, p.r, p.c)) continue;
      visited[k] = true;
      if (consumed[k]) continue;

      var cell = s.grid[p.r][p.c];
      if (cell.tile && cell.tile.special) {
        triggered.push({ r: p.r, c: p.c, special: cell.tile.special });
        var extra = specialSeed(s, p, cell.tile.special);
        for (var i = 0; i < extra.length; i++) queue.push(extra[i]);
      }
    }

    var positions = [];
    for (var kk in visited) positions.push(unkey(+kk));
    return { positions: positions, triggered: triggered };
  }

  /* ── fall & refill ──────────────────────────── */

  function applyFall(s) {
    var moves = [];
    var spawns = [];

    for (var c = 0; c < s.w; c++) {
      var writeR = s.h - 1;
      for (var r = s.h - 1; r >= 0; r--) {
        var tile = s.grid[r][c].tile;
        if (!tile) continue;
        if (r !== writeR) {
          s.grid[writeR][c].tile = tile;
          s.grid[r][c].tile = null;
          moves.push({ id: tile.id, c: c, fromR: r, toR: writeR });
        }
        writeR--;
      }
      // spawn into remaining empties from top
      for (var rr = writeR; rr >= 0; rr--) {
        var t = newTile(s, randInt(TILE_COUNT));
        s.grid[rr][c].tile = t;
        spawns.push({ id: t.id, type: t.type, special: null, c: c, toR: rr });
      }
    }
    return { moves: moves, spawns: spawns };
  }

  /* ── one full cascade resolution ────────────── */

  function resolve(s, firstSeed, firstInfo) {
    var steps = [];
    var seed = firstSeed || null;
    var info = firstInfo || null;

    for (var guard = 0; guard < 60; guard++) {
      var comps, creations, baseCakes;

      if (seed) {
        // first wave seeded externally (combo / rainbow / hammer) — no match creation
        var consumed = info ? info.consumed : null;
        var seedCakes = info ? (info.cakes || 0) : 0;
        var exSeed = expandClear(s, seed, consumed);
        var wave = applyClear(s, exSeed, [], seedCakes, steps);
        seed = null; info = null;
        if (!wave.anyCleared) break;
        continue;
      }

      comps = findMatchGroups(s);
      if (!comps.length) break;

      creations = [];
      baseCakes = 0;
      var matchedCells = [];

      comps.forEach(function (comp) {
        var info = analyzeComp(comp, s.lastSwapPos);
        var t = s.grid[comp[0].r][comp[0].c].tile;
        baseCakes += info.special ? 2 : 1;
        creations.push({ at: info.at, special: info.special, type: t.type });
        comp.forEach(function (p) { matchedCells.push(p); });
      });

      var ex = expandClear(s, matchedCells, null);
      var triggerCakes = 0;
      ex.triggered.forEach(function (tg) {
        triggerCakes += (tg.special === "rainbow") ? 3 : 1;
      });
      applyClear(s, ex, creations, baseCakes + triggerCakes, steps);
    }

    return steps;
  }

  function applyClear(s, ex, creations, cakes, steps) {
    var tiles = [];
    var blockers = [];
    var brokenAny = false;
    var i, p;

    for (i = 0; i < ex.positions.length; i++) {
      p = ex.positions[i];
      var cell = s.grid[p.r][p.c];
      if (cell.tile) {
        var t = cell.tile;
        tiles.push({ r: p.r, c: p.c, id: t.id, type: t.type, special: t.special });
        s.stats.cleared++;
        s.stats.byType[t.type]++;
        cell.tile = null;
      }
      if (cell.blocker > 0) {
        cell.blocker--;
        blockers.push({ r: p.r, c: p.c, hp: cell.blocker });
        if (cell.blocker === 0) { s.stats.blockersBroken++; brokenAny = true; }
      }
    }

    // place created specials (they replace their cleared cell)
    var created = [];
    for (i = 0; i < creations.length; i++) {
      var cr = creations[i];
      if (!cr.special || !cr.at) continue;
      if (!inBounds(s, cr.at.r, cr.at.c)) continue;
      var nt = newTile(s, cr.type);
      nt.special = cr.special;
      s.grid[cr.at.r][cr.at.c].tile = nt;
      created.push({ r: cr.at.r, c: cr.at.c, id: nt.id, type: cr.type, special: cr.special });
    }

    s.cakes += cakes;

    steps.push({
      type: "clear",
      tiles: tiles,
      triggered: ex.triggered,
      created: created,
      blockers: blockers,
      cakes: cakes
    });

    var fall = applyFall(s);
    steps.push({ type: "fall", moves: fall.moves, spawns: fall.spawns });

    return { anyCleared: tiles.length > 0 || created.length > 0 || brokenAny };
  }

  /* ── validity / deadlock ────────────────────── */

  function swapTiles(s, a, b) {
    var t = s.grid[a.r][a.c].tile;
    s.grid[a.r][a.c].tile = s.grid[b.r][b.c].tile;
    s.grid[b.r][b.c].tile = t;
  }

  function isComboSwap(ta, tb) {
    return ta && tb && ta.special && tb.special;
  }

  function wouldMatch(s, a, b) {
    swapTiles(s, a, b);
    var ok = findMatchGroups(s).length > 0;
    swapTiles(s, a, b);
    return ok;
  }

  function isAdjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function hasAnyMove(s) {
    for (var r = 0; r < s.h; r++) {
      for (var c = 0; c < s.w; c++) {
        var a = { r: r, c: c };
        var dirs = [[0,1],[1,0]];
        for (var d = 0; d < 2; d++) {
          var rr = r + dirs[d][0], cc = c + dirs[d][1];
          if (rr >= s.h || cc >= s.w) continue;
          var b = { r: rr, c: cc };
          var ta = s.grid[a.r][a.c].tile, tb = s.grid[b.r][b.c].tile;
          if (!ta || !tb) continue;
          if (ta.special === "rainbow" || tb.special === "rainbow") return true;
          if (isComboSwap(ta, tb)) return true;
          if (wouldMatch(s, a, b)) return true;
        }
      }
    }
    return false;
  }

  function reshuffle(s) {
    var tiles = [];
    var positions = [];
    forEachTile(s, function (t, r, c) { tiles.push(t); positions.push({ r: r, c: c }); });

    var guard = 0;
    var remap;
    do {
      // Fisher–Yates on tiles
      for (var i = tiles.length - 1; i > 0; i--) {
        var j = randInt(i + 1);
        var tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp;
      }
      positions.forEach(function (p, idx) { s.grid[p.r][p.c].tile = tiles[idx]; });
      remap = positions.map(function (p, idx) {
        return { id: tiles[idx].id, r: p.r, c: p.c };
      });
      guard++;
    } while ((findMatchGroups(s).length > 0 || !hasAnyMove(s)) && guard < 60);

    if (findMatchGroups(s).length > 0 || !hasAnyMove(s)) {
      // ultimate fallback: fresh types across the whole board
      positions.forEach(function (p) {
        s.grid[p.r][p.c].tile = newTile(s, pickTypeAvoiding(s, p.r, p.c));
      });
      if (!hasAnyMove(s)) fillWithoutMatches(s);
      remap = [];
      forEachTile(s, function (t, r, c) { remap.push({ id: t.id, r: r, c: c }); });
    }
    return remap;
  }

  /* ── public: player actions ─────────────────── */

  function swap(state, a, b) {
    if (!inBounds(state, a.r, a.c) || !inBounds(state, b.r, b.c) || !isAdjacent(a, b)) {
      return { valid: false, steps: [] };
    }
    var ta = state.grid[a.r][a.c].tile;
    var tb = state.grid[b.r][b.c].tile;
    if (!ta || !tb) return { valid: false, steps: [] };

    var combo = isComboSwap(ta, tb) ? comboSeed(state, a, ta, b, tb) : null;
    var rainbowPlain = null;
    if (!combo && (ta.special === "rainbow" || tb.special === "rainbow")) {
      var rPos = ta.special === "rainbow" ? a : b;
      var oTile = ta.special === "rainbow" ? tb : ta;
      var oPos = ta.special === "rainbow" ? b : a;
      rainbowPlain = { pos: rPos, type: oTile.type, otherPos: oPos, otherTile: oTile };
    }
    var matches = !combo && !rainbowPlain ? wouldMatch(state, a, b) : false;

    if (!combo && !rainbowPlain && !matches) {
      return {
        valid: false,
        steps: [{ type: "invalidSwap", a: a, b: b }]
      };
    }

    // commit the swap
    swapTiles(state, a, b);
    state.movesLeft--;
    state.lastSwapPos = b; // creation prefers the swapped-into cell

    var steps = [{ type: "swap", a: a, b: b }];
    var seed = null, info = null;

    if (combo) {
      seed = combo.seed;
      info = combo;
    } else if (rainbowPlain) {
      // rainbow now sits at b (or a), plain tile at the other; clear the plain tile's type
      var rainbowPos = (state.grid[a.r][a.c].tile.special === "rainbow") ? a : b;
      var seedP = [];
      var targetType = rainbowPlain.type;
      forEachTile(state, function (t, r, c) {
        if (t.type === targetType && !(r === rainbowPos.r && c === rainbowPos.c)) seedP.push({ r: r, c: c });
      });
      seedP.push(rainbowPos);
      seed = seedP;
      info = { consumed: [rainbowPos], cakes: 2 };
    }

    var cascade = resolve(state, seed, info);
    steps = steps.concat(cascade);
    steps = postSettle(state, steps);

    return { valid: true, steps: steps, won: objectiveDone(state), lost: isLost(state) };
  }

  function postSettle(state, steps) {
    if (!hasAnyMove(state)) {
      var remap = reshuffle(state);
      steps.push({ type: "shuffle", remap: remap });
    }
    return steps;
  }

  function objectiveDone(s) {
    var o = s.level.objective;
    if (o.type === "collect") return s.stats.byType[o.tile] >= o.count;
    if (o.type === "clear") return s.stats.cleared >= o.count;
    if (o.type === "blockers") return s.stats.blockersTotal > 0 &&
      s.stats.blockersBroken >= s.stats.blockersTotal;
    return false;
  }

  function isLost(s) {
    return s.movesLeft <= 0 && !objectiveDone(s);
  }

  function progressText(s) {
    var o = s.level.objective;
    var L = TGL.Levels;
    if (o.type === "collect") {
      return L.tiles[o.tile] + " " + Math.min(s.stats.byType[o.tile], o.count) + "/" + o.count;
    }
    if (o.type === "clear") {
      return "🧩 " + Math.min(s.stats.cleared, o.count) + "/" + o.count;
    }
    var alive = s.stats.blockersTotal - s.stats.blockersBroken;
    return "🎁 " + alive + " left";
  }

  /* hammer booster: clear one tile (counts to objective) */
  function hammer(state, pos) {
    if (!inBounds(state, pos.r, pos.c) || !state.grid[pos.r][pos.c].tile) return null;
    var steps = resolve(state, [{ r: pos.r, c: pos.c }], null);
    steps = postSettle(state, steps);
    return { valid: true, steps: steps, won: objectiveDone(state), lost: isLost(state) };
  }

  function starsFor(s) {
    var frac = s.startMoves > 0 ? s.movesLeft / s.startMoves : 0;
    if (frac >= TGL.Levels.starMovesLeft.three) return 3;
    if (frac >= TGL.Levels.starMovesLeft.two) return 2;
    return 1;
  }

  /* shuffle booster / manual reshuffle */
  function shuffleBoard(state) {
    var remap = reshuffle(state);
    return {
      valid: true,
      steps: [{ type: "shuffle", remap: remap }],
      won: objectiveDone(state),
      lost: isLost(state)
    };
  }

  TGL.Board = {
    create: create,
    swap: swap,
    hammer: hammer,
    shuffle: shuffleBoard,
    objectiveDone: objectiveDone,
    isLost: isLost,
    progressText: progressText,
    starsFor: starsFor,
    hasAnyMove: hasAnyMove,
    _internal: {
      findMatchGroups: findMatchGroups,
      expandClear: expandClear,
      applyFall: applyFall,
      reshuffle: reshuffle
    }
  };
})();
