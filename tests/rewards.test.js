/* tests/rewards.test.js — dare rotation + 10-match cooldown rules */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
for (const f of ["js/storage.js", "js/content.js", "js/levels.js", "js/rewards.js"]) {
  (0, eval)(fs.readFileSync(path.join(root, f), "utf8"));
}
const TGL = globalThis.TGL;
const Rewards = TGL.Rewards;

function fresh() {
  TGL.Storage.reset();
}

function playMatches(n) {
  for (let i = 0; i < n; i++) Rewards.win(1, 3, 0);
}

test("special dares: every dare appears once before any repeat", () => {
  fresh();
  const total = TGL.Content.get().specialDares.length;
  const picks = [];
  for (let cycle = 0; cycle < total; cycle++) {
    playMatches(10);           // streak-10 → one secret trigger per 10 matches
    picks.push(Rewards.pickDare("special").index);
  }
  assert.strictEqual(new Set(picks).size, total,
    "first cycle must show each dare exactly once, got: " + picks);
});

test("special dares: 10-match cooldown gates reappearing", () => {
  fresh();
  const total = TGL.Content.get().specialDares.length;

  // mark every dare as already shown
  const seenAll = Array.from({ length: total }, (_, i) => i);
  TGL.Storage.set("tgl_dares_revealed", { my: [], special: seenAll });

  const MATCHES = 100;
  TGL.Storage.set("tgl_matches", MATCHES);
  const last = {};
  for (let i = 0; i < total; i++) last[i] = MATCHES;   // just used → on cooldown
  const cooledIdx = (MATCHES + 3) % total;
  last[cooledIdx] = MATCHES - 10;                       // exactly 10 matches ago → eligible
  TGL.Storage.set("tgl_dare_state", { last });

  const pick = Rewards.pickDare("special");
  assert.strictEqual(pick.index, cooledIdx,
    "only the dare whose cooldown expired may be picked");
});

test("special dares: on-cooldown dares excluded while one is eligible", () => {
  fresh();
  const total = TGL.Content.get().specialDares.length;
  TGL.Storage.set("tgl_dares_revealed", { my: [], special: Array.from({ length: total }, (_, i) => i) });

  const MATCHES = 50;
  TGL.Storage.set("tgl_matches", MATCHES);
  const last = {};
  for (let i = 0; i < total; i++) last[i] = MATCHES;   // all fresh → cooling
  last[0] = MATCHES - 9;                               // 9 matches → still cooling
  last[1] = MATCHES - 10;                              // 10 matches → eligible
  TGL.Storage.set("tgl_dare_state", { last });

  const pick = Rewards.pickDare("special");
  assert.strictEqual(pick.index, 1, "9-match dare stays out; 10-match dare comes in");
});

test("matches counter advances on win and lose", () => {
  fresh();
  assert.strictEqual(TGL.Storage.get("tgl_matches", 0), 0);
  Rewards.win(1, 3, 0);
  Rewards.lose();
  Rewards.win(1, 3, 0);
  assert.strictEqual(TGL.Storage.get("tgl_matches", 0), 3);
});

test("lose dares (my) keep prefer-never-revealed behavior", () => {
  fresh();
  const total = TGL.Content.get().myDares.length;
  const picks = [];
  for (let i = 0; i < total; i++) picks.push(Rewards.pickDare("my").index);
  assert.strictEqual(new Set(picks).size, total, "lose dares rotate without repeats first");
});
