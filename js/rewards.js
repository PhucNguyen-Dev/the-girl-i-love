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
    hearts: "tgl_hearts"
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

      // hearts: free refill on win if the toggle drained them
      if (hearts() < 5) TGL.Storage.set(K.hearts, 5);

      return { payout: payout, stars: stars, streak: secret ? 0 : streak, secret: secret };
    },

    /* ── lose ── */
    lose: function () {
      TGL.Storage.set(K.streak, 0);
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
      for (var i = 0; i < list.length; i++) if (seen.indexOf(i) === -1) pool.push(i);
      var idx;
      if (pool.length) idx = pool[Math.floor(Math.random() * pool.length)];
      else idx = Math.floor(Math.random() * list.length);

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
