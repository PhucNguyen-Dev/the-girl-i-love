/* rewards.js — persistence + win/lose/streak reward logic, wishes, dares */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  var K = {
    progress: "tgl_progress",
    wishes: "tgl_wishes",
    streak: "tgl_streak",
    settings: "tgl_settings",
    revealed: "tgl_dares_revealed",
    hearts: "tgl_hearts",
    stock: "tgl_stock",
    endless: "tgl_endless",
    seenIntro: "tgl_seen_intro",
    matches: "tgl_matches",
    dareState: "tgl_dare_state",
    letterSeen: "tgl_letter_seen"
  };

  var STAR_MULT = { 0: 1.0, 1: 1.10, 2: 1.15, 3: 1.25 };
  var DEFAULTS = { sound: true, music: true, retryCostsLife: false, herName: "", hisName: "", instantWin: false };
  var cache = null;

  function progress() {
    return TGL.Storage.get(K.progress, { level: 1, stars: {}, cakes: 0 }) ||
      { level: 1, stars: {}, cakes: 0 };
  }

  function saveProgress(p) { TGL.Storage.set(K.progress, p); }

  function settings() {
    if (!cache) {
      var s = TGL.Storage.get(K.settings, {}) || {};
      for (var k in DEFAULTS) if (s[k] === undefined) s[k] = DEFAULTS[k];
      cache = s;
    }
    return cache;
  }

  function saveSettings() { TGL.Storage.set(K.settings, cache); }

  function revealed() {
    return TGL.Storage.get(K.revealed, { my: [], special: [] }) || { my: [], special: [] };
  }

  function hearts() {
    var h = TGL.Storage.get(K.hearts, 5);
    if (typeof h !== "number" || h < 0 || h > 5) h = 5;
    return h;
  }

  var Rewards = {
    settings: settings,

    setSetting: function (key, val) {
      settings()[key] = val;
      saveSettings();
    },

    progress: progress,
    hearts: hearts,

    totalStars: function () {
      var p = progress(), sum = 0;
      for (var k in p.stars) sum += p.stars[k];
      return sum;
    },

    streak: function () {
      var v = TGL.Storage.get(K.streak, 0);
      return typeof v === "number" ? v : 0;
    },

    /* ── win: returns everything the win flow needs ── */
    win: function (levelNum, stars, baseCakes) {
      var p = progress();
      var mult = STAR_MULT[stars] || 1;
      var payout = Math.round(baseCakes * mult);

      p.stars[levelNum] = Math.max(p.stars[levelNum] || 0, stars);
      p.cakes = (p.cakes || 0) + payout;
      if (levelNum >= p.level && levelNum < TGL.Levels.count) p.level = levelNum + 1;
      saveProgress(p);

      var streak = Rewards.streak() + 1;
      var secret = streak >= 10;
      TGL.Storage.set(K.streak, secret ? 0 : streak);
      TGL.Storage.set(K.matches, (TGL.Storage.get(K.matches, 0) || 0) + 1);

      // hearts: free refill on win if the toggle drained them
      if (hearts() < 5) TGL.Storage.set(K.hearts, 5);

      return { payout: payout, stars: stars, streak: secret ? 0 : streak, secret: secret };
    },

    /* ── lose ── */
    lose: function () {
      TGL.Storage.set(K.streak, 0);
      TGL.Storage.set(K.matches, (TGL.Storage.get(K.matches, 0) || 0) + 1);
      var usedLife = false;
      if (settings().retryCostsLife) {
        var h = hearts();
        if (h > 0) { TGL.Storage.set(K.hearts, h - 1); usedLife = true; }
        else TGL.Storage.set(K.hearts, 5); // never soft-lock: auto refill
      }
      return { streak: 0, usedLife: usedLife, hearts: hearts() };
    },

    /* ── dares: prefer never-revealed, record reveal ── */
    pickDare: function (which) {
      var content = TGL.Content.get();
      var list = which === "special" ? content.specialDares : content.myDares;
      if (!list || !list.length) return { text: "You win this time… 😌", index: -1 };

      var rev = revealed();
      var key = which === "special" ? "special" : "my";
      var seen = rev[key] || [];
      var pool = [];
      var idx, i;
      var matches = TGL.Storage.get(K.matches, 0) || 0;

      if (which === "special") {
        // rule: every dare shows once first; a shown dare needs a
        // 10-match cooldown before it has a chance to appear again
        var unseen = [];
        for (i = 0; i < list.length; i++) if (seen.indexOf(i) === -1) unseen.push(i);
        if (unseen.length) {
          pool = unseen;
        } else {
          var st = TGL.Storage.get(K.dareState, null);
          if (!st || typeof st !== "object" || typeof st.last !== "object" || !st.last) st = { last: {} };
          for (i = 0; i < list.length; i++) {
            var last = typeof st.last[i] === "number" ? st.last[i] : -1;
            if (matches - last >= 10) pool.push(i);
          }
          if (!pool.length) for (i = 0; i < list.length; i++) pool.push(i); // safety
        }
      } else {
        for (i = 0; i < list.length; i++) if (seen.indexOf(i) === -1) pool.push(i);
      }

      if (pool.length) idx = pool[Math.floor(Math.random() * pool.length)];
      else idx = Math.floor(Math.random() * list.length);

      if (which === "special") {
        var st2 = TGL.Storage.get(K.dareState, null);
        if (!st2 || typeof st2 !== "object" || typeof st2.last !== "object" || !st2.last) st2 = { last: {} };
        st2.last[idx] = matches;
        TGL.Storage.set(K.dareState, st2);
      }

      var firstTime = seen.indexOf(idx) === -1;
      if (firstTime) {
        seen.push(idx);
        rev[key] = seen;
        TGL.Storage.set(K.revealed, rev);
      }
      return { text: list[idx], index: idx, firstTime: firstTime };
    },

    revealedList: function () { return revealed(); },

    /* ── wishes ── */
    wishes: function () {
      var w = TGL.Storage.get(K.wishes, []);
      return Array.isArray(w) ? w : [];
    },

    saveWish: function (text, category) {
      text = (text || "").trim();
      if (!text) return { ok: false, reason: "empty" };
      var list = Rewards.wishes();
      text = text.slice(0, 200);
      for (var i = 0; i < list.length; i++) {
        if (list[i].text.toLowerCase() === text.toLowerCase() && list[i].status === "pending") {
          return { ok: false, reason: "duplicate" };
        }
      }
      list.unshift({
        id: Date.now() + "_" + Math.floor(Math.random() * 1000),
        text: text,
        category: category || "",
        createdAt: Date.now(),
        status: "pending"
      });
      if (list.length > 200) list.length = 200;
      TGL.Storage.set(K.wishes, list);
      return { ok: true };
    },

    setWishStatus: function (id, status) {
      var list = Rewards.wishes();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { list[i].status = status; break; }
      }
      TGL.Storage.set(K.wishes, list);
    },

    deleteWish: function (id) {
      var list = Rewards.wishes().filter(function (w) { return w.id !== id; });
      TGL.Storage.set(K.wishes, list);
    },

    /* ── booster stock (shop) ── */
    stock: function () {
      var s = TGL.Storage.get(K.stock, null);
      if (!s || typeof s !== "object") s = { hammer: 0, shuffle: 0, moves: 0 };
      ["hammer", "shuffle", "moves"].forEach(function (k) {
        if (typeof s[k] !== "number" || s[k] < 0) s[k] = 0;
      });
      return s;
    },

    buyStock: function (kind, price) {
      var p = progress();
      if (p.cakes < price) return false;
      p.cakes -= price;
      saveProgress(p);
      var s = Rewards.stock();
      s[kind] = (s[kind] || 0) + 1;
      TGL.Storage.set(K.stock, s);
      return true;
    },

    useStock: function (kind) {
      var s = Rewards.stock();
      if (!s[kind]) return false;
      s[kind]--;
      TGL.Storage.set(K.stock, s);
      return true;
    },

    /* ── endless challenge ── */
    endless: function () {
      var e = TGL.Storage.get(K.endless, null);
      if (!e || typeof e !== "object") e = { loop: 1, wishCount: 0, best: 0 };
      if (typeof e.loop !== "number" || e.loop < 1) e.loop = 1;
      if (typeof e.wishCount !== "number" || e.wishCount < 0) e.wishCount = 0;
      if (typeof e.best !== "number") e.best = 0;
      return e;
    },

    // called on every endless win; wish panel shows every 5th win
    advanceEndless: function () {
      var e = Rewards.endless();
      e.loop++;
      e.wishCount++;
      e.best = Math.max(e.best, e.loop);
      TGL.Storage.set(K.endless, e);
      return { nextLoop: e.loop, showWish: e.wishCount % 5 === 0, best: e.best };
    },

    /* ── first-launch story ── */
    seenIntro: function () { return !!TGL.Storage.get(K.seenIntro, false); },
    markIntroSeen: function () { TGL.Storage.set(K.seenIntro, true); },

    /* ── letter mailbox (first auto-open after finale) ── */
    letterSeen: function () { return !!TGL.Storage.get(K.letterSeen, false); },
    markLetterSeen: function () { TGL.Storage.set(K.letterSeen, true); },

    /* ── backup / restore / reset ── */
    exportAll: function () {
      var data = { v: 1, exportedAt: Date.now() };
      TGL.Storage.keys().forEach(function (k) {
        if (k.indexOf("tgl_") === 0) data[k] = TGL.Storage.get(k, null);
      });
      return JSON.stringify(data, null, 1);
    },

    importAll: function (json) {
      var data = JSON.parse(json);
      if (!data || typeof data !== "object") throw new Error("bad backup");
      var any = false;
      for (var k in data) {
        if (k.indexOf("tgl_") === 0) { TGL.Storage.set(k, data[k]); any = true; }
      }
      if (!any) throw new Error("no data");
      return true;
    },

    resetAll: function () {
      TGL.Storage.reset();
      cache = null;
    }
  };

  TGL.Rewards = Rewards;
})();
