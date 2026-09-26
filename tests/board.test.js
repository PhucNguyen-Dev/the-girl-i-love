/* tests/board.test.js — run with: node --test tests/ */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
for (const f of ["js/levels.js", "js/board.js"]) {
  (0, eval)(fs.readFileSync(path.join(root, f), "utf8"));
}
const TGL = globalThis.TGL;
const Board = TGL.Board;
const Levels = TGL.Levels;

/*
 * Base pattern: type = (7r + 11c) % 6.
 * Consecutive cells (any direction) always differ → no matches ever form
 * from this pattern alone, and a single random refill tile can never
 * complete a run of 3 (its two horizontal neighbours differ from each other,
 * vertical neighbours always differ). Makes cascade outcomes deterministic.
 */
function fillBase(state) {
  for (let r = 0; r < state.h; r++)
    for (let c = 0; c < state.w; c++)
      setT(state, r, c, (7 * r + 11 * c) % 6);
}

function setT(state, r, c, type, special) {
  state.grid[r][c].tile = { id: state.nextId++, type, special: special || null };
}

function gridIds(state) {
  const out = [];
  for (let r = 0; r < state.h; r++)
    for (let c = 0; c < state.w; c++)
      out.push(state.grid[r][c].tile ? state.grid[r][c].tile.id : null);
  return out;
}

function findSpecials(state) {
  const out = [];
  for (let r = 0; r < state.h; r++)
    for (let c = 0; c < state.w; c++)
      if (state.grid[r][c].tile && state.grid[r][c].tile.special)
        out.push({ r, c, special: state.grid[r][c].tile.special });
  return out;
}

function createdIn(res, special) {
  return res.steps.some(st =>
    st.type === "clear" && st.created.some(cr => cr.special === special));
}

function assertBoardSolid(state) {
  for (let r = 0; r < state.h; r++)
    for (let c = 0; c < state.w; c++)
      assert.ok(state.grid[r][c].tile, `missing tile at ${r},${c}`);
}

/* ── creation ─────────────────────────────── */

test("create: full board, no pre-matches, has a move, unique ids", () => {
  for (let n = 1; n <= 15; n++) {
    const s = Board.create(Levels.get(n));
    assertBoardSolid(s);
    assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, `level ${n} has pre-matches`);
    assert.ok(Board.hasAnyMove(s), `level ${n} has no moves`);
    const ids = [];
    for (const row of s.grid) for (const cell of row) ids.push(cell.tile.id);
    assert.strictEqual(new Set(ids).size, 49, `level ${n} duplicate ids`);
  }
});

test("create: blockers registered from level data", () => {
  assert.strictEqual(Board.create(Levels.get(4)).stats.blockersTotal, 6);
  assert.strictEqual(Board.create(Levels.get(1)).stats.blockersTotal, 0);
  assert.strictEqual(Board.create(Levels.get(15)).stats.blockersTotal, 12);
});

test("create: boosters applied", () => {
  assert.strictEqual(Board.create(Levels.get(5)).movesLeft, 24);
  const boosted = Board.create(Levels.get(5), { extraMoves: 5, startBomb: true, rainbowInHand: true });
  assert.strictEqual(boosted.movesLeft, 29);
  const specs = findSpecials(boosted);
  assert.ok(specs.some(x => x.special === "bomb"), "start-bomb missing");
  assert.ok(specs.some(x => x.special === "rainbow"), "rainbow-in-hand missing");
});

/* ── swapping ─────────────────────────────── */

test("valid swap: match-3 clears, falls, board solid, move consumed", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  setT(s, 0, 2, 0);                    // base row0: 0 5 4… → force 0 5 0
  // swap (0,1)[5] with (1,1)[0] → row0 becomes 0 0 0
  const res = Board.swap(s, { r: 0, c: 1 }, { r: 1, c: 1 });

  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.steps[0].type, "swap");
  assert.ok(res.steps.some(st => st.type === "clear" && st.tiles.length >= 3));
  assert.strictEqual(s.movesLeft, 24);
  assert.ok(s.stats.cleared >= 3);
  assert.ok(s.stats.byType[0] >= 3);
  assertBoardSolid(s);
  assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, "not settled");
});

test("invalid swap: reverts, no move consumed, grid unchanged", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  const before = gridIds(s);
  const res = Board.swap(s, { r: 0, c: 0 }, { r: 0, c: 1 }); // 0 ↔ 5, no match
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.steps[0].type, "invalidSwap");
  assert.deepStrictEqual(gridIds(s), before);
  assert.strictEqual(s.movesLeft, 25);
});

test("non-adjacent swap rejected", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  assert.strictEqual(Board.swap(s, { r: 0, c: 0 }, { r: 0, c: 2 }).valid, false);
});

/* ── special creation ─────────────────────── */

test("match-4 creates a rocket", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  // row0 base: 0 5 4 3 2 1 0 → force (0,2)=(0,3)=0; swap brings 0 into (0,1)
  setT(s, 0, 2, 0);
  setT(s, 0, 3, 0);
  assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, "setup pre-match");

  const res = Board.swap(s, { r: 0, c: 1 }, { r: 1, c: 1 }); // (1,1) base = 0
  assert.strictEqual(res.valid, true);
  assert.ok(createdIn(res, "rocketH") || createdIn(res, "rocketV"),
    "no rocket created");
});

test("line-5 creates a rainbow", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  // row0 base: 0 5 4 3 2 1 0 → force (0,0)(0,1)(0,3)(0,4)=2; (0,2)=4 stays ≠2
  setT(s, 0, 0, 2); setT(s, 0, 1, 2); setT(s, 0, 3, 2); setT(s, 0, 4, 2);
  setT(s, 1, 2, 2); // swap source (base 5)
  assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, "setup pre-match");

  const res = Board.swap(s, { r: 0, c: 2 }, { r: 1, c: 2 });
  assert.strictEqual(res.valid, true);
  assert.ok(createdIn(res, "rainbow"), "no rainbow created");
});

test("L-shape creates a bomb", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  // corner (1,1)=5 swapped with (1,0)=0 → both arms complete
  setT(s, 1, 0, 0);
  setT(s, 1, 1, 5);
  setT(s, 1, 2, 0); setT(s, 1, 3, 0);
  setT(s, 2, 1, 0); setT(s, 3, 1, 0);
  assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, "setup pre-match");

  const res = Board.swap(s, { r: 1, c: 1 }, { r: 1, c: 0 });
  assert.strictEqual(res.valid, true);
  assert.ok(createdIn(res, "bomb"), "no bomb created");
});

/* ── special activation & combos ──────────── */

test("rocket fires its column when part of a match", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  // rocket at (1,0) type 1; swap brings 1 into (1,1) → run includes rocket
  setT(s, 1, 0, 1, "rocketV");
  setT(s, 1, 2, 1);
  setT(s, 0, 1, 1);
  assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, "setup pre-match");

  const res = Board.swap(s, { r: 1, c: 1 }, { r: 0, c: 1 });
  assert.strictEqual(res.valid, true);

  const firstClear = res.steps.find(st => st.type === "clear");
  assert.ok(firstClear.triggered.some(t => t.special === "rocketV"), "rocket not triggered");
  const col0 = firstClear.tiles.filter(t => t.c === 0).length;
  assert.strictEqual(col0, 7, `column should be cleared (got ${col0})`);
  assert.ok(s.stats.cleared >= 9, "column + match tiles");
});

test("rainbow + plain tile clears every tile of that type", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  setT(s, 0, 0, 0, "rainbow");
  const partnerType = s.grid[0][1].tile.type;
  let count = 0;
  for (const row of s.grid) for (const cell of row)
    if (cell.tile.type === partnerType && cell.tile.special !== "rainbow") count++;
  assert.ok(count > 3, "setup: not enough partner tiles");

  const res = Board.swap(s, { r: 0, c: 0 }, { r: 0, c: 1 });
  assert.strictEqual(res.valid, true);
  assert.ok(s.stats.byType[partnerType] >= count,
    `cleared ${s.stats.byType[partnerType]} of ${count}`);
});

test("rainbow + rocket does a grand slam", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  setT(s, 0, 0, 0, "rainbow");
  setT(s, 0, 1, 1, "rocketH");
  const before = s.stats.cleared;
  const res = Board.swap(s, { r: 0, c: 0 }, { r: 0, c: 1 });
  assert.strictEqual(res.valid, true);
  assert.ok(s.stats.cleared - before >= 40, "expected near-board clear");
});

test("bomb + bomb clears a 5x5 area", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  setT(s, 3, 3, 0, "bomb");
  setT(s, 3, 4, 1, "bomb");
  assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, "setup pre-match");
  const before = s.stats.cleared;
  const res = Board.swap(s, { r: 3, c: 3 }, { r: 3, c: 4 });
  assert.strictEqual(res.valid, true);
  assert.ok(s.stats.cleared - before >= 20, "5×5 should clear ≥20");
});

/* ── blockers ─────────────────────────────── */

test("hammer damages a blocker twice until it breaks", () => {
  const s = Board.create(Levels.get(4));
  fillBase(s); // deterministic: no cascade can form from refills
  assert.strictEqual(s.grid[2][1].blocker, 2);

  const r1 = Board.hammer(s, { r: 2, c: 1 });
  assert.ok(r1 && r1.valid);
  assert.strictEqual(s.grid[2][1].blocker, 1);
  assert.strictEqual(s.stats.blockersBroken, 0);

  const r2 = Board.hammer(s, { r: 2, c: 1 });
  assert.ok(r2 && r2.valid);
  assert.strictEqual(s.grid[2][1].blocker, 0);
  assert.strictEqual(s.stats.blockersBroken, 1);
  assertBoardSolid(s);
});

test("blockers objective completes when all broken", () => {
  const s = Board.create(Levels.get(4));
  assert.strictEqual(Board.objectiveDone(s), false);
  s.stats.blockersBroken = s.stats.blockersTotal;
  assert.strictEqual(Board.objectiveDone(s), true);
});

/* ── objectives & stars ───────────────────── */

test("collect / clear objectives map correctly", () => {
  const s1 = Board.create(Levels.get(1));
  assert.strictEqual(Board.objectiveDone(s1), false);
  s1.stats.byType[0] = 10;
  assert.strictEqual(Board.objectiveDone(s1), true);
  assert.strictEqual(Board.progressText(s1), "💗 10/10");

  const s2 = Board.create(Levels.get(2));
  s2.stats.cleared = 40;
  assert.strictEqual(Board.objectiveDone(s2), true);

  const s9 = Board.create(Levels.get(9));
  s9.stats.byType[5] = 11;
  assert.strictEqual(Board.progressText(s9), "💍 11/12");
});

test("stars depend on moves left", () => {
  const s = Board.create(Levels.get(1)); // 25 moves
  s.movesLeft = 25; assert.strictEqual(Board.starsFor(s), 3);
  s.movesLeft = 9;  assert.strictEqual(Board.starsFor(s), 3);
  s.movesLeft = 8;  assert.strictEqual(Board.starsFor(s), 2);
  s.movesLeft = 4;  assert.strictEqual(Board.starsFor(s), 2);
  s.movesLeft = 3;  assert.strictEqual(Board.starsFor(s), 1);
  s.movesLeft = 0;  assert.strictEqual(Board.starsFor(s), 1);
});

test("loss detection: moves exhausted with objective unmet", () => {
  const s = Board.create(Levels.get(1));
  s.movesLeft = 1;
  assert.strictEqual(Board.isLost(s), false);
  s.movesLeft = 0;
  assert.strictEqual(Board.isLost(s), true);
  s.stats.byType[0] = 10;
  assert.strictEqual(Board.isLost(s), false);
});

/* ── deadlock ─────────────────────────────── */

test("deadlock pattern detected; reshuffle fixes it", () => {
  // brute-force-verified no-move pattern: no swap can ever create 3-in-a-row
  const s = Board.create(Levels.get(1));
  for (let r = 0; r < s.h; r++)
    for (let c = 0; c < s.w; c++)
      setT(s, r, c, (Math.floor(r / 2) + Math.floor(c / 2) + 2 * (r % 2) + 2 * (c % 2)) % 3);

  assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, "pattern has matches");
  assert.strictEqual(Board.hasAnyMove(s), false, "pattern should be deadlocked");

  Board._internal.reshuffle(s);
  assertBoardSolid(s);
  assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, "reshuffle left matches");
  assert.ok(Board.hasAnyMove(s), "reshuffle left no moves");
});

/* ── hints ─────────────────────────────────── */

function swapCells(state, a, b) {
  const t = state.grid[a.r][a.c].tile;
  state.grid[a.r][a.c].tile = state.grid[b.r][b.c].tile;
  state.grid[b.r][b.c].tile = t;
}

test("findHint: valid swap, clears 3+, never mutates the board", () => {
  for (let n = 1; n <= 15; n++) {
    for (let trial = 0; trial < 5; trial++) {
      const s = Board.create(Levels.get(n));
      const before = gridIds(s);
      const hint = Board.findHint(s);
      assert.ok(hint, `level ${n} trial ${trial}: no hint found`);
      assert.deepStrictEqual(gridIds(s), before, "findHint mutated the board");
      assert.strictEqual(
        Math.abs(hint.a.r - hint.b.r) + Math.abs(hint.a.c - hint.b.c), 1,
        "hint swap must be adjacent");
      const ta = s.grid[hint.a.r][hint.a.c].tile;
      const tb = s.grid[hint.b.r][hint.b.c].tile;
      const isSpecialSwap = ta.special === "rainbow" || tb.special === "rainbow" || (ta.special && tb.special);
      if (!isSpecialSwap) {
        swapCells(s, hint.a, hint.b);
        assert.ok(Board._internal.findMatchGroups(s).length > 0, "hint swap creates no match");
        swapCells(s, hint.a, hint.b);
        assert.ok(hint.match.length >= 3, "normal hint should clear at least 3");
        const touchesSwap = hint.match.some(p =>
          (p.r === hint.a.r && p.c === hint.a.c) || (p.r === hint.b.r && p.c === hint.b.c));
        assert.ok(touchesSwap, "hint match should include a swapped cell");
      } else {
        assert.strictEqual(hint.match.length, 2, "special swap hint shows both cells");
      }
    }
  }
});

test("findHint: null on deadlocked board; rainbow adjacency hinted", () => {
  const s = Board.create(Levels.get(1));
  for (let r = 0; r < s.h; r++)
    for (let c = 0; c < s.w; c++)
      setT(s, r, c, (Math.floor(r / 2) + Math.floor(c / 2) + 2 * (r % 2) + 2 * (c % 2)) % 3);

  assert.strictEqual(Board.findHint(s), null, "dead board should have no hint");

  setT(s, 0, 0, 0, "rainbow");
  const hint = Board.findHint(s);
  assert.ok(hint, "rainbow should create a hint");
  const involvesRainbow = (hint.a.r === 0 && hint.a.c === 0) || (hint.b.r === 0 && hint.b.c === 0);
  assert.ok(involvesRainbow, "only valid move is swapping the rainbow");
  assert.strictEqual(hint.match.length, 2);
});

/* ── endless generator ────────────────────── */

test("endless: valid shape, scaling difficulty, engine-ready", () => {
  for (let L = 1; L <= 24; L++) {
    const lv = Levels.endless(L);
    assert.strictEqual(lv.w, 7, `loop ${L} width`);
    assert.strictEqual(lv.h, 7, `loop ${L} height`);
    assert.strictEqual(lv.n, 15 + L, `loop ${L} number`);
    assert.ok(lv.moves >= 16 && lv.moves <= 24, `loop ${L} moves ${lv.moves}`);
    assert.ok(Levels.describe(lv).length > 0, `loop ${L} describe`);

    const seen = new Set();
    for (const b of lv.blockers) {
      assert.ok(b[0] >= 0 && b[0] < 7 && b[1] >= 0 && b[1] < 7, `loop ${L} blocker bounds`);
      assert.ok(b[2] === 1 || b[2] === 2, `loop ${L} blocker hp`);
      const k = b[0] + "," + b[1];
      assert.ok(!seen.has(k), `loop ${L} duplicate blocker`);
      seen.add(k);
    }
    if (lv.objective.type === "blockers") {
      assert.ok(lv.blockers.length >= 5, `loop ${L} blockers objective needs boxes`);
    }

    const s = Board.create(lv);
    assertBoardSolid(s);
    assert.strictEqual(Board._internal.findMatchGroups(s).length, 0, `loop ${L} pre-matches`);
    assert.ok(Board.hasAnyMove(s), `loop ${L} no moves`);
    assert.ok(Board.findHint(s), `loop ${L} no hint`);
    assert.strictEqual(s.stats.blockersTotal, lv.blockers.length, `loop ${L} blocker count`);
  }
});

test("endless: objectives rotate and scale with loop", () => {
  const kinds = [];
  for (let L = 1; L <= 8; L++) kinds.push(Levels.endless(L).objective.type);
  assert.deepStrictEqual(kinds, ["collect", "clear", "collect", "blockers",
    "collect", "clear", "collect", "blockers"]);

  const a = Levels.endless(1).objective, b = Levels.endless(5).objective;
  assert.strictEqual(a.type, "collect");
  assert.strictEqual(b.type, "collect");
  assert.ok(b.count > a.count, "collect target grows");

  assert.ok(Levels.endless(6).objective.count > Levels.endless(2).objective.count,
    "clear target grows");

  let prev = Infinity;
  for (let L = 1; L <= 30; L++) {
    const m = Levels.endless(L).moves;
    assert.ok(m <= prev, `moves should tighten at loop ${L}`);
    assert.ok(m >= 16, `moves floor at loop ${L}`);
    prev = m;
  }

  assert.ok(Levels.endless(4).blockers.length > Levels.endless(1).blockers.length,
    "blockers grow");
});

/* ── economy ──────────────────────────────── */

test("matches award cakes; special-making matches award 2", () => {
  const s = Board.create(Levels.get(1));
  fillBase(s);
  setT(s, 0, 2, 0);
  assert.strictEqual(s.cakes, 0);
  const res = Board.swap(s, { r: 0, c: 1 }, { r: 1, c: 1 }); // plain match-3
  assert.ok(res.valid);
  assert.ok(s.cakes >= 1, "match-3 should award ≥1 cake");

  const s2 = Board.create(Levels.get(1));
  fillBase(s2);
  setT(s2, 0, 2, 0); setT(s2, 0, 3, 0); // match-4 setup
  const res2 = Board.swap(s2, { r: 0, c: 1 }, { r: 1, c: 1 });
  assert.ok(res2.valid);
  assert.ok(s2.cakes >= 2, "special-making match should award ≥2 cakes");
});

/* ── random fuzz ──────────────────────────── */

test("fuzz: 200 random games never corrupt the board", () => {
  for (let g = 0; g < 200; g++) {
    const s = Board.create(Levels.get(1 + (g % 15)));
    let acted = 0;
    for (let step = 0; step < 40 && acted < 12; step++) {
      const r = Math.floor(Math.random() * s.h);
      const c = Math.floor(Math.random() * s.w);
      const dir = Math.random() < 0.5 ? { r: r, c: c + 1 } : { r: r + 1, c: c };
      if (dir.r >= s.h || dir.c >= s.w) continue;
      const res = Board.swap(s, { r, c }, dir);
      if (res.valid) {
        acted++;
        assertBoardSolid(s);
        assert.strictEqual(Board._internal.findMatchGroups(s).length, 0,
          `game ${g} step ${step}: unsettled matches`);
      }
    }
    assert.ok(Board.hasAnyMove(s), `game ${g}: deadlocked without shuffle`);
  }
});
