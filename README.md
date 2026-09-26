# 🎂 The Girl I Love — Birthday Match-3

A mobile-first match-3 birthday gift. 15 levels, wishes, dares, streak secrets and a finale — made with love.

## Play

- **PWA (recommended):** open the deployed URL on Android → menu → *Add to Home screen*. Works fully offline after the first visit.
- **Local:** open `index.html` directly in a browser (works from `file://` too).

## Edit the content

**In-game (no code):** tap the 🎂 on the title screen **5 times fast** → developer panel.
Edit the dare lists (one per line) and the finale message → *Save content*.

**In code:** edit `js/content.js` (`DEFAULT_CONTENT`) — dares, special dares, finale message.

## Features

- Opening story 💌 (first launch) + in-game tutorial swipe guide
- 15 hand-tuned levels (collect / clear / blockers) with ★ star ratings
- Endless Challenge ∞ after level 15 — procedural levels, wish panel every 5th win
- 🎂 cake currency: hammer 🔨 (15), shuffle 🔀 (10), +5 moves ➕ (20)
- Booster Shop 🛍️ — stockpile boosters with cakes; stock is used before cake pay-per-use
- Idle hint after 10s, pre-level boosters (levels ≥5), wish Board 💝
- Lose dares 🎲, 10-win streak secret 🏆, level-15 finale
- Lives toggle (off by default), settings, backup/restore, reset
- Installable offline PWA, touch-first, safe-area aware

## Development

```bash
node --test tests/board.test.js tests/rewards.test.js   # engine + dare tests (30)
```

- Engine is pure (`js/board.js`) — no DOM, fully covered by tests.
- After changing **any** asset, bump `CACHE` in `sw.js` (e.g. `tgl-v3`) so phones pick up the update.

## Deploy

GitHub Pages: repo → Settings → Pages → Deploy from branch → `main` / root.
