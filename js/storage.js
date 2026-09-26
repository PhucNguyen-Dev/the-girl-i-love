/* storage.js — localStorage helpers with in-memory fallback (file:// safe) */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  var memory = {};
  var usable = (function () {
    try {
      var k = "__tgl_probe__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();

  var Storage = {
    persistent: usable,

    get: function (key, fallback) {
      try {
        var raw = usable ? localStorage.getItem(key) : memory[key];
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },

    set: function (key, value) {
      var raw;
      try {
        raw = JSON.stringify(value);
      } catch (e) {
        return false;
      }
      try {
        if (usable) localStorage.setItem(key, raw);
        else memory[key] = raw;
        return true;
      } catch (e) {
        memory[key] = raw;
        return false;
      }
    },

    remove: function (key) {
      try {
        if (usable) localStorage.removeItem(key);
        delete memory[key];
      } catch (e) { /* ignore */ }
    },

    keys: function () {
      var out = [];
      try {
        for (var i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
      } catch (e) { /* ignore */ }
      for (var m in memory) if (out.indexOf(m) === -1) out.push(m);
      return out;
    },

    reset: function () {
      var all = Storage.keys();
      for (var i = 0; i < all.length; i++) {
        if (all[i].indexOf("tgl_") === 0) Storage.remove(all[i]);
      }
    }
  };

  TGL.Storage = Storage;
})();
