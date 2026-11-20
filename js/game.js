(() => {
  const LP = window.LogicPages;
  const STORAGE_KEY = "logic-pages-v2";

  const state = {
    screen: "home",
    levelId: "wire",
    buttons: {},
    mem: {},
    flags: {},
    extras: { jumper: false },
    revealed: {},
    completed: {},
    settings: {
      sound: false,
      toggleMode: false,
      highContrast: false,
      reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    },
    idleTimer: null,
    hintShown: false,
  };

  const el = {
    screens: {
      home: document.getElementById("screen-home"),
      play: document.getElementById("screen-play"),
      complete: document.getElementById("screen-complete"),
    },
    pageChip: document.getElementById("page-chip"),
    board: document.getElementById("board"),
    svg: document.getElementById("circuit"),
    inputs: document.getElementById("inputs"),
    titleMark: document.getElementById("title-mark"),
    sideTitle: document.getElementById("side-title"),
    sideGoal: document.getElementById("side-goal"),
    sideTruth: document.getElementById("side-truth"),
    boardStatus: document.getElementById("board-status"),
    boardBlurb: document.getElementById("board-blurb"),
    sideHint: document.getElementById("side-hint"),
    tracks: document.getElementById("tracks"),
    btnPrev: document.getElementById("btn-prev"),
    btnNext: document.getElementById("btn-next"),
    settingsModal: document.getElementById("settings-modal"),
    courseModal: document.getElementById("course-modal"),
    courseTracks: document.getElementById("course-tracks"),
    parentModal: document.getElementById("parent-modal"),
    parentBody: document.getElementById("parent-body"),
    parentGate: document.getElementById("parent-gate"),
    parentGateForm: document.getElementById("parent-gate-form"),
    parentNote: document.getElementById("parent-note"),
  };

  function level() {
    return LP.levelById(state.levelId) || LP.LEVELS[0];
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // migrate v1 primer progress if present
        const v1 = localStorage.getItem("logic-pages-v1");
        if (v1) {
          const old = JSON.parse(v1);
          state.completed = old.completed || {};
          state.revealed = old.revealed || {};
          state.settings = { ...state.settings, ...(old.settings || {}) };
        }
        return;
      }
      const data = JSON.parse(raw);
      state.completed = data.completed || {};
      state.revealed = data.revealed || {};
      state.settings = { ...state.settings, ...(data.settings || {}) };
    } catch {
      /* ignore */
    }
  }

  function save() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        completed: state.completed,
        revealed: state.revealed,
        settings: state.settings,
      })
    );
  }

  function applySettings() {
    document.documentElement.classList.toggle("high-contrast", state.settings.highContrast);
    document.documentElement.classList.toggle("reduce-motion", state.settings.reduceMotion);
    document.getElementById("set-sound").checked = state.settings.sound;
    document.getElementById("set-toggle").checked = state.settings.toggleMode;
    document.getElementById("set-contrast").checked = state.settings.highContrast;
    document.getElementById("set-motion").checked = state.settings.reduceMotion;
  }

  let audioCtx = null;
  function beep(freq = 440, dur = 0.04) {
    if (!state.settings.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = 0.04;
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch {
      /* ignore */
    }
  }

  function setScreen(name) {
    state.screen = name;
    Object.entries(el.screens).forEach(([key, node]) => {
      node.classList.toggle("active", key === name);
    });
    document.getElementById("app").classList.toggle("play-mode", name === "play");
    const L = level();
    if (name === "play") {
      el.pageChip.textContent = state.revealed[L.id] ? L.name : `${L.track}${indexInTrack(L) + 1}`;
    } else if (name === "complete") {
      el.pageChip.textContent = "Done";
    } else {
      el.pageChip.textContent = "Logic Pages";
    }
    document.getElementById("play-nav").hidden = name !== "play";
  }

  function indexInTrack(L) {
    return LP.levelsInTrack(L.track).findIndex((x) => x.id === L.id);
  }

  function renderTracks() {
    el.tracks.innerHTML = "";
    LP.TRACKS.forEach((t) => {
      const unlocked = LP.trackUnlocked(t.id, state.completed);
      const levels = LP.levelsInTrack(t.id);
      const doneCount = levels.filter((l) => state.completed[l.id]).length;
      const card = document.createElement("article");
      card.className = "track-card" + (unlocked ? "" : " locked");
      card.innerHTML = `
        <div class="track-card-head">
          <h3>Track ${t.id} · ${t.title}</h3>
          <span class="chip">${doneCount}/${levels.length}</span>
        </div>
        <p>${unlocked ? t.blurb : lockMessage(t.id)}</p>
        <div class="level-dots" data-track="${t.id}"></div>
      `;
      const dots = card.querySelector(".level-dots");
      levels.forEach((l) => {
        const b = document.createElement("button");
        b.type = "button";
        b.title = l.name;
        b.setAttribute("aria-label", l.name);
        if (state.completed[l.id]) b.classList.add("done");
        if (l.id === state.levelId && state.screen === "play") b.classList.add("current");
        b.disabled = !unlocked;
        b.addEventListener("click", () => {
          if (unlocked) goToLevel(l.id);
        });
        dots.appendChild(b);
      });
      el.tracks.appendChild(card);
    });
  }

  function lockMessage(track) {
    if (track === "B") return "Locked — finish Primer through XOR.";
    if (track === "C") return "Locked — finish Primer LATCH.";
    if (track === "D") return "Locked — finish Latch+key (C1) or five Nest quests.";
    return "Locked";
  }

  function resetLevelState() {
    const L = level();
    state.buttons = {};
    L.buttons.forEach((b) => {
      state.buttons[b.id] = false;
    });
    state.mem = {};
    state.flags = L.flags ? { ...L.flags } : {};
    state.extras = { jumper: false, jumperNeeded: !!L.jumper };
    state.hintShown = false;
  }

  function toggleJumper() {
    state.extras.jumper = !state.extras.jumper;
    const label = el.svg.querySelector("#jumper-label");
    if (label) label.textContent = state.extras.jumper ? "jumper on" : "tap gap";
    const gap = el.svg.querySelector("#jumper-hit");
    if (gap) gap.classList.toggle("jumper-on", state.extras.jumper);
    beep(420, 0.03);
    updateCircuit();
  }

  function bindJumperHit() {
    const hit = el.svg.querySelector("#jumper-hit-area") || el.svg.querySelector("#jumper-hit");
    if (!hit) return;
    hit.style.cursor = "pointer";
    hit.addEventListener("click", toggleJumper);
  }

  function renderBoard() {
    const L = level();
    const rev = !!state.revealed[L.id];
    el.svg.innerHTML = L.draw(rev);
    if (LP.stackCircuitLayers) LP.stackCircuitLayers(el.svg);
    el.titleMark.textContent = rev ? L.name : "???";

    const color = L.ledColor || "#e85d9a";
    document.documentElement.style.setProperty("--led", color);
    /* Wires use rainbow gradient; keep probes/dots on accent signal */

    el.inputs.innerHTML = "";
    L.buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `input-btn color-${b.color}`;
      // Curriculum x/y = button CENTER % of .board-stage (CSS translate -50%).
      btn.style.left = `${b.x}%`;
      btn.style.top = `${b.y}%`;
      btn.dataset.id = b.id;
      btn.setAttribute("aria-label", b.label);
      btn.setAttribute("aria-pressed", "false");
      if (L.buttons.length === 1) btn.classList.add("solo");
      bindButton(btn, b.id);
      el.inputs.appendChild(btn);
    });

    if (L.jumper) {
      bindJumperHit();
    }

    updateCircuit();
  }

  function updateCircuit() {
    const L = level();
    L._extras = state.extras;
    const { values, mem } = LP.evaluate(L, state.buttons, state.mem);
    state.mem = mem;

    if (typeof L.onUpdate === "function") {
      L.onUpdate(values, state.buttons, state.flags);
    }

    el.svg.querySelectorAll(".trace[data-hot]").forEach((path) => {
      const key = path.getAttribute("data-hot");
      let hot = !!values[key];
      if (path.id === "jumper-hit") {
        hot = state.extras.jumper && (!!values.b || !!values.path);
        path.classList.toggle("jumper-on", state.extras.jumper);
      }
      path.classList.toggle("hot", hot);
    });

    el.svg.querySelectorAll(".led-bulb[data-node], .probe-bulb[data-node]").forEach((node) => {
      const id = node.getAttribute("data-node");
      node.classList.toggle("on", !!values[id]);
    });

    el.inputs.querySelectorAll(".input-btn").forEach((btn) => {
      const id = btn.dataset.id;
      const down = !!state.buttons[id];
      btn.setAttribute("aria-pressed", String(down));
      btn.classList.toggle("is-down", down);
    });

    const statusParts = L.buttons.map((b) => `${b.label}=${state.buttons[b.id] ? 1 : 0}`);
    const outs = L.nodes.filter((n) => n.led || n.probe);
    outs.forEach((n) => {
      statusParts.push(`${n.id.toUpperCase()}=${values[n.id] ? 1 : 0}`);
    });
    el.boardStatus.textContent = statusParts.join(" · ");

    el.board.setAttribute(
      "aria-label",
      `${L.name}. ${L.nodes
        .filter((n) => n.led)
        .map((n) => `${n.id} ${values[n.id] ? "on" : "off"}`)
        .join(", ")}`
    );

    if (L.completeWhen(values, state.buttons, state.flags, state.extras)) {
      markComplete(L.id);
    }
    if (!state.revealed[L.id] && L.revealWhen(values, state.buttons, state.flags, state.extras)) {
      reveal(L.id);
    }

    refreshTruthProgress(values);
  }

  function reveal(id) {
    if (state.revealed[id]) return;
    state.revealed[id] = true;
    save();
    const L = level();
    el.titleMark.textContent = L.name;
    el.pageChip.textContent = L.name;
    // Redraw circuit labels only (keep button DOM / listeners)
    const jumper = state.extras.jumper;
    el.svg.innerHTML = L.draw(true);
    if (LP.stackCircuitLayers) LP.stackCircuitLayers(el.svg);
    if (L.jumper) {
      state.extras.jumper = jumper;
      const gap = el.svg.querySelector("#jumper-hit");
      if (gap) gap.classList.toggle("jumper-on", jumper);
      const label = el.svg.querySelector("#jumper-label");
      if (label) label.textContent = jumper ? "jumper on" : "tap gap";
      bindJumperHit();
    }
    updateCircuit();
    renderSide();
    beep(660, 0.06);
  }

  function markComplete(id) {
    if (state.completed[id]) {
      el.sideGoal.classList.add("done");
      return;
    }
    state.completed[id] = true;
    save();
    renderSide();
    renderTracks();
    beep(520, 0.05);
    setTimeout(() => beep(720, 0.07), 70);
    el.sideHint.textContent = "Nice — next page when you are ready.";
  }

  function truthRowAchieved(row, flags, values, buttons) {
    if (typeof row.doneWhen === "function") {
      return !!row.doneWhen(flags, values, buttons);
    }
    if (row.flag) return !!flags[row.flag];
    return false;
  }

  function truthRowLive(row, flags, values, buttons) {
    if (typeof row.liveWhen !== "function") return false;
    return !!row.liveWhen(flags, values, buttons);
  }

  function truthProgressSignature(L, values) {
    if (!L.truth) return "none";
    return L.truth
      .map((row) => {
        const achieved = truthRowAchieved(row, state.flags, values, state.buttons);
        const live = truthRowLive(row, state.flags, values, state.buttons);
        return `${achieved ? 1 : 0}${live ? 1 : 0}`;
      })
      .join("");
  }

  /** Update side truth progress without resetting hints / idle (safe every tick). */
  function refreshTruthProgress(values) {
    const L = level();
    const revealed = !!state.revealed[L.id];
    if (!revealed || !L.truth) {
      if (state._truthSig === "hidden") return;
      state._truthSig = "hidden";
      el.sideTruth.innerHTML = "";
      const div = document.createElement("div");
      div.className = "row pending";
      div.innerHTML = `<span>Try the buttons</span><span class="out">???</span>`;
      el.sideTruth.appendChild(div);
      return;
    }

    const vals = values || LP.evaluate(L, state.buttons, state.mem).values;
    const sig = truthProgressSignature(L, vals);
    if (sig === state._truthSig) return;
    state._truthSig = sig;

    el.sideTruth.innerHTML = "";
    L.truth.forEach((row) => {
      const achieved = truthRowAchieved(row, state.flags, vals, state.buttons);
      const live = truthRowLive(row, state.flags, vals, state.buttons);
      const div = document.createElement("div");
      const classes = ["row", "pending"];
      if (achieved) classes.push("done");
      if (live) classes.push("live");
      div.className = classes.join(" ");
      const mark = achieved ? `<span class="check" aria-hidden="true">✓</span>` : "";
      div.innerHTML = `<span class="in">${row.in}</span><span class="out">${row.out}${mark}</span>`;
      el.sideTruth.appendChild(div);
    });
  }

  function renderSide() {
    const L = level();
    const done = !!state.completed[L.id];
    const revealed = !!state.revealed[L.id];

    el.sideTitle.textContent = revealed ? L.name : "Find the rule";
    el.sideGoal.textContent = L.goal;
    el.sideGoal.classList.toggle("done", done);

    state._truthSig = null;
    refreshTruthProgress();

    el.boardBlurb.textContent = revealed
      ? L.parent
      : "Press buttons and watch wires. Names appear when you find the rule.";

    // Always clear stale hints from other levels; idle timer may refill.
    el.sideHint.textContent = done ? "Nice — next page when you are ready." : "";
    state.hintShown = done;
    if (!done) resetIdle();

    const prev = LP.prevLevel(L.id);
    const next = LP.nextLevel(L.id);
    el.btnPrev.disabled = !prev || !LP.trackUnlocked(prev.track, state.completed);
    el.btnNext.querySelector(".label").textContent = next ? "Next" : "Finish";
  }

  function resetIdle() {
    clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      if (state.hintShown || state.screen !== "play") return;
      el.sideHint.textContent = level().hint || "";
      state.hintShown = true;
    }, 9000);
  }

  function goToLevel(id) {
    const L = LP.levelById(id);
    if (!L || !LP.trackUnlocked(L.track, state.completed)) return;
    state.levelId = id;
    resetLevelState();
    setScreen("play");
    renderBoard();
    renderSide();
    renderTracks();
  }

  function nextPage() {
    const next = LP.nextLevel(state.levelId);
    if (!next) {
      setScreen("complete");
      return;
    }
    if (!LP.trackUnlocked(next.track, state.completed)) {
      setScreen("home");
      renderTracks();
      el.sideHint.textContent = "";
      return;
    }
    goToLevel(next.id);
  }

  function prevPage() {
    const prev = LP.prevLevel(state.levelId);
    if (!prev) return;
    goToLevel(prev.id);
  }

  function setInput(id, down) {
    const prev = !!state.buttons[id];
    state.buttons[id] = down;
    if (prev !== down) beep(down ? 380 : 280, 0.025);
    updateCircuit();
    resetIdle();
  }

  let heldId = null;

  function bindButton(button, id) {
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try {
        button.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (state.settings.toggleMode) {
        setInput(id, !state.buttons[id]);
        return;
      }
      heldId = id;
      setInput(id, true);
    });
    const release = () => {
      if (state.settings.toggleMode) return;
      if (heldId === id && state.buttons[id]) {
        setInput(id, false);
        heldId = null;
      }
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (state.settings.toggleMode) setInput(id, !state.buttons[id]);
        else if (!e.repeat) {
          heldId = id;
          setInput(id, true);
        }
      }
    });
    button.addEventListener("keyup", (e) => {
      if ((e.key === " " || e.key === "Enter") && !state.settings.toggleMode) {
        e.preventDefault();
        release();
      }
    });
  }

  window.addEventListener("pointerup", () => {
    if (state.settings.toggleMode || !heldId) return;
    if (state.buttons[heldId]) setInput(heldId, false);
    heldId = null;
  });

  function openModal(node) {
    node.classList.add("open");
    node.setAttribute("aria-hidden", "false");
  }
  function closeModal(node) {
    node.classList.remove("open");
    node.setAttribute("aria-hidden", "true");
  }

  let parentExpect = null;

  function openParent() {
    const L = level();
    el.parentGate.textContent = state.revealed[L.id] ? L.name : "Hidden";
    el.parentNote.hidden = true;
    el.parentGateForm.hidden = false;
    el.parentBody.innerHTML = "";
    const y = new Date().getFullYear();
    const a = 3 + Math.floor(Math.random() * 6);
    parentExpect = String(y - a);
    document.getElementById("parent-q").textContent = `What year was it ${a} years ago?`;
    document.getElementById("parent-a").value = "";
    document.getElementById("parent-err").textContent = "";
    openModal(el.parentModal);
  }

  function showParentNote() {
    const L = level();
    el.parentGateForm.hidden = true;
    el.parentNote.hidden = false;
    el.parentBody.innerHTML = `
      <p><strong>What to try:</strong> ${L.goal}</p>
      <p>${L.parent}</p>
      <p>Watch mid probes — they show whether a nested gate is happy before the final LED.</p>
    `;
  }

  function renderCourseNav() {
    el.courseTracks.innerHTML = "";
    LP.TRACKS.forEach((t) => {
      const unlocked = LP.trackUnlocked(t.id, state.completed);
      const levels = LP.levelsInTrack(t.id);
      const block = document.createElement("div");
      block.className = "course-track" + (unlocked ? "" : " locked");
      block.innerHTML = `<h3>Track ${t.id} · ${t.title}${unlocked ? "" : " · locked"}</h3>`;
      const row = document.createElement("div");
      row.className = "course-levels";
      levels.forEach((l) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = state.revealed[l.id] || state.completed[l.id] ? l.name : `${t.id}${levels.indexOf(l) + 1}`;
        if (state.completed[l.id]) b.classList.add("done");
        if (l.id === state.levelId && state.screen === "play") b.classList.add("current");
        b.disabled = !unlocked;
        b.addEventListener("click", () => {
          closeModal(el.courseModal);
          goToLevel(l.id);
        });
        row.appendChild(b);
      });
      block.appendChild(row);
      el.courseTracks.appendChild(block);
    });
  }

  function openCourseNav() {
    renderCourseNav();
    openModal(el.courseModal);
  }

  function bindUi() {
    document.getElementById("btn-start").addEventListener("click", () => goToLevel("wire"));
    document.getElementById("btn-resume").addEventListener("click", () => {
      goToLevel(LP.firstIncomplete(state.completed).id);
    });
    document.getElementById("btn-home").addEventListener("click", () => {
      setScreen("home");
      renderTracks();
    });
    document.getElementById("btn-replay").addEventListener("click", () => goToLevel("wire"));

    el.btnPrev.addEventListener("click", prevPage);
    el.btnNext.addEventListener("click", nextPage);

    el.pageChip.addEventListener("click", openCourseNav);
    document.getElementById("course-home").addEventListener("click", () => {
      closeModal(el.courseModal);
      setScreen("home");
      renderTracks();
    });

    document.getElementById("btn-settings").addEventListener("click", () => {
      applySettings();
      openModal(el.settingsModal);
    });
    document.getElementById("btn-parent").addEventListener("click", openParent);

    el.settingsModal.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => closeModal(el.settingsModal))
    );
    el.courseModal.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => closeModal(el.courseModal))
    );
    el.parentModal.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => closeModal(el.parentModal))
    );
    el.settingsModal.addEventListener("click", (e) => {
      if (e.target === el.settingsModal) closeModal(el.settingsModal);
    });
    el.courseModal.addEventListener("click", (e) => {
      if (e.target === el.courseModal) closeModal(el.courseModal);
    });
    el.parentModal.addEventListener("click", (e) => {
      if (e.target === el.parentModal) closeModal(el.parentModal);
    });

    document.getElementById("parent-unlock").addEventListener("click", () => {
      if (document.getElementById("parent-a").value.trim() !== parentExpect) {
        document.getElementById("parent-err").textContent = "Try again, or ask another grown-up.";
        return;
      }
      showParentNote();
    });

    document.getElementById("set-sound").addEventListener("change", (e) => {
      state.settings.sound = e.target.checked;
      save();
      if (e.target.checked) beep(500, 0.05);
    });
    document.getElementById("set-toggle").addEventListener("change", (e) => {
      state.settings.toggleMode = e.target.checked;
      resetLevelState();
      updateCircuit();
      save();
    });
    document.getElementById("set-contrast").addEventListener("change", (e) => {
      state.settings.highContrast = e.target.checked;
      applySettings();
      save();
    });
    document.getElementById("set-motion").addEventListener("change", (e) => {
      state.settings.reduceMotion = e.target.checked;
      applySettings();
      save();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal(el.settingsModal);
        closeModal(el.courseModal);
        closeModal(el.parentModal);
      }
    });
  }

  function init() {
    load();
    applySettings();
    bindUi();
    setScreen("home");
    renderTracks();
  }

  init();
})();
