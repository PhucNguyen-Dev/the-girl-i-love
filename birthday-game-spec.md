# "The Girl I Love" — Birthday Challenge Game
## Full Build Specification (hand this entire document to your AI agent)

You are building a **single self-contained browser game** as a romantic birthday gift. It is a Royal Match-style match-3 challenge game with a personal reward system. Target user: one specific person (the developer's girlfriend). Target device: **mobile-first browser** (she plays on her phone), also runs on desktop. Everything runs **offline in the browser** after first load. No login, no server required.

---

## 1. Product overview

**Name (working title):** "The Girl I Love"
**Genre:** Match-3 puzzle + personal reward dashboard
**Platform:** Web (single HTML page app). Must run from a static host (GitHub Pages / Netlify) and also from a plain `file://` open for testing.
**Core loop:**

```
Start screen → Match-3 level → Win/Lose → Reward flow → Back
```

**Reward flow rules (critical — the whole point of the gift):**
- **Win:** she may type ANY request she wants the developer to do into a text box. Saved to the "Her Wishes" dashboard.
- **Lose:** the game shows ONE randomly picked request from the developer's pre-written list ("My Dares") — things SHE must do for HIM.
- **Win 10 rounds back-to-back (streak of 10):** the game shows a special pick also drawn from the developer's pre-written list, presented as a "secret unlocked" celebration, then streak resets.

---

## 2. Tech stack (no Unity, no C#, no C++)

- **HTML5 + CSS3 + vanilla JavaScript (ES6+)**, single-page app. No build step, no npm required — agent may use plain script files.
- Optional: **Phaser 3 via CDN** is allowed but NOT required. Prefer plain Canvas/DOM if simpler. If Phaser is used, load from CDN (`https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.min.js`).
- **Rendering:** the match-3 board must use **Canvas** (smooth animation) OR CSS-positioned DOM tiles. Canvas preferred for particles/effects.
- **UI screens (menus, dashboard, popups):** regular HTML/CSS overlays on top of the canvas — much easier to make beautiful.
- **Storage:** `localStorage`. Keys prefixed `tgl_` (e.g. `tgl_progress`, `tgl_wishes`, `tgl_streak`, `tgl_settings`).
- **Fonts/emoji:** use emoji directly for tiles (💗 🌸 ⭐ 🎁 🍫 💌 💍) — zero asset pipeline, looks great on phones. No external font required; may use a Google Font like "Baloo 2" or "Quicksand" via CDN link with system-font fallback.
- **No account system, no backend, no analytics, no ads.**
- **Target:** runs at 60fps on a mid-range phone browser. Single `index.html` acceptable, or small folder of files.

### Delivery
- Single folder: `index.html`, `css/style.css`, `js/*.js` (or one combined file — agent's choice, but must work by opening index.html without a build server).
- Include a short `README.md` with how to run and how to edit the content files.

---

## 3. Screens / UI

All screens are mobile-first, portrait layout, with rounded corners, soft gradients (pink/rose/gold palette), big touch targets (min 44px), and polished micro-animations everywhere (button bounce on tap, score popups, confetti/particle bursts on match).

### 3.1 Splash / Title screen
- Title: "The Girl I Love — Birthday Challenge 🎂"
- Animated hearts background, "Tap to Start" button.
- Shows her current level number and current win streak.

### 3.2 Home / Map screen (mini "castle" equivalent)
- A vertical path of level nodes (like Royal Match's progression map), scrollable.
- Completed levels show a filled heart; current level pulses.
- Nodes unlock progressively; node #N+1 unlocks after beating #N.
- Top bar: hearts (lives) counter, stars/coins display (optional), streak counter (🔥 xN).
- Buttons: "Dashboard" (opens reward dashboard), Settings (gear icon).

### 3.3 Level intro popup
- Level number, objective text ("Collect 15 💗"), moves remaining counter, "Play" button.
- Optional: show one pre-level booster pick (see section 4.4).

### 3.4 Match-3 gameplay screen
- Board centered, top bar shows: objective progress ("💗 7/15"), moves left, pause button.
- Bottom bar: current streak indicator.
- See section 4 for full mechanics.

### 3.5 Win screen
- Bounce-in "You Win! 🎉" with confetti + star shakers based on score (1–3 stars).
- Then the **Wish Input panel**:
  - Heading: "You won! Now tell me what I should do 😏"
  - Large text input (max 200 chars) + optional category chips (Sweet, Favor, Date, Food, Photo, Funny).
  - Buttons: "Save my wish 💝" and "Skip".
  - After saving: confirmation animation ("Wish saved! I promise 😌"), then back to map with next level unlocked.

### 3.6 Lose screen
- Gentle, funny tone. Never harsh. "Oops! The game picks this one for YOU 🎲"
- Displays ONE randomly chosen entry from the developer's dares list with a reveal animation (card flip or gift-box open).
- Buttons: "Okay, I'll do it 🙈" / "Retry level".
- Retry is free (no lives cost on lose during Beta; see settings flag).

### 3.7 Ten-win streak screen
- Triggered automatically on 10th consecutive win, fires BEFORE the wish input (streak reward replaces that win's wish flow, or shows after — agent can show a full-screen takeover first, then the wish panel).
- Full-screen celebration: fireworks, "SECRET LOCKED — 10 WINS IN A ROW 🏆"
- Reveals one random pick from the developer's special dares list (separate `specialDares` array, can overlap `dares` if the list is short).
- Button: "Enjoy 😈" — then continues to normal win/next level.

### 3.8 Dashboard ("Wish Board")
- Two tabs:
  - **"My Wishes 💝"** — all wishes she has typed, newest first, with status (pending / done). She (or the developer) can tap a wish to mark "He did it ✅" or delete.
  - **"My Dares 🎲"** — a read/view list of the developer's pre-written dares with a badge showing which ones have been revealed so far. Hidden until first reveal (each dare shows "???" until drawn once).
- Editable by the developer via a hidden/long-press developer panel (section 6).

### 3.9 Settings
- Sound on/off, music on/off, "Retry costs a life" toggle, reset progress, edit-name fields.

---

## 4. Match-3 mechanics

Standard match-3 with Royal Match-style feel. Requirements:

### 4.1 Board
- Grid: **7×7** (configurable per level via level data).
- **6 tile types** by default: 💗 🌸 ⭐ 🎁 🍫 💍 (emoji rendered on canvas as text — cheap and pretty).
- Tiles spawn with no initial pre-made matches (auto-solved board generation).
- No valid-move deadlock: after each settle, check for possible moves; if none, reshuffle the board with a shuffle animation.

### 4.2 Drop & fall
- Matched tiles pop with a burst particle effect; tiles above fall down (tweened, slight bounce on land); new tiles spawn from the top.
- Cascades chain until no matches remain.

### 4.3 Special tiles (essential, keep small)
- Match 4 in a line → **Linebreaker** (rocket): clears full row or column.
- Match 5 in a line → **Rainbow**: clears all tiles of one chosen type.
- L/T shape (5 in cross) → **Bomb**: clears 3×3 area.
- Combining two specials (swap two specials) → bigger effect (bomb+bomb = bigger radius; rainbow+line = all rows/columns). Implement at least rainbow+line if time-constrained.
- Activating a special counts toward objectives (e.g. rocket clears count as cleared tiles).

### 4.4 Input & feel
- Tap-or-swipe two adjacent tiles to swap; invalid swaps shake and revert.
- Input during falling: allow queuing the next swap while tiles are falling (Royal Match feel) — at minimum, accept input as soon as tiles are settled in the affected columns.
- Board never fully hard-locks after a move.

### 4.5 Objectives (per level, defined in level data)
- **Collect N of a tile type** (main type).
- **Clear N tiles total.**
- **Break all blockers** (jelly/ice style tile: tile behind a "timer/surprise box" — needs 1–3 hits from adjacent matches). Implement 1 blocker type: a wrapped-gift box that must be matched/cleared adjacent.
- Every level has a **move limit** (e.g. 20–30 moves).
- Star thresholds by percentage of objective/moves used.

### 4.6 Boosters (small, optional gate)
- Pre-game pick (only on levels ≥ 5): choose 1 free booster.
- Examples: "+5 moves", "Start with a bomb on board", "Rainbow in hand".
- Optional in-game booster buy with earned stars (skip purchasing entirely — no payments).

### 4.7 Level count
- **15 levels** minimum, defined as declarative JSON (`js/levels.json` or embedded `LEVELS` array in `levels.js`), each with: grid size, tile set, objective type/count, move limit, blocker positions, star thresholds, and map-node position.
- Levels 1–3 easy tutorial-easy; ramp difficulty; final level (15) is the "birthday finale" with a special ending screen ("Happy Birthday 🎂 I love you") — final message text configurable.

---

## 5. Reward/content system

### 5.1 Data (all in a clearly-marked, easy-to-edit section)
```js
const CONTENT = {
  myDares: [               // what SHE must do when she loses
    "Give me a 60-second hug, timer on 😌",
    "Sing the chorus of my favorite song",
    // ...20+ entries recommended
  ],
  specialDares: [          // drawn on the 10-win streak
    "Plan our next date completely by yourself",
    // ...10+ entries
  ],
  finaleMessage: "Happy Birthday, my love..."
};
```
- Developer edits this array in ONE file (`content.js`) before gifting. Mark it with a big comment banner in the code ("EDIT YOUR DARES HERE").

### 5.2 Wish storage
```js
// tgl_wishes = [{ id, text, category, createdAt, status: "pending" | "done" }]
```
- Deduplicate identical pending texts. Cap display list rendering at 200 items.

### 5.3 Streak logic
- Streak++ on win, reset to 0 on lose.
- At streak === 10: fire streak celebration, draw from `specialDares`, reset streak to 0 (continue otherwise seamlessly).
- Persist streak in `localStorage` so refresh doesn't cheat it.

---

## 6. Developer mode
- Hidden entry: on the title screen, tap the birthday-cake emoji 5 times quickly → developer panel appears.
- Dev panel can: edit dares/specialDares inline, toggle "physics-free spring lookahead for testing" — NO. Keep it simple: (1) edit lists, (2) toggle "instant win" for testing, (3) export/import wishes and settings as a JSON text block, (4) reset all.
- Store edited content back with an override key `tgl_content_override` merged with defaults, so code file edits aren't required after deployment. **Important:** keep the ability to preload CONTENT from the code (surprise content baked in, override optional).

## 7. Audio
- Small generated/WebAudio blips (no external audio files required): pop sound on match, win jingle, fail "aww" tone, streak fanfare. Mute toggle in settings. If using files, keep 2–3 tiny `.mp3`/`.ogg` < 100KB each.

## 8. Visual polish requirements (non-negotiable — this is the gift's quality bar)
- Everything animates: buttons press down 2–3px, popups spring in, numbers pop.
- Confetti/particle system on win and streak screens.
- Card-flip or box-open reveal animation for dares.
- Consistent rounded, playful visual style; pink/rose/gold gradient background with floating hearts on menus.
- No placeholders, no lorem ipsum, no broken emoji fallback. If an emoji doesn't render in canvas on some devices, fall back to inline SVG hearts — test with 💗 🌸 ⭐ 🎁 🍫 💍.

## 9. Non-functional requirements
- **Performance:** board settles under ~350ms/step; total cascade resolution under 3s; no frame drops below 60fps target on a 4-year-old phone.
- **Persistence:** level progress, stars, streak, settings, wishes all in localStorage; survive page refresh.
- **Responsive:** works 360×640 to desktop; game area scales to fit; safe-area insets for notched phones (`env(safe-area-inset-*)`).
- **Touch:** full touch support (pointer events), no 300ms delay, prevent double-tap zoom on the board.
- **No external network calls at runtime** except optional CDN font/Phaser; game must still work fully offline.
- **Privacy:** no tracking, no analytics, no images leaving device; wishes stay local.

## 10. Acceptance checklist (test before gifting)
1. Opens from `file://` with zero console errors.
2. Level 1 playable with a successful match and cascade observed.
3. Swiping during a fall does not break the board (input-queue behavior works).
4. Win → wish typed → appears in Dashboard → survives refresh.
5. Lose → random dare appears → different dare on next loss → retry works.
6. 10 straight wins → streak celebration fires → special dare shows → streak resets.
7. Deadlock case triggers shuffle instead of freezing the game.
8. 15 levels all completable; finale screen shows.
9. Sound toggle works; all visuals polished, no raw edges.
10. Content file is the ONLY file the developer needed to edit.

## 11. Out of scope (don't build)
- Accounts/login, backend servers, payments, ads, multiplayer, leaderboards, push notifications, PWA service worker (optional nice-to-have only if trivial), level editor GUI (JSON is enough).

## 12. Suggested file structure
```
birthday-game/
├── index.html
├── README.md
├── css/style.css
├── js/
│   ├── main.js        # boot, screen router
│   ├── levels.js      # LEVELS data (15 levels)
│   ├── content.js     # EDIT-YOUR-DARES zone
│   ├── board.js       # match-3 engine (grid, match, fall, specials)
│   ├── render.js      # canvas rendering + particles
│   ├── rewards.js     # win/lose/streak reward flows
│   ├── dashboard.js   # wish board UI + storage
│   └── storage.js     # localStorage helpers
```
Build order: storage → board engine → level data → reward flows → dashboard → audio → polish/acceptance pass.
