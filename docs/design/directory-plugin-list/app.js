const plugins = {
  home: { label: "项目首页", tabs: [{ id: "home", label: "项目首页", pinned: true }] },
  goals: {
    label: "Goals",
    tabs: [
      { id: "canvas", label: "Goal 画布", pinned: true },
      { id: "core", label: "让每项工作都有可信的完成依据", close: true },
    ],
    search: "搜索目标",
  },
  sessions: {
    label: "Sessions",
    tabs: [{ id: "session-1", label: "核对 Frame 引用卡片", close: true }],
    search: "搜索会话",
    kind: "session",
  },
  inbox: {
    label: "Inbox",
    tabs: [{ id: "inbox-1", label: "核对 Frame 的 Feed 条目", close: true }],
    kind: "inbox",
  },
  feed: {
    label: "Feed",
    tabs: [{ id: "feed-1", label: "核对 Frame 的 Feed 条目", close: true }],
    search: "搜索",
    views: ["Feed", "来源"],
    kind: "feed",
  },
  artifacts: {
    label: "Artifacts",
    tabs: [{ id: "art-1", label: "frame-note", close: true }],
    kind: "artifact",
  },
};

const goals = [
  { id: "facts", title: "让项目事实成为不同 Runtime 的共同底座", outcome: "不同对话读到同一份项目进度。", status: "等待中", state: "waiting", x: 36, y: 88 },
  { id: "core", title: "让每项工作都有可信的完成依据", outcome: "完成依据留在 Goal 上，而不是聊天记录里。", status: "已完成", state: "done", x: 340, y: 88 },
  { id: "bench", title: "让人能在同一工作台看清并推进 Goal", outcome: "目录、画布和 Frame 共用一份关系。", status: "可继续", state: "continue", x: 644, y: 88 },
  { id: "first", title: "让第一次接入从安装走到真实推进", outcome: "安装后知道下一步怎么开始。", status: "等待中", state: "waiting", parent: "让第一次使用的人顺利完成一轮目标协作", x: 36, y: 330 },
];
const edges = [
  { from: "facts", to: "core" },
  { from: "core", to: "bench" },
];
const canvasOf = {
  root: "facts", facts: "facts", same: "facts",
  core: "core",
  bench: "bench", graph: "bench", station: "bench",
  first: "first", install: "first",
};

const lists = {
  home: [],
  goals: [
    { id: "root", title: "让第一次使用的人顺利完成一轮目标协作", status: "等待中", branch: true, open: true },
    { id: "facts", title: "让项目事实成为不同 Runtime 的共同底座", status: "等待中", child: true, branch: true, open: true },
    { id: "same", title: "让不同 AI 对话看到同一项目进度", status: "等待中", grandchild: true },
    { id: "core", title: "让每项工作都有可信的完成依据", status: "已完成", child: true, done: true },
    { id: "bench", title: "让人能在同一工作台看清并推进 Goal", status: "可继续", child: true, branch: true, open: true, continue: true },
    { id: "graph", title: "让复杂 Goal 关系仍然一眼可读", status: "等待中", grandchild: true },
    { id: "station", title: "把 Molis Work 作为不切窗口的主工作站", status: "等待中", grandchild: true },
    { id: "first", title: "让第一次接入从安装走到真实推进", status: "等待中", child: true, branch: true, open: true },
    { id: "install", title: "让新用户安装后知道下一步怎么开始", status: "等待中", grandchild: true },
  ],
  sessions: [
    { id: "session-1", title: "核对 Frame 引用卡片", meta: "Codex", kind: "session", caption: "本机 Codex · 今天 16:20" },
    { id: "session-2", title: "安装后第一次打开", meta: "Claude Code", kind: "session", caption: "本机 Claude Code · 昨天" },
  ],
  inbox: [
    { id: "inbox-1", title: "核对 Frame 的 Feed 条目", meta: "你手工加入", kind: "inbox", caption: "原消息还在 Feed，这里只处理需要介入的一步。" },
    { id: "inbox-2", title: "来源授权即将过期", meta: "需要重新连接", kind: "inbox", caption: "GitHub 连接需要重新授权，否则同步会停。" },
  ],
  feed: [
    { id: "feed-1", title: "核对 Frame 的 Feed 条目", meta: "产品观察", kind: "feed", caption: "只验证引用，不打开整页。" },
    { id: "feed-2", title: "终端与目标信息应当如何配合", meta: "产品观察", kind: "feed", caption: "切换工作台时保留上下文。" },
    { id: "feed-3", title: "从首次使用观察中找到下一步", meta: "产品观察", kind: "feed", caption: "完整保留来源和正文。" },
  ],
  artifacts: [
    { id: "art-1", title: "frame-note", meta: "v1", kind: "artifact", caption: "example.note · 精确版本" },
    { id: "art-2", title: "Product launch checklist", meta: "v1", kind: "artifact", caption: "来自 Feed 规则捕捉的交付物。" },
  ],
};

const details = {
  "session-1": {
    kind: "会话",
    facts: [
      ["Runtime", "Codex"],
      ["当前 Goal", "让每项工作都有可信的完成依据"],
      ["下一步", "核对引用卡能否拖进 Frame，而不打开整页。"],
    ],
    events: [
      ["用户", "把会话拖进这个 Goal 的 Frame，只留引用。"],
      ["Runtime", "终端仍在 Goal 工作框里，Frame 不嵌 PTY。"],
    ],
    note: "终端仍在 Goal 工作框里。这里只读执行记录。",
  },
  "session-2": {
    kind: "会话",
    facts: [
      ["Runtime", "Claude Code"],
      ["当前 Goal", "让第一次接入从安装走到真实推进"],
      ["下一步", "打开后仍知道下一步。"],
    ],
    events: [["用户", "安装后第一次打开工作台。"]],
    note: "终端仍在 Goal 工作框里。这里只读执行记录。",
  },
  "inbox-1": {
    kind: "Inbox",
    facts: [
      ["为什么进入 Inbox", "你手工加入"],
      ["关联对象", "Feed · 核对 Frame 的 Feed 条目"],
      ["下一步", "查看原消息并处理。"],
      ["当前状态", "待处理"],
    ],
  },
  "inbox-2": {
    kind: "Inbox",
    facts: [
      ["为什么进入 Inbox", "连接即将过期"],
      ["关联对象", "GitHub 来源"],
      ["下一步", "重新授权，否则同步会停。"],
      ["当前状态", "待处理"],
    ],
  },
  "feed-1": {
    kind: "Feed",
    source: "产品观察 · 9月15日",
    body: "只验证引用，不打开整页。卡片展开后读这一段正文，主区仍停在 Goal Frame。",
  },
  "feed-2": {
    kind: "Feed",
    source: "产品观察 · 已读",
    body: "切换工作台时保留上下文，让记录留在正确的目标里。",
  },
  "feed-3": {
    kind: "Feed",
    source: "产品观察 · 未读",
    body: "完整保留消息来源和正文，再决定如何推进。",
  },
  "art-1": {
    kind: "交付物",
    facts: [
      ["类型", "example.note"],
      ["版本", "v1"],
      ["事实", "Frame 里只读事实，不导出、不丢原始 JSON。"],
    ],
  },
  "art-2": {
    kind: "交付物",
    facts: [
      ["类型", "io.molis.work.feed.capture"],
      ["版本", "v1"],
      ["事实", "规则捕捉后的清单版本。"],
    ],
  },
};

const marketPlugins = [
  { id: "goals", icon: "i-goals", label: "Goals", copy: "确定目标，推进工作，留下结果。" },
  { id: "sessions", icon: "i-sessions", label: "Sessions", copy: "回到你的会话，继续正在做的事。" },
  { id: "inbox", icon: "i-inbox", label: "Inbox", copy: "只看需要你介入的事项。" },
  { id: "feed", icon: "i-feed", label: "Feed", copy: "查看来源消息和完整流水。" },
  { id: "artifacts", icon: "i-file", label: "Artifacts", copy: "打开项目成果，查看保留下来的版本。" },
];

const destinations = document.getElementById("destinations");
const listTitle = document.getElementById("list-title");
const listTools = document.getElementById("list-tools");
const listBody = document.getElementById("list-body");
const panes = document.getElementById("panes");
const groupA = document.querySelector('[data-group="a"]');
const groupB = document.querySelector('[data-group="b"]');
const layoutBtn = document.getElementById("layout-btn");
const layoutMenu = document.getElementById("layout-menu");
const picker = document.getElementById("plugin-picker");
const lastItem = { goals: "core", sessions: "session-1", inbox: "inbox-1", feed: "feed-1", artifacts: "art-1" };
const groups = {
  a: { plugin: "goals", tab: "core" },
  b: { plugin: null, tab: null },
};
const canvasCamera = { x: 12, y: 8, scale: 1 };
const frames = {
  core: {
    camera: { x: 0, y: 0, scale: 1 },
    blocks: [
      { id: "b-s1", kind: "session", itemId: "session-1", x: 48, y: 52 },
      { id: "b-f1", kind: "feed", itemId: "feed-1", x: 320, y: 52 },
      { id: "b-i1", kind: "inbox", itemId: "inbox-1", x: 48, y: 220 },
      { id: "b-a1", kind: "artifact", itemId: "art-1", x: 320, y: 220 },
    ],
    expanded: "",
  },
};
let focus = "a";
let layout = "single";
let pickerGroup = null;
let viewingMarket = false;
let expandedGoal = "";
let detailsOpen = true;
let homeMonth = new Date(2026, 8, 1);
let toastTimer = 0;
let lastListPlugin = "";
const lastPaneKey = { a: "", b: "" };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const kindLabel = { session: "会话", feed: "Feed", inbox: "Inbox", artifact: "交付物" };
const statusIcon = { done: "i-check", continue: "i-ready", waiting: "i-clock" };

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function icon(id) {
  return `<svg><use href="#${id}"></use></svg>`;
}
function itemOf(id) {
  return [...lists.sessions, ...lists.inbox, ...lists.feed, ...lists.artifacts].find((row) => row.id === id);
}
function ensureFrame(goalId) {
  if (!frames[goalId]) frames[goalId] = { camera: { x: 0, y: 0, scale: 1 }, blocks: [], expanded: "" };
  return frames[goalId];
}
function currentPlugin() {
  return viewingMarket ? "market" : groups[focus].plugin;
}
function defaultTab(pluginId) {
  if (pluginId === "home") return "home";
  const spec = plugins[pluginId];
  return spec.tabs.find((tab) => tab.id === lastItem[pluginId])?.id || spec.tabs[0].id;
}
function clampScale(value) {
  return Math.min(1.6, Math.max(0.4, value));
}
function playEnter(node) {
  if (!node || reduced) return;
  node.classList.remove("is-enter");
  void node.offsetWidth;
  node.classList.add("is-enter");
}
function showToast(text) {
  window.clearTimeout(toastTimer);
  const host = document.querySelector(".group.is-focus .pane") || document.querySelector("[data-pane]");
  if (!host) return;
  let node = host.querySelector(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    node.setAttribute("role", "status");
    host.append(node);
  }
  node.textContent = text;
  toastTimer = window.setTimeout(() => node.remove(), 2200);
}

function closePicker() {
  picker.hidden = true;
  pickerGroup = null;
  document.querySelectorAll(".tab-add").forEach((btn) => btn.setAttribute("aria-expanded", "false"));
}
function openPicker(anchor, groupId) {
  const open = pickerGroup === groupId && !picker.hidden;
  closePicker();
  if (open) return;
  pickerGroup = groupId;
  picker.hidden = false;
  anchor.setAttribute("aria-expanded", "true");
  const rect = anchor.getBoundingClientRect();
  const width = Math.max(176, picker.offsetWidth);
  picker.style.top = `${rect.bottom + 4}px`;
  picker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
}
function renderPicker() {
  picker.replaceChildren();
  destinations.querySelectorAll("[data-plugin]").forEach((src) => {
    if (src.dataset.plugin === "market") return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    btn.dataset.plugin = src.dataset.plugin;
    btn.innerHTML = src.innerHTML;
    picker.append(btn);
  });
}

function renderList() {
  const pluginId = currentPlugin();
  const spec = pluginId && pluginId !== "market" ? plugins[pluginId] : null;
  listTitle.textContent = pluginId === "market" ? "插件市场" : spec ? spec.label : "空格子";
  listTools.replaceChildren();
  listBody.replaceChildren();
  if (!spec) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = pluginId === "market" ? "把需要的工作方式添加到项目。" : "这一格还空着。用 + 选择要打开的插件。";
    listBody.append(empty);
    if (pluginId !== lastListPlugin) playEnter(listBody);
    lastListPlugin = pluginId;
    return;
  }
  if (spec.search) {
    const row = document.createElement("div");
    row.className = "list-tools-row";
    row.innerHTML = `<div class="search-wrap">${icon("i-search")}<input class="search" type="search" placeholder="${spec.search}" aria-label="${spec.search}"></div><button class="tool-btn" type="button" aria-label="筛选">${icon("i-filter")}</button>`;
    listTools.append(row);
  }
  if (spec.views) {
    const views = document.createElement("div");
    views.className = "subviews";
    spec.views.forEach((name, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = name;
      if (i === 0) btn.setAttribute("aria-current", "true");
      views.append(btn);
    });
    listTools.append(views);
  }
  const rows = lists[pluginId];
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "首页没有条目。点上面的插件开始工作。";
    listBody.append(empty);
  } else {
    rows.forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "row";
      if (item.child) row.classList.add("is-child");
      if (item.grandchild) row.classList.add("is-grandchild");
      if (item.open) row.classList.add("is-open");
      if (item.kind) row.classList.add("is-two-line");
      if (item.id === lastItem[pluginId]) row.setAttribute("aria-current", "true");
      const twist = item.branch ? `<svg class="twist"><use href="#i-tree"></use></svg>` : "";
      const statusClass = item.done ? "status is-done" : item.continue ? "status is-continue" : item.status ? "status is-wait" : "";
      const copy = item.kind
        ? `<span class="copy"><span class="title">${esc(item.title)}</span><small>${esc(item.caption || "")}</small></span>`
        : `<span class="title">${esc(item.title)}</span>`;
      row.innerHTML = `${twist}${copy}<span class="meta ${statusClass}">${esc(item.meta || item.status || "")}</span>`;
      if (item.kind) {
        row.draggable = true;
        row.addEventListener("dragstart", (event) => {
          row.classList.add("is-dragging");
          event.dataTransfer.setData("text/molis-item", JSON.stringify({ kind: item.kind, id: item.id }));
          event.dataTransfer.effectAllowed = "copy";
        });
        row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
      }
      row.addEventListener("click", () => {
        lastItem[pluginId] = item.id;
        const group = groups[focus];
        if (pluginId === "goals") {
          const hasFrame = plugins.goals.tabs.some((tab) => tab.id === item.id && tab.id !== "canvas");
          group.tab = hasFrame ? item.id : "canvas";
          if (!hasFrame) expandedGoal = "";
        } else {
          group.tab = item.id;
        }
        renderList();
        renderGroup(focus);
      });
      listBody.append(row);
    });
  }
  if (pluginId !== lastListPlugin) playEnter(listBody);
  lastListPlugin = pluginId;
}

function factMap(detail) {
  return Object.fromEntries(detail.facts || []);
}

function clipText(id) {
  const item = itemOf(id);
  const detail = details[id] || {};
  if (detail.body) return detail.body;
  if (detail.events?.length) return detail.events[detail.events.length - 1][1];
  const facts = factMap(detail);
  if (detail.kind === "Inbox") return [facts["为什么进入 Inbox"], facts["下一步"]].filter(Boolean).join("。");
  if (detail.kind === "交付物") return [facts["类型"], facts["事实"]].filter(Boolean).join(" · ");
  return item?.caption || "";
}

function readingMarkup(id, { heading = true } = {}) {
  const item = itemOf(id);
  const detail = details[id] || {};
  const title = item?.title || id;
  const head = heading ? `<h2>${esc(title)}</h2>` : "";
  if (detail.body) {
    return `<div class="frame-reading">${head}<p class="frame-reading-meta">${esc(detail.source || "")}</p><p>${esc(detail.body)}</p></div>`;
  }
  const facts = factMap(detail);
  if (detail.kind === "Inbox") {
    const why = facts["为什么进入 Inbox"] ? `${esc(facts["为什么进入 Inbox"])}。` : "";
    const relation = facts["关联对象"] ? `这件事关联 ${esc(facts["关联对象"])}。` : "";
    const next = facts["下一步"] ? `下一步：${esc(facts["下一步"])}` : "";
    return `<div class="frame-reading" data-frame-reading="inbox">${head}<p>${why}${relation}${next}</p></div>`;
  }
  if (detail.kind === "交付物") {
    const line = [facts["类型"], facts["版本"]].filter(Boolean).join(" · ");
    return `<div class="frame-reading">${head}<p class="frame-reading-meta">${esc(line)}</p><p>${esc(facts["事实"] || "")}</p></div>`;
  }
  const events = (detail.events || []).map(([who, text]) => `<li><strong>${esc(who)}</strong><span>${esc(text)}</span></li>`).join("");
  const note = detail.note ? `<p class="frame-reading-meta">${esc(detail.note)}</p>` : "";
  const list = events ? `<ol class="frame-session-events">${events}</ol>` : "";
  return `<div class="frame-reading">${head}${note}${list}</div>`;
}

function renderHome(node) {
  const year = homeMonth.getFullYear();
  const month = homeMonth.getMonth();
  const first = new Date(year, month, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const day = i - start + 1;
    let label = day;
    let out = false;
    if (day < 1) { label = prevDays + day; out = true; }
    else if (day > days) { label = day - days; out = true; }
    const current = !out && year === 2026 && month === 8 && label === 15;
    cells.push(`<td class="${out ? "is-out" : ""}"${current ? ' aria-current="date"' : ""}><span>${label}</span></td>`);
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
  node.className = "pane";
  node.innerHTML = `<div class="pane-home">
    <section class="home-context">
      <div class="home-date-panel">
        <p class="home-date-year">2026年</p>
        <h1 class="home-today"><time datetime="2026-09-15">9月15日</time><span>星期二</span></h1>
      </div>
      <section class="home-calendar" aria-label="月历">
        <header><span>${year}年${month + 1}月</span><div class="home-month-actions">
          <button type="button" data-month="-1" aria-label="上个月">${icon("i-left")}</button>
          <button type="button" data-month="1" aria-label="下个月">${icon("i-tree")}</button>
        </div></header>
        <table><thead><tr>${["一","二","三","四","五","六","日"].map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>${weeks.join("")}</tbody></table>
      </section>
    </section>
    <section class="home-launch">
      <ul class="home-shortcuts"><li class="home-shortcut home-shortcut-add"><button type="button"><span class="home-shortcut-icon">${icon("i-plus")}</span><span>添加快捷方式</span></button></li></ul>
      <div class="home-composer">${icon("i-spark")}<input disabled placeholder="你想推进什么？" aria-label="Agent 尚未开放，暂不可输入"><button class="home-send" type="button" disabled aria-label="暂不可发送">${icon("i-arrow")}</button></div>
      <p class="home-agent-note">${icon("i-lock")}<span>Agent 尚未开放</span></p>
    </section>
  </div>`;
  node.querySelectorAll("[data-month]").forEach((btn) => {
    btn.addEventListener("click", () => {
      homeMonth = new Date(year, month + Number(btn.dataset.month), 1);
      renderHome(node);
    });
  });
}

function statusMarkup(goal) {
  const klass = goal.state === "done" ? "is-done" : goal.state === "continue" ? "is-continue" : "is-wait";
  return `<span class="goal-status ${klass}">${icon(statusIcon[goal.state] || "i-clock")}${esc(goal.status)}</span>`;
}

function zoomHud(camera, hint) {
  return `<footer class="goal-canvas-tools">
    <span>${esc(hint)}</span>
    <div role="group" aria-label="缩放">
      <button type="button" data-zoom="out" aria-label="缩小">${icon("i-minus")}</button>
      <output data-zoom-value>${Math.round(camera.scale * 100)}%</output>
      <button type="button" data-zoom="in" aria-label="放大">${icon("i-plus")}</button>
      <button type="button" data-zoom="fit" aria-label="适应全部">${icon("i-maximize")}</button>
    </div>
  </footer>`;
}

function selectedCanvasId() {
  return canvasOf[lastItem.goals] || (lastItem.goals === "canvas" ? "core" : lastItem.goals);
}

function renderCanvas(node) {
  const selectedId = selectedCanvasId();
  node.className = "pane is-dots";
  const nodes = goals.map((goal) => {
    const on = selectedId === goal.id;
    const hidden = expandedGoal === goal.id ? "is-expanded-node" : "";
    const belongs = goal.parent ? `<small>属于：${esc(goal.parent)}</small>` : "";
    return `<article class="goal-canvas-node ${on ? "is-selected" : ""} ${goal.state === "done" ? "is-complete" : ""} ${hidden}" data-goal="${goal.id}" tabindex="0" style="transform:translate(${goal.x}px,${goal.y}px)">
      ${statusMarkup(goal)}
      <button class="goal-canvas-frame" type="button" data-open-frame="${goal.id}" aria-label="打开 Frame">${icon("i-frame")}</button>
      <button class="goal-canvas-open" type="button" data-open-goal="${goal.id}" aria-label="打开 Goal">${icon("i-maximize")}</button>
      <strong>${esc(goal.title)}</strong>
      <span class="goal-canvas-node-outcome">${esc(goal.outcome)}</span>
      ${belongs}
    </article>`;
  }).join("");
  const edgeSvg = edges.map((edge) => {
    const from = goals.find((g) => g.id === edge.from);
    const to = goals.find((g) => g.id === edge.to);
    const x1 = from.x + 258;
    const y1 = from.y + 95;
    const x2 = to.x;
    const y2 = to.y + 95;
    const selected = selectedId === edge.from || selectedId === edge.to ? "is-selected-path" : "";
    return `<g class="${selected}"><path d="M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}" marker-end="url(#arrow)"></path></g>`;
  }).join("");
  const goal = goals.find((g) => g.id === expandedGoal);
  const workspace = goal ? `<section class="workspace" data-details-open="${detailsOpen}">
      <header>
        <h1>${esc(goal.title)}</h1>
        <div class="workspace-actions">
          <button type="button" data-toggle-details aria-label="Goal 信息">${icon("i-panel")}</button>
          <button type="button" data-close-workspace aria-label="收起 Goal">${icon("i-close")}</button>
        </div>
      </header>
      <div class="workspace-body">
        <div class="workspace-main">
          <div class="goal-work-modebar" role="tablist" aria-label="终端">
            <button type="button" disabled aria-selected="false">${icon("i-message")}<span>对话</span></button>
            <button type="button" aria-selected="true">${icon("i-sessions")}<span>终端</span></button>
          </div>
          <div class="tui-empty">
            <span class="tui-empty-mark">${icon("i-sessions")}</span>
            <strong>还没有终端</strong>
            <p>点右上角打开常用 Runtime。终端仍在这个工作框里，不嵌进 Frame 卡片。</p>
          </div>
        </div>
        <aside class="workspace-side">
          <details class="goal-info" ${detailsOpen ? "open" : ""}>
            <summary><span>Goal 信息</span>${statusMarkup(goal)}</summary>
            <p>${esc(goal.outcome)}</p>
          </details>
          <h2>时间线 <span>0</span></h2>
          <p>打开终端开始工作，或添加一条记录。</p>
        </aside>
      </div>
    </section>` : "";
  node.innerHTML = `<div class="goal-canvas" data-surface="canvas" data-expanded="${expandedGoal ? "true" : "false"}">
    <header class="goal-map-heading"><h1>目标关系</h1><p>${goals.length} 个目标 · 箭头从前置成果指向后续工作</p></header>
    <div class="world" style="transform:translate(${canvasCamera.x}px,${canvasCamera.y}px) scale(${canvasCamera.scale})">
      <svg class="goal-canvas-edges" aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>${edgeSvg}</svg>
      ${nodes}
    </div>
    ${zoomHud(canvasCamera, "单击看血缘 · 右上角打开工作框或 Frame")}
    ${workspace}
  </div>`;
}

function renderFrame(node, goalId) {
  const frame = ensureFrame(goalId);
  const goal = lists.goals.find((row) => row.id === goalId) || goals.find((g) => g.id === goalId);
  node.className = "pane is-dots";
  const blocks = frame.blocks.map((block) => {
    const item = itemOf(block.itemId);
    const expanded = frame.expanded === block.id ? " is-expanded" : "";
    const placed = block.fresh ? " is-placed" : "";
    return `<article class="block${expanded}${placed}" data-block="${block.id}" data-kind="${block.kind}" tabindex="0" style="left:${block.x}px;top:${block.y}px">
      <p>${esc(clipText(block.itemId))}</p>
      <div class="block-head">
        <strong>${esc(item?.title || block.itemId)}</strong>
        <button class="block-close" type="button" data-collapse-block aria-label="收起">${icon("i-close")}</button>
      </div>
      <span class="kind">${kindLabel[block.kind]}</span>
      <div class="block-body">${readingMarkup(block.itemId, { heading: false })}</div>
    </article>`;
  }).join("");
  const empty = frame.blocks.length ? "" : `<p class="canvas-invite">把会话、Feed、交付物放到这张画布上<small>这些内容只为完成「${esc(goal?.title || "这个 Goal")}」</small></p>`;
  node.innerHTML = `<div class="frame-canvas" data-surface="frame" data-goal="${goalId}">${empty}
    <div class="world" style="transform:translate(${frame.camera.x}px,${frame.camera.y}px) scale(${frame.camera.scale})">${blocks}</div>
    ${zoomHud(frame.camera, "从目录把会话、Feed、Inbox、交付物拖进来")}
  </div>`;
  frame.blocks.forEach((block) => { block.fresh = false; });
}

function renderPluginRead(node, id) {
  const item = itemOf(id);
  const detail = details[id] || {};
  node.className = "pane";
  node.innerHTML = `<article class="plugin-read">
    <h1>${esc(item?.title || id)}</h1>
    <p class="lede">${esc(detail.source || item?.caption || "")}</p>
    ${detail.body ? `<p>${esc(detail.body)}</p>` : readingMarkup(id, { heading: false })}
  </article>`;
}

function renderMarketPane(node) {
  node.className = "pane";
  node.innerHTML = `<div class="market">
    <header class="market-heading"><span>Molis Work</span><h1>插件市场</h1><p>把需要的工作方式添加到项目。</p></header>
    <div class="market-grid">${marketPlugins.map((plugin) => `<article>
      ${icon(plugin.icon)}<h2>${esc(plugin.label)}</h2><p>${esc(plugin.copy)}</p>
      <footer><span>内置</span><button type="button" disabled>已添加</button></footer>
    </article>`).join("")}</div>
    <p class="market-note">这里提供随 Molis Work 一起交付的内置插件。</p>
  </div>`;
}

function renderEmpty(node) {
  node.className = "pane is-dots";
  node.innerHTML = `<p class="canvas-invite">选择要打开的插件<small>点这一格的 +，把一套 Tab 放进来。</small></p>`;
}

function applyCamera(surface, camera) {
  const world = surface.querySelector(".world");
  if (world) world.style.transform = `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`;
  const output = surface.querySelector("[data-zoom-value]");
  if (output) output.textContent = `${Math.round(camera.scale * 100)}%`;
}

function bindPan(surface, camera) {
  let pan = null;
  surface.addEventListener("pointerdown", (event) => {
    if (expandedGoal) return;
    if (event.target.closest(".goal-canvas-node, .block, .workspace, button, .goal-canvas-tools")) return;
    pan = { x: event.clientX - camera.x, y: event.clientY - camera.y };
    surface.classList.add("is-panning");
    surface.setPointerCapture(event.pointerId);
  });
  surface.addEventListener("pointermove", (event) => {
    if (!pan) return;
    camera.x = event.clientX - pan.x;
    camera.y = event.clientY - pan.y;
    applyCamera(surface, camera);
  });
  surface.addEventListener("pointerup", () => {
    pan = null;
    surface.classList.remove("is-panning");
  });
  surface.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    camera.scale = clampScale(camera.scale + (event.deltaY > 0 ? -0.08 : 0.08));
    applyCamera(surface, camera);
  }, { passive: false });
  surface.querySelectorAll("[data-zoom]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (btn.dataset.zoom === "in") camera.scale = clampScale(camera.scale + 0.1);
      if (btn.dataset.zoom === "out") camera.scale = clampScale(camera.scale - 0.1);
      if (btn.dataset.zoom === "fit") {
        camera.x = surface.classList.contains("goal-canvas") ? 12 : 0;
        camera.y = surface.classList.contains("goal-canvas") ? 8 : 0;
        camera.scale = 1;
      }
      applyCamera(surface, camera);
    });
  });
}

function bindMove(el, pos, onClick) {
  el.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button") || expandedGoal) return;
    event.stopPropagation();
    const origin = { x: pos.x, y: pos.y };
    const start = { x: event.clientX, y: event.clientY };
    el.setPointerCapture(event.pointerId);
    const move = (ev) => {
      pos.x = origin.x + ev.clientX - start.x;
      pos.y = origin.y + ev.clientY - start.y;
      el.style.transform = `translate(${pos.x}px,${pos.y}px)`;
    };
    const up = (ev) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      if (Math.abs(ev.clientX - start.x) < 4 && Math.abs(ev.clientY - start.y) < 4) onClick?.();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
}

function bindFrameBlock(el, pos, state, onClick) {
  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button") || event.target.closest(".block-body")) return;
    event.stopPropagation();
    event.preventDefault();
    const origin = { x: pos.x, y: pos.y };
    const start = { x: event.clientX, y: event.clientY };
    const scale = state.camera.scale || 1;
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      pos.x = origin.x + dx / scale;
      pos.y = origin.y + dy / scale;
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (!moved) onClick?.();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    try { el.setPointerCapture(event.pointerId); } catch {}
  });
}

function openGoalFrame(goalId) {
  const spec = plugins.goals;
  const label = lists.goals.find((row) => row.id === goalId)?.title || goals.find((g) => g.id === goalId)?.title || goalId;
  if (!spec.tabs.some((tab) => tab.id === goalId)) spec.tabs.push({ id: goalId, label, close: true });
  viewingMarket = false;
  groups[focus].plugin = "goals";
  groups[focus].tab = goalId;
  lastItem.goals = goalId;
  expandedGoal = "";
  ensureFrame(goalId);
  setFocus(focus);
  renderGroups();
}

function placeBlock(kind, id, clientX, clientY, surface) {
  const group = groups[focus];
  if (group.plugin !== "goals" || group.tab === "canvas" || group.tab === "home") return;
  const frame = ensureFrame(group.tab);
  const rect = surface.getBoundingClientRect();
  const x = (clientX - rect.left - frame.camera.x) / frame.camera.scale - 120;
  const y = (clientY - rect.top - frame.camera.y) / frame.camera.scale - 24;
  const maxY = Math.max(24, (rect.height / frame.camera.scale) - 180);
  if (frame.blocks.some((block) => block.itemId === id)) {
    showToast("已经在这个 Frame 里。");
    return;
  }
  const block = { id: `b-${id}-${Date.now()}`, kind, itemId: id, x: Math.max(24, x), y: Math.max(24, Math.min(y, maxY)), fresh: true };
  frame.blocks.push(block);
  frame.expanded = block.id;
  renderGroup(focus);
}

function bindSurface(node, groupId) {
  const canvas = node.querySelector(".goal-canvas");
  const frame = node.querySelector(".frame-canvas");
  if (canvas) {
    bindPan(canvas, canvasCamera);
    canvas.querySelectorAll(".goal-canvas-node").forEach((el) => {
      const goal = goals.find((g) => g.id === el.dataset.goal);
      bindMove(el, goal, () => {
        lastItem.goals = goal.id;
        renderList();
        canvas.querySelectorAll(".goal-canvas-node").forEach((item) => item.classList.toggle("is-selected", item === el));
      });
    });
    canvas.addEventListener("click", (event) => {
      const frameBtn = event.target.closest("[data-open-frame]");
      const openBtn = event.target.closest("[data-open-goal]");
      const closeBtn = event.target.closest("[data-close-workspace]");
      const detailsBtn = event.target.closest("[data-toggle-details]");
      if (frameBtn) { event.stopPropagation(); openGoalFrame(frameBtn.dataset.openFrame); }
      if (openBtn) {
        event.stopPropagation();
        expandedGoal = openBtn.dataset.openGoal;
        lastItem.goals = expandedGoal;
        renderGroup(groupId);
      }
      if (closeBtn) { expandedGoal = ""; renderGroup(groupId); }
      if (detailsBtn) {
        detailsOpen = !detailsOpen;
        const workspace = canvas.querySelector(".workspace");
        if (workspace) workspace.dataset.detailsOpen = String(detailsOpen);
      }
    });
    canvas.addEventListener("dblclick", (event) => {
      const card = event.target.closest(".goal-canvas-node");
      if (!card || event.target.closest("button")) return;
      expandedGoal = card.dataset.goal;
      lastItem.goals = expandedGoal;
      renderGroup(groupId);
    });
    canvas.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "none"; });
    canvas.addEventListener("drop", (event) => {
      event.preventDefault();
      canvas.classList.add("is-reject");
      window.setTimeout(() => canvas.classList.remove("is-reject"), 420);
      showToast("Goal 画布只放 Goal。先打开某个 Goal 的 Frame，再把内容拖进去。");
    });
  }
  if (frame) {
    const state = ensureFrame(frame.dataset.goal);
    bindPan(frame, state.camera);
    frame.querySelectorAll(".block").forEach((el) => {
      const block = state.blocks.find((row) => row.id === el.dataset.block);
      bindFrameBlock(el, block, state, () => {
        state.expanded = state.expanded === block.id ? "" : block.id;
        renderGroup(groupId);
      });
    });
    frame.addEventListener("click", (event) => {
      if (event.target.closest("[data-collapse-block]")) {
        event.stopPropagation();
        state.expanded = "";
        renderGroup(groupId);
      }
    });
    frame.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      frame.classList.add("is-drop");
    });
    frame.addEventListener("dragleave", (event) => {
      if (!frame.contains(event.relatedTarget)) frame.classList.remove("is-drop");
    });
    frame.addEventListener("drop", (event) => {
      event.preventDefault();
      frame.classList.remove("is-drop");
      const raw = event.dataTransfer.getData("text/molis-item");
      if (!raw) return;
      const item = JSON.parse(raw);
      if (item.kind === "goal") { showToast("Goal 留在主画布上。这里只放推进这个 Goal 用的工作内容。"); return; }
      setFocus(groupId);
      placeBlock(item.kind, item.id, event.clientX, event.clientY, frame);
    });
  }
}

function renderPane(node, id, pluginId) {
  if (!pluginId) { renderEmpty(node); return; }
  if (pluginId === "home") { renderHome(node); return; }
  if (pluginId === "goals") {
    if (id === "canvas") renderCanvas(node);
    else renderFrame(node, id);
    return;
  }
  renderPluginRead(node, id);
}

function renderGroupTabs(id) {
  const nav = document.querySelector(`[data-tabs="${id}"]`);
  const group = groups[id];
  nav.replaceChildren();
  if (!group.plugin) {
    const add = document.createElement("button");
    add.className = "tab tab-add";
    add.type = "button";
    add.setAttribute("aria-label", "添加插件");
    add.setAttribute("aria-haspopup", "menu");
    add.setAttribute("aria-expanded", "false");
    add.innerHTML = icon("i-plus");
    add.addEventListener("click", (event) => {
      event.stopPropagation();
      setFocus(id);
      openPicker(add, id);
    });
    nav.append(add);
    return;
  }
  plugins[group.plugin].tabs.forEach((tab) => {
    const el = document.createElement("button");
    el.className = "tab";
    el.type = "button";
    if (tab.id === group.tab) el.setAttribute("aria-current", "page");
    const label = document.createElement("span");
    label.textContent = tab.label;
    el.append(label);
    if (tab.close) {
      const x = document.createElement("span");
      x.className = "x";
      x.setAttribute("aria-label", `关闭 ${tab.label}`);
      x.innerHTML = icon("i-close");
      x.addEventListener("click", (event) => {
        event.stopPropagation();
        plugins[group.plugin].tabs = plugins[group.plugin].tabs.filter((item) => item.id !== tab.id);
        if (group.tab === tab.id) group.tab = plugins[group.plugin].tabs[0].id;
        renderGroups();
      });
      el.append(x);
    }
    el.addEventListener("click", (event) => {
      if (event.target.closest(".x")) return;
      setFocus(id);
      group.tab = tab.id;
      if (group.plugin !== "home") lastItem[group.plugin] = tab.id === "canvas" ? lastItem.goals : tab.id;
      if (tab.id === "canvas") expandedGoal = "";
      renderGroup(id);
      renderList();
    });
    nav.append(el);
  });
}

function renderGroup(id) {
  const group = groups[id];
  const pane = document.querySelector(`[data-pane="${id}"]`);
  renderGroupTabs(id);
  const key = group.plugin ? `${group.plugin}:${group.tab}` : "empty";
  if (!group.plugin) {
    pane.setAttribute("aria-label", "空格子");
    renderEmpty(pane);
  } else {
    pane.setAttribute("aria-label", plugins[group.plugin].label);
    renderPane(pane, group.tab, group.plugin);
    bindSurface(pane, id);
  }
  lastPaneKey[id] = key;
}

function renderMarket() {
  const nav = document.querySelector('[data-tabs="a"]');
  nav.replaceChildren();
  const tab = document.createElement("button");
  tab.className = "tab";
  tab.type = "button";
  tab.setAttribute("aria-current", "page");
  tab.textContent = "插件市场";
  nav.append(tab);
  const pane = document.querySelector('[data-pane="a"]');
  pane.setAttribute("aria-label", "插件市场");
  renderMarketPane(pane);
}

function renderGroups() {
  if (viewingMarket) {
    groupB.hidden = true;
    panes.dataset.layout = "single";
    renderMarket();
    return;
  }
  panes.dataset.layout = layout;
  groupB.hidden = layout === "single";
  renderGroup("a");
  if (layout !== "single") renderGroup("b");
}

function syncDestinations() {
  const pluginId = currentPlugin();
  destinations.querySelectorAll("button").forEach((btn) => {
    if (btn.dataset.plugin === pluginId) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
}

function setFocus(id) {
  if (layout === "single" || viewingMarket) id = "a";
  focus = id;
  groupA.classList.toggle("is-focus", focus === "a");
  groupB.classList.toggle("is-focus", focus === "b");
  syncDestinations();
  renderList();
}

function assignPlugin(groupId, pluginId) {
  if (pluginId === "market") {
    viewingMarket = true;
    focus = "a";
    closePicker();
    groupA.classList.add("is-focus");
    groupB.classList.remove("is-focus");
    syncDestinations();
    renderList();
    renderGroups();
    return;
  }
  viewingMarket = false;
  groups[groupId].plugin = pluginId;
  groups[groupId].tab = defaultTab(pluginId);
  setFocus(groupId);
  renderGroups();
}

function setLayout(next) {
  viewingMarket = false;
  layout = next;
  panes.dataset.layout = layout;
  groupB.hidden = layout === "single";
  if (layout === "single") focus = "a";
  layoutMenu.querySelectorAll("[data-layout]").forEach((item) => {
    item.toggleAttribute("aria-current", item.dataset.layout === layout);
  });
  setFocus(focus);
  renderGroups();
}

destinations.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-plugin]");
  if (!btn) return;
  assignPlugin(focus, btn.dataset.plugin);
  document.body.classList.remove("is-drawer");
});
document.getElementById("theme").addEventListener("click", () => document.documentElement.classList.toggle("dark"));
document.getElementById("toggle-sidebar").addEventListener("click", () => {
  if (matchMedia("(max-width: 600px)").matches) document.body.classList.remove("is-drawer");
  else document.body.classList.add("is-collapsed");
});
document.getElementById("show-dir").addEventListener("click", () => {
  document.body.classList.remove("is-collapsed");
  document.body.classList.add("is-drawer");
});
document.getElementById("scrim").addEventListener("click", () => document.body.classList.remove("is-drawer"));
[groupA, groupB].forEach((node) => {
  node.addEventListener("click", (event) => {
    if (event.target.closest(".tab, .plugin-picker, .layout-wrap")) return;
    setFocus(node.dataset.group);
  });
});
layoutBtn.addEventListener("click", () => {
  const open = layoutMenu.hidden;
  layoutMenu.hidden = !open;
  layoutBtn.setAttribute("aria-expanded", String(open));
  if (open) closePicker();
});
layoutMenu.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-layout]");
  if (!btn) return;
  setLayout(btn.dataset.layout);
  layoutMenu.hidden = true;
  layoutBtn.setAttribute("aria-expanded", "false");
});
picker.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-plugin]");
  if (!btn || !pickerGroup) return;
  assignPlugin(pickerGroup, btn.dataset.plugin);
  closePicker();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".layout-wrap")) {
    layoutMenu.hidden = true;
    layoutBtn.setAttribute("aria-expanded", "false");
  }
  if (!event.target.closest(".plugin-picker, .tab-add")) closePicker();
});

const params = new URLSearchParams(location.search);
if (params.get("dark") === "0") document.documentElement.classList.remove("dark");
if (params.get("plugin")) {
  groups.a.plugin = params.get("plugin");
  groups.a.tab = defaultTab(groups.a.plugin);
}
if (params.get("layout")) layout = params.get("layout");
renderPicker();
setLayout(layout);
