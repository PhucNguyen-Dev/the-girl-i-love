/* main.js — boot, screen router, game flow, reward flows, dev panel */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  var $ = function (id) { return document.getElementById(id); };
  var Audio, Render, Board, Levels, Rewards, Dashboard, Content;

  var app = {
    screen: "splash",
    level: 1,
    mode: "story",   // story | endless
    loop: 1,         // endless loop number
    state: null,
    selected: null,
    pendingSwap: null,
    modalOpen: null,
    hammerArmed: false,
    chosenBooster: null,
    winCtx: null,
    lastInput: 0,
    hintOn: false,
    devTaps: 0,
    devTapLast: 0,
    devTapTimer: null
  };

  var PRICE = { hammer: 15, shuffle: 10, moves: 20 };

  /* ── small helpers ────────────────────────── */

  function toast(msg, ms) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, ms || 2200);
  }

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.toggle("active", s.id === "screen-" + name);
    });
    app.screen = name;
    if (name !== "game") {
      var hand = $("tut-hand");
      if (hand) hand.hidden = true;
    }
    if (name === "map") renderMap();
    if (name === "splash") updateSplash();
    TGL.Audio.play("tap");
  }

  function openModal(id) {
    closeAllModals();
    var m = $(id);
    m.classList.add("open");
    app.modalOpen = id;
  }

  function closeModal(id) {
    var m = $(id);
    if (m) m.classList.remove("open");
    if (app.modalOpen === id) app.modalOpen = null;
  }

  function closeAllModals() {
    document.querySelectorAll(".modal.open").forEach(function (m) { m.classList.remove("open"); });
    app.modalOpen = null;
  }

  function adjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function markInput() {
    app.lastInput = Date.now();
    clearHint();
  }

  function clearHint() {
    Render.setHint(null);
    app.hintOn = false;
  }

  // idle hint: 10s with no input → pulse a random valid match
  function idleTick() {
    if (app.screen !== "game" || app.modalOpen || !app.state) {
      if (app.hintOn) clearHint();
      return;
    }
    if (Render.isBusy() || app.hammerArmed) return;
    if (Date.now() - app.lastInput < 10000) { if (app.hintOn) clearHint(); return; }
    if (app.hintOn) return;
    var h = Board.findHint(app.state);
    if (h) { Render.setHint(h); app.hintOn = true; }
  }

  /* ── first-time tutorial ──────────────────── */

  function tut(name) {
    var f = TGL.Storage.get("tgl_tut", null);
    return !!(f && typeof f === "object" && f[name]);
  }

  function tutDone(name) {
    var f = TGL.Storage.get("tgl_tut", null);
    if (!f || typeof f !== "object") f = {};
    f[name] = true;
    TGL.Storage.set("tgl_tut", f);
  }

  function startTutorialSwipe() {
    if (app.mode !== "story" || app.level !== 1 || tut("swipe")) return;
    setTimeout(function () {
      if (app.screen !== "game" || app.modalOpen || !app.state) return;
      var h = Board.findHint(app.state);
      if (!h) return;
      Render.setHint(h);
      app.hintOn = true;
      positionHand(h);
      toast("Swipe two tiles to swap 👇", 3600);
    }, 450);
  }

  function positionHand(h) {
    var hand = $("tut-hand");
    var wrap = $("board-wrap").getBoundingClientRect();
    var cv = $("board-canvas").getBoundingClientRect();
    var cw = cv.width / app.state.w, ch = cv.height / app.state.h;
    function at(p) {
      return {
        x: cv.left - wrap.left + (p.c + 0.5) * cw - 23,
        y: cv.top - wrap.top + (p.r + 0.5) * ch - 23
      };
    }
    var a = at(h.a), b = at(h.b);
    hand.style.setProperty("--ax", a.x + "px");
    hand.style.setProperty("--ay", a.y + "px");
    hand.style.setProperty("--bx", b.x + "px");
    hand.style.setProperty("--by", b.y + "px");
    hand.hidden = false;
  }

  function hideHand() {
    var hand = $("tut-hand");
    if (!hand.hidden) {
      hand.hidden = true;
      if (!tut("swipe")) {
        tutDone("swipe");
        if (!tut("objective")) {
          tutDone("objective");
          toast("Match 3 goal tiles 💗 to collect them!", 3400);
        }
      }
    }
  }

  /* ── splash & hearts ──────────────────────── */

  function updateSplash() {
    var p = Rewards.progress();
    $("splash-level").textContent = "Level " + p.level;
    $("splash-streak").textContent = "🔥 " + Rewards.streak();
    var her = Rewards.settings().herName;
    $("splash-her-name").textContent = her ? "Happy birthday, " + her + "! 🎂" : "";
  }

  function buildHearts() {
    var bg = $("hearts-bg");
    var chars = ["💗", "❤️", "💕", "🩷", "💗", "💗"];
    for (var i = 0; i < 15; i++) {
      var h = document.createElement("span");
      h.className = "bg-heart";
      h.textContent = chars[i % chars.length];
      h.style.left = Math.random() * 96 + "%";
      h.style.fontSize = 16 + Math.random() * 22 + "px";
      h.style.animationDuration = 12 + Math.random() * 12 + "s";
      h.style.animationDelay = -Math.random() * 20 + "s";
      bg.appendChild(h);
    }
  }

  /* ── map ──────────────────────────────────── */

  function renderMap() {
    updateTopbar();
    var layout = Levels.mapLayout();
    var path = $("map-path");
    var p = Rewards.progress();
    path.innerHTML = "";

    var nodes = layout.slice();
    var storyDone = p.stars[Levels.count] != null;
    if (storyDone) {
      var ep = Levels.nodePos(layout.length);
      nodes.push({ n: Levels.count + 1, x: ep.x, y: ep.y, endless: true });
    }
    var last = nodes[nodes.length - 1];
    path.style.height = (last.y + 110) + "px";

    // dashed connectors
    var w = $("map-scroll").clientWidth || 360;
    for (var i = 0; i < nodes.length - 1; i++) {
      var a = nodes[i], b = nodes[i + 1];
      var x1 = w * a.x / 100, y1 = a.y;
      var x2 = w * b.x / 100, y2 = b.y;
      var len = Math.hypot(x2 - x1, y2 - y1);
      var ang = Math.atan2(x2 - x1, y2 - y1) * 180 / Math.PI;
      var line = document.createElement("div");
      line.className = "map-line";
      line.style.left = x1 + "px";
      line.style.top = (y1 + 30) + "px";
      line.style.height = Math.max(0, len - 60) + "px";
      line.style.transform = "translateX(-50%) rotate(" + ang + "deg)";
      path.appendChild(line);
    }

    nodes.forEach(function (n) {
      if (n.endless) {
        var e = Rewards.endless();
        var node = document.createElement("button");
        node.className = "map-node current endless-node";
        node.style.left = n.x + "%";
        node.style.top = n.y + "px";
        node.innerHTML = "∞";
        var st = document.createElement("span");
        st.className = "map-stars";
        st.textContent = "Loop " + e.loop;
        node.appendChild(st);
        node.addEventListener("click", function () {
          TGL.Audio.play("tap");
          openEndlessIntro();
        });
        path.appendChild(node);
        return;
      }
      var done = n.n < p.level || (n.n === p.level && p.stars[n.n] != null && n.n === Levels.count);
      var current = n.n === p.level && !(p.stars[n.n] != null && n.n === Levels.count);
      var locked = n.n > p.level;
      var node = document.createElement("button");
      node.className = "map-node " + (done ? "done" : current ? "current" : locked ? "locked" : "");
      node.style.left = n.x + "%";
      node.style.top = n.y + "px";
      node.innerHTML = locked ? "🔒" : current ? n.n : n.n;
      if (p.stars[n.n]) {
        var st = document.createElement("span");
        st.className = "map-stars";
        st.textContent = "★".repeat(p.stars[n.n]) + "☆".repeat(3 - p.stars[n.n]);
        node.appendChild(st);
      }
      node.addEventListener("click", function () {
        if (locked) { TGL.Audio.play("invalid"); toast("Finish the level before this one 🔒"); return; }
        TGL.Audio.play("tap");
        openLevelIntro(n.n);
      });
      path.appendChild(node);
    });

    // scroll current node into view
    var curY = storyDone
      ? nodes[nodes.length - 1].y
      : layout[Math.min(p.level, Levels.count) - 1].y;
    var scroll = $("map-scroll");
    setTimeout(function () {
      scroll.scrollTop = Math.max(0, curY - scroll.clientHeight / 2);
    }, 60);
  }

  function updateTopbar() {
    var p = Rewards.progress();
    $("map-lives").textContent = "❤️ " + Rewards.hearts();
    $("map-stars").textContent = "⭐ " + Rewards.totalStars();
    $("map-cakes").textContent = "🎂 " + p.cakes;
    $("map-streak").textContent = "🔥 " + Rewards.streak();
    $("dash-cakes").textContent = "🎂 " + p.cakes;
  }

  /* ── level intro ──────────────────────────── */

  var BOOSTER_DEFS = [
    { id: "moves", icon: "➕", name: "+5 moves" },
    { id: "bomb", icon: "💣", name: "Start bomb" },
    { id: "rainbow", icon: "🌈", name: "Rainbow" }
  ];

  function fillIntro(lvl, title) {
    app.chosenBooster = null;
    $("intro-level").textContent = title;
    $("intro-objective").textContent = Levels.describe(lvl);
    $("intro-moves").textContent = lvl.moves;

    var pick = $("intro-booster-pick");
    var opts = $("pick-options");
    opts.innerHTML = "";
    if (lvl.n >= 5) {
      pick.hidden = false;
      BOOSTER_DEFS.forEach(function (b) {
        var btn = document.createElement("button");
        btn.className = "pick-opt";
        btn.innerHTML = '<span class="p-icon">' + b.icon + "</span><span>" + b.name + "</span>";
        btn.addEventListener("click", function () {
          var already = app.chosenBooster === b.id;
          app.chosenBooster = already ? null : b.id;
          opts.querySelectorAll(".pick-opt").forEach(function (o) { o.classList.remove("chosen"); });
          if (!already) btn.classList.add("chosen");
          TGL.Audio.play("tap");
        });
        opts.appendChild(btn);
      });
    } else {
      pick.hidden = true;
    }
  }

  function openLevelIntro(n) {
    app.mode = "story";
    app.loop = 1;
    app.level = n;
    fillIntro(Levels.get(n), "Level " + n);
    openModal("modal-level-intro");
  }

  function openEndlessIntro() {
    app.mode = "endless";
    app.loop = Rewards.endless().loop;
    app.level = Levels.count + app.loop;
    fillIntro(Levels.endless(app.loop), "Challenge " + app.level + "  ·  Loop " + app.loop);
    openModal("modal-level-intro");
  }

  /* ── start / HUD / booster bar ────────────── */

  function startLevel() {
    var lvl = app.mode === "endless" ? Levels.endless(app.loop) : Levels.get(app.level);
    var opts = {};
    if (app.chosenBooster === "moves") opts.extraMoves = 5;
    if (app.chosenBooster === "bomb") opts.startBomb = true;
    if (app.chosenBooster === "rainbow") opts.rainbowInHand = true;

    app.state = Board.create(lvl, opts);
    app.selected = null;
    app.pendingSwap = null;
    app.hammerArmed = false;
    app.winCtx = null;
    markInput();

    closeAllModals();
    showScreen("game");
    Render.setBoard(app.state);
    Render.setSelection(null);
    Render.setHammerMode(false);
    updateHUD();
    renderBoosterBar();
    startTutorialSwipe();
  }

  function updateHUD() {
    if (!app.state) return;
    $("hud-objective").textContent = Board.progressText(app.state);
    var mv = $("hud-moves");
    mv.textContent = app.state.movesLeft;
    mv.classList.toggle("low", app.state.movesLeft <= 5);
    var p = Rewards.progress();
    $("hud-streak").textContent = "🔥 " + Rewards.streak() + "  ·  🎂 " + p.cakes;
    renderBoosterBar();
  }

  function renderBoosterBar() {
    var bar = $("booster-bar");
    if (!bar.dataset.built) {
      bar.innerHTML =
        btnHTML("hammer", "🔨") +
        btnHTML("shuffle", "🔀") +
        btnHTML("moves", "➕");
      bar.dataset.built = "1";
      bar.querySelectorAll(".booster-btn").forEach(function (b) {
        b.addEventListener("click", function () { useBooster(b.dataset.b); });
      });
    }
    var cakes = Rewards.progress().cakes;
    var stock = Rewards.stock();
    bar.querySelectorAll(".booster-btn").forEach(function (b) {
      var cost = PRICE[b.dataset.b];
      var s = stock[b.dataset.b] || 0;
      b.classList.toggle("has-stock", s > 0);
      b.classList.toggle("poor", !s && cakes < cost);
      b.classList.toggle("armed", b.dataset.b === "hammer" && app.hammerArmed);
      b.querySelector(".b-cost").textContent = s > 0 ? "\u00d7" + s : cost + " 🎂";
    });
  }

  function btnHTML(id, icon) {
    return '<button class="booster-btn" data-b="' + id + '">' +
      '<span class="b-icon">' + icon + "</span>" +
      '<span class="b-cost">' + PRICE[id] + " 🎂</span></button>";
  }

  function spendCakes(n) {
    var p = Rewards.progress();
    if (p.cakes < n) { toast("Not enough 🎂 — win more levels!"); TGL.Audio.play("invalid"); return false; }
    p.cakes -= n;
    TGL.Storage.set("tgl_progress", p);
    TGL.Audio.play("cake");
    updateHUD();
    return true;
  }

  function spendOrStock(kind, price) {
    if (Rewards.useStock(kind)) { TGL.Audio.play("tap"); updateHUD(); return true; }
    return spendCakes(price);
  }

  function useBooster(kind) {
    if (app.screen !== "game" || app.modalOpen || !app.state) return;
    markInput();
    if (Render.isBusy()) { toast("Wait for the board to settle ⏳", 1400); return; }

    if (kind === "hammer") {
      if (app.hammerArmed) {
        app.hammerArmed = false;
        Render.setHammerMode(false);
        Render.setSelection(null);
        renderBoosterBar();
        return;
      }
      if (!Rewards.stock().hammer && Rewards.progress().cakes < PRICE.hammer) {
        toast("Not enough 🎂 — win more levels or shop 🛍️!");
        TGL.Audio.play("invalid");
        return;
      }
      app.hammerArmed = true;
      Render.setHammerMode(true);
      renderBoosterBar();
      toast("Tap any tile to smash it 🔨", 2400);
      return;
    }

    if (kind === "shuffle") {
      if (!spendOrStock("shuffle", PRICE.shuffle)) return;
      runSteps(Board.shuffle(app.state));
      return;
    }

    if (kind === "moves") {
      if (!spendOrStock("moves", PRICE.moves)) return;
      app.state.movesLeft += 5;
      TGL.Audio.play("special");
      toast("+5 moves! ➕");
      updateHUD();
    }
  }

  function doHammer(cell) {
    var stock = Rewards.stock();
    if (stock.hammer > 0) {
      Rewards.useStock("hammer");
    } else if (Rewards.progress().cakes < PRICE.hammer) {
      toast("Not enough 🎂 — win more levels or shop 🛍️!");
      TGL.Audio.play("invalid");
      app.hammerArmed = false;
      Render.setHammerMode(false);
      renderBoosterBar();
      return;
    } else {
      spendCakes(PRICE.hammer);
    }
    app.hammerArmed = false;
    Render.setHammerMode(false);
    var res = Board.hammer(app.state, cell);
    if (!res) { toast("Nothing to smash there", 1400); return; }
    Render.setSelection(null);
    runSteps(res);
  }

  /* ── input ────────────────────────────────── */

  function onBoardInput(evt) {
    if (app.screen !== "game" || app.modalOpen || !app.state) return;
    markInput();
    hideHand();
    if (Render.isBusy()) {
      if (evt.type === "swipe") app.pendingSwap = evt; // spec: queue the next swap during falls
      return;
    }
    if (app.hammerArmed) {
      if (evt.type === "tap") doHammer(evt.cell);
      return;
    }
    if (evt.type === "tap") {
      var c = evt.cell;
      if (app.selected && app.selected.r === c.r && app.selected.c === c.c) {
        app.selected = null;
        Render.setSelection(null);
      } else if (app.selected && adjacent(app.selected, c)) {
        trySwap(app.selected, c);
      } else {
        app.selected = c;
        Render.setSelection(c);
        TGL.Audio.play("tap");
      }
    } else {
      trySwap(evt.from, evt.to);
    }
  }

  function trySwap(a, b) {
    app.selected = null;
    Render.setSelection(null);
    runSteps(Board.swap(app.state, a, b));
  }

  function runSteps(res) {
    clearHint();
    if (!res || !res.steps || !res.steps.length) { afterSteps(res); return; }
    var clearIdx = 0;
    var valid = res.valid;
    Render.playSteps(res.steps, {
      onStep: function (step) {
        if (step.type === "swap") TGL.Audio.play("swap");
        else if (step.type === "invalidSwap") TGL.Audio.play("invalid");
        else if (step.type === "shuffle") TGL.Audio.play("shuffle");
        else if (step.type === "clear") {
          TGL.Audio.play("clear", clearIdx++);
          if (step.triggered && step.triggered.length) TGL.Audio.play("special");
          var broke = step.blockers && step.blockers.some(function (b) { return b.hp === 0; });
          if (broke) TGL.Audio.play("box");
        }
      },
      onDone: function () {
        if (valid) updateHUD();
        afterSteps(res);
      }
    });
  }

  function afterSteps(res) {
    if (!res || !res.valid) {
      drainPending();
      return;
    }
    if (app.mode === "story" && app.level <= 3 && !tut("booster")) {
      tutDone("booster");
      toast("Tip: 🔨 smash · 🔀 shuffle · ➕ moves — free from stock, or buy in Shop 🛍️", 4200);
    }
    var s = app.state;
    var instant = Rewards.settings().instantWin;
    if (Board.objectiveDone(s) || instant) { winFlow(); return; }
    if (Board.isLost(s)) { loseFlow(); return; }
    drainPending();
  }

  function drainPending() {
    var p = app.pendingSwap;
    app.pendingSwap = null;
    if (p && app.screen === "game" && !app.modalOpen && !Render.isBusy()) {
      trySwap(p.from, p.to);
    }
  }

  /* ── win flow ─────────────────────────────── */

  function resetStarRow() {
    var stars = $("win-stars").querySelectorAll(".star");
    stars.forEach(function (s) { s.classList.remove("on"); });
    void $("win-stars").offsetWidth;
  }

  function winFlow() {
    var s = app.state;
    var stars = Board.starsFor(s);
    var endless = app.mode === "endless";
    var levelNum = endless ? Levels.count + app.loop : app.level;
    var result = Rewards.win(levelNum, stars, s.cakes);
    var adv = endless ? Rewards.advanceEndless() : null;
    app.winCtx = {
      stars: stars,
      payout: result.payout,
      secret: result.secret,
      finale: !endless && app.level === Levels.count,
      wishOff: endless && !adv.showWish,
      loop: endless ? app.loop : 0,
      wishDone: false
    };
    app.pendingSwap = null;

    resetStarRow();
    $("win-cakes").textContent = "+" + result.payout + " 🎂";
    $("wish-text").value = "";
    $("wish-chips").querySelectorAll(".chip").forEach(function (c) { c.classList.remove("on"); });
    $("wish-panel").hidden = true;
    $("wish-saved").hidden = true;
    var se = $("wish-saved").querySelector(".saved-emoji");
    var sp = $("wish-saved").querySelector("p");
    if (se) se.textContent = "😌";
    if (sp) sp.textContent = "Wish saved! I promise";

    openModal("modal-win");
    TGL.Render.confettiOn($("win-confetti"), 5200);
    TGL.Audio.play("win");
    for (var i = 1; i <= stars; i++) {
      (function (n) {
        setTimeout(function () {
          var st = $("win-stars").querySelectorAll(".star")[n - 1];
          if (st) st.classList.add("on");
          TGL.Audio.play("star");
        }, 350 + (n - 1) * 250);
      })(i);
    }

    setTimeout(function () {
      if (!app.winCtx || app.modalOpen !== "modal-win") return;
      revealWinStage();
    }, 1500);
  }

  function revealWinStage() {
    var ctx = app.winCtx;
    if (!ctx) return;
    if (ctx.secret) { showSecret(); return; }
    if (ctx.wishOff) { showWinContinue(); return; }
    showWishPanel();
  }

  function showWinContinue() {
    $("wish-panel").hidden = true;
    $("wish-saved").hidden = false;
    var se = $("wish-saved").querySelector(".saved-emoji");
    var p = $("wish-saved").querySelector("p");
    if (se) se.textContent = "🔥";
    if (p) p.textContent = "Loop " + app.winCtx.loop + " cleared! Every 5th win unlocks a wish.";
  }

  function showWishPanel() {
    $("wish-panel").hidden = false;
    $("wish-saved").hidden = true;
  }

  function showSecret() {
    var dare = Rewards.pickDare("special");
    closeModal("modal-win");
    $("streak-dare").textContent = dare.text;
    $("streak-flip").classList.remove("flipped");
    openModal("modal-streak");
    TGL.Render.confettiOn($("streak-confetti"), 6000);
    TGL.Audio.play("secret");
    setTimeout(function () { $("streak-flip").classList.add("flipped"); }, 550);
  }

  function backToWishFromSecret() {
    closeModal("modal-streak");
    openModal("modal-win");
    TGL.Render.confettiOn($("win-confetti"), 3600);
    revealWinStage();
  }

  function saveWish() {
    if (!app.winCtx) return;
    var text = $("wish-text").value;
    var chip = $("wish-chips").querySelector(".chip.on");
    var cat = chip ? chip.dataset.cat : "";
    var res = Rewards.saveWish(text, cat);
    if (!res.ok) {
      if (res.reason === "empty") { toast("Type something first 😌"); return; }
      toast("You already wished that one 💗");
    }
    TGL.Audio.play("wish");
    $("wish-panel").hidden = true;
    $("wish-saved").hidden = false;
  }

  function finishWin() {
    var ctx = app.winCtx;
    app.winCtx = null;
    closeModal("modal-win");
    if (ctx && ctx.finale) showFinale();
    else showScreen("map");
  }

  function showFinale() {
    $("finale-msg").textContent = Content.get().finaleMessage;
    openModal("modal-finale");
    TGL.Render.confettiOn($("finale-confetti"), 8000);
    TGL.Audio.play("fanfare");
  }

  /* ── lose flow ────────────────────────────── */

  function loseFlow() {
    var result = Rewards.lose();
    var dare = Rewards.pickDare("my");
    $("lose-dare").textContent = dare.text;
    $("lose-flip").classList.remove("flipped");
    openModal("modal-lose");
    TGL.Audio.play("fail");
    setTimeout(function () { $("lose-flip").classList.add("flipped"); }, 500);
    app._loseResult = result;
  }

  /* ── settings / dashboard / dev ───────────── */

  function syncToggles() {
    var s = Rewards.settings();
    $("tg-sound").classList.toggle("on", s.sound);
    $("tg-music").classList.toggle("on", s.music);
    $("tg-lives").classList.toggle("on", s.retryCostsLife);
    $("tg-instant").classList.toggle("on", s.instantWin);
    $("in-her").value = s.herName || "";
    $("in-his").value = s.hisName || "";
  }

  function toggleSetting(elId, key) {
    var s = Rewards.settings();
    var next = !s[key];
    Rewards.setSetting(key, next);
    $(elId).classList.toggle("on", next);
    if (key === "sound") TGL.Audio.setSound(next);
    if (key === "music") TGL.Audio.setMusic(next);
    TGL.Audio.play("tap");
    if (key === "instantWin" && next && app.screen === "game" && app.state && !app.modalOpen) {
      toast("Instant win ON — make a move 🧪");
    }
  }

  function exportData() {
    var json = Rewards.exportAll();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () {
        toast("Backup copied to clipboard 📋");
      }).catch(function () {
        window.prompt("Copy your backup:", json);
      });
    } else {
      window.prompt("Copy your backup:", json);
    }
  }

  function importData() {
    var json = window.prompt("Paste your backup:");
    if (!json) return;
    try {
      Rewards.importAll(json);
      toast("Restored! Reloading…");
      setTimeout(function () { location.reload(); }, 800);
    } catch (e) {
      toast("That doesn't look like a backup ❌");
    }
  }

  function resetData() {
    if (!window.confirm("Reset ALL progress, wishes and settings? This cannot be undone.")) return;
    Rewards.resetAll();
    Content.clearOverride();
    location.reload();
  }

  function openDashboard() {
    showScreen("dashboard");
    Dashboard.open();
  }

  function openSettings() {
    syncToggles();
    showScreen("settings");
  }

  /* ── shop ─────────────────────────────────── */

  var SHOP_ITEMS = {
    hammer: { icon: "🔨", name: "Hammer", desc: "Smash any single tile — no match needed" },
    shuffle: { icon: "🔀", name: "Shuffle", desc: "Reshuffle the whole board into a fresh layout" },
    moves: { icon: "➕", name: "+5 Moves", desc: "Five extra moves on the current level" }
  };

  function openShop() {
    renderShop();
    showScreen("shop");
  }

  function renderShop() {
    $("shop-cakes").textContent = "🎂 " + Rewards.progress().cakes;
    var stock = Rewards.stock();
    var body = $("shop-body");
    body.innerHTML = "";
    ["hammer", "shuffle", "moves"].forEach(function (kind) {
      var it = SHOP_ITEMS[kind];
      var card = document.createElement("div");
      card.className = "shop-card";
      card.innerHTML =
        '<div class="s-icon">' + it.icon + "</div>" +
        '<div class="s-name">' + it.name + "</div>" +
        '<div class="s-desc">' + it.desc + "</div>" +
        '<div class="s-owned">In stock: ' + stock[kind] + "</div>" +
        '<button class="btn btn-primary" data-buy="' + kind + '">Buy — ' + PRICE[kind] + " 🎂</button>";
      body.appendChild(card);
    });
    body.querySelectorAll("[data-buy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.dataset.buy;
        if (Rewards.buyStock(kind, PRICE[kind])) {
          TGL.Audio.play("cake");
          toast("+1 " + SHOP_ITEMS[kind].name + " in stock 🛍️");
          renderShop();
        } else {
          TGL.Audio.play("invalid");
          toast("Not enough 🎂 — win more levels!");
        }
      });
    });
  }

  /* ── dev panel ────────────────────────────── */

  function noteCakeTap() {
    var now = Date.now();
    if (now - app.devTapLast > 1200) app.devTaps = 0;
    app.devTapLast = now;
    app.devTaps++;
    clearTimeout(app.devTapTimer);
    app.devTapTimer = setTimeout(function () { app.devTaps = 0; }, 1200);
    if (app.devTaps >= 5) {
      app.devTaps = 0;
      openDevPanel();
    }
  }

  function openDevPanel() {
    var c = Content.get();
    $("dev-myDares").value = c.myDares.join("\n");
    $("dev-specialDares").value = c.specialDares.join("\n");
    $("dev-finale").value = c.finaleMessage;
    syncToggles();
    openModal("modal-dev");
    TGL.Audio.play("fanfare");
    toast("Developer mode 🛠️");
  }

  function lines(text) {
    return text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function saveContent() {
    var my = lines($("dev-myDares").value);
    var sp = lines($("dev-specialDares").value);
    var fin = $("dev-finale").value.trim();
    if (!my.length || !sp.length) { toast("Lists can't be empty ❌"); return; }
    Content.saveOverride({ myDares: my, specialDares: sp, finaleMessage: fin });
    toast("Content saved 💾");
    TGL.Audio.play("wish");
  }

  /* ── boot ─────────────────────────────────── */

  function registerSW() {
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register("sw.js").catch(function () { /* offline file ok */ });
    }
  }

  function boot() {
    Audio = TGL.Audio; Render = TGL.Render; Board = TGL.Board;
    Levels = TGL.Levels; Rewards = TGL.Rewards; Dashboard = TGL.Dashboard; Content = TGL.Content;

    var s = Rewards.settings();
    Audio.setSound(s.sound);
    Audio.setMusic(s.music);
    Audio.init();

    buildHearts();
    Render.init($("board-canvas"), $("fx-canvas"));
    Render.setInput(onBoardInput);
    setInterval(idleTick, 500);
    updateSplash();
    registerSW();

    if (!TGL.Storage.persistent) {
      setTimeout(function () { toast("Note: progress won't survive a browser clear ⚠️", 3200); }, 1500);
    }

    $("btn-start").addEventListener("click", function () {
      TGL.Audio.play("tap");
      showScreen("map");
    });
    $("btn-story").addEventListener("click", function () {
      TGL.Audio.play("tap");
      Rewards.markIntroSeen();
      showScreen("map");
    });
    $("btn-shop").addEventListener("click", openShop);
    $("btn-shop-back").addEventListener("click", function () { showScreen("map"); });
    $("dev-cake").addEventListener("click", noteCakeTap);

    $("btn-dashboard").addEventListener("click", openDashboard);
    $("btn-dash-back").addEventListener("click", function () { showScreen("map"); });
    document.querySelectorAll(".tabs .tab").forEach(function (t) {
      t.addEventListener("click", function () {
        TGL.Audio.play("tap");
        Dashboard.showTab(t.dataset.tab);
        if (t.dataset.tab === "wishes") Dashboard.renderWishes();
        else Dashboard.renderDares();
      });
    });

    $("btn-settings").addEventListener("click", openSettings);
    $("btn-set-back").addEventListener("click", function () { showScreen("map"); });
    $("tg-sound").addEventListener("click", function () { toggleSetting("tg-sound", "sound"); });
    $("tg-music").addEventListener("click", function () { toggleSetting("tg-music", "music"); });
    $("tg-lives").addEventListener("click", function () { toggleSetting("tg-lives", "retryCostsLife"); });
    $("tg-instant").addEventListener("click", function () { toggleSetting("tg-instant", "instantWin"); });
    $("in-her").addEventListener("change", function () { Rewards.setSetting("herName", this.value.trim()); });
    $("in-his").addEventListener("change", function () { Rewards.setSetting("hisName", this.value.trim()); });
    $("btn-export").addEventListener("click", exportData);
    $("btn-import").addEventListener("click", importData);
    $("btn-reset").addEventListener("click", resetData);

    $("btn-play").addEventListener("click", function () {
      TGL.Audio.play("tap");
      closeModal("modal-level-intro");
      startLevel();
    });
    $("btn-intro-cancel").addEventListener("click", function () {
      closeModal("modal-level-intro");
    });

    $("btn-pause").addEventListener("click", function () {
      if (Render.isBusy()) return;
      openModal("modal-pause");
    });
    $("btn-resume").addEventListener("click", function () { closeModal("modal-pause"); });
    $("btn-quit").addEventListener("click", function () {
      closeModal("modal-pause");
      app.pendingSwap = null;
      showScreen("map");
    });

    $("btn-wish-save").addEventListener("click", saveWish);
    $("btn-wish-skip").addEventListener("click", function () {
      if (!app.winCtx) return;
      TGL.Audio.play("tap");
      finishWin();
    });
    $("btn-win-next").addEventListener("click", finishWin);
    $("wish-chips").querySelectorAll(".chip").forEach(function (c) {
      c.addEventListener("click", function () {
        var on = c.classList.contains("on");
        $("wish-chips").querySelectorAll(".chip").forEach(function (x) { x.classList.remove("on"); });
        if (!on) c.classList.add("on");
        TGL.Audio.play("tap");
      });
    });

    $("btn-streak-ok").addEventListener("click", function () {
      TGL.Audio.play("tap");
      backToWishFromSecret();
    });

    $("btn-dare-ok").addEventListener("click", function () {
      closeModal("modal-lose");
      var r = app._loseResult;
      showScreen("map");
      if (r && r.usedLife) toast("−1 ❤️ Be careful next time", 2400);
    });
    $("btn-retry").addEventListener("click", function () {
      TGL.Audio.play("tap");
      closeModal("modal-lose");
      if (app.mode === "endless") openEndlessIntro();
      else openLevelIntro(app.level);
    });

    $("btn-finale-ok").addEventListener("click", function () {
      TGL.Audio.play("tap");
      closeModal("modal-finale");
      showScreen("map");
    });

    $("btn-dev-close").addEventListener("click", function () { closeModal("modal-dev"); });
    $("btn-dev-save").addEventListener("click", saveContent);
    $("btn-dev-export").addEventListener("click", exportData);
    $("btn-dev-import").addEventListener("click", importData);
    $("btn-dev-reset").addEventListener("click", resetData);

    if (Rewards.seenIntro()) showScreen("splash");
    else showScreen("story");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
