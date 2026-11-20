/** Gate page definitions and pure evaluate helpers. */
window.LogicPages = window.LogicPages || {};

window.LogicPages.LED_COLORS = {
  wire: "#4aa3c7",
  not: "#6b7fd7",
  or: "#3f8f5a",
  and: "#c27a3a",
  xor: "#3f8f5a",
  latch: "#b85a4a",
};

window.LogicPages.PAGES = [
  {
    id: "wire",
    name: "WIRE",
    inputs: 1,
    goal: "Press the button to turn the light on.",
    parent:
      "A wire passes a signal through. Pressed = ON (1). Released = OFF (0). This is the simplest path electricity can take.",
    truth: [
      { in: "button released", out: "off" },
      { in: "button pressed", out: "on" },
    ],
    completeWhen: (s) => s.out === true,
  },
  {
    id: "not",
    name: "NOT",
    inputs: 1,
    goal: "Press the button (light goes off), then let go (light comes back).",
    parent:
      "A NOT gate flips the signal. When the button is off, the light is on. Many sensors work this way (active-low).",
    truth: [
      { in: "button released", out: "on" },
      { in: "button pressed", out: "off" },
    ],
    completeWhen: (s) => s.sawOff && s.out === true && !s.a,
  },
  {
    id: "or",
    name: "OR",
    inputs: 2,
    goal: "Turn the light on with either button.",
    parent:
      "OR lights up if any input is on — like a car dome light that turns on when any door opens.",
    truth: [
      { in: "none", out: "off" },
      { in: "red only", out: "on" },
      { in: "yellow only", out: "on" },
      { in: "both", out: "on" },
    ],
    completeWhen: (s) => s.out === true,
  },
  {
    id: "and",
    name: "AND",
    inputs: 2,
    goal: "Press both buttons at the same time.",
    parent:
      "AND needs every input on — like a special move that only fires when two buttons are held together.",
    truth: [
      { in: "none", out: "off" },
      { in: "red only", out: "off" },
      { in: "yellow only", out: "off" },
      { in: "both", out: "on" },
    ],
    completeWhen: (s) => s.out === true && s.a && s.b,
  },
  {
    id: "xor",
    name: "XOR",
    inputs: 2,
    goal: "Light the LED with exactly one button.",
    parent:
      "XOR (exclusive OR) is on only when inputs differ. Useful for comparing two signals or building adders.",
    truth: [
      { in: "none", out: "off" },
      { in: "red only", out: "on" },
      { in: "yellow only", out: "on" },
      { in: "both", out: "off" },
    ],
    completeWhen: (s) => s.out === true && s.a !== s.b,
  },
  {
    id: "latch",
    name: "LATCH",
    inputs: 2,
    labels: { a: "SET", b: "RESET" },
    goal: "Press SET so the light stays on after you let go. Then press RESET to clear it.",
    parent:
      "A latch remembers. SET turns the light on and it stays on. RESET clears it. This is how computers keep a bit of memory.",
    truth: [
      { in: "SET pulse", out: "stays on" },
      { in: "RESET pulse", out: "clears" },
    ],
    completeWhen: (s) => s.latchedSeen && s.resetSeen,
  },
];

window.LogicPages.evaluate = function evaluate(pageId, a, b, latchState) {
  switch (pageId) {
    case "wire":
      return { out: a, latch: false };
    case "not":
      return { out: !a, latch: false };
    case "or":
      return { out: a || b, latch: false };
    case "and":
      return { out: a && b, latch: false };
    case "xor":
      return { out: a !== b, latch: false };
    case "latch": {
      let next = latchState;
      if (a && !b) next = true;
      if (b) next = false;
      return { out: next, latch: next };
    }
    default:
      return { out: false, latch: false };
  }
};

window.LogicPages.pageIndex = function pageIndex(id) {
  return window.LogicPages.PAGES.findIndex((p) => p.id === id);
};
