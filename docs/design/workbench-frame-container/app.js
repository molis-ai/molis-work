(() => {
  const CANVAS_TAB = "goal-canvas";
  const SCALE_MIN = 0.4;
  const SCALE_MAX = 1.6;
  const NODE_W = 258;
  const NODE_H = 190;
  const query = new URLSearchParams(location.search);

  const copy = {
    zh: {
      dirBack: "项目目录",
      localSpace: "本机空间",
      search: "搜索…",
      canvasTab: "Goal 画布",
      closeTab: "关闭",
      collapse: "收起目录",
      openDir: "打开目录",
      theme: "切换外观",
      openGoal: "打开 Goal",
      openFrame: "打开 Frame",
      mapTitle: "目标关系",
      mapSub: "{count} 个目标 · 箭头从前置成果指向后续工作",
      hintCanvas: "单击看血缘 · 双击或右上角打开",
      hintFrame: "从目录把会话、Feed、交付物拖进来",
      emptyFrame: "把会话、Feed、交付物放到这张画布上",
      emptyFrameSub: "这些内容只为完成「{title}」",
      rejectCanvas: "Goal 画布只放 Goal。先打开某个 Goal 的 Frame，再把内容拖进去。",
      rejectGoal: "Goal 留在主画布上。这里只放推进这个 Goal 用的工作内容。",
      home: "项目首页",
      goalsCap: "目标和推进",
      sessionsCap: "会话与终端",
      feedCap: "来源与待处理",
      artifactsCap: "成果与版本",
      market: "插件市场",
      currentProject: "当前项目",
      otherProject: "另一个项目",
      dirEmpty: "这个目录还没有条目。",
      continue: "可继续",
      waiting: "等待中",
      done: "已完成",
      belongs: "属于：{title}",
      kindGoal: "目标",
      kindSession: "会话",
      kindFeed: "Feed",
      kindArtifact: "交付物",
      workspace: "Goal 工作区",
      collapseGoal: "收起 Goal，返回关系画布",
      details: "Goal 信息与时间线",
      conversation: "对话",
      conversationSoon: "对话尚未接入",
      terminal: "终端",
      noTerminal: "还没有终端",
      noTerminalHint: "点右上角「添加终端」，在这个 Goal 上打开常用 Runtime 或自定义命令。",
      goalInfo: "Goal 信息",
      timeline: "时间线",
      record: "记一笔",
      timelineEmpty: "打开终端开始工作，或添加一条记录。",
      latestFirst: "最新在前",
      localeBtn: "EN",
      zoomOut: "缩小",
      zoomIn: "放大",
      zoomFit: "适应全部目标",
    },
    en: {
      dirBack: "Project directory",
      localSpace: "This device",
      search: "Search…",
      canvasTab: "Goal canvas",
      closeTab: "Close",
      collapse: "Collapse directory",
      openDir: "Open directory",
      theme: "Appearance",
      openGoal: "Open Goal",
      openFrame: "Open Frame",
      mapTitle: "Goal relations",
      mapSub: "{count} Goals · arrows point from earlier results to later work",
      hintCanvas: "Click to see lineage · double-click or use the top-right to open",
      hintFrame: "Drag sessions, Feed, or artifacts from the directory",
      emptyFrame: "Put sessions, Feed, or artifacts on this canvas",
      emptyFrameSub: "These belong to finishing “{title}”",
      rejectCanvas: "The Goal canvas only holds Goals. Open a Frame first, then drop work into it.",
      rejectGoal: "Goals stay on the main canvas. This Frame only holds work that finishes this Goal.",
      home: "Project home",
      goalsCap: "Goals and progress",
      sessionsCap: "Sessions and terminals",
      feedCap: "Sources and attention",
      artifactsCap: "Results and versions",
      market: "Plugin market",
      currentProject: "Current project",
      otherProject: "Another project",
      dirEmpty: "Nothing in this directory yet.",
      continue: "Continue",
      waiting: "Waiting",
      done: "Done",
      belongs: "Part of: {title}",
      kindGoal: "Goal",
      kindSession: "Session",
      kindFeed: "Feed",
      kindArtifact: "Artifact",
      workspace: "Goal workspace",
      collapseGoal: "Collapse Goal, return to the relation map",
      details: "Goal info and timeline",
      conversation: "Chat",
      conversationSoon: "Chat is not connected yet",
      terminal: "Terminal",
      noTerminal: "No terminal yet",
      noTerminalHint: "Use Add terminal in the corner to open a Runtime or a custom command on this Goal.",
      goalInfo: "Goal info",
      timeline: "Timeline",
      record: "Note",
      timelineEmpty: "Open a terminal to work, or add a record.",
      latestFirst: "Newest first",
      localeBtn: "中文",
      zoomOut: "Zoom out",
      zoomIn: "Zoom in",
      zoomFit: "Fit all Goals",
    },
  };

  let locale = query.get("en") ? "en" : "zh";
  const t = (key, vars = {}) => {
    let text = copy[locale][key] || copy.zh[key] || key;
    Object.entries(vars).forEach(([name, value]) => {
      text = text.replace(`{${name}}`, value);
    });
    return text;
  };

  const KIND_LABEL = () => ({
    goal: t("kindGoal"),
    session: t("kindSession"),
    feed_entry: t("kindFeed"),
    artifact: t("kindArtifact"),
  });
  const STATE_LABEL = () => ({ continue: t("continue"), waiting: t("waiting"), done: t("done") });
  const STATUS_ICON = { continue: "i-ready", waiting: "i-clock", done: "i-check" };
  const PLUGIN_KEY = { goals: "goals", sessions: "sessions", feed: "feed", artifacts: "artifacts" };
  const ITEM_KIND = { goals: "goal", sessions: "session", feed: "feed_entry", artifacts: "artifact" };

  const catalog = {
    studio: {
      name: "工作台",
      emblem: "工",
      plugins: ["goals", "sessions", "feed", "artifacts"],
      items: {
        goals: [
          { id: "runtime", title: "Runtime 接入", caption: "终端仍归 Work 插件拥有", state: "done" },
          { id: "shell", title: "工作台容器", caption: "Goal 画布是主表面，Frame 按 Goal 展开", state: "waiting", parent: "runtime" },
          { id: "weekly", title: "写周报", caption: "把本周推进收成一页可读的记录", state: "continue", parent: "shell" },
        ],
        sessions: [
          { id: "s12", title: "runtime-12", caption: "本机 Codex · 今天 16:20" },
          { id: "s8", title: "review-pass", caption: "本机 Claude · 昨天" },
        ],
        feed: [{ id: "f1", title: "发行说明草稿", caption: "来源 · 产品笔记" }],
        artifacts: [{ id: "a1", title: "容器 spec.md", caption: "精确版本 · 今天" }],
      },
      edges: [
        { from: "runtime", to: "shell" },
        { from: "shell", to: "weekly" },
      ],
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
      edges: [],
    },
  };

  let uid = 1;
  const nextId = (prefix) => `${prefix}-${uid++}`;

  const emptyProject = (firstGoalId) => ({
    directory: "goals",
    plugin: "goals",
    activeTab: CANVAS_TAB,
    selectedGoalId: firstGoalId,
    expandedGoalId: "",
    detailsOpen: true,
    query: "",
    openFrames: [],
    canvasCamera: { x: 0, y: 0, scale: 1 },
    cards: {},
    frames: {},
  });

  function demoStudio() {
    uid = 40;
    return {
      directory: "goals",
      plugin: "goals",
      activeTab: query.get("tab") === "frame" ? "weekly" : CANVAS_TAB,
      selectedGoalId: "weekly",
      expandedGoalId: query.get("workspace") === "1" ? "weekly" : "",
      detailsOpen: true,
      query: "",
      openFrames: ["weekly"],
      canvasCamera: { x: 8, y: 4, scale: 1 },
      cards: {
        runtime: { x: 40, y: 70 },
        shell: { x: 380, y: 70 },
        weekly: { x: 720, y: 70 },
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
      cards: { clip: { x: 40, y: 70 } },
      frames: { clip: { camera: { x: 0, y: 0, scale: 1 }, blocks: [] } },
    };
  }

  const stores = { studio: demoStudio(), spark: demoSpark() };
  let projectId = query.get("project") === "spark" ? "spark" : "studio";
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
    return itemsOf(kind).find((row) => row.id === id) || { title: id, caption: KIND_LABEL()[kind] || kind };
  }

  function ensureCard(goalId) {
    const current = state();
    if (!current.cards[goalId]) current.cards[goalId] = { x: 72, y: 72 };
    return current.cards[goalId];
  }

  function ensureFrame(goalId) {
    const current = state();
    if (!current.frames[goalId]) current.frames[goalId] = { camera: { x: 0, y: 0, scale: 1 }, blocks: [] };
    return current.frames[goalId];
  }

  function clampScale(value) {
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(value * 100) / 100));
  }

  function activeCamera() {
    const current = state();
    return current.activeTab === CANVAS_TAB ? current.canvasCamera : ensureFrame(current.activeTab).camera;
  }

  function showToast(text) {
    toastText = text;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastText = "";
      const node = document.querySelector(".toast");
      if (node) node.remove();
    }, 2400);
    const host = $("container");
    if (!host) return;
    let node = host.querySelector(".toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      node.setAttribute("role", "status");
      host.appendChild(node);
    }
    node.textContent = text;
  }

  function rejectNonGoal(surface) {
    if (surface) {
      surface.classList.add("is-reject");
      window.setTimeout(() => surface.classList.remove("is-reject"), 420);
    }
    showToast(t("rejectCanvas"));
  }

  function selectGoal(goalId) {
    const current = state();
    current.selectedGoalId = goalId;
    current.activeTab = CANVAS_TAB;
    current.directory = "goals";
    current.plugin = "goals";
    current.expandedGoalId = "";
    ensureCard(goalId);
    if (window.matchMedia("(max-width: 600px)").matches) document.body.classList.add("is-collapsed");
    render();
  }

  function openWorkspace(goalId) {
    const current = state();
    current.selectedGoalId = goalId;
    current.activeTab = CANVAS_TAB;
    current.expandedGoalId = goalId;
    render();
  }

  function closeWorkspace() {
    state().expandedGoalId = "";
    render();
  }

  function expandFrame(goalId) {
    const current = state();
    ensureFrame(goalId);
    if (!current.openFrames.includes(goalId)) current.openFrames.push(goalId);
    current.activeTab = goalId;
    current.selectedGoalId = goalId;
    current.expandedGoalId = "";
    render();
  }

  function closeFrameTab(goalId) {
    const current = state();
    current.openFrames = current.openFrames.filter((id) => id !== goalId);
    if (current.activeTab === goalId) current.activeTab = CANVAS_TAB;
    render();
  }

  function placeBlock(kind, itemId, clientX, clientY) {
    const current = state();
    if (current.activeTab === CANVAS_TAB) {
      rejectNonGoal($("surface"));
      return;
    }
    const frame = ensureFrame(current.activeTab);
    const surface = $("container").querySelector(".frame-canvas");
    const rect = surface.getBoundingClientRect();
    const x = (clientX - rect.left - frame.camera.x) / frame.camera.scale - 40;
    const y = (clientY - rect.top - frame.camera.y) / frame.camera.scale - 24;
    frame.blocks.push({ id: nextId("b"), kind, itemId, x: Math.max(16, x), y: Math.max(16, y) });
    render();
  }

  function addBlockToCurrentFrame(kind, itemId) {
    const current = state();
    if (current.activeTab === CANVAS_TAB) {
      rejectNonGoal($("surface"));
      return;
    }
    const frame = ensureFrame(current.activeTab);
    const n = frame.blocks.length;
    frame.blocks.push({
      id: nextId("b"),
      kind,
      itemId,
      x: 48 + (n % 3) * 260,
      y: 48 + Math.floor(n / 3) * 140,
    });
    render();
  }

  function setZoom(next) {
    const camera = activeCamera();
    camera.scale = clampScale(next);
    render();
  }

  function fitCanvas() {
    const current = state();
    current.canvasCamera = { x: 8, y: 4, scale: 1 };
    render();
  }

  function applyChromeCopy() {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    document.title = locale === "en" ? "Molis Work · Goal canvas" : "Molis Work · Goal 画布";
    $("item-search").placeholder = t("search");
    $("btn-locale").textContent = t("localeBtn");
    $("toggle-sidebar").setAttribute("aria-label", document.body.classList.contains("is-collapsed") ? t("openDir") : t("collapse"));
    $("btn-theme").setAttribute("aria-label", t("theme"));
    document.querySelectorAll("[data-copy]").forEach((node) => {
      node.textContent = t(node.dataset.copy);
    });
  }

  function renderStatus(goal) {
    const label = STATE_LABEL()[goal.state] || goal.state;
    const icon = STATUS_ICON[goal.state] || "i-clock";
    const klass = goal.state === "done" ? "completed" : goal.state;
    return `<span class="goal-status goal-status--${klass}" title="${esc(label)}"><svg><use href="#${icon}"></use></svg><span>${esc(label)}</span></span>`;
  }

  function renderDirectory() {
    const current = state();
    const currentProject = project();
    $("project-emblem").textContent = currentProject.emblem;
    $("project-name").textContent = currentProject.name;
    $("dir-heading").hidden = current.directory === "root";
    $("root-dir").hidden = current.directory !== "root";
    $("item-dir").hidden = current.directory === "root";
    $("plugin-strip").innerHTML = currentProject.plugins.map((id) => {
      const labels = { goals: "Goals", sessions: "Sessions", feed: "Feed", artifacts: "Artifacts" };
      return `<button type="button" data-plugin="${id}" ${current.plugin === id ? "aria-current='true'" : ""}>${labels[id]}</button>`;
    }).join("");

    const captions = { home: currentProject.name, goals: t("goalsCap"), sessions: t("sessionsCap"), feed: t("feedCap"), artifacts: t("artifactsCap") };
    const modules = [
      ["home", "i-home", t("home"), captions.home],
      ["goals", "i-target", "Goals", captions.goals],
      ...(currentProject.plugins.includes("sessions") ? [["sessions", "i-terminal", "Sessions", captions.sessions]] : []),
      ...(currentProject.plugins.includes("feed") ? [["feed", "i-feed", "Feed", captions.feed]] : []),
      ...(currentProject.plugins.includes("artifacts") ? [["artifacts", "i-file", "Artifacts", captions.artifacts]] : []),
    ];
    $("root-dir").innerHTML = `${modules.map(([id, icon, title, caption]) => `
      <button class="module-row" type="button" data-root="${id}">
        <svg><use href="#${icon}"></use></svg>
        <span><strong>${esc(title)}</strong><small>${esc(caption)}</small></span>
        ${id === "home" ? "" : '<svg class="chevron"><use href="#i-chevron"></use></svg>'}
      </button>`).join("")}
      <button class="market-row" type="button" disabled>
        <svg><use href="#i-store"></use></svg>
        <span>${esc(t("market"))}</span>
      </button>`;

    if (current.directory === "root") return;
    const key = PLUGIN_KEY[current.directory] || current.directory;
    const kind = ITEM_KIND[key];
    const q = current.query.trim().toLowerCase();
    const rows = (currentProject.items[key] || []).filter((row) => !q || `${row.title} ${row.caption}`.toLowerCase().includes(q));
    $("item-list").innerHTML = rows.map((row) => {
      const two = kind !== "goal" ? "is-two-line" : "";
      const selected = kind === "goal" && current.selectedGoalId === row.id ? "is-selected" : "";
      const status = row.state ? `<span class="state ${row.state}">${STATE_LABEL()[row.state] || row.state}</span>` : "";
      return `<button class="item-row ${two} ${selected}" type="button" draggable="true" data-kind="${kind}" data-id="${row.id}">
        <span class="copy"><strong>${esc(row.title)}</strong>${kind === "goal" ? "" : `<small>${esc(row.caption)}</small>`}</span>
        ${status}
      </button>`;
    }).join("") || `<p class="dir-empty">${esc(t("dirEmpty"))}</p>`;
  }

  function renderTabs() {
    const current = state();
    const canvasCurrent = current.activeTab === CANVAS_TAB ? "aria-current='true'" : "";
    const frames = current.openFrames.map((goalId) => {
      const title = meta("goal", goalId).title;
      const selected = current.activeTab === goalId ? "aria-current='true'" : "";
      return `<button class="tab" type="button" data-tab="${goalId}" ${selected}>
        <span>${esc(title)}</span>
        <span class="close" data-close="${goalId}" aria-label="${esc(t("closeTab"))}"><svg><use href="#i-close"></use></svg></span>
      </button>`;
    }).join("");
    $("tabstrip").innerHTML = `
      <button class="tab is-pinned" type="button" data-tab="${CANVAS_TAB}" ${canvasCurrent}>
        <span>${esc(t("canvasTab"))}</span>
      </button>${frames}`;
  }

  function renderHud(hint) {
    const camera = activeCamera();
    return `<div class="hud">
      <p class="canvas-hint">${esc(hint)}</p>
      <div class="zoom-tools">
        <button type="button" data-zoom="out" aria-label="-"><svg><use href="#i-minus"></use></svg></button>
        <output>${Math.round(camera.scale * 100)}%</output>
        <button type="button" data-zoom="in" aria-label="+"><svg><use href="#i-plus"></use></svg></button>
      </div>
    </div>`;
  }

  function edgePath(from, to) {
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  }

  function renderWorkspace(goal) {
    const current = state();
    return `<section class="goal-node-workspace" data-goal-node-workspace aria-label="${esc(t("workspace"))}" data-details-open="${current.detailsOpen ? "true" : "false"}">
      <header class="goal-node-toolbar">
        <div class="goal-node-heading"><h1>${esc(goal.title)}</h1></div>
        <div class="goal-node-actions">
          <button type="button" data-goal-details-toggle aria-expanded="${current.detailsOpen}" aria-label="${esc(t("details"))}" title="${esc(t("details"))}"><svg><use href="#i-panel"></use></svg></button>
          <button type="button" data-goal-collapse aria-label="${esc(t("collapseGoal"))}" title="${esc(t("collapseGoal"))}"><svg><use href="#i-close"></use></svg></button>
        </div>
      </header>
      <div class="goal-node-workbench">
        <section class="goal-work-main">
          <div class="goal-work-modebar">
            <div role="tablist" aria-label="${esc(t("terminal"))}">
              <button type="button" role="tab" aria-selected="false" aria-disabled="true" disabled title="${esc(t("conversationSoon"))}"><svg><use href="#i-message"></use></svg><span>${esc(t("conversation"))}</span></button>
              <button type="button" role="tab" aria-selected="true"><svg><use href="#i-terminal"></use></svg><span>${esc(t("terminal"))}</span></button>
            </div>
          </div>
          <div class="tui-pane">
            <div class="tui-empty">
              <span class="tui-empty-mark" aria-hidden="true"><svg><use href="#i-terminal"></use></svg></span>
              <p><strong>${esc(t("noTerminal"))}</strong></p>
              <p>${esc(t("noTerminalHint"))}</p>
            </div>
          </div>
        </section>
        <section class="document-pane" aria-label="${esc(t("goalInfo"))}">
          <aside class="goal-workspace-hero">
            <details class="goal-info-popover" open>
              <summary><span class="goal-info-label">${esc(t("goalInfo"))}</span>${renderStatus(goal)}<svg><use href="#i-down"></use></svg></summary>
              <div class="goal-info-body">
                <h1>${esc(goal.title)}</h1>
                <p class="goal-info-outcome">${esc(goal.caption)}</p>
                <div class="goal-info-status"><p>${esc(t("timelineEmpty"))}</p></div>
              </div>
            </details>
          </aside>
          <section class="timeline-pane">
            <div class="stream-toolbar">
              <h2>${esc(t("timeline"))} <span>0</span></h2>
              <span class="timeline-compose"><svg><use href="#i-plus"></use></svg><span>${esc(t("record"))}</span></span>
            </div>
            <p class="timeline-empty">${esc(t("timelineEmpty"))}</p>
            <div class="timeline-footer">${esc(t("latestFirst"))}</div>
          </section>
        </section>
      </div>
    </section>`;
  }

  function renderGoalCanvas() {
    const current = state();
    const cam = current.canvasCamera;
    const goals = project().items.goals;
    const expanded = current.expandedGoalId;
    const nodes = goals.map((goal) => {
      const card = ensureCard(goal.id);
      const selected = current.selectedGoalId === goal.id ? "is-selected" : "";
      const complete = goal.state === "done" ? "is-complete" : "";
      const hidden = expanded === goal.id ? "is-expanded-node" : "";
      const parent = goal.parent ? meta("goal", goal.parent) : null;
      const belongs = parent ? `<small>${esc(t("belongs", { title: parent.title }))}</small>` : "";
      return `<article tabindex="0" role="group" class="goal-canvas-node ${selected} ${complete} ${hidden}" data-goal="${goal.id}" data-graph-node style="transform:translate(${card.x}px,${card.y}px)" aria-label="${esc(goal.title)}">
        ${renderStatus(goal)}
        <button class="goal-canvas-frame" type="button" data-frame="${goal.id}" aria-label="${esc(t("openFrame"))}" title="${esc(t("openFrame"))}"><svg><use href="#i-frame"></use></svg></button>
        <button class="goal-canvas-open" type="button" data-graph-open="${goal.id}" aria-label="${esc(t("openGoal"))}：${esc(goal.title)}" title="${esc(t("openGoal"))}"><svg><use href="#i-maximize"></use></svg></button>
        <strong>${esc(goal.title)}</strong>
        <span class="goal-canvas-node-outcome">${esc(goal.caption)}</span>
        ${belongs}
      </article>`;
    }).join("");
    const edges = (project().edges || []).map((edge) => {
      const from = ensureCard(edge.from);
      const to = ensureCard(edge.to);
      const selected = current.selectedGoalId === edge.from || current.selectedGoalId === edge.to ? "is-selected-path" : "";
      const fromTitle = meta("goal", edge.from).title;
      const toTitle = meta("goal", edge.to).title;
      return `<g class="${selected}" data-edge-from="${edge.from}" data-edge-to="${edge.to}"><path d="${edgePath(from, to)}" marker-end="url(#momentum-arrow)"></path><title>${esc(`${fromTitle} → ${toTitle}`)}</title></g>`;
    }).join("");
    const workspaceGoal = expanded ? goals.find((goal) => goal.id === expanded) : null;
    return `<div class="goal-canvas-shell" data-expanded="${expanded ? "true" : "false"}">
      <section class="goal-canvas-map">
        <header class="goal-canvas-map-heading"><h1>${esc(t("mapTitle"))}</h1><p>${esc(t("mapSub", { count: String(goals.length) }))}</p></header>
        <div class="goal-canvas-viewport" id="surface">
          <div class="world" style="transform:translate(${cam.x}px,${cam.y}px) scale(${cam.scale})">
            <svg class="goal-canvas-edges" aria-hidden="true"><defs><marker id="momentum-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>${edges}</svg>
            ${nodes}
          </div>
        </div>
        <footer class="goal-canvas-tools">
          <span>${esc(t("hintCanvas"))}</span>
          <div role="group" aria-label="${esc(t("zoomFit"))}">
            <button type="button" data-zoom="out" aria-label="${esc(t("zoomOut"))}">−</button>
            <output data-graph-zoom-value>${Math.round(cam.scale * 100)}%</output>
            <button type="button" data-zoom="in" aria-label="${esc(t("zoomIn"))}">+</button>
            <button type="button" data-zoom="fit" aria-label="${esc(t("zoomFit"))}"><svg><use href="#i-maximize"></use></svg></button>
          </div>
        </footer>
      </section>
      ${workspaceGoal ? renderWorkspace(workspaceGoal) : ""}
    </div>`;
  }

  function renderFrame() {
    const current = state();
    const goalId = current.activeTab;
    const frame = ensureFrame(goalId);
    const cam = frame.camera;
    const blocks = frame.blocks.map((block) => {
      const row = meta(block.kind, block.itemId);
      return `<article class="block" data-block="${block.id}" data-kind="${block.kind}" style="left:${block.x}px;top:${block.y}px">
        <p>${esc(row.caption)}</p>
        <strong>${esc(row.title)}</strong>
        <span class="kind">${esc(KIND_LABEL()[block.kind])}</span>
      </article>`;
    }).join("");
    const empty = frame.blocks.length ? "" : `<p class="canvas-invite">${esc(t("emptyFrame"))}<small>${esc(t("emptyFrameSub", { title: meta("goal", goalId).title }))}</small></p>`;
    return `<div class="frame-canvas" id="surface">${empty}
      <div class="world" style="transform:translate(${cam.x}px,${cam.y}px) scale(${cam.scale})">${blocks}</div>
      ${renderHud(t("hintFrame"))}
    </div>`;
  }

  function renderStage() {
    const current = state();
    $("container").innerHTML = current.activeTab === CANVAS_TAB ? renderGoalCanvas() : renderFrame();
    if (toastText) {
      const node = document.createElement("div");
      node.className = "toast";
      node.setAttribute("role", "status");
      node.textContent = toastText;
      $("container").appendChild(node);
    }
  }

  function render() {
    applyChromeCopy();
    renderDirectory();
    renderTabs();
    renderStage();
    bindStage();
  }

  function bindPan(surface, camera) {
    let pan = null;
    surface.addEventListener("pointerdown", (event) => {
      if (state().expandedGoalId) return;
      if (event.target.closest(".goal-canvas-node, .block, .goal-node-workspace, form, input, button, .hud, .goal-canvas-tools")) return;
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
    surface.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const next = camera.scale + (event.deltaY > 0 ? -0.08 : 0.08);
      camera.scale = clampScale(next);
      const world = surface.querySelector(".world");
      const output = surface.querySelector("output");
      if (world) world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
      if (output) output.textContent = `${Math.round(camera.scale * 100)}%`;
    }, { passive: false });
  }

  function bindMove(node, pos, placement) {
    node.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button") || state().expandedGoalId) return;
      event.stopPropagation();
      const origin = { x: pos.x, y: pos.y };
      const start = { x: event.clientX - pos.x, y: event.clientY - pos.y };
      node.setPointerCapture(event.pointerId);
      const move = (ev) => {
        pos.x = ev.clientX - start.x;
        pos.y = ev.clientY - start.y;
        if (placement === "left") {
          node.style.left = `${pos.x}px`;
          node.style.top = `${pos.y}px`;
        } else {
          node.style.transform = `translate(${pos.x}px,${pos.y}px)`;
        }
      };
      const up = () => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        if (placement !== "left" && (Math.abs(pos.x - origin.x) > 2 || Math.abs(pos.y - origin.y) > 2)) render();
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
    });
  }

  function bindStage() {
    const current = state();
    const surface = $("surface");
    if (!surface) return;
    const camera = current.activeTab === CANVAS_TAB ? current.canvasCamera : ensureFrame(current.activeTab).camera;
    bindPan(surface, camera);

    surface.querySelectorAll(".goal-canvas-node").forEach((node) => {
      const card = ensureCard(node.dataset.goal);
      bindMove(node, card);
      node.addEventListener("click", () => {
        current.selectedGoalId = node.dataset.goal;
        document.querySelectorAll(".goal-canvas-node").forEach((el) => el.classList.toggle("is-selected", el === node));
        document.querySelectorAll(".item-row").forEach((el) => el.classList.toggle("is-selected", el.dataset.id === node.dataset.goal));
      });
      node.addEventListener("dblclick", (event) => {
        if (event.target.closest("button")) return;
        openWorkspace(node.dataset.goal);
      });
    });
    surface.querySelectorAll(".block").forEach((node) => {
      const frame = ensureFrame(current.activeTab);
      const block = frame.blocks.find((row) => row.id === node.dataset.block);
      if (block) bindMove(node, block, "left");
    });

    surface.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = current.activeTab === CANVAS_TAB ? "none" : "copy";
      if (current.activeTab !== CANVAS_TAB) surface.classList.add("is-drop");
    });
    surface.addEventListener("dragleave", (event) => {
      if (!surface.contains(event.relatedTarget)) surface.classList.remove("is-drop");
    });
    surface.addEventListener("drop", (event) => {
      event.preventDefault();
      surface.classList.remove("is-drop");
      const raw = event.dataTransfer.getData("text/mw-item");
      if (!raw) return;
      const item = JSON.parse(raw);
      if (current.activeTab === CANVAS_TAB) {
        if (item.kind === "goal") selectGoal(item.id);
        else rejectNonGoal(surface);
        return;
      }
      if (item.kind === "goal") {
        showToast(t("rejectGoal"));
        return;
      }
      placeBlock(item.kind, item.id, event.clientX, event.clientY);
    });
  }

  function setCollapsed(collapsed) {
    document.body.classList.toggle("is-collapsed", collapsed);
    const wide = window.matchMedia("(min-width: 601px)").matches;
    $("drawer-scrim").hidden = collapsed || wide;
    $("reveal-dir").hidden = !collapsed;
    applyChromeCopy();
  }

  $("toggle-sidebar").addEventListener("click", () => {
    setCollapsed(!document.body.classList.contains("is-collapsed"));
  });
  $("reveal-dir").addEventListener("click", () => setCollapsed(false));
  $("drawer-scrim").addEventListener("click", () => setCollapsed(true));
  $("project-trigger").addEventListener("click", () => {
    const menu = $("project-menu");
    const open = menu.hidden;
    menu.hidden = !open;
    $("project-trigger").setAttribute("aria-expanded", String(open));
    if (open) {
      menu.innerHTML = Object.entries(catalog).map(([id, row]) => `
        <button type="button" data-project="${id}" ${id === projectId ? "aria-current='true'" : ""}>
          <span class="emblem">${row.emblem}</span>
          <span><strong>${esc(row.name)}</strong><small>${esc(id === "studio" ? t("currentProject") : t("otherProject"))}</small></span>
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
    state().query = "";
    $("item-search").value = "";
    render();
  });
  $("root-dir").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-root]");
    if (!btn) return;
    if (btn.dataset.root === "home") {
      state().activeTab = CANVAS_TAB;
      state().directory = "root";
      state().expandedGoalId = "";
      render();
      return;
    }
    state().directory = btn.dataset.root;
    state().plugin = btn.dataset.root;
    state().query = "";
    $("item-search").value = "";
    render();
  });
  $("item-search").addEventListener("input", (event) => {
    state().query = event.target.value;
    renderDirectory();
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
    event.dataTransfer.setData("text/mw-item", JSON.stringify({ kind: btn.dataset.kind, id: btn.dataset.id }));
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
    if (tab.dataset.tab === CANVAS_TAB) {
      /* keep workspace only if still on canvas */
    } else {
      state().expandedGoalId = "";
    }
    render();
  });
  $("container").addEventListener("click", (event) => {
    const zoom = event.target.closest("[data-zoom]");
    if (zoom) {
      if (zoom.dataset.zoom === "fit") fitCanvas();
      else setZoom(activeCamera().scale + (zoom.dataset.zoom === "in" ? 0.1 : -0.1));
      return;
    }
    const open = event.target.closest("[data-graph-open]");
    if (open) {
      openWorkspace(open.dataset.graphOpen);
      return;
    }
    const frame = event.target.closest("[data-frame]");
    if (frame) {
      expandFrame(frame.dataset.frame);
      return;
    }
    const collapse = event.target.closest("[data-goal-collapse]");
    if (collapse) {
      closeWorkspace();
      return;
    }
    const details = event.target.closest("[data-goal-details-toggle]");
    if (details) {
      state().detailsOpen = !state().detailsOpen;
      render();
    }
  });
  $("btn-theme").addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
  });
  $("btn-locale").addEventListener("click", () => {
    locale = locale === "zh" ? "en" : "zh";
    render();
  });
  if (query.get("dark")) document.documentElement.classList.add("dark");
  if (window.matchMedia("(max-width: 600px)").matches) setCollapsed(true);
  document.addEventListener("click", (event) => {
    if (event.target.closest("#project-trigger, #project-menu")) return;
    $("project-menu").hidden = true;
    $("project-trigger").setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state().expandedGoalId) {
        closeWorkspace();
        return;
      }
      $("project-menu").hidden = true;
      $("project-trigger").setAttribute("aria-expanded", "false");
      if (window.matchMedia("(max-width: 600px)").matches) setCollapsed(true);
    }
  });

  render();
})();
