/* ═══════════════════════════════════════════════════════════
   ★★★  EDIT YOUR DARES HERE  ★★★
   This is the ONLY file you need to change before gifting.
   Rewrite the sentences below to match your own voice.
   (Or use the hidden developer panel in-game: tap the 🎂 on
   the title screen 5 times fast — changes save to the phone.)
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  var DEFAULT_CONTENT = {
    // When SHE loses → she must do one of these
    myDares: [
      "Now rub you pussy against my cock until you dry",
      "Give me a 60-second hug, timer on 😌",
      "Sing the chorus of my favorite song",
      "Make me a drink and deliver it with a curtsy ☕",
      "Take a selfie with your silliest face and send it to me",
      "Compliment me for 60 seconds straight, no pauses",
      "Let me pick the movie tonight 🎬",
      "Draw a tiny heart on my hand 🖐️",
      "Feed me the next three bites of my food",
      "Tell me my best quality — with evidence",
      "Dance one slow song with me, no music needed 💃",
      "Write me a haiku about us 📝",
      "Back massage until I say stop (minimum 2 minutes) 💆",
      "Put your phone away for one whole hour and just talk to me",
      "Say my name the way you did when we first met",
      "Recreate our first selfie together 📸",
      "Let me do your hair however I want 💇",
      "Share your fries with me — all of them 🍟",
      "Hold my hand in public for the next 10 minutes",
      "Act out your favorite memory of us, no words allowed 🎭",
      "Text me a heart emoji right now, from right there 💗",
      "Pick the music for the whole car ride 🎶",
      "Stay up 15 minutes later just to talk to me 🌙",
      "Give me your hoodie for the rest of the day 🧥",
      "Recreate your favorite photo of me — pose and all"
    ],

    // 10 wins in a row → the SECRET unlocked list
    // Rules: each dare shows once first; only after 10 matches can it reappear.
    specialDares: [
      "drop your little wet tight pussy upon my face and let me eat it",
      "come on bae, show me your naughty face with endless moans",
      "do a sex squat excerise with my cock and moan till the abyss hear you",
      "you reach here, it's time for you to taste the most dangerous fruit",
      "beware me in your sleep, I can tear your pussy apart with miles away",
      "tied yourself first and wait for your daddy to reward you",
      "who has the most dirty mind right now, huh. Do you dare to tell me so badly? 😈",
      "tiddy your room now baby, and prepare for the biggest mess ever with our juice today"
    ],

    // Shown after beating level 15 — the birthday finale
    finaleMessage:
      "Happy Birthday, my love 🎂\n\n" +
      "You beat all 15 levels — but honestly, every day with you feels like a win. " +
      "I made this for you because you deserve a whole game dedicated to how special you are.\n\n" +
      "I love you. 🎈\n\n" +
      "something ahead waiting for you"
  };

  // Merge phone-side developer-panel edits over the baked-in defaults
  function load() {
    var override = TGL.Storage.get("tgl_content_override", null);
    if (!override || typeof override !== "object") return DEFAULT_CONTENT;
    return {
      myDares: Array.isArray(override.myDares) && override.myDares.length
        ? override.myDares : DEFAULT_CONTENT.myDares,
      specialDares: Array.isArray(override.specialDares) && override.specialDares.length
        ? override.specialDares : DEFAULT_CONTENT.specialDares,
      finaleMessage: typeof override.finaleMessage === "string" && override.finaleMessage
        ? override.finaleMessage : DEFAULT_CONTENT.finaleMessage
    };
  }

  TGL.Content = {
    defaults: DEFAULT_CONTENT,
    get: load,
    saveOverride: function (obj) {
      TGL.Storage.set("tgl_content_override", {
        myDares: obj.myDares,
        specialDares: obj.specialDares,
        finaleMessage: obj.finaleMessage
      });
    },
    clearOverride: function () {
      TGL.Storage.remove("tgl_content_override");
    }
  };
})();
