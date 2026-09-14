(() => {
  const KIND_LABEL = {
    goal: "目标",
    session: "会话",
    feed_entry: "Feed",
    artifact: "交付物",
  };
  const STATE_LABEL = { waiting: "待执行", done: "已完成" };
  const PLUGIN_KEY = {
    goals: "goals",
    sessions: "sessions",
    feed: "feed",
    artifacts: "artifacts",
  };
  const ITEM_KIND = {
    goals: "goal",
    sessions: "session",
    feed: "feed_entry",
    artifacts: "artifact",
  };

  const catalog = {
    goalboard: {
      name: "GoalBoard",
      emblem: "G",
      plugins: ["goals", "sessions", "feed", "artifacts"],
      items: {
        goals: [
          { id: "weekly", title: "写周报", caption: "把本周推进收成一页可读的记录", state: "waiting" },
          { id: "shell", title: "工作台容器", caption: "Goal 画布是主表面，Frame 按 Goal 展开", state: "waiting" },
          { id: "runtime", title: "Runtime 接入", caption: "终端仍归 Work 插件拥有", state: "done" },
        ],
        sessions: [
          { id: "s12", title: "runtime-12", caption: "本机 Codex · 今天 16:20" },
          { id: "s8", title: "review-pass", caption: "本机 Claude · 昨天" },
        ],
        feed: [{ id: "f1", title: "发行说明草稿", caption: "来源 · 产品笔记" }],
        artifacts: [{ id: "a1", title: "容器 spec.md", caption: "精确版本 · 今天" }],
      },
    },
    spark: {
      name: "灵感收集",
      emblem: "灵",
      plugins: ["goals", "feed"],
      items: {
        goals: [{ id: "clip", title: "收集片断", caption: "还没有拆成可执行的 Goal", state: "waiting" }],
        sessions: [],
        feed: [{ id: "f2", title: "一条未分类摘录", caption: "来源 · 剪藏" }],
        artifacts: [],
      },
    },
  };

  let uid = 1;
  const nextId = (p) => `${p}-${uid++}`;

  const CANVAS_TAB = "goal-canvas";

  const emptyProject = (firstGoalId) => ({
    directory: "goals",
    plugin: "goals",
    activeTab: CANVAS_TAB,
    selectedGoalId: firstGoalId,
    openFrames: [],
    canvasCamera: { x: 0, y: 0, scale: 1 },
    cards: {},
    frames: {},
  });

  function demoGoalboard() {
    uid = 40;
    return {
      directory: "goals",
      plugin: "goals",
      activeTab: CANVAS_TAB,
      selectedGoalId: "weekly",
      openFrames: ["weekly"],
      canvasCamera: { x: 0, y: 0, scale: 1 },
      cards: {
        weekly: {
          x: 56,
          y: 56,
          mode: "chat",
          messages: [
            { who: "me", text: "先把本周三件事收成可读的一段。" },
            { who: "bot", text: "切片示意，尚未接入 Runtime。" },
          ],
        },
        shell: { x: 338, y: 56, mode: "card", messages: [] },
        runtime: { x: 56, y: 360, mode: "card", messages: [] },
      },
      frames: {
        weekly: {
          camera: { x: 0, y: 0, scale: 1 },
          blocks: [
            { id: "b-s12", kind: "session", itemId: "s12", x: 48, y: 48 },
            { id: "b-a1", kind: "artifact", itemId: "a1", x: 336, y: 48 },
          ],
        },
      },
    };
  }

  function demoSpark() {
    return {
      ...emptyProject("clip"),
      cards: { clip: { x: 56, y: 56, mode: "card", messages: [] } },
      frames: { clip: { camera: { x: 0, y: 0, scale: 1 }, blocks: [] } },
    };
  }

  const stores = { goalboard: demoGoalboard(), spark: demoSpark() };
  let projectId = "goalboard";
  let toastTimer = 0;
  let toastText = "";

  const $ = (id) => document.getElementById(id);
  const state = () => stores[projectId];
  const project = () => catalog[projectId];

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function itemsOf(kind) {
    const bag = project().items;
    if (kind === "goal") return bag.goals;
    if (kind === "session") return bag.sessions;
    if (kind === "feed_entry") return bag.feed;
    if (kind === "artifact") return bag.artifacts;
    return [];
  }

  function meta(kind, id) {
    return itemsOf(kind).find((row) => row.id === id) || { title: id, caption: KIND_LABEL[kind] || kind };
  }

  function ensureCard(goalId) {
    const s = state();
    if (!s.cards[goalId]) s.cards[goalId] = { x: 72, y: 72, mode: "card", messages: [] };
    return s.cards[goalId];
  }

  function ensureFrame(goalId) {
    const s = state();
    if (!s.frames[goalId]) s.frames[goalId] = { camera: { x: 0, y: 0, scale: 1 }, blocks: [] };
    return s.frames[goalId];
  }

  function showToast(text) {
    toastText = text;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastText = "";
      const node = document.querySelector(".toast");
      if (node) node.remove();
    }, 2200);
    const host = $("container");
    if (!host) return;
    let node = host.querySelector(".toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      host.appendChild(node);
    }
    node.textContent = text;
  }

  function rejectNonGoal(surface) {
    if (surface) {
      surface.classList.add("is-reject");
      window.setTimeout(() => surface.classList.remove("is-reject"), 420);
    }
    showToast("Goal 画布只放 Goal。先展开某个 Goal 的 Frame，再把内容拖进去。");
  }

  function selectGoal(goalId) {
    const s = state();
    s.selectedGoalId = goalId;
    s.activeTab = CANVAS_TAB;
    s.directory = "goals";
    s.plugin = "goals";
    ensureCard(goalId);
    render();
  }

  function setCardMode(goalId, mode) {
    const card = ensureCard(goalId);
    card.mode = mode;
    state().selectedGoalId = goalId;
    render();
  }

  function expandFrame(goalId) {
    const s = state();
    ensureFrame(goalId);
    if (!s.openFrames.includes(goalId)) s.openFrames.push(goalId);
    s.activeTab = goalId;
    s.selectedGoalId = goalId;
    render();
  }

  function closeFrameTab(goalId) {
    const s = state();
    s.openFrames = s.openFrames.filter((id) => id !== goalId);
    if (s.activeTab === goalId) s.activeTab = CANVAS_TAB;
    render();
  }

  function placeBlock(kind, itemId, clientX, clientY) {
    const s = state();
    if (s.activeTab === CANVAS_TAB) {
      rejectNonGoal($("container").querySelector(".goal-canvas"));
      return;
    }
    const frame = ensureFrame(s.activeTab);
    const surface = $("container").querySelector(".frame-canvas");
    const rect = surface.getBoundingClientRect();
    const x = (clientX - rect.left - frame.camera.x) / frame.camera.scale - 40;
    const y = (clientY - rect.top - frame.camera.y) / frame.camera.scale - 24;
    frame.blocks.push({ id: nextId("b"), kind, itemId, x: Math.max(16, x), y: Math.max(16, y) });
    render();
  }

  function addBlockToCurrentFrame(kind, itemId) {
    const s = state();
    if (s.activeTab === CANVAS_TAB) {
      rejectNonGoal($("container").querySelector(".goal-canvas"));
      return;
    }
    const frame = ensureFrame(s.activeTab);
    const offset = frame.blocks.length * 28;
    frame.blocks.push({ id: nextId("b"), kind, itemId, x: 48 + offset, y: 48 + offset });
    render();
  }

  function sendChat(goalId, text) {
    const card = ensureCard(goalId);
    card.mode = "chat";
    card.messages.push({ who: "me", text });
    card.messages.push({ who: "bot", text: "切片示意，尚未接入 Runtime。" });
    render();
  }

  function renderDirectory() {
    const s = state();
    const p = project();
    $("project-emblem").textContent = p.emblem;
    $("project-name").textContent = p.name;
    $("dir-heading").hidden = s.directory === "root";
    $("root-dir").hidden = s.directory !== "root";
    $("item-dir").hidden = s.directory === "root";
    $("plugin-strip").innerHTML = p.plugins.map((id) => {
      const labels = { goals: "Goals", sessions: "Sessions", feed: "Feed", artifacts: "Artifacts" };
      return `<button type="button" data-plugin="${id}" ${s.plugin === id ? "aria-current='true'" : ""}>${labels[id]}</button>`;
    }).join("");

    const modules = [
      ["home", "i-home", "项目首页", p.name],
      ["goals", "i-target", "Goals", "目标和推进"],
      ...(p.plugins.includes("sessions") ? [["sessions", "i-terminal", "Sessions", "会话与终端"]] : []),
      ...(p.plugins.includes("feed") ? [["feed", "i-feed", "Feed", "来源与待处理"]] : []),
      ...(p.plugins.includes("artifacts") ? [["artifacts", "i-file", "Artifacts", "成果与版本"]] : []),
    ];
    $("root-dir").innerHTML = modules.map(([id, icon, title, caption]) => `
      <button class="module-row" type="button" data-root="${id}">
        <svg><use href="#${icon}"/></svg>
        <span><strong>${title}</strong><small>${caption}</small></span>
        ${id === "home" ? "" : '<svg class="chevron"><use href="#i-chevron"/></svg>'}
      </button>`).join("");

    if (s.directory === "root") return;
    const key = PLUGIN_KEY[s.directory] || s.directory;
    const kind = ITEM_KIND[key];
    const rows = project().items[key] || [];
    $("item-list").innerHTML = rows.map((row) => {
      const two = kind !== "goal" ? "is-two-line" : "";
      const state = row.state ? `<span class="state ${row.state}">${STATE_LABEL[row.state] || row.state}</span>` : "";
      return `<button class="item-row ${two}" type="button" draggable="true" data-kind="${kind}" data-id="${row.id}">
        <span class="copy"><strong>${esc(row.title)}</strong>${kind === "goal" ? "" : `<small>${esc(row.caption)}</small>`}</span>
        ${state}
      </button>`;
    }).join("") || `<p class="caption" style="padding:8px;color:var(--quiet)">这个目录还没有条目。</p>`;
  }

  function renderTabs() {
    const s = state();
    const canvasCurrent = s.activeTab === CANVAS_TAB ? "aria-current='true'" : "";
    const frames = s.openFrames.map((goalId) => {
      const title = meta("goal", goalId).title;
      const current = s.activeTab === goalId ? "aria-current='true'" : "";
      return `<button class="tab" type="button" data-tab="${goalId}" ${current}>
        <span>${esc(title)}</span>
        <span class="close" data-close="${goalId}" aria-label="关闭"><svg><use href="#i-close"/></svg></span>
      </button>`;
    }).join("");
    $("tabstrip").innerHTML = `
      <button class="tab is-pinned" type="button" data-tab="${CANVAS_TAB}" ${canvasCurrent}>
        <span>Goal 画布</span>
      </button>${frames}`;
  }

  function renderGoalCanvas() {
    const s = state();
    const cam = s.canvasCamera;
    const cards = project().items.goals.map((goal) => {
      const card = ensureCard(goal.id);
      const selected = s.selectedGoalId === goal.id ? "is-selected" : "";
      const chat = card.mode === "chat" ? "is-chat" : "";
      const complete = goal.state === "done" ? "is-complete" : "";
      const status = STATE_LABEL[goal.state] || "";
      const thread = card.messages.map((msg) => `
        <li>
          <span>${msg.who === "me" ? "你" : "Runtime"}</span>
          <p>${esc(msg.text)}</p>
        </li>`).join("");
      const chatHtml = card.mode === "chat" ? `
        <div class="card-chat">
          <ol class="card-thread">${thread}</ol>
          <form class="card-compose" data-chat="${goal.id}">
            <input name="line" placeholder="直接对话推进…" autocomplete="off">
            <button type="submit">发送</button>
          </form>
        </div>` : `<p class="caption">${esc(goal.caption)}</p>`;
      return `<article class="goal-card ${selected} ${chat} ${complete}" data-goal="${goal.id}" style="left:${card.x}px;top:${card.y}px">
        <div class="card-modes" role="group" aria-label="Goal 模式">
          <button type="button" data-mode="chat" data-goal="${goal.id}" aria-pressed="${card.mode === "chat"}">对话</button>
          <button type="button" data-expand="${goal.id}">展开</button>
        </div>
        <strong>${esc(goal.title)}</strong>
        ${status ? `<span class="status ${goal.state || ""}">${status}</span>` : ""}
        ${chatHtml}
      </article>`;
    }).join("");
    return `<div class="goal-canvas" id="surface">
      <div class="world" style="transform:translate(${cam.x}px,${cam.y}px) scale(${cam.scale})">${cards}</div>
    </div>`;
  }

  function renderFrame() {
    const s = state();
    const goalId = s.activeTab;
    const frame = ensureFrame(goalId);
    const cam = frame.camera;
    const blocks = frame.blocks.map((block) => {
      const row = meta(block.kind, block.itemId);
      return `<article class="block" data-block="${block.id}" data-kind="${block.kind}" style="left:${block.x}px;top:${block.y}px">
        <span class="kind">${KIND_LABEL[block.kind]}</span>
        <strong>${esc(row.title)}</strong>
        <p>${esc(row.caption)}</p>
      </article>`;
    }).join("");
    const empty = frame.blocks.length ? "" : `<div class="frame-empty">
      <p>把会话、Feed、交付物拖到这里</p>
      <small>这些内容只为完成「${esc(meta("goal", goalId).title)}」</small>
    </div>`;
    return `<div class="frame-canvas" id="surface">${empty}
      <div class="world" style="transform:translate(${cam.x}px,${cam.y}px) scale(${cam.scale})">${blocks}</div>
    </div>`;
  }

  function renderStage() {
    const s = state();
    $("container").innerHTML = s.activeTab === CANVAS_TAB ? renderGoalCanvas() : renderFrame();
    if (toastText) {
      const node = document.createElement("div");
      node.className = "toast";
      node.setAttribute("role", "status");
      node.textContent = toastText;
      $("container").appendChild(node);
    }
  }

  function render() {
    renderDirectory();
    renderTabs();
    renderStage();
  }

  function bindPan(surface, camera) {
    let pan = null;
    surface.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".goal-card, .block, .card-modes, form, input, button")) return;
      pan = { x: event.clientX - camera.x, y: event.clientY - camera.y };
      surface.classList.add("is-panning");
      surface.setPointerCapture(event.pointerId);
    });
    surface.addEventListener("pointermove", (event) => {
      if (!pan) return;
      camera.x = event.clientX - pan.x;
      camera.y = event.clientY - pan.y;
      const world = surface.querySelector(".world");
      if (world) world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
    });
    surface.addEventListener("pointerup", () => {
      pan = null;
      surface.classList.remove("is-panning");
    });
  }

  function bindMove(node, pos) {
    node.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, form, input, .card-modes")) return;
      event.stopPropagation();
      const start = { x: event.clientX - pos.x, y: event.clientY - pos.y };
      node.setPointerCapture(event.pointerId);
      const move = (ev) => {
        pos.x = ev.clientX - start.x;
        pos.y = ev.clientY - start.y;
        node.style.left = `${pos.x}px`;
        node.style.top = `${pos.y}px`;
      };
      const up = () => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
    });
  }

  function bindStage() {
    const s = state();
    const surface = $("surface");
    if (!surface) return;
    const camera = s.activeTab === CANVAS_TAB ? s.canvasCamera : ensureFrame(s.activeTab).camera;
    bindPan(surface, camera);

    surface.querySelectorAll(".goal-card").forEach((node) => {
      const card = ensureCard(node.dataset.goal);
      bindMove(node, card);
      node.addEventListener("click", () => {
        s.selectedGoalId = node.dataset.goal;
        document.querySelectorAll(".goal-card").forEach((el) => el.classList.toggle("is-selected", el === node));
      });
    });
    surface.querySelectorAll(".block").forEach((node) => {
      const frame = ensureFrame(s.activeTab);
      const block = frame.blocks.find((row) => row.id === node.dataset.block);
      if (block) bindMove(node, block);
    });

    surface.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = s.activeTab === CANVAS_TAB ? "none" : "copy";
      if (s.activeTab !== CANVAS_TAB) surface.classList.add("is-drop");
    });
    surface.addEventListener("dragleave", (event) => {
      if (!surface.contains(event.relatedTarget)) surface.classList.remove("is-drop");
    });
    surface.addEventListener("drop", (event) => {
      event.preventDefault();
      surface.classList.remove("is-drop");
      const raw = event.dataTransfer.getData("text/goalboard-item");
      if (!raw) return;
      const item = JSON.parse(raw);
      if (s.activeTab === CANVAS_TAB) {
        if (item.kind === "goal") selectGoal(item.id);
        else rejectNonGoal(surface);
        return;
      }
      if (item.kind === "goal") {
        showToast("Goal 留在主画布上。这里只放推进这个 Goal 用的工作内容。");
        return;
      }
      placeBlock(item.kind, item.id, event.clientX, event.clientY);
    });
  }

  const originalRender = render;
  render = function renderAndBind() {
    originalRender();
    bindStage();
  };

  $("toggle-sidebar").addEventListener("click", () => {
    document.body.classList.toggle("is-collapsed");
  });
  $("project-trigger").addEventListener("click", () => {
    const menu = $("project-menu");
    const open = menu.hidden;
    menu.hidden = !open;
    $("project-trigger").setAttribute("aria-expanded", String(open));
    if (open) {
      menu.innerHTML = Object.entries(catalog).map(([id, row]) => `
        <button type="button" data-project="${id}" ${id === projectId ? "aria-current='true'" : ""}>
          <span class="emblem">${row.emblem}</span>
          <span><strong>${row.name}</strong><small>${id === "goalboard" ? "当前产品" : "另一个项目"}</small></span>
        </button>`).join("");
    }
  });
  $("project-menu").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-project]");
    if (!btn) return;
    projectId = btn.dataset.project;
    $("project-menu").hidden = true;
    $("project-trigger").setAttribute("aria-expanded", "false");
    render();
  });
  $("dir-back").addEventListener("click", () => {
    state().directory = "root";
    render();
  });
  $("plugin-strip").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-plugin]");
    if (!btn) return;
    state().plugin = btn.dataset.plugin;
    state().directory = btn.dataset.plugin;
    render();
  });
  $("root-dir").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-root]");
    if (!btn) return;
    if (btn.dataset.root === "home") {
      state().activeTab = CANVAS_TAB;
      state().directory = "root";
      render();
      return;
    }
    state().directory = btn.dataset.root;
    state().plugin = btn.dataset.root;
    render();
  });
  $("item-list").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-kind]");
    if (!btn) return;
    if (btn.dataset.kind === "goal") selectGoal(btn.dataset.id);
    else addBlockToCurrentFrame(btn.dataset.kind, btn.dataset.id);
  });
  $("item-list").addEventListener("dragstart", (event) => {
    const btn = event.target.closest("[data-kind]");
    if (!btn) return;
    event.dataTransfer.setData("text/goalboard-item", JSON.stringify({ kind: btn.dataset.kind, id: btn.dataset.id }));
    event.dataTransfer.effectAllowed = "copy";
  });
  $("tabstrip").addEventListener("click", (event) => {
    const close = event.target.closest("[data-close]");
    if (close) {
      event.stopPropagation();
      closeFrameTab(close.dataset.close);
      return;
    }
    const tab = event.target.closest("[data-tab]");
    if (!tab) return;
    state().activeTab = tab.dataset.tab;
    render();
  });
  $("container").addEventListener("click", (event) => {
    const expand = event.target.closest("[data-expand]");
    if (expand) {
      expandFrame(expand.dataset.expand);
      return;
    }
    const mode = event.target.closest("[data-mode]");
    if (mode) {
      const card = ensureCard(mode.dataset.goal);
      setCardMode(mode.dataset.goal, card.mode === "chat" ? "card" : "chat");
    }
  });
  $("container").addEventListener("submit", (event) => {
    const form = event.target.closest("[data-chat]");
    if (!form) return;
    event.preventDefault();
    const input = form.elements.line;
    const text = String(input.value || "").trim();
    if (!text) return;
    sendChat(form.dataset.chat, text);
  });
  $("btn-theme").addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
  });
  if (window.matchMedia("(max-width: 600px)").matches) {
    document.body.classList.add("is-collapsed");
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest("#project-trigger, #project-menu")) return;
    $("project-menu").hidden = true;
    $("project-trigger").setAttribute("aria-expanded", "false");
  });

  render();
})();
