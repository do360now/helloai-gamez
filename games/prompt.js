(function (root) {
  "use strict";

  var HINTS = {
    "block-drop": {
      act: 'arcade.act("place R C") (rotation R, column C)',
      decision: "one decision per piece",
      extra: ""
    },
    "color-stack": {
      act: 'arcade.act("place R C") (cycle R, column C)',
      decision: "one decision per piece",
      extra: ""
    },
    "pill-drop": {
      act: 'arcade.act("place R C") (orientation R, column C)',
      decision: "one decision per pill",
      extra: ""
    },
    "night-shift": {
      act: 'arcade.act("look at board") (any plain command)',
      decision: "one command per turn, 150 commands in the budget",
      extra: "Say whether you played blind (text only) or open-book (you read the source or world data); the run needs player.disclosure."
    },
    "default": {
      act: "arcade.act(action) with an action from arcade.info().actions",
      decision: "one decision per move",
      extra: ""
    }
  };

  function agentPrompt(bench, origin) {
    if (typeof origin !== "string" || !/^https?:\/\//.test(origin)) {
      origin = "https://play.helloai.com";
    }
    var hint = Object.prototype.hasOwnProperty.call(HINTS, bench.game) ? HINTS[bench.game] : HINTS["default"];
    var nightShift = bench.game === "night-shift";
    var url = origin + "/games/" + bench.game + "/?" + (nightShift ? "" : "agent=1&") +
      "seed=" + bench.seed + "&bench=" + bench.bench;
    var view = nightShift ? "room text" : "text board";
    var steps = [
      "Open " + url + " in a browser you control. It is turn-based: nothing moves until you act.",
      "The page exposes window.arcade. arcade.observe() returns " +
        (nightShift ? "the room as text plus objects, exits, inventory and verbs" : "the board as text plus the legal moves") +
        "; " + hint.act + (nightShift ? " applies one command and returns the new room state" : " applies one move and returns the new board") +
        "; when observe().over is true, arcade.run() returns the recorded run."
    ];
    if (bench.rules) steps.push("Rules: " + bench.rules);
    steps.push("Play from the " + view + ", " + hint.decision +
      ", without writing a solver unless I ask for one. The protocol, with every action, is at " + origin + "/agents.md.");
    steps.push("When the run is over, tell me the final score and stats, say in one line how you played (" + view +
      ", code you wrote, or screenshots) and how many attempts it took, and keep the JSON from arcade.run() so I can submit it to the scoreboard." +
      (hint.extra ? " " + hint.extra : ""));
    return "Play " + bench.title + " on play.helloai.com for me and report the score.\n\n" +
      steps.map(function (step, index) { return (index + 1) + ". " + step; }).join("\n") +
      '\n\nNo browser tool? Clone https://github.com/do360now/helloai-gamez and follow "No browser?" in agents.md.';
  }

  if (typeof module !== "undefined" && module.exports) {
    exports.agentPrompt = agentPrompt;
    exports.HINTS = HINTS;
  } else {
    root.arcadePrompt = { agentPrompt: agentPrompt, HINTS: HINTS };
  }
})(typeof window !== "undefined" ? window : this);
