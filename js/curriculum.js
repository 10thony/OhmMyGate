/** Deep curriculum: graph levels + evaluator. Drawing via LP.* from draw.js. */
window.LogicPages = window.LogicPages || {};

(function (LP) {
  const COLORS = {
    red: "#b85a4a",
    yellow: "#c9a24a",
    blue: "#4a7ab8",
    green: "#3f8f5a",
    purple: "#8b6bb8",
    teal: "#2a9d8f",
  };

  const {
    gateShape,
    gatePorts,
    led,
    ledPorts,
    probe,
    probePorts,
    buttonPort,
    wire,
    memBox,
    memPorts,
  } = LP;

  function opEval(op, ins, mem) {
    switch (op) {
      case "WIRE":
        return !!ins[0];
      case "NOT":
        return !ins[0];
      case "OR":
        return !!(ins[0] || ins[1]);
      case "AND":
        return !!(ins[0] && ins[1]);
      case "XOR":
        return !!(!!ins[0] !== !!ins[1]);
      case "LATCH": {
        // ins[0]=SET, ins[1]=RESET — RESET wins
        if (ins[1]) return false;
        if (ins[0]) return true;
        return !!mem;
      }
      default:
        return false;
    }
  }

  /** Evaluate a level graph. buttons: {id:bool}, mem: {latchNodeId:bool} */
  function evaluate(level, buttons, mem) {
    const values = { ...buttons };
    const nextMem = { ...(mem || {}) };
    const extras = level._extras || {};

    // Apply jumper virtual: b_eff etc.
    if (extras.jumperNeeded) {
      values._jumper = !!extras.jumper;
    }

    const pending = level.nodes.map((n) => n.id);
    let guard = 0;
    while (pending.length && guard++ < 40) {
      let progressed = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        const node = level.nodes.find((n) => n.id === pending[i]);
        const ready = node.inputs.every((inp) => {
          if (inp === "_jumper") return true;
          return Object.prototype.hasOwnProperty.call(values, inp);
        });
        if (!ready) continue;
        const ins = node.inputs.map((inp) => {
          if (inp === "_jumper") return !!extras.jumper;
          return !!values[inp];
        });
        if (node.op === "LATCH") {
          const out = opEval("LATCH", ins, nextMem[node.id]);
          nextMem[node.id] = out;
          values[node.id] = out;
        } else {
          values[node.id] = opEval(node.op, ins);
        }
        pending.splice(i, 1);
        progressed = true;
      }
      if (!progressed) break;
    }
    return { values, mem: nextMem };
  }

  // ——— Track A ———
  const A = [
    {
      id: "wire",
      track: "A",
      name: "WIRE",
      goal: "Press the button to turn the light on.",
      parent: "A wire passes a signal through. Pressed = ON (1). Released = OFF (0).",
      hint: "Hold the red button. Watch the wire turn on.",
      ledColor: "#4aa3c7",
      buttons: [{ id: "a", color: "red", label: "Button", x: 18.3, y: 50.2 }],
      nodes: [{ id: "out", op: "WIRE", inputs: ["a"], led: true }],
      truth: [
        { in: "released", out: "off" },
        { in: "pressed", out: "on" },
      ],
      completeWhen: (v, b) => v.out,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const gx = 220,
          gy = 130,
          lx = 500,
          ly = 130;
        const g = gatePorts("WIRE", gx, gy);
        const L = ledPorts(lx, ly);
        const a = buttonPort(18.3, 50.2);
        return `
        ${wire("a", a, g.inMid)}
        ${wire("out", g.out, L.in)}
        ${gateShape("WIRE", gx, gy, "WIRE", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "not",
      track: "A",
      name: "NOT",
      goal: "Press the button (light off), then let go (light on).",
      parent: "A NOT gate flips the signal. Off → on. On → off.",
      hint: "Press, then let go. Watch the light.",
      ledColor: "#6b7fd7",
      buttons: [{ id: "a", color: "red", label: "Button", x: 18.3, y: 50.2 }],
      nodes: [{ id: "out", op: "NOT", inputs: ["a"], led: true }],
      truth: [
        { in: "released", out: "on" },
        { in: "pressed", out: "off" },
      ],
      flags: { sawOff: false },
      onUpdate(v, b, flags) {
        if (b.a && !v.out) flags.sawOff = true;
      },
      completeWhen: (v, b, f) => f.sawOff && v.out && !b.a,
      revealWhen: (v, b, f) => f.sawOff && v.out && !b.a,
      draw: (rev) => {
        const gx = 200,
          gy = 130,
          lx = 500,
          ly = 130;
        const g = gatePorts("NOT", gx, gy);
        const L = ledPorts(lx, ly);
        const a = buttonPort(18.3, 50.2);
        return `
        ${wire("a", a, g.inMid)}
        ${wire("out", g.out, L.in)}
        ${gateShape("NOT", gx, gy, "NOT", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "or",
      track: "A",
      name: "OR",
      goal: "Turn the light on with either button.",
      parent: "OR lights if any input is on — like a dome light for any open door.",
      hint: "Try one button, then the other.",
      ledColor: "#3f8f5a",
      buttons: [
        { id: "a", color: "red", label: "Red", x: 18.3, y: 27.2 },
        { id: "b", color: "yellow", label: "Yellow", x: 18.3, y: 73.2 },
      ],
      nodes: [{ id: "out", op: "OR", inputs: ["a", "b"], led: true }],
      truth: [
        { in: "none", out: "off" },
        { in: "either", out: "on" },
        { in: "both", out: "on" },
      ],
      completeWhen: (v) => v.out,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const gx = 230,
          gy = 130,
          lx = 500,
          ly = 130;
        const g = gatePorts("OR", gx, gy);
        const L = ledPorts(lx, ly);
        const a = buttonPort(18.3, 27.2);
        const b = buttonPort(18.3, 73.2);
        const bus = 200;
        return `
        ${wire("a", a, g.inTop, { via: [{ x: bus, y: a.y }] })}
        ${wire("b", b, g.inBot, { via: [{ x: bus, y: b.y }] })}
        ${wire("out", g.out, L.in)}
        ${gateShape("OR", gx, gy, "OR", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "and",
      track: "A",
      name: "AND",
      goal: "Press both buttons at the same time.",
      parent: "AND needs every input on.",
      hint: "Can you press both at once?",
      ledColor: "#c27a3a",
      buttons: [
        { id: "a", color: "red", label: "Red", x: 18.3, y: 27.2 },
        { id: "b", color: "yellow", label: "Yellow", x: 18.3, y: 73.2 },
      ],
      nodes: [{ id: "out", op: "AND", inputs: ["a", "b"], led: true }],
      truth: [
        { in: "one only", out: "off" },
        { in: "both", out: "on" },
      ],
      completeWhen: (v, b) => v.out && b.a && b.b,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const gx = 230,
          gy = 130,
          lx = 500,
          ly = 130;
        const g = gatePorts("AND", gx, gy);
        const L = ledPorts(lx, ly);
        const a = buttonPort(18.3, 27.2);
        const b = buttonPort(18.3, 73.2);
        const bus = 200;
        return `
        ${wire("a", a, g.inTop, { via: [{ x: bus, y: a.y }] })}
        ${wire("b", b, g.inBot, { via: [{ x: bus, y: b.y }] })}
        ${wire("out", g.out, L.in)}
        ${gateShape("AND", gx, gy, "AND", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "xor",
      track: "A",
      name: "XOR",
      goal: "Light the LED with exactly one button.",
      parent: "XOR is on only when inputs differ.",
      hint: "What if both are pressed?",
      ledColor: "#3f8f5a",
      buttons: [
        { id: "a", color: "red", label: "Red", x: 18.3, y: 27.2 },
        { id: "b", color: "yellow", label: "Yellow", x: 18.3, y: 73.2 },
      ],
      nodes: [{ id: "out", op: "XOR", inputs: ["a", "b"], led: true }],
      truth: [
        { in: "exactly one", out: "on" },
        { in: "both / none", out: "off" },
      ],
      completeWhen: (v, b) => v.out && b.a !== b.b,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const gx = 235,
          gy = 130,
          lx = 500,
          ly = 130;
        const g = gatePorts("XOR", gx, gy);
        const L = ledPorts(lx, ly);
        const a = buttonPort(18.3, 27.2);
        const b = buttonPort(18.3, 73.2);
        const bus = 200;
        return `
        ${wire("a", a, g.inTop, { via: [{ x: bus, y: a.y }] })}
        ${wire("b", b, g.inBot, { via: [{ x: bus, y: b.y }] })}
        ${wire("out", g.out, L.in)}
        ${gateShape("XOR", gx, gy, "XOR", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "latch",
      track: "A",
      name: "LATCH",
      goal: "Press SET so the light stays on after you let go. Then RESET to clear.",
      parent: "A latch remembers. SET sticks. RESET clears. That is a bit of memory.",
      hint: "Tap SET, let go, then tap RESET.",
      ledColor: "#b85a4a",
      buttons: [
        { id: "a", color: "red", label: "SET", x: 18.3, y: 27.2 },
        { id: "b", color: "yellow", label: "RESET", x: 18.3, y: 73.2 },
      ],
      nodes: [{ id: "out", op: "LATCH", inputs: ["a", "b"], led: true }],
      truth: [
        {
          in: "SET pulse",
          out: "stays on",
          flag: "latchedSeen",
          liveWhen: (f, v, b) => v.out && !b.a && !b.b,
        },
        {
          in: "RESET",
          out: "clears",
          flag: "resetSeen",
          liveWhen: (f, v, b) => b.b && !v.out,
        },
      ],
      flags: { latchedSeen: false, resetSeen: false },
      onUpdate(v, b, flags) {
        if (v.out && !b.a && !b.b) flags.latchedSeen = true;
        if (b.b && !v.out) flags.resetSeen = true;
      },
      completeWhen: (v, b, f) => f.latchedSeen && f.resetSeen,
      revealWhen: (v, b, f) => f.latchedSeen,
      draw: (rev) => {
        const gx = 210,
          gy = 130,
          mx = 360,
          my = 130,
          lx = 500,
          ly = 130;
        const g = gatePorts("LATCH", gx, gy);
        const m = memPorts(mx, my);
        const L = ledPorts(lx, ly);
        const a = buttonPort(18.3, 27.2);
        const b = buttonPort(18.3, 73.2);
        const bus = 180;
        const loopY = 48;
        return `
        ${wire("a", a, g.inTop, { via: [{ x: bus, y: a.y }] })}
        ${wire("b", b, g.inBot, { via: [{ x: bus, y: b.y }] })}
        ${wire("out", g.out, m.inMid)}
        ${wire("out", m.out, L.in)}
        ${wire("out", m.top, g.top, {
          via: [
            { x: m.top.x, y: loopY },
            { x: g.top.x, y: loopY },
          ],
        })}
        ${gateShape("LATCH", gx, gy, "LATCH", !rev)}
        ${memBox(mx, my)}
        ${led(lx, ly, "out")}
      `;
      },
    },
  ];

  // ——— Track B ———
  const B = [
    {
      id: "b1",
      track: "B",
      name: "NOT → AND",
      goal: "Release red and hold yellow so the light turns on.",
      parent: "NOT flips red into a mid-wire. AND needs that mid-wire and yellow together.",
      hint: "Let go of red. Hold yellow. Watch the middle probe.",
      ledColor: "#3f8f5a",
      buttons: [
        { id: "a", color: "red", label: "Red", x: 17.3, y: 25.2 },
        { id: "b", color: "yellow", label: "Yellow", x: 17.3, y: 71.2 },
      ],
      nodes: [
        { id: "n1", op: "NOT", inputs: ["a"], probe: true },
        { id: "out", op: "AND", inputs: ["n1", "b"], led: true },
      ],
      truth: [
        { in: "red up + yellow", out: "on" },
        { in: "red held", out: "off" },
      ],
      completeWhen: (v, b) => v.out && !b.a && b.b,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const nx = 160,
          ny = 65,
          ax = 320,
          ay = 130,
          px = 275,
          py = 65,
          lx = 500,
          ly = 130;
        const n = gatePorts("NOT", nx, ny);
        const and = gatePorts("AND", ax, ay);
        const p = probePorts(px, py);
        const L = ledPorts(lx, ly);
        const a = buttonPort(17.3, 25.2);
        const b = buttonPort(17.3, 71.2);
        return `
        ${wire("a", a, n.inMid)}
        ${wire("n1", n.out, and.inTop, { via: [p.c] })}
        ${wire("b", b, and.inBot, { via: [{ x: 280, y: b.y }] })}
        ${wire("out", and.out, L.in)}
        ${gateShape("NOT", nx, ny, "NOT", !rev)}
        ${probe(px, py, "n1")}
        ${gateShape("AND", ax, ay, "AND", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "b4",
      track: "B",
      name: "NOT → NOT",
      goal: "Hold the button to turn the light on (two flips cancel).",
      parent: "Two NOTs in a row cancel. Mid probe is off while the LED is on.",
      hint: "Hold the button. Compare the middle light to the final light.",
      ledColor: "#6b7fd7",
      buttons: [{ id: "a", color: "red", label: "Button", x: 17.3, y: 50.2 }],
      nodes: [
        { id: "n1", op: "NOT", inputs: ["a"], probe: true },
        { id: "out", op: "NOT", inputs: ["n1"], led: true },
      ],
      truth: [
        { in: "pressed", out: "on" },
        { in: "released", out: "off" },
      ],
      completeWhen: (v, b) => v.out && b.a,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const n1x = 150,
          n1y = 130,
          n2x = 300,
          n2y = 130,
          px = 270,
          py = 130,
          lx = 500,
          ly = 130;
        const g1 = gatePorts("NOT", n1x, n1y);
        const g2 = gatePorts("NOT", n2x, n2y);
        const p = probePorts(px, py);
        const L = ledPorts(lx, ly);
        const a = buttonPort(17.3, 50.2);
        return `
        ${wire("a", a, g1.inMid)}
        ${wire("n1", g1.out, g2.inMid, { via: [p.c] })}
        ${wire("out", g2.out, L.in)}
        ${gateShape("NOT", n1x, n1y, "NOT", !rev)}
        ${probe(px, py, "n1")}
        ${gateShape("NOT", n2x, n2y, "NOT", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "b2",
      track: "B",
      name: "OR → AND",
      goal: "Open either door and hold the key.",
      parent: "OR arms the system from either door. AND still needs the key.",
      hint: "One door alone is not enough — add the key.",
      ledColor: "#c27a3a",
      buttons: [
        { id: "a", color: "red", label: "Door 1", x: 16.3, y: 17.2 },
        { id: "b", color: "yellow", label: "Door 2", x: 16.3, y: 42.2 },
        { id: "c", color: "blue", label: "Key", x: 16.3, y: 75.2 },
      ],
      nodes: [
        { id: "armed", op: "OR", inputs: ["a", "b"], probe: true },
        { id: "out", op: "AND", inputs: ["armed", "c"], led: true },
      ],
      truth: [
        { in: "door + key", out: "on" },
        { in: "key alone", out: "off" },
      ],
      completeWhen: (v, b) => v.out && b.c && (b.a || b.b),
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const ox = 200,
          oy = 110,
          ax = 345,
          ay = 140,
          px = 325,
          py = 110,
          lx = 500,
          ly = 140;
        const or = gatePorts("OR", ox, oy);
        const and = gatePorts("AND", ax, ay);
        const p = probePorts(px, py);
        const L = ledPorts(lx, ly);
        const a = buttonPort(16.3, 17.2);
        const b = buttonPort(16.3, 42.2);
        const c = buttonPort(16.3, 75.2);
        const bus = 170;
        return `
        ${wire("a", a, or.inTop, { via: [{ x: bus, y: a.y }] })}
        ${wire("b", b, or.inBot, { via: [{ x: bus, y: b.y }] })}
        ${wire("armed", or.out, and.inTop, { via: [p.c] })}
        ${wire("c", c, and.inBot, { via: [{ x: 300, y: c.y }] })}
        ${wire("out", and.out, L.in)}
        ${gateShape("OR", ox, oy, "OR", !rev)}
        ${probe(px, py, "armed")}
        ${gateShape("AND", ax, ay, "AND", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "b3",
      track: "B",
      name: "XOR → OR",
      goal: "Light with exactly one of red/yellow, or use the blue bypass.",
      parent: "XOR makes “odd.” OR lets blue bypass a cancelled XOR.",
      hint: "Both red and yellow cancel. Try blue alone — or one color.",
      ledColor: "#3f8f5a",
      buttons: [
        { id: "a", color: "red", label: "Red", x: 16.3, y: 17.2 },
        { id: "b", color: "yellow", label: "Yellow", x: 16.3, y: 42.2 },
        { id: "c", color: "blue", label: "Bypass", x: 16.3, y: 75.2 },
      ],
      nodes: [
        { id: "odd", op: "XOR", inputs: ["a", "b"], probe: true },
        { id: "out", op: "OR", inputs: ["odd", "c"], led: true },
      ],
      truth: [
        { in: "exactly one / bypass", out: "on" },
        { in: "both, no bypass", out: "off" },
      ],
      completeWhen: (v) => v.out,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const xx = 205,
          xy = 110,
          ox = 350,
          oy = 140,
          px = 328,
          py = 110,
          lx = 500,
          ly = 140;
        const xor = gatePorts("XOR", xx, xy);
        const or = gatePorts("OR", ox, oy);
        const p = probePorts(px, py);
        const L = ledPorts(lx, ly);
        const a = buttonPort(16.3, 17.2);
        const b = buttonPort(16.3, 42.2);
        const c = buttonPort(16.3, 75.2);
        const bus = 170;
        return `
        ${wire("a", a, xor.inTop, { via: [{ x: bus, y: a.y }] })}
        ${wire("b", b, xor.inBot, { via: [{ x: bus, y: b.y }] })}
        ${wire("odd", xor.out, or.inTop, { via: [p.c] })}
        ${wire("c", c, or.inBot, { via: [{ x: 300, y: c.y }] })}
        ${wire("out", or.out, L.in)}
        ${gateShape("XOR", xx, xy, "XOR", !rev)}
        ${probe(px, py, "odd")}
        ${gateShape("OR", ox, oy, "OR", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "b5",
      track: "B",
      name: "NOR build",
      goal: "Light the LED with neither button pressed.",
      parent: "NOT(A) AND NOT(B) — you built a NOR. Any press kills a mid-wire.",
      hint: "Let both buttons go. Watch both probes.",
      ledColor: "#6b7fd7",
      buttons: [
        { id: "a", color: "red", label: "A", x: 17.3, y: 23.2 },
        { id: "b", color: "yellow", label: "B", x: 17.3, y: 73.2 },
      ],
      nodes: [
        { id: "na", op: "NOT", inputs: ["a"], probe: true },
        { id: "nb", op: "NOT", inputs: ["b"], probe: true },
        { id: "out", op: "AND", inputs: ["na", "nb"], led: true },
      ],
      truth: [
        { in: "neither", out: "on" },
        { in: "any press", out: "off" },
      ],
      flags: { touched: false },
      onUpdate(v, b, f) {
        if (b.a || b.b) f.touched = true;
      },
      completeWhen: (v, b, f) => f.touched && v.out && !b.a && !b.b,
      revealWhen: (v, b, f) => f.touched && v.out && !b.a && !b.b,
      draw: (rev) => {
        const nax = 150,
          nay = 60,
          nbx = 150,
          nby = 190,
          ax = 325,
          ay = 130,
          pax = 270,
          pay = 60,
          pbx = 270,
          pby = 190,
          lx = 500,
          ly = 130;
        const na = gatePorts("NOT", nax, nay);
        const nb = gatePorts("NOT", nbx, nby);
        const and = gatePorts("AND", ax, ay);
        const pa = probePorts(pax, pay);
        const pb = probePorts(pbx, pby);
        const L = ledPorts(lx, ly);
        const a = buttonPort(17.3, 23.2);
        const b = buttonPort(17.3, 73.2);
        return `
        ${wire("a", a, na.inMid)}
        ${wire("b", b, nb.inMid)}
        ${wire("na", na.out, and.inTop, { via: [pa.c] })}
        ${wire("nb", nb.out, and.inBot, { via: [pb.c] })}
        ${wire("out", and.out, L.in)}
        ${gateShape("NOT", nax, nay, "NOT", !rev)}
        ${gateShape("NOT", nbx, nby, "NOT", !rev)}
        ${probe(pax, pay, "na")}
        ${probe(pbx, pby, "nb")}
        ${gateShape("AND", ax, ay, rev ? "NOR" : "AND", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "b6",
      track: "B",
      name: "OR / AND → XOR",
      goal: "Make L and R different so the final light turns on.",
      parent: "Shared B feeds OR and AND. XOR wants those mid results to disagree.",
      hint: "Try pressing only A — or only C — and watch probes L and R.",
      ledColor: "#3f8f5a",
      buttons: [
        { id: "a", color: "red", label: "A", x: 16.3, y: 15.2 },
        { id: "b", color: "yellow", label: "B", x: 16.3, y: 42.2 },
        { id: "c", color: "blue", label: "C", x: 16.3, y: 77.2 },
      ],
      nodes: [
        { id: "L", op: "OR", inputs: ["a", "b"], probe: true },
        { id: "R", op: "AND", inputs: ["b", "c"], probe: true },
        { id: "out", op: "XOR", inputs: ["L", "R"], led: true },
      ],
      truth: [
        { in: "L ≠ R", out: "on" },
        { in: "L = R", out: "off" },
      ],
      completeWhen: (v) => v.out,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const ox = 185,
          oy = 80,
          ax = 185,
          ay = 170,
          xx = 350,
          xy = 130,
          plx = 310,
          ply = 80,
          prx = 310,
          pry = 170,
          lx = 500,
          ly = 130;
        const or = gatePorts("OR", ox, oy);
        const and = gatePorts("AND", ax, ay);
        const xor = gatePorts("XOR", xx, xy);
        const pL = probePorts(plx, ply);
        const pR = probePorts(prx, pry);
        const L = ledPorts(lx, ly);
        const a = buttonPort(16.3, 15.2);
        const b = buttonPort(16.3, 42.2);
        const c = buttonPort(16.3, 77.2);
        const split = 140;
        return `
        ${wire("a", a, or.inTop, { via: [{ x: 160, y: a.y }] })}
        ${wire("b", b, or.inBot, { via: [{ x: split, y: b.y }] })}
        ${wire("b", { x: split, y: b.y }, and.inTop)}
        ${wire("c", c, and.inBot, { via: [{ x: 160, y: c.y }] })}
        ${wire("L", or.out, xor.inTop, { via: [pL.c] })}
        ${wire("R", and.out, xor.inBot, { via: [pR.c] })}
        ${wire("out", xor.out, L.in)}
        ${gateShape("OR", ox, oy, "OR", !rev)}
        ${gateShape("AND", ax, ay, "AND", !rev)}
        ${probe(plx, ply, "L")}
        ${probe(prx, pry, "R")}
        ${gateShape("XOR", xx, xy, "XOR", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "b7",
      track: "B",
      name: "Broken wire",
      goal: "Tap the gap to place a jumper, then press both buttons.",
      parent: "A path must exist before AND can see both signals.",
      hint: "Tap the dotted gap on the yellow wire, then hold both.",
      ledColor: "#c27a3a",
      jumper: true,
      buttons: [
        { id: "a", color: "red", label: "Red", x: 18.3, y: 27.2 },
        { id: "b", color: "yellow", label: "Yellow", x: 18.3, y: 73.2 },
      ],
      nodes: [
        { id: "path", op: "AND", inputs: ["b", "_jumper"], probe: true },
        { id: "out", op: "AND", inputs: ["a", "path"], led: true },
      ],
      truth: [
        { in: "jumper + both", out: "on" },
        { in: "gap open", out: "off" },
      ],
      completeWhen: (v, b, f, extras) => v.out && extras.jumper && b.a && b.b,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const ax = 320,
          ay = 130,
          lx = 500,
          ly = 130;
        const and = gatePorts("AND", ax, ay);
        const L = ledPorts(lx, ly);
        const a = buttonPort(18.3, 27.2);
        const b = buttonPort(18.3, 73.2);
        // Probe = T-junction on the yellow→AND path (gap ends at probe center; rise from there).
        const px = 270,
          py = b.y;
        const p = probePorts(px, py);
        const gapL = { x: px - 55, y: py };
        const gapR = { x: px, y: py };
        return `
        ${wire("a", a, and.inTop, { via: [{ x: 200, y: a.y }] })}
        ${wire("b", b, gapL)}
        <rect id="jumper-hit-area" x="${gapL.x - 8}" y="${py - 22}" width="${px - gapL.x + 24}" height="44" rx="8" />
        ${wire("path", gapL, gapR, { id: "jumper-hit", className: "jumper-gap", dash: "6 6" })}
        ${wire("path", p.c, and.inBot, { via: [{ x: px, y: and.inBot.y }] })}
        ${wire("out", and.out, L.in)}
        ${probe(px, py, "path")}
        ${gateShape("AND", ax, ay, "AND", !rev)}
        ${led(lx, ly, "out")}
        <text id="jumper-label" x="${(gapL.x + px) / 2}" y="${py + 36}" class="gate-label" style="font-size:10px">tap gap</text>
      `;
      },
    },
    {
      id: "b8",
      track: "B",
      name: "Nested ???",
      goal: "Find a combo that lights the LED. Gates stay hidden until you do.",
      parent: "(A XOR B) AND C — exactly one of A/B, and C held.",
      hint: "Try holding the blue key while only one of the others is down.",
      ledColor: "#4aa3c7",
      hideUntilReveal: true,
      buttons: [
        { id: "a", color: "red", label: "A", x: 16.3, y: 17.2 },
        { id: "b", color: "yellow", label: "B", x: 16.3, y: 42.2 },
        { id: "c", color: "blue", label: "C", x: 16.3, y: 75.2 },
      ],
      nodes: [
        { id: "n1", op: "XOR", inputs: ["a", "b"], probe: true },
        { id: "out", op: "AND", inputs: ["n1", "c"], led: true },
      ],
      truth: [
        { in: "exactly one of A/B + C", out: "on" },
      ],
      completeWhen: (v, b) => v.out && b.c && b.a !== b.b,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const xx = 205,
          xy = 110,
          ax = 350,
          ay = 140,
          px = 325,
          py = 110,
          lx = 500,
          ly = 140;
        const xor = gatePorts("XOR", xx, xy);
        const and = gatePorts("AND", ax, ay);
        const p = probePorts(px, py);
        const L = ledPorts(lx, ly);
        const a = buttonPort(16.3, 17.2);
        const b = buttonPort(16.3, 42.2);
        const c = buttonPort(16.3, 75.2);
        const bus = 170;
        return `
        ${wire("a", a, xor.inTop, { via: [{ x: bus, y: a.y }] })}
        ${wire("b", b, xor.inBot, { via: [{ x: bus, y: b.y }] })}
        ${wire("n1", xor.out, and.inTop, { via: [p.c] })}
        ${wire("c", c, and.inBot, { via: [{ x: 300, y: c.y }] })}
        ${wire("out", and.out, L.in)}
        ${gateShape("XOR", xx, xy, "XOR", !rev)}
        ${probe(px, py, "n1")}
        ${gateShape("AND", ax, ay, "AND", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
  ];

  // ——— Track C ———
  const C = [
    {
      id: "c1",
      track: "C",
      name: "Latch + key",
      goal: "Pulse SET so Q stays on, then press Key. RESET clears.",
      parent: "Latch memory arms the AND. Key alone is not enough.",
      hint: "SET, let go, then Key. Watch the Q probe stay lit.",
      ledColor: "#b85a4a",
      buttons: [
        // center % of stage (see draw.js button contract)
        { id: "a", color: "red", label: "SET", x: 18.3, y: 21.2 },
        { id: "b", color: "yellow", label: "RESET", x: 18.3, y: 46.2 },
        { id: "c", color: "blue", label: "Key", x: 18.3, y: 79.2 },
      ],
      nodes: [
        { id: "q", op: "LATCH", inputs: ["a", "b"], probe: true },
        { id: "out", op: "AND", inputs: ["q", "c"], led: true },
      ],
      truth: [
        {
          in: "SET then Key",
          out: "on",
          flag: "keyed",
          liveWhen: (f, v, b) => v.out && b.c,
        },
        {
          in: "Key alone",
          out: "off",
          flag: "keyAlone",
          liveWhen: (f, v, b) => b.c && !v.out,
        },
      ],
      flags: { armed: false, keyed: false, keyAlone: false },
      onUpdate(v, b, f) {
        if (v.q && !b.a) f.armed = true;
        if (v.out && b.c && f.armed) f.keyed = true;
        if (b.c && !v.out) f.keyAlone = true;
      },
      completeWhen: (v, b, f) => f.armed && f.keyed,
      revealWhen: (v, b, f) => f.armed && v.out,
      draw: (rev) => {
        const lxg = 195,
          lyg = 105,
          ax = 345,
          ay = 140,
          px = 315,
          py = 105,
          lx = 500,
          ly = 140;
        const latch = gatePorts("LATCH", lxg, lyg);
        const and = gatePorts("AND", ax, ay);
        const p = probePorts(px, py);
        const L = ledPorts(lx, ly);
        const a = buttonPort(18.3, 21.2);
        const b = buttonPort(18.3, 46.2);
        const c = buttonPort(18.3, 79.2);
        const bus = 170;
        return `
        ${wire("a", a, latch.inTop, { via: [{ x: bus, y: a.y }] })}
        ${wire("b", b, latch.inBot, { via: [{ x: bus, y: b.y }] })}
        ${wire("q", latch.out, and.inTop, { via: [p.c] })}
        ${wire("c", c, and.inBot, { via: [{ x: 300, y: c.y }] })}
        ${wire("out", and.out, L.in)}
        ${gateShape("LATCH", lxg, lyg, "LATCH", !rev)}
        ${probe(px, py, "q")}
        ${gateShape("AND", ax, ay, "AND", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "c2",
      track: "C",
      name: "Armed XOR",
      goal: "Arm with SET, then press exactly one of A or B.",
      parent: "Q AND (A XOR B). Both A+B kills odd after arming.",
      hint: "SET and release. Then only one of the lower buttons.",
      ledColor: "#3f8f5a",
      buttons: [
        // SET/RESET top stubs clear of LATCH; A/B spaced on left with separate XOR buses
        { id: "set", color: "red", label: "SET", x: 20.0, y: 13.5 },
        { id: "rst", color: "yellow", label: "RESET", x: 30.5, y: 13.5 },
        { id: "a", color: "green", label: "A", x: 18.3, y: 58.5 },
        { id: "b", color: "blue", label: "B", x: 18.3, y: 80.0 },
      ],
      nodes: [
        { id: "q", op: "LATCH", inputs: ["set", "rst"], probe: true },
        { id: "odd", op: "XOR", inputs: ["a", "b"], probe: true },
        { id: "out", op: "AND", inputs: ["q", "odd"], led: true },
      ],
      truth: [
        { in: "armed + exactly one", out: "on" },
      ],
      completeWhen: (v, b) => v.out && v.q && b.a !== b.b,
      revealWhen: (v) => v.out,
      draw: (rev) => {
        // LATCH right of top buttons; XOR under it; AND mid; probes on mid-horizontals
        const lxg = 235,
          lyg = 100,
          xx = 235,
          xy = 181,
          ax = 390,
          ay = 140,
          pq = 348,
          pqy = lyg,
          po = 337,
          poy = xy,
          lx = 520,
          ly = ay;
        const latch = gatePorts("LATCH", lxg, lyg);
        const xor = gatePorts("XOR", xx, xy);
        const and = gatePorts("AND", ax, ay);
        const pQ = probePorts(pq, pqy);
        const pOdd = probePorts(po, poy);
        const L = ledPorts(lx, ly);
        const set = buttonPort(20.0, 13.5);
        const rst = buttonPort(30.5, 13.5);
        const a = buttonPort(18.3, 58.5);
        const b = buttonPort(18.3, 80.0);
        const setBus = 205;
        const rstBus = 220;
        const aBus = 200;
        const bBus = 215;
        const qElbow = 370;
        const oddElbow = 370;
        return `
        ${wire("set", set, latch.inTop, { via: [{ x: setBus, y: set.y }] })}
        ${wire("rst", rst, latch.inBot, { via: [{ x: rstBus, y: rst.y }] })}
        ${wire("q", latch.out, and.inTop, { via: [pQ.c, { x: qElbow, y: pQ.c.y }] })}
        ${wire("a", a, xor.inTop, { via: [{ x: aBus, y: a.y }] })}
        ${wire("b", b, xor.inBot, { via: [{ x: bBus, y: b.y }] })}
        ${wire("odd", xor.out, and.inBot, { via: [pOdd.c, { x: oddElbow, y: pOdd.c.y }] })}
        ${wire("out", and.out, L.in)}
        ${gateShape("LATCH", lxg, lyg, "LATCH", !rev)}
        ${probe(pq, pqy, "q")}
        ${gateShape("XOR", xx, xy, "XOR", !rev)}
        ${probe(po, poy, "odd")}
        ${gateShape("AND", ax, ay, "AND", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
  ];

  // ——— Track D ———
  const D = [
    {
      id: "d1",
      track: "D",
      name: "Half-adder",
      goal: "Press both bits: Sum should be off, Carry on (1+1).",
      parent: "Sum = XOR. Carry = AND. Together they add two bits.",
      hint: "Try both buttons. Watch Sum and Carry.",
      ledColor: "#4aa3c7",
      buttons: [
        { id: "a", color: "red", label: "Bit A", x: 19.3, y: 31.2 },
        { id: "b", color: "yellow", label: "Bit B", x: 19.3, y: 77.2 },
      ],
      nodes: [
        { id: "sum", op: "XOR", inputs: ["a", "b"], led: true },
        { id: "carry", op: "AND", inputs: ["a", "b"], led: true },
      ],
      truth: [
        { in: "1+1", out: "Sum 0 · Carry 1" },
        { in: "exactly one", out: "Sum 1 · Carry 0" },
      ],
      completeWhen: (v, b) => b.a && b.b && !v.sum && v.carry,
      revealWhen: (v, b) => b.a && b.b && !v.sum && v.carry,
      draw: (rev) => {
        const xx = 230,
          xy = 100,
          ax = 230,
          ay = 170,
          lsx = 430,
          lsy = 95,
          lcx = 430,
          lcy = 165;
        const xor = gatePorts("XOR", xx, xy);
        const and = gatePorts("AND", ax, ay);
        const sum = ledPorts(lsx, lsy, "Sum");
        const carry = ledPorts(lcx, lcy, "Carry");
        const a = buttonPort(19.3, 31.2);
        const b = buttonPort(19.3, 77.2);
        const split = 160;
        return `
        ${wire("a", a, xor.inTop, { via: [{ x: 200, y: a.y }] })}
        ${wire("a", { x: split, y: a.y }, and.inTop)}
        ${wire("b", b, and.inBot, { via: [{ x: 200, y: b.y }] })}
        ${wire("b", { x: split, y: b.y }, xor.inBot)}
        ${wire("sum", xor.out, sum.in)}
        ${wire("carry", and.out, carry.in)}
        ${gateShape("XOR", xx, xy, "XOR", !rev)}
        ${gateShape("AND", ax, ay, "AND", !rev)}
        ${led(lsx, lsy, "sum", "Sum")}
        ${led(lcx, lcy, "carry", "Carry")}
      `;
      },
    },
    {
      id: "d2",
      track: "D",
      name: "Mux 2→1",
      goal: "With S up, show D1. With S down, show D0. Do both scenes.",
      parent: "(D0 AND NOT S) OR (D1 AND S) — select picks which data passes.",
      hint: "Hold one data button. Flip select and watch which path wins.",
      ledColor: "#6b7fd7",
      buttons: [
        { id: "d0", color: "red", label: "D0", x: 18.3, y: 44.6 },
        { id: "d1", color: "yellow", label: "D1", x: 18.3, y: 65.0 },
        { id: "s", color: "blue", label: "S", x: 18.3, y: 84.2 },
      ],
      nodes: [
        { id: "ns", op: "NOT", inputs: ["s"], probe: true },
        { id: "t0", op: "AND", inputs: ["d0", "ns"], probe: true },
        { id: "t1", op: "AND", inputs: ["d1", "s"], probe: true },
        { id: "out", op: "OR", inputs: ["t0", "t1"], led: true },
      ],
      truth: [
        {
          in: "S=0 → D0",
          out: "pass",
          flag: "scene0",
          liveWhen: (f, v, b) => !b.s && b.d0 && !b.d1,
        },
        {
          in: "S=1 → D1",
          out: "pass",
          flag: "scene1",
          liveWhen: (f, v, b) => b.s && b.d1 && !b.d0,
        },
      ],
      flags: { scene0: false, scene1: false },
      onUpdate(v, b, f) {
        if (v.out && !b.s && b.d0 && !b.d1) f.scene0 = true;
        if (v.out && b.s && b.d1 && !b.d0) f.scene1 = true;
      },
      completeWhen: (v, b, f) => f.scene0 && f.scene1,
      revealWhen: (v, b, f) => f.scene0 || f.scene1,
      draw: (rev) => {
        // (D0 AND NOT S) OR (D1 AND S)
        // NOT aligned with AND0.inTop → straight NS mid-wire; D0 below NOT body
        const a0x = 310,
          a0y = 100,
          a1x = 310,
          a1y = 185,
          ox = 445,
          oy = 142,
          lx = 535,
          ly = 142;
        const and0 = gatePorts("AND", a0x, a0y);
        const and1 = gatePorts("AND", a1x, a1y);
        const or = gatePorts("OR", ox, oy);
        const L = ledPorts(lx, ly);
        const nx = 150,
          ny = and0.inTop.y;
        const not = gatePorts("NOT", nx, ny);
        const d0 = buttonPort(18.3, 44.6);
        const d1 = buttonPort(18.3, 65.0);
        const s = buttonPort(18.3, 84.2);
        const pns = 270,
          pnsy = not.out.y,
          pt0 = 395,
          pt0y = and0.out.y,
          pt1 = 395,
          pt1y = and1.out.y;
        const pNs = probePorts(pns, pnsy);
        const pT0 = probePorts(pt0, pt0y);
        const pT1 = probePorts(pt1, pt1y);
        const sBus = 138;
        const dLane = 260;
        const tElbow = 422;
        return `
        ${wire("s", s, not.inMid, { via: [{ x: sBus, y: s.y }, { x: sBus, y: not.inMid.y }] })}
        ${wire("s", { x: sBus, y: and1.inBot.y }, and1.inBot)}
        ${wire("ns", not.out, and0.inTop, { via: [pNs.c] })}
        ${wire("d0", d0, and0.inBot, { via: [{ x: dLane, y: d0.y }] })}
        ${wire("d1", d1, and1.inTop, { via: [{ x: dLane, y: d1.y }] })}
        ${wire("t0", and0.out, or.inTop, { via: [pT0.c, { x: tElbow, y: pt0y }] })}
        ${wire("t1", and1.out, or.inBot, { via: [pT1.c, { x: tElbow, y: pt1y }] })}
        ${wire("out", or.out, L.in)}
        ${gateShape("NOT", nx, ny, "NOT", !rev)}
        ${probe(pns, pnsy, "ns")}
        ${gateShape("AND", a0x, a0y, "AND", !rev)}
        ${gateShape("AND", a1x, a1y, "AND", !rev)}
        ${probe(pt0, pt0y, "t0")}
        ${probe(pt1, pt1y, "t1")}
        ${gateShape("OR", ox, oy, "OR", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "d3",
      track: "D",
      name: "Parity",
      goal: "Light the LED with an odd number of buttons (1 or 3).",
      parent: "Cascaded XORs compute odd parity.",
      hint: "One button works. All three also works. Two does not.",
      ledColor: "#3f8f5a",
      buttons: [
        { id: "a", color: "red", label: "A", x: 18.3, y: 21.2 },
        { id: "b", color: "yellow", label: "B", x: 18.3, y: 46.2 },
        { id: "c", color: "blue", label: "C", x: 18.3, y: 79.2 },
      ],
      nodes: [
        { id: "x1", op: "XOR", inputs: ["a", "b"], probe: true },
        { id: "out", op: "XOR", inputs: ["x1", "c"], led: true },
      ],
      truth: [
        { in: "odd count", out: "on" },
        { in: "even count", out: "off" },
      ],
      completeWhen: (v, b) => {
        const n = (b.a ? 1 : 0) + (b.b ? 1 : 0) + (b.c ? 1 : 0);
        return v.out && (n === 1 || n === 3);
      },
      revealWhen: (v) => v.out,
      draw: (rev) => {
        const x1x = 200,
          x1y = 110,
          x2x = 355,
          x2y = 140,
          px = 325,
          py = 110,
          lx = 500,
          ly = 140;
        const x1 = gatePorts("XOR", x1x, x1y);
        const x2 = gatePorts("XOR", x2x, x2y);
        const p = probePorts(px, py);
        const L = ledPorts(lx, ly);
        const a = buttonPort(18.3, 21.2);
        const b = buttonPort(18.3, 46.2);
        const c = buttonPort(18.3, 79.2);
        const bus = 170;
        return `
        ${wire("a", a, x1.inTop, { via: [{ x: bus, y: a.y }] })}
        ${wire("b", b, x1.inBot, { via: [{ x: bus, y: b.y }] })}
        ${wire("x1", x1.out, x2.inTop, { via: [p.c] })}
        ${wire("c", c, x2.inBot, { via: [{ x: 300, y: c.y }] })}
        ${wire("out", x2.out, L.in)}
        ${gateShape("XOR", x1x, x1y, "XOR", !rev)}
        ${probe(px, py, "x1")}
        ${gateShape("XOR", x2x, x2y, "XOR", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
  ];

  // ——— Track E · Machines (multi-in / multi-out) ———
  const E = [
    {
      id: "e1",
      track: "E",
      name: "Majority",
      goal: "Light OUT with any two (or all three) buttons. One alone stays off.",
      parent: "(A∧B) ∨ (A∧C) ∨ (B∧C) — vote of three.",
      hint: "Hold any pair. Watch the three AND probes feed the OR tree.",
      ledColor: "#3f8f5a",
      buttons: [
        { id: "a", color: "red", label: "A", x: 16.3, y: 18.2 },
        { id: "b", color: "yellow", label: "B", x: 16.3, y: 50.2 },
        { id: "c", color: "blue", label: "C", x: 16.3, y: 82.2 },
      ],
      nodes: [
        { id: "ab", op: "AND", inputs: ["a", "b"], probe: true },
        { id: "ac", op: "AND", inputs: ["a", "c"], probe: true },
        { id: "bc", op: "AND", inputs: ["b", "c"], probe: true },
        { id: "or1", op: "OR", inputs: ["ab", "ac"], probe: true },
        { id: "out", op: "OR", inputs: ["or1", "bc"], led: true },
      ],
      truth: [
        {
          in: "any two+",
          out: "on",
          flag: "pair",
          liveWhen: (f, v, b) => (b.a ? 1 : 0) + (b.b ? 1 : 0) + (b.c ? 1 : 0) >= 2,
        },
        {
          in: "one alone",
          out: "off",
          flag: "alone",
          liveWhen: (f, v, b) => (b.a ? 1 : 0) + (b.b ? 1 : 0) + (b.c ? 1 : 0) === 1,
        },
      ],
      flags: { pair: false, alone: false },
      onUpdate(v, b, f) {
        const n = (b.a ? 1 : 0) + (b.b ? 1 : 0) + (b.c ? 1 : 0);
        // pair: ≥2 inputs and OUT on; alone: exactly one input and OUT off
        if (n >= 2 && v.out) f.pair = true;
        if (n === 1 && !v.out) f.alone = true;
      },
      completeWhen: (v, b, f) => f.pair && f.alone,
      revealWhen: (v, b, f) => f.pair,
      draw: (rev) => {
        const abx = 200,
          aby = 55,
          acx = 200,
          acy = 130,
          bcx = 200,
          bcy = 205,
          o1x = 340,
          o1y = 90,
          o2x = 430,
          o2y = 150,
          lx = 530,
          ly = 150;
        const ab = gatePorts("AND", abx, aby);
        const ac = gatePorts("AND", acx, acy);
        const bc = gatePorts("AND", bcx, bcy);
        const or1 = gatePorts("OR", o1x, o1y);
        const or2 = gatePorts("OR", o2x, o2y);
        const L = ledPorts(lx, ly);
        const a = buttonPort(16.3, 18.2);
        const b = buttonPort(16.3, 50.2);
        const c = buttonPort(16.3, 82.2);
        const aBus = 145,
          bBus = 160,
          cBus = 175;
        const pAb = probePorts(290, aby);
        const pAc = probePorts(290, acy);
        const pBc = probePorts(370, bcy);
        const pOr = probePorts(420, o1y);
        // Long verticals span topmost→bottommost tap so stubs never float.
        return `
        ${wire("a", a, ac.inTop, {
          via: [
            { x: aBus, y: a.y },
            { x: aBus, y: ab.inTop.y },
            { x: aBus, y: ac.inTop.y },
          ],
        })}
        ${wire("a", { x: aBus, y: ab.inTop.y }, ab.inTop)}
        ${wire("b", b, bc.inTop, {
          via: [
            { x: bBus, y: b.y },
            { x: bBus, y: ab.inBot.y },
            { x: bBus, y: bc.inTop.y },
          ],
        })}
        ${wire("b", { x: bBus, y: ab.inBot.y }, ab.inBot)}
        ${wire("c", c, bc.inBot, {
          via: [
            { x: cBus, y: c.y },
            { x: cBus, y: ac.inBot.y },
            { x: cBus, y: bc.inBot.y },
          ],
        })}
        ${wire("c", { x: cBus, y: ac.inBot.y }, ac.inBot)}
        ${wire("ab", ab.out, or1.inTop, { via: [pAb.c, { x: 320, y: aby }] })}
        ${wire("ac", ac.out, or1.inBot, { via: [pAc.c, { x: 320, y: acy }] })}
        ${wire("or1", or1.out, or2.inTop, { via: [pOr.c, { x: 425, y: o1y }] })}
        ${wire("bc", bc.out, or2.inBot, { via: [pBc.c, { x: 425, y: bcy }] })}
        ${wire("out", or2.out, L.in)}
        ${gateShape("AND", abx, aby, "AND", !rev)}
        ${gateShape("AND", acx, acy, "AND", !rev)}
        ${gateShape("AND", bcx, bcy, "AND", !rev)}
        ${probe(290, aby, "ab")}
        ${probe(290, acy, "ac")}
        ${probe(370, bcy, "bc")}
        ${gateShape("OR", o1x, o1y, "OR", !rev)}
        ${probe(420, o1y, "or1")}
        ${gateShape("OR", o2x, o2y, "OR", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
    {
      id: "e2",
      track: "E",
      name: "Full adder",
      goal: "Hit three sums: 1+0+0, 1+1+0, and 1+1+1. Watch Sum and Cout.",
      parent: "Two half-adders + OR: Sum = A⊕B⊕Cin, Cout = majority of carries.",
      hint: "A and B feed both XOR and AND. Cin joins the second stage.",
      ledColor: "#4aa3c7",
      buttons: [
        { id: "a", color: "red", label: "A", x: 15.5, y: 16.2 },
        { id: "b", color: "yellow", label: "B", x: 15.5, y: 48.2 },
        { id: "cin", color: "blue", label: "Cin", x: 15.5, y: 82.2 },
      ],
      nodes: [
        { id: "s1", op: "XOR", inputs: ["a", "b"], probe: true },
        { id: "c1", op: "AND", inputs: ["a", "b"], probe: true },
        { id: "sum", op: "XOR", inputs: ["s1", "cin"], led: true },
        { id: "c2", op: "AND", inputs: ["s1", "cin"], probe: true },
        { id: "cout", op: "OR", inputs: ["c1", "c2"], led: true },
      ],
      truth: [
        {
          in: "1+0+0",
          out: "Sum1 Cout0",
          flag: "s100",
          liveWhen: (f, v, b) => b.a && !b.b && !b.cin,
        },
        {
          in: "1+1+0",
          out: "Sum0 Cout1",
          flag: "s110",
          liveWhen: (f, v, b) => b.a && b.b && !b.cin,
        },
        {
          in: "1+1+1",
          out: "Sum1 Cout1",
          flag: "s111",
          liveWhen: (f, v, b) => b.a && b.b && b.cin,
        },
      ],
      flags: { s100: false, s110: false, s111: false },
      onUpdate(v, b, f) {
        // Exact A,B,Cin plus Sum/Cout pair for each scene
        if (b.a && !b.b && !b.cin && v.sum && !v.cout) f.s100 = true;
        if (b.a && b.b && !b.cin && !v.sum && v.cout) f.s110 = true;
        if (b.a && b.b && b.cin && v.sum && v.cout) f.s111 = true;
      },
      completeWhen: (v, b, f) => f.s100 && f.s110 && f.s111,
      revealWhen: (v, b, f) => f.s100 || f.s110 || f.s111,
      draw: (rev) => {
        // Stage 1 HA at x=165; stage 2 HA at x=310 with xor2.inTop on s1 row.
        const x1 = 165,
          y1 = 70,
          a1x = 165,
          a1y = 175,
          x2 = 310,
          y2 = y1 + 16,
          a2x = 310,
          a2y = 160,
          ox = 420,
          oy = 200,
          lsx = 500,
          lsy = y2,
          lcx = 530,
          lcy = oy;
        const xor1 = gatePorts("XOR", x1, y1);
        const and1 = gatePorts("AND", a1x, a1y);
        const xor2 = gatePorts("XOR", x2, y2);
        const and2 = gatePorts("AND", a2x, a2y);
        const or = gatePorts("OR", ox, oy);
        const sum = ledPorts(lsx, lsy, "Sum");
        const cout = ledPorts(lcx, lcy, "Cout");
        const a = buttonPort(15.5, 16.2);
        const b = buttonPort(15.5, 48.2);
        const cin = buttonPort(15.5, 82.2);
        const aBus = 125,
          bBus = 140,
          cLane = 155,
          sBus = 255,
          cinBus = 285,
          floorY = 238;
        const pS1 = probePorts(sBus, y1);
        const pC1 = probePorts(255, a1y);
        const pC2 = probePorts(385, a2y);
        return `
        ${wire("a", a, and1.inTop, {
          via: [
            { x: aBus, y: a.y },
            { x: aBus, y: xor1.inTop.y },
            { x: aBus, y: and1.inTop.y },
          ],
        })}
        ${wire("a", { x: aBus, y: xor1.inTop.y }, xor1.inTop)}
        ${wire("b", b, and1.inBot, {
          via: [
            { x: bBus, y: b.y },
            { x: bBus, y: xor1.inBot.y },
            { x: bBus, y: and1.inBot.y },
          ],
        })}
        ${wire("b", { x: bBus, y: xor1.inBot.y }, xor1.inBot)}
        ${wire("s1", xor1.out, and2.inTop, {
          via: [pS1.c, { x: sBus, y: and2.inTop.y }],
        })}
        ${wire("s1", pS1.c, xor2.inTop)}
        ${wire("cin", cin, and2.inBot, {
          via: [
            { x: cLane, y: cin.y },
            { x: cLane, y: floorY },
            { x: cinBus, y: floorY },
            { x: cinBus, y: xor2.inBot.y },
            { x: cinBus, y: and2.inBot.y },
          ],
        })}
        ${wire("cin", { x: cinBus, y: xor2.inBot.y }, xor2.inBot)}
        ${wire("sum", xor2.out, sum.in)}
        ${wire("c1", and1.out, or.inBot, {
          via: [pC1.c, { x: 395, y: a1y }, { x: 395, y: or.inBot.y }],
        })}
        ${wire("c2", and2.out, or.inTop, {
          via: [pC2.c, { x: 405, y: a2y }, { x: 405, y: or.inTop.y }],
        })}
        ${wire("cout", or.out, cout.in)}
        ${gateShape("XOR", x1, y1, "XOR", !rev)}
        ${gateShape("AND", a1x, a1y, "AND", !rev)}
        ${probe(sBus, y1, "s1")}
        ${probe(255, a1y, "c1")}
        ${gateShape("XOR", x2, y2, "XOR", !rev)}
        ${gateShape("AND", a2x, a2y, "AND", !rev)}
        ${probe(385, a2y, "c2")}
        ${gateShape("OR", ox, oy, "OR", !rev)}
        ${led(lsx, lsy, "sum", "Sum")}
        ${led(lcx, lcy, "cout", "Cout")}
      `;
      },
    },
    {
      id: "e3",
      track: "E",
      name: "Demux 1→2",
      goal: "With D held: S down lights Y0, S up lights Y1. Do both routes.",
      parent: "Y0 = D∧¬S, Y1 = D∧S — one input steered to two outputs.",
      hint: "Hold D. Flip S. Only one LED should be on at a time.",
      ledColor: "#6b7fd7",
      buttons: [
        { id: "d", color: "red", label: "D", x: 17.3, y: 32.2 },
        { id: "s", color: "blue", label: "S", x: 17.3, y: 72.2 },
      ],
      nodes: [
        { id: "ns", op: "NOT", inputs: ["s"], probe: true },
        { id: "y0", op: "AND", inputs: ["d", "ns"], led: true },
        { id: "y1", op: "AND", inputs: ["d", "s"], led: true },
      ],
      truth: [
        {
          in: "S=0 · D",
          out: "Y0",
          flag: "route0",
          liveWhen: (f, v, b) => b.d && !b.s,
        },
        {
          in: "S=1 · D",
          out: "Y1",
          flag: "route1",
          liveWhen: (f, v, b) => b.d && b.s,
        },
      ],
      flags: { route0: false, route1: false },
      onUpdate(v, b, f) {
        // D held; S steers to exactly one output
        if (b.d && !b.s && v.y0 && !v.y1) f.route0 = true;
        if (b.d && b.s && v.y1 && !v.y0) f.route1 = true;
      },
      completeWhen: (v, b, f) => f.route0 && f.route1,
      revealWhen: (v, b, f) => f.route0 || f.route1,
      draw: (rev) => {
        // NOT aligned with AND0.inTop → straight NS mid-wire (same trick as mux d2).
        const a0x = 330,
          a0y = 100,
          a1x = 330,
          a1y = 180,
          l0x = 490,
          l0y = a0y,
          l1x = 490,
          l1y = a1y;
        const and0 = gatePorts("AND", a0x, a0y);
        const and1 = gatePorts("AND", a1x, a1y);
        const nx = 155,
          ny = and0.inTop.y;
        const not = gatePorts("NOT", nx, ny);
        const y0 = ledPorts(l0x, l0y, "Y0");
        const y1 = ledPorts(l1x, l1y, "Y1");
        const d = buttonPort(17.3, 32.2);
        const s = buttonPort(17.3, 72.2);
        const sBus = 125,
          dBus = 270;
        const pns = 250;
        const pNs = probePorts(pns, ny);
        return `
        ${wire("s", s, not.inMid, {
          via: [
            { x: sBus, y: s.y },
            { x: sBus, y: and1.inBot.y },
            { x: sBus, y: not.inMid.y },
          ],
        })}
        ${wire("s", { x: sBus, y: and1.inBot.y }, and1.inBot)}
        ${wire("ns", not.out, and0.inTop, { via: [pNs.c] })}
        ${wire("d", d, and1.inTop, {
          via: [
            { x: dBus, y: d.y },
            { x: dBus, y: and0.inBot.y },
            { x: dBus, y: and1.inTop.y },
          ],
        })}
        ${wire("d", { x: dBus, y: and0.inBot.y }, and0.inBot)}
        ${wire("y0", and0.out, y0.in)}
        ${wire("y1", and1.out, y1.in)}
        ${gateShape("NOT", nx, ny, "NOT", !rev)}
        ${probe(pns, ny, "ns")}
        ${gateShape("AND", a0x, a0y, "AND", !rev)}
        ${gateShape("AND", a1x, a1y, "AND", !rev)}
        ${led(l0x, l0y, "y0", "Y0")}
        ${led(l1x, l1y, "y1", "Y1")}
      `;
      },
    },
    {
      id: "e4",
      track: "E",
      name: "Decoder 2→4",
      goal: "Visit all four codes AB=00,01,10,11. Exactly one Y lights each time.",
      parent: "Y0=¬A∧¬B … Y3=A∧B — one-hot from two bits.",
      hint: "Try every combo of A and B. Only one LED should win.",
      ledColor: "#c97b4a",
      buttons: [
        { id: "a", color: "red", label: "A", x: 16.3, y: 28.2 },
        { id: "b", color: "yellow", label: "B", x: 16.3, y: 72.2 },
      ],
      nodes: [
        { id: "na", op: "NOT", inputs: ["a"], probe: true },
        { id: "nb", op: "NOT", inputs: ["b"], probe: true },
        { id: "y0", op: "AND", inputs: ["na", "nb"], led: true },
        { id: "y1", op: "AND", inputs: ["na", "b"], led: true },
        { id: "y2", op: "AND", inputs: ["a", "nb"], led: true },
        { id: "y3", op: "AND", inputs: ["a", "b"], led: true },
      ],
      truth: [
        {
          in: "00",
          out: "Y0",
          flag: "c00",
          liveWhen: (f, v, b) => !b.a && !b.b,
        },
        {
          in: "01",
          out: "Y1",
          flag: "c01",
          liveWhen: (f, v, b) => !b.a && b.b,
        },
        {
          in: "10",
          out: "Y2",
          flag: "c10",
          liveWhen: (f, v, b) => b.a && !b.b,
        },
        {
          in: "11",
          out: "Y3",
          flag: "c11",
          liveWhen: (f, v, b) => b.a && b.b,
        },
      ],
      flags: { c00: false, c01: false, c10: false, c11: false },
      onUpdate(v, b, f) {
        // One-hot: exact AB code with only the matching Y high
        const one =
          (v.y0 ? 1 : 0) + (v.y1 ? 1 : 0) + (v.y2 ? 1 : 0) + (v.y3 ? 1 : 0) === 1;
        if (!b.a && !b.b && v.y0 && one) f.c00 = true;
        if (!b.a && b.b && v.y1 && one) f.c01 = true;
        if (b.a && !b.b && v.y2 && one) f.c10 = true;
        if (b.a && b.b && v.y3 && one) f.c11 = true;
      },
      completeWhen: (v, b, f) => f.c00 && f.c01 && f.c10 && f.c11,
      revealWhen: (v, b, f) => f.c00 || f.c01 || f.c10 || f.c11,
      draw: (rev) => {
        // 65px LED pitch so Y labels clear the next bulb+GND.
        const nax = 145,
          nay = 70,
          nbx = 145,
          nby = 190;
        const a0x = 310,
          a0y = 30,
          a1x = 310,
          a1y = 95,
          a2x = 310,
          a2y = 160,
          a3x = 310,
          a3y = 225;
        const lx = 495;
        const na = gatePorts("NOT", nax, nay);
        const nb = gatePorts("NOT", nbx, nby);
        const and0 = gatePorts("AND", a0x, a0y);
        const and1 = gatePorts("AND", a1x, a1y);
        const and2 = gatePorts("AND", a2x, a2y);
        const and3 = gatePorts("AND", a3x, a3y);
        const y0 = ledPorts(lx, a0y, "Y0");
        const y1 = ledPorts(lx, a1y, "Y1");
        const y2 = ledPorts(lx, a2y, "Y2");
        const y3 = ledPorts(lx, a3y, "Y3");
        const a = buttonPort(16.3, 28.2);
        const b = buttonPort(16.3, 72.2);
        // Buses sit right of button exits (≈115) and left of NOT inputs (145).
        const aBus = 128,
          bBus = 136,
          naBus = 265,
          nbBus = 280;
        const pNa = probePorts(248, nay);
        const pNb = probePorts(248, nby);
        return `
        ${wire("a", a, and3.inTop, {
          via: [
            { x: aBus, y: a.y },
            { x: aBus, y: na.inMid.y },
            { x: aBus, y: and3.inTop.y },
          ],
        })}
        ${wire("a", { x: aBus, y: na.inMid.y }, na.inMid)}
        ${wire("a", { x: aBus, y: and2.inTop.y }, and2.inTop)}
        ${wire("b", b, and3.inBot, {
          via: [
            { x: bBus, y: b.y },
            { x: bBus, y: and1.inBot.y },
            { x: bBus, y: and3.inBot.y },
          ],
        })}
        ${wire("b", { x: bBus, y: nb.inMid.y }, nb.inMid)}
        ${wire("b", { x: bBus, y: and1.inBot.y }, and1.inBot)}
        ${wire("na", na.out, and1.inTop, {
          via: [
            pNa.c,
            { x: naBus, y: nay },
            { x: naBus, y: and0.inTop.y },
            { x: naBus, y: and1.inTop.y },
          ],
        })}
        ${wire("na", { x: naBus, y: and0.inTop.y }, and0.inTop)}
        ${wire("nb", nb.out, and0.inBot, {
          via: [
            pNb.c,
            { x: nbBus, y: nby },
            { x: nbBus, y: and2.inBot.y },
            { x: nbBus, y: and0.inBot.y },
          ],
        })}
        ${wire("nb", { x: nbBus, y: and2.inBot.y }, and2.inBot)}
        ${wire("y0", and0.out, y0.in)}
        ${wire("y1", and1.out, y1.in)}
        ${wire("y2", and2.out, y2.in)}
        ${wire("y3", and3.out, y3.in)}
        ${gateShape("NOT", nax, nay, "NOT", !rev)}
        ${gateShape("NOT", nbx, nby, "NOT", !rev)}
        ${probe(248, nay, "na")}
        ${probe(248, nby, "nb")}
        ${gateShape("AND", a0x, a0y, "AND", !rev)}
        ${gateShape("AND", a1x, a1y, "AND", !rev)}
        ${gateShape("AND", a2x, a2y, "AND", !rev)}
        ${gateShape("AND", a3x, a3y, "AND", !rev)}
        ${led(lx, a0y, "y0", "Y0")}
        ${led(lx, a1y, "y1", "Y1")}
        ${led(lx, a2y, "y2", "Y2")}
        ${led(lx, a3y, "y3", "Y3")}
      `;
      },
    },
    {
      id: "e5",
      track: "E",
      name: "Equality",
      goal: "Match A to B so EQ lights, then mismatch so EQ goes dark.",
      parent: "EQ = ¬(A0⊕B0) ∧ ¬(A1⊕B1) — bitwise same.",
      hint: "Copy A onto B for a match. Flip one bit for a miss.",
      ledColor: "#3f8f5a",
      buttons: [
        { id: "a1", color: "red", label: "A1", x: 14.5, y: 14.2 },
        { id: "a0", color: "yellow", label: "A0", x: 14.5, y: 36.2 },
        { id: "b1", color: "green", label: "B1", x: 14.5, y: 62.2 },
        { id: "b0", color: "blue", label: "B0", x: 14.5, y: 84.2 },
      ],
      nodes: [
        { id: "x1", op: "XOR", inputs: ["a1", "b1"], probe: true },
        { id: "x0", op: "XOR", inputs: ["a0", "b0"], probe: true },
        { id: "n1", op: "NOT", inputs: ["x1"], probe: true },
        { id: "n0", op: "NOT", inputs: ["x0"], probe: true },
        { id: "eq", op: "AND", inputs: ["n1", "n0"], led: true },
      ],
      truth: [
        {
          in: "A = B",
          out: "EQ on",
          flag: "match",
          liveWhen: (f, v, b) => b.a0 === b.b0 && b.a1 === b.b1,
        },
        {
          in: "A ≠ B",
          out: "EQ off",
          flag: "miss",
          liveWhen: (f, v, b) => !(b.a0 === b.b0 && b.a1 === b.b1),
        },
      ],
      flags: { match: false, miss: false },
      onUpdate(v, b, f) {
        const same = b.a0 === b.b0 && b.a1 === b.b1;
        if (v.eq && same) f.match = true;
        // miss: at least one bit differs and EQ off (all-zero is a match, not a miss)
        if (!v.eq && !same) f.miss = true;
      },
      completeWhen: (v, b, f) => f.match && f.miss,
      revealWhen: (v, b, f) => f.match || f.miss,
      draw: (rev) => {
        const x1x = 175,
          x1y = 70,
          x0x = 175,
          x0y = 175,
          n1x = 310,
          n1y = 70,
          n0x = 310,
          n0y = 175,
          ax = 430,
          ay = 120,
          lx = 530,
          ly = 120;
        const xor1 = gatePorts("XOR", x1x, x1y);
        const xor0 = gatePorts("XOR", x0x, x0y);
        const not1 = gatePorts("NOT", n1x, n1y);
        const not0 = gatePorts("NOT", n0x, n0y);
        const and = gatePorts("AND", ax, ay);
        const L = ledPorts(lx, ly, "EQ");
        const a1 = buttonPort(14.5, 14.2);
        const a0 = buttonPort(14.5, 36.2);
        const b1 = buttonPort(14.5, 62.2);
        const b0 = buttonPort(14.5, 84.2);
        const a1Bus = 120,
          a0Bus = 135,
          b1Bus = 150,
          b0Bus = 165;
        const pX1 = probePorts(265, x1y);
        const pX0 = probePorts(265, x0y);
        const pN1 = probePorts(400, n1y);
        const pN0 = probePorts(400, n0y);
        return `
        ${wire("a1", a1, xor1.inTop, { via: [{ x: a1Bus, y: a1.y }, { x: a1Bus, y: xor1.inTop.y }] })}
        ${wire("b1", b1, xor1.inBot, { via: [{ x: b1Bus, y: b1.y }, { x: b1Bus, y: xor1.inBot.y }] })}
        ${wire("a0", a0, xor0.inTop, { via: [{ x: a0Bus, y: a0.y }, { x: a0Bus, y: xor0.inTop.y }] })}
        ${wire("b0", b0, xor0.inBot, { via: [{ x: b0Bus, y: b0.y }, { x: b0Bus, y: xor0.inBot.y }] })}
        ${wire("x1", xor1.out, not1.inMid, { via: [pX1.c] })}
        ${wire("x0", xor0.out, not0.inMid, { via: [pX0.c] })}
        ${wire("n1", not1.out, and.inTop, { via: [pN1.c, { x: 415, y: n1y }] })}
        ${wire("n0", not0.out, and.inBot, { via: [pN0.c, { x: 415, y: n0y }] })}
        ${wire("eq", and.out, L.in)}
        ${gateShape("XOR", x1x, x1y, "XOR", !rev)}
        ${gateShape("XOR", x0x, x0y, "XOR", !rev)}
        ${probe(265, x1y, "x1")}
        ${probe(265, x0y, "x0")}
        ${gateShape("NOT", n1x, n1y, "NOT", !rev)}
        ${gateShape("NOT", n0x, n0y, "NOT", !rev)}
        ${probe(400, n1y, "n1")}
        ${probe(400, n0y, "n0")}
        ${gateShape("AND", ax, ay, "AND", !rev)}
        ${led(lx, ly, "eq", "EQ")}
      `;
      },
    },
    {
      id: "e6",
      track: "E",
      name: "ALU slice",
      goal: "S=0: light OUT with A=1 B=1 (AND). S=1: light OUT with A=1 B=0 (XOR). Do both.",
      parent: "Mux picks between AND and XOR — a 1-bit ALU fragment.",
      hint: "AND needs A and B with S down. For XOR, S up and exactly one of A/B — A=1 B=1 leaves OUT dark.",
      ledColor: "#8b6bb8",
      buttons: [
        { id: "a", color: "red", label: "A", x: 15.5, y: 18.2 },
        { id: "b", color: "yellow", label: "B", x: 15.5, y: 48.2 },
        { id: "s", color: "purple", label: "S", x: 15.5, y: 82.2 },
      ],
      nodes: [
        { id: "and", op: "AND", inputs: ["a", "b"], probe: true },
        { id: "xor", op: "XOR", inputs: ["a", "b"], probe: true },
        { id: "ns", op: "NOT", inputs: ["s"], probe: true },
        { id: "t0", op: "AND", inputs: ["and", "ns"], probe: true },
        { id: "t1", op: "AND", inputs: ["xor", "s"], probe: true },
        { id: "out", op: "OR", inputs: ["t0", "t1"], led: true },
      ],
      truth: [
        {
          in: "S=0 · A=1 B=1",
          out: "OUT (AND)",
          flag: "andScene",
          liveWhen: (f, v, b) => !b.s && b.a && b.b,
        },
        {
          in: "S=1 · A≠B",
          out: "OUT (XOR)",
          flag: "xorScene",
          liveWhen: (f, v, b) => b.s && ((b.a && !b.b) || (!b.a && b.b)),
        },
      ],
      flags: { andScene: false, xorScene: false },
      onUpdate(v, b, f) {
        if (!b.s && b.a && b.b && v.out) f.andScene = true;
        // Prefer A=1 B=0; also accept A=0 B=1 (XOR lights OUT)
        if (b.s && v.out && ((b.a && !b.b) || (!b.a && b.b))) f.xorScene = true;
      },
      completeWhen: (v, b, f) => f.andScene && f.xorScene,
      revealWhen: (v, b, f) => f.andScene || f.xorScene,
      draw: (rev) => {
        // AND/XOR stage → mux ANDs → OR→LED. NOT aligned with t0.inBot for straight NS.
        const andx = 155,
          andy = 65,
          xorx = 155,
          xory = 180,
          t0x = 355,
          t0y = andy + 16,
          t1x = 355,
          t1y = xory + 16,
          ox = 440,
          oy = 125,
          lx = 535,
          ly = oy;
        const and = gatePorts("AND", andx, andy);
        const xor = gatePorts("XOR", xorx, xory);
        const t0 = gatePorts("AND", t0x, t0y);
        const t1 = gatePorts("AND", t1x, t1y);
        const nx = 250,
          ny = t0.inBot.y;
        const not = gatePorts("NOT", nx, ny);
        const or = gatePorts("OR", ox, oy);
        const L = ledPorts(lx, ly);
        const a = buttonPort(15.5, 18.2);
        const b = buttonPort(15.5, 48.2);
        const s = buttonPort(15.5, 82.2);
        const aBus = 115,
          bBus = 130,
          sBus = 220;
        const pAndX = 235,
          pXorX = 235,
          pNsX = 350;
        const pAnd = probePorts(pAndX, andy);
        const pXor = probePorts(pXorX, xory);
        const pNs = probePorts(pNsX, ny);
        const pT0 = probePorts(425, t0y);
        const pT1 = probePorts(425, t1y);
        const tElbow = 432;
        return `
        ${wire("a", a, xor.inTop, {
          via: [
            { x: aBus, y: a.y },
            { x: aBus, y: and.inTop.y },
            { x: aBus, y: xor.inTop.y },
          ],
        })}
        ${wire("a", { x: aBus, y: and.inTop.y }, and.inTop)}
        ${wire("b", b, xor.inBot, {
          via: [
            { x: bBus, y: b.y },
            { x: bBus, y: and.inBot.y },
            { x: bBus, y: xor.inBot.y },
          ],
        })}
        ${wire("b", { x: bBus, y: and.inBot.y }, and.inBot)}
        ${wire("s", s, not.inMid, {
          via: [
            { x: sBus, y: s.y },
            { x: sBus, y: t1.inBot.y },
            { x: sBus, y: not.inMid.y },
          ],
        })}
        ${wire("s", { x: sBus, y: t1.inBot.y }, t1.inBot)}
        ${wire("and", and.out, t0.inTop, { via: [pAnd.c] })}
        ${wire("xor", xor.out, t1.inTop, { via: [pXor.c] })}
        ${wire("ns", not.out, t0.inBot, { via: [pNs.c] })}
        ${wire("t0", t0.out, or.inTop, { via: [pT0.c, { x: tElbow, y: t0y }] })}
        ${wire("t1", t1.out, or.inBot, { via: [pT1.c, { x: tElbow, y: t1y }] })}
        ${wire("out", or.out, L.in)}
        ${gateShape("AND", andx, andy, "AND", !rev)}
        ${gateShape("XOR", xorx, xory, "XOR", !rev)}
        ${probe(pAndX, andy, "and")}
        ${probe(pXorX, xory, "xor")}
        ${gateShape("NOT", nx, ny, "NOT", !rev)}
        ${probe(pNsX, ny, "ns")}
        ${gateShape("AND", t0x, t0y, "AND", !rev)}
        ${gateShape("AND", t1x, t1y, "AND", !rev)}
        ${probe(425, t0y, "t0")}
        ${probe(425, t1y, "t1")}
        ${gateShape("OR", ox, oy, "OR", !rev)}
        ${led(lx, ly, "out")}
      `;
      },
    },
  ];

  const LEVELS = [...A, ...B, ...C, ...D, ...E];

  function levelById(id) {
    return LEVELS.find((l) => l.id === id);
  }

  function levelsInTrack(track) {
    return LEVELS.filter((l) => l.track === track);
  }

  function trackUnlocked(track, completed) {
    const done = (id) => !!completed[id];
    if (track === "A") return true;
    if (track === "B") {
      return ["wire", "not", "or", "and", "xor"].every(done);
    }
    if (track === "C") return done("latch");
    if (track === "D") return done("c1") || B.filter((l) => done(l.id)).length >= 5;
    if (track === "E") return done("d1") || D.filter((l) => done(l.id)).length >= 2;
    return false;
  }

  function nextLevel(id) {
    const i = LEVELS.findIndex((l) => l.id === id);
    return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
  }

  function prevLevel(id) {
    const i = LEVELS.findIndex((l) => l.id === id);
    return i > 0 ? LEVELS[i - 1] : null;
  }

  function firstIncomplete(completed) {
    return LEVELS.find((l) => !completed[l.id] && trackUnlocked(l.track, completed)) || LEVELS[0];
  }

  LP.COLORS = COLORS;
  LP.LEVELS = LEVELS;
  LP.evaluate = evaluate;
  LP.levelById = levelById;
  LP.levelsInTrack = levelsInTrack;
  LP.trackUnlocked = trackUnlocked;
  LP.nextLevel = nextLevel;
  LP.prevLevel = prevLevel;
  LP.firstIncomplete = firstIncomplete;
  LP.TRACKS = [
    { id: "A", title: "Primer", blurb: "One gate at a time." },
    { id: "B", title: "Nest", blurb: "Gate outputs feed other gates." },
    { id: "C", title: "Memory", blurb: "Latch arms the next rule." },
    { id: "D", title: "Capstone", blurb: "Adders, mux, parity." },
    { id: "E", title: "Machines", blurb: "Multi-in / multi-out: adder, decoder, ALU." },
  ];
})(window.LogicPages);
