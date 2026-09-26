/* mail.js — letter outbox: save first, then deliver via FormSubmit AJAX */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  var ENDPOINT = "https://formsubmit.co/ajax/kentnguyenbuildthewall@gmail.com";
  var K_OUTBOX = "tgl_outbox";

  function outbox() {
    var o = TGL.Storage.get(K_OUTBOX, null);
    if (!Array.isArray(o)) o = [];
    // salvage entries written by older/odd shapes
    return o.filter(function (m) { return m && typeof m.text === "string"; });
  }

  function save(list) { TGL.Storage.set(K_OUTBOX, list); }

  function bodyFor(item) {
    var when = new Date(item.at).toLocaleString();
    return "💌 A letter from her phone\n" + when + "\n\n" + item.text;
  }

  var flushing = null;

  var Mail = {
    outbox: outbox,

    pending: function () {
      return outbox().filter(function (m) { return m.status !== "sent"; }).length;
    },

    /* queue first — her words are never lost, even fully offline */
    queue: function (text, fromName) {
      text = (text || "").trim();
      if (!text) return null;
      text = text.slice(0, 2000);
      var list = outbox();
      var item = {
        id: Date.now() + "_" + Math.floor(Math.random() * 1000),
        text: text,
        from: (fromName || "").slice(0, 60),
        at: Date.now(),
        status: "pending"
      };
      list.push(item);
      save(list);
      return item.id;
    },

    /* try to deliver every pending letter; safe to call anytime (boot, online, send) */
    flush: function () {
      if (flushing) return flushing;
      var list = outbox();
      var pendingIdx = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].status !== "sent") pendingIdx.push(i);
      }
      if (!pendingIdx.length) return Promise.resolve({ sent: 0, left: 0 });

      flushing = (async function () {
        var sent = 0;
        try {
          for (var k = 0; k < pendingIdx.length; k++) {
            var item = list[pendingIdx[k]];
            try {
              var res = await fetch(ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                  _subject: "💌 She wrote you a letter",
                  name: item.from || "The Girl I Love",
                  message: bodyFor(item)
                })
              });
              var data = null;
              try { data = await res.json(); } catch (e) { data = null; }
              var ok = res.ok && data && String(data.success) !== "false";
              if (ok) {
                item.status = "sent";
                item.sentAt = Date.now();
                sent++;
                save(list);
              }
            } catch (e) {
              // offline / network error → stays pending, retried next time
              break;
            }
          }
        } finally {
          flushing = null;
        }
        return { sent: sent, left: pendingIdx.length - sent };
      })();
      return flushing;
    }
  };

  TGL.Mail = Mail;
})();
