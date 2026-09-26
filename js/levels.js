/* levels.js — 15 declarative levels + tile table + map layout */
(function () {
  "use strict";
  globalThis.TGL = globalThis.TGL || {};

  var TILES = ["💗", "🌸", "⭐", "🎁", "🍫", "💍"];

  // objective: {type:'collect', tile, count} | {type:'clear', count} | {type:'blockers'}
  var LEVELS = [
    { n: 1,  w: 7, h: 7, moves: 25, objective: { type: "collect",  tile: 0, count: 10 }, blockers: [] },
    { n: 2,  w: 7, h: 7, moves: 25, objective: { type: "clear",    count: 40 },        blockers: [] },
    { n: 3,  w: 7, h: 7, moves: 24, objective: { type: "collect",  tile: 1, count: 15 }, blockers: [] },
    { n: 4,  w: 7, h: 7, moves: 25, objective: { type: "blockers" }, blockers: [[2,1,2],[2,5,2],[4,1,2],[4,5,2],[3,3,1],[1,3,1]] },
    { n: 5,  w: 7, h: 7, moves: 24, objective: { type: "collect",  tile: 2, count: 18 }, blockers: [] },
    { n: 6,  w: 7, h: 7, moves: 24, objective: { type: "clear",    count: 50 },        blockers: [[1,1,1],[1,5,1],[5,1,1],[5,5,1]] },
    { n: 7,  w: 7, h: 7, moves: 23, objective: { type: "collect",  tile: 3, count: 20 }, blockers: [] },
    { n: 8,  w: 7, h: 7, moves: 24, objective: { type: "blockers" }, blockers: [[1,1,2],[1,3,1],[1,5,2],[3,1,1],[3,5,1],[5,1,2],[5,3,1],[5,5,2]] },
    { n: 9,  w: 7, h: 7, moves: 22, objective: { type: "collect",  tile: 5, count: 12 }, blockers: [] },
    { n: 10, w: 7, h: 7, moves: 22, objective: { type: "clear",    count: 60 },        blockers: [[2,2,2],[2,4,2],[4,2,2],[4,4,2],[0,3,1],[6,3,1]] },
    { n: 11, w: 7, h: 7, moves: 22, objective: { type: "collect",  tile: 4, count: 22 }, blockers: [] },
    { n: 12, w: 7, h: 7, moves: 23, objective: { type: "blockers" }, blockers: [[1,0,2],[1,2,1],[1,4,1],[1,6,2],[5,0,2],[5,2,1],[5,4,1],[5,6,2],[3,1,2],[3,3,1],[3,5,2],[0,3,1]] },
    { n: 13, w: 7, h: 7, moves: 21, objective: { type: "collect",  tile: 0, count: 25 }, blockers: [] },
    { n: 14, w: 7, h: 7, moves: 20, objective: { type: "clear",    count: 80 },        blockers: [[1,1,2],[1,5,2],[3,3,2],[5,1,2],[5,5,2],[2,3,1],[4,3,1],[6,3,1]] },
    { n: 15, w: 7, h: 7, moves: 22, objective: { type: "clear",    count: 100 },       blockers: [[0,1,2],[0,3,2],[0,5,2],[2,1,2],[2,5,2],[4,1,2],[4,5,2],[6,1,2],[6,3,2],[6,5,2],[3,0,1],[3,6,1]] }
  ];

  var STAR_MOVES_LEFT = { three: 0.35, two: 0.15 }; // fraction of starting moves

  function get(n) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].n === n) return LEVELS[i];
    return LEVELS[LEVELS.length - 1];
  }

  function describe(level) {
    var o = level.objective;
    if (o.type === "collect") return "Collect " + o.count + " " + TILES[o.tile];
    if (o.type === "clear") return "Clear " + o.count + " tiles";
    return "Break all the gift boxes 🎁";
  }

  // vertical serpentine path, percentages of path width
  function mapLayout() {
    var nodes = [];
    for (var i = 0; i < LEVELS.length; i++) {
      nodes.push({
        n: LEVELS[i].n,
        x: 50 + 30 * Math.sin(i * 0.95),
        y: 70 + i * 128
      });
    }
    return nodes;
  }

  TGL.Levels = {
    all: LEVELS,
    tiles: TILES,
    get: get,
    describe: describe,
    mapLayout: mapLayout,
    starMovesLeft: STAR_MOVES_LEFT,
    count: LEVELS.length
  };
})();
