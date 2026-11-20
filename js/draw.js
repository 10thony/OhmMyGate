/** Shared SVG drawing layer: ports + orthogonal wires for Logic Pages.
 *  viewBox is always 560×260. Every trace must start/end on a port.
 */
window.LogicPages = window.LogicPages || {};

(function (LP) {
  const VB = { W: 560, H: 260 };
  /**
   * Button contract (shared with CSS .input-btn + curriculum x/y):
   * - Diameter = 8.5% of stage width (= BTN_SIZE in SVG units).
   * - Curriculum x,y = CENTER of button as % of the letterboxed .board-stage.
   * - CSS: left/top at that % with transform: translate(-50%, -50%).
   * - buttonPort → SVG right-rim exit at vertical mid of that circle.
   */
  const BTN_SIZE = VB.W * 0.085;

  function rnd(n) {
    return Math.round(n * 10) / 10;
  }

  /**
   * Port contract (SVG coords) relative to gateShape(op, x, y):
   *
   * WIRE / LATCH / MEM — rect [x, y-28]→[x+90, y+28]
   *   inMid (x, y) · inTop (x, y-14) · inBot (x, y+14) · out (x+90, y)
   *   top (x+45, y-28) — top-edge mid (feedback loops)
   *
   * NOT — triangle tip + bubble; bubble center (x+78, y) r=8
   *   inMid (x, y) · out (x+86, y)  // right rim of bubble
   *
   * OR / AND / XOR — shield; right tip of body at (x+68, y)
   *   Left edge is a quadratic that bulges right: at ±16px from mid,
   *   the outline sits near x+10; at mid, x+14. Inputs meet that curve.
   *   (XOR arc at x-8 is decorative only.)
   *   inTop (x+10, y-16) · inBot (x+10, y+16) · inMid (x+14, y) · out (x+68, y)
   */
  function gatePorts(op, x, y) {
    if (op === "NOT") {
      return {
        inMid: { x: x, y: y },
        inTop: { x: x, y: y },
        inBot: { x: x, y: y },
        out: { x: x + 86, y: y },
      };
    }
    if (op === "WIRE" || op === "LATCH" || op === "MEM") {
      return {
        inMid: { x: x, y: y },
        inTop: { x: x, y: y - 14 },
        inBot: { x: x, y: y + 14 },
        out: { x: x + 90, y: y },
        top: { x: x + 45, y: y - 28 },
      };
    }
    // OR / AND / XOR — tip is quadratic midpoint at x+68; inputs on left curve
    return {
      inMid: { x: x + 14, y: y },
      inTop: { x: x + 10, y: y - 16 },
      inBot: { x: x + 10, y: y + 16 },
      out: { x: x + 68, y: y },
    };
  }

  function gateShape(op, x, y, label, hidden) {
    const text = hidden ? "???" : label || op;
    if (op === "NOT") {
      return `
        <polygon class="gate-body" points="${x},${y - 28} ${x + 70},${y} ${x},${y + 28}" />
        <circle cx="${x + 78}" cy="${y}" r="8" fill="var(--surface-raised)" stroke="var(--ink)" stroke-width="2.5" />
        <text class="gate-label ${hidden ? "hidden-label" : ""}" data-gate-label x="${x + 28}" y="${y + 4}">${text}</text>`;
    }
    if (op === "WIRE" || op === "LATCH" || op === "MEM") {
      return `
        <rect class="gate-body" x="${x}" y="${y - 28}" width="90" height="56" rx="10" />
        <text class="gate-label ${hidden ? "hidden-label" : ""}" data-gate-label x="${x + 45}" y="${y + 4}">${text}</text>`;
    }
    const xor =
      op === "XOR" && !hidden
        ? `<path d="M ${x - 8} ${y - 30} Q ${x + 12} ${y} ${x - 8} ${y + 30}" fill="none" stroke="var(--ink)" stroke-width="2.5" />`
        : "";
    return `
      ${xor}
      <path class="gate-body" d="M ${x} ${y - 30} L ${x + 48} ${y - 30} Q ${x + 88} ${y} ${x + 48} ${y + 30} L ${x} ${y + 30} Q ${x + 28} ${y} ${x} ${y - 30} Z" />
      <text class="gate-label ${hidden ? "hidden-label" : ""}" data-gate-label x="${x + 40}" y="${y + 4}">${text}</text>`;
  }

  function ledRadius(label) {
    return label ? 14 : 16;
  }

  function ledPorts(cx, cy, label) {
    const r = ledRadius(label);
    return { in: { x: cx - r, y: cy }, c: { x: cx, y: cy }, r };
  }

  function led(cx, cy, id, label) {
    const r = ledRadius(label);
    // Clear air gap under the bulb so GND does not crowd the LED stroke
    const gndY = cy + r + 12;
    const labelY = label ? gndY + 22 : null;
    return `
      <circle class="led-bulb" id="led-${id}" data-node="${id}" cx="${cx}" cy="${cy}" r="${r}" />
      <g class="gnd" transform="translate(${cx} ${gndY})">
        <line x1="-8" y1="0" x2="8" y2="0" />
        <line x1="-5" y1="5" x2="5" y2="5" />
        <line x1="-2" y1="10" x2="2" y2="10" />
      </g>
      ${
        label
          ? `<text class="gate-label" x="${cx}" y="${labelY}" style="font-size:11px">${label}</text>`
          : ""
      }`;
  }

  function probePorts(cx, cy) {
    return {
      c: { x: cx, y: cy },
      in: { x: cx - 8, y: cy },
      out: { x: cx + 8, y: cy },
    };
  }

  function probe(cx, cy, id) {
    return `<circle class="probe-bulb" id="probe-${id}" data-node="${id}" cx="${cx}" cy="${cy}" r="8" />`;
  }

  /** Button center % on the 560×260 stage → right-rim exit port in SVG. */
  function buttonPort(pctX, pctY) {
    const cx = (pctX / 100) * VB.W;
    const cy = (pctY / 100) * VB.H;
    return {
      x: Math.round(cx + BTN_SIZE / 2),
      y: Math.round(cy),
    };
  }

  /**
   * Expand waypoints into an orthogonal polyline.
   * elbow: "vh" = vertical then horizontal (default — arrives on a horizontal run),
   *        "hv" = horizontal then vertical.
   */
  function expandOrtho(points, elbow) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const b = { x: rnd(points[i].x), y: rnd(points[i].y) };
      if (i === 0) {
        out.push(b);
        continue;
      }
      const a = out[out.length - 1];
      if (a.x !== b.x && a.y !== b.y) {
        if (elbow === "hv") out.push({ x: b.x, y: a.y });
        else out.push({ x: a.x, y: b.y });
      }
      out.push(b);
    }
    return out;
  }

  function pointsToPath(pts) {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[i - 1];
      if (p.x !== q.x) d += ` H ${p.x}`;
      else if (p.y !== q.y) d += ` V ${p.y}`;
    }
    return d;
  }

  /**
   * wire(dataHot, from, to, opts?)
   * wire(dataHot, points[], opts?)  — explicit waypoints (still ortho-expanded)
   *
   * opts.via    — extra waypoints between from and to
   * opts.elbow  — "vh" | "hv" (default "vh")
   * opts.id / className / dash — path attributes (jumper, etc.)
   */
  function wire(dataHot, a, b, opts) {
    let points;
    let options = opts || {};
    if (Array.isArray(a)) {
      points = a;
      options = b || {};
    } else {
      points = [a, ...((options && options.via) || []), b];
    }
    const elbow = (options && options.elbow) || "vh";
    const d = pointsToPath(expandOrtho(points, elbow));
    const cls = ["trace", options.className].filter(Boolean).join(" ");
    const idAttr = options.id ? ` id="${options.id}"` : "";
    const dash = options.dash ? ` stroke-dasharray="${options.dash}"` : "";
    return `<path class="${cls}" data-hot="${dataHot}"${idAttr} d="${d}"${dash} />`;
  }

  /** Compact MEM block used on the primer latch page. */
  function memBox(x, y) {
    return `
      <rect class="gate-body" x="${x}" y="${y - 24}" width="55" height="48" rx="8" />
      <text class="gate-label" x="${x + 27.5}" y="${y + 4}" style="font-size:11px">MEM</text>`;
  }

  function memPorts(x, y) {
    // Compact MEM rect: [x, y-24]→[x+55, y+24]
    return {
      inMid: { x: x, y: y },
      out: { x: x + 55, y: y },
      top: { x: x + 27.5, y: y - 24 },
    };
  }

  /** Rainbow stroke defs for live wires (referenced by CSS .trace.hot). */
  function ensureWireDefs(svg) {
    if (!svg || svg.querySelector("#wire-defs")) return;
    const NS = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(NS, "defs");
    defs.id = "wire-defs";
    defs.innerHTML = `
      <linearGradient id="wire-rainbow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="560" y2="260">
        <stop offset="0%" stop-color="#ff2d55"/>
        <stop offset="14%" stop-color="#ff7a1a"/>
        <stop offset="28%" stop-color="#ffd400"/>
        <stop offset="42%" stop-color="#2ee59d"/>
        <stop offset="57%" stop-color="#2ec4ff"/>
        <stop offset="72%" stop-color="#7b61ff"/>
        <stop offset="86%" stop-color="#ff4fd8"/>
        <stop offset="100%" stop-color="#ff2d55"/>
        <animate attributeName="x1" values="0;180;0" dur="6s" repeatCount="indefinite"/>
        <animate attributeName="x2" values="560;740;560" dur="6s" repeatCount="indefinite"/>
      </linearGradient>
      <linearGradient id="wire-rainbow-static" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="560" y2="260">
        <stop offset="0%" stop-color="#ff2d55"/>
        <stop offset="14%" stop-color="#ff7a1a"/>
        <stop offset="28%" stop-color="#ffd400"/>
        <stop offset="42%" stop-color="#2ee59d"/>
        <stop offset="57%" stop-color="#2ec4ff"/>
        <stop offset="72%" stop-color="#7b61ff"/>
        <stop offset="86%" stop-color="#ff4fd8"/>
        <stop offset="100%" stop-color="#ff2d55"/>
      </linearGradient>
    `;
    svg.insertBefore(defs, svg.firstChild);
  }

  /**
   * Paint order: gate bodies → traces (so strokes meet ports on top of fills)
   * → probes/LEDs/jumper hit UI. Call after assigning svg.innerHTML from draw().
   */
  function stackCircuitLayers(svg) {
    if (!svg) return;
    ensureWireDefs(svg);
    const traces = [...svg.querySelectorAll("path.trace")];
    traces.forEach((t) => svg.appendChild(t));
    // GND under the bulb so the LED rim stays clean where they meet
    svg.querySelectorAll("g.gnd").forEach((n) => svg.appendChild(n));
    svg.querySelectorAll(".probe-bulb, .led-bulb").forEach((n) => svg.appendChild(n));
    const hit = svg.querySelector("#jumper-hit-area");
    if (hit) svg.appendChild(hit);
    // keep dashed jumper segment clickable-looking above the hit area sibling order
    const gap = svg.querySelector("#jumper-hit");
    if (gap) svg.appendChild(gap);
    const jlabel = svg.querySelector("#jumper-label");
    if (jlabel) svg.appendChild(jlabel);
    // LED labels (Sum/Carry) above everything
    svg.querySelectorAll("text.gate-label").forEach((t) => {
      if (t.getAttribute("data-gate-label") != null) return;
      svg.appendChild(t);
    });
  }

  LP.VB = VB;
  LP.gatePorts = gatePorts;
  LP.gateShape = gateShape;
  LP.led = led;
  LP.ledPorts = ledPorts;
  LP.probe = probe;
  LP.probePorts = probePorts;
  LP.buttonPort = buttonPort;
  LP.wire = wire;
  LP.memBox = memBox;
  LP.memPorts = memPorts;
  LP.stackCircuitLayers = stackCircuitLayers;
})(window.LogicPages);
