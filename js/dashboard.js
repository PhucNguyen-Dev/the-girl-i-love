/* dashboard.js — Wish Board UI: My Wishes + My Dares tabs */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  function timeAgo(ts) {
    var d = Date.now() - ts;
    var m = Math.floor(d / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  var Dashboard = {
    open: function () {
      Dashboard.showTab("wishes");
      Dashboard.renderWishes();
      Dashboard.renderDares();
    },

    showTab: function (name) {
      document.querySelectorAll(".tabs .tab").forEach(function (t) {
        t.classList.toggle("active", t.dataset.tab === name);
      });
      document.getElementById("wishes-list").hidden = name !== "wishes";
      document.getElementById("dares-list").hidden = name !== "dares";
    },

    renderWishes: function () {
      var ul = document.getElementById("wishes-list");
      ul.innerHTML = "";
      var list = TGL.Rewards.wishes();
      if (!list.length) {
        ul.appendChild(el("li", "empty-state",
          "No wishes yet 💭<br>Win a level and tell me<br>what I should do 😏"));
        return;
      }
      list.forEach(function (w, i) {
        var li = el("li", "card-item");
        li.style.animationDelay = Math.min(i * 40, 300) + "ms";
        var badge = w.status === "done"
          ? '<span class="badge done">He did it ✅</span>'
          : '<span class="badge">pending ⏳</span>';
        var cat = w.category ? '<span class="badge">' + esc(w.category) + "</span>" : "";
        li.innerHTML =
          '<div class="wish-text">' + esc(w.text) + "</div>" +
          '<div class="wish-meta">' + badge + cat +
          "<span>" + timeAgo(w.createdAt) + "</span>" +
          '<span style="flex:1"></span>' +
          (w.status === "done"
            ? '<button class="mini-btn" data-act="pending">Undo</button>'
            : '<button class="mini-btn" data-act="done">He did it ✅</button>') +
          '<button class="mini-btn danger" data-act="del">Delete</button>' +
          "</div>";

        li.querySelector('[data-act="done"]') && li.querySelector('[data-act="done"]')
          .addEventListener("click", function () {
            TGL.Rewards.setWishStatus(w.id, "done");
            TGL.Audio.play("wish");
            Dashboard.renderWishes();
          });
        li.querySelector('[data-act="pending"]') && li.querySelector('[data-act="pending"]')
          .addEventListener("click", function () {
            TGL.Rewards.setWishStatus(w.id, "pending");
            Dashboard.renderWishes();
          });
        li.querySelector('[data-act="del"]').addEventListener("click", function () {
          TGL.Rewards.deleteWish(w.id);
          Dashboard.renderWishes();
        });
        ul.appendChild(li);
      });
    },

    renderDares: function () {
      var ul = document.getElementById("dares-list");
      ul.innerHTML = "";
      var content = TGL.Content.get();
      var rev = TGL.Rewards.revealedList();

      function section(title, list, seen) {
        var head = el("li", "empty-state", title);
        head.style.padding = "10px 0 2px";
        head.style.fontWeight = "800";
        head.style.color = "#d6336c";
        ul.appendChild(head);
        list.forEach(function (text, i) {
          var li = el("li", "card-item");
          var isOpen = seen.indexOf(i) !== -1;
          li.innerHTML = isOpen
            ? '<div class="wish-text">' + esc(text) + "</div>" +
              '<div class="wish-meta"><span class="badge done">revealed ✨</span></div>'
            : '<div class="wish-text dare-hidden">???</div>' +
              '<div class="wish-meta"><span class="badge">not yet</span></div>';
          ul.appendChild(li);
        });
      }

      section("Lose dares 🎲", content.myDares, rev.my || []);
      section("Secret unlocks 🏆", content.specialDares, rev.special || []);
    }
  };

  TGL.Dashboard = Dashboard;
})();
