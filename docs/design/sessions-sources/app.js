// 22 · External sessions: discovery, project suggestions, history and project AI reading, each with 2-3 options and
// their normal and failure states. Built on the component board's real parts: markup mirrors the mw-* renderers in
// packages/plugin-sdk/src/ui and packages/design-system/src/primitives, the shell is the board's "栏与内容框"
// (rail + directory sidebar + frame, scoped by .mw-layout-primitives), styles come from mw.css (a snapshot of the board).
// Sample data only (data.js). Nothing reads a tool, a Home or the disk; no tool is started.
(() => {
  const D = window.protoData;
  document.getElementById("icons").innerHTML = window.mwSprite;
  const app = document.getElementById("app");
  const KEY = "molis-proto.sessions-sources.v1";

  const fresh = () => ({
    block: "discover", opt: { discover: "B", owner: "B", history: "A", permit: "A" },
    state: { discover: "reading", owner: "pending", history: "normal", permit: "agent" },
    lang: "zh", theme: "light", cat: false,
    sel: "s1", src: null, view: "all", tool: "all", q: "", mDetail: false, srcOpen: false,
    decided: {}, sheet: false, move: null, kpFix: false,
    sheetTab: "tools", pm: {}, pmSnap: {}, pmNote: {}, pmQ: "", pmTarget: null, pmTools: false, pmLeft: false, pmMoreOpen: false,
    cur: "molis", failLeft: 1, fromBlock: false, blockAnswer: null, arrived: 0, picks: {},
  });
  let S = load();
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.v === 1) { const f = fresh(); return { ...f, ...v.s, opt: { ...f.opt, ...v.s.opt }, state: { ...f.state, ...v.s.state }, sheet: false, move: null }; } } catch { /* preview without storage */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, s: S })); } catch { /* preview without storage */ } }

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (pair) => (Array.isArray(pair) ? (S.lang === "zh" ? pair[0] : pair[1]) : pair);
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const block = (id = S.block) => D.blocks.find((b) => b.id === id);
  const st = (id) => { const b = block(id); return b.states.some((x) => x.id === S.state[id]) ? S.state[id] : b.states[0].id; };
  const opt = (id) => S.opt[id];
  const tool = (id) => D.tools.find((t) => t.id === id);
  const toolName = (id) => T(tool(id).name);
  const proj = (id) => D.projects.find((p) => p.id === id);
  const sess = (id) => D.sessions.find((s) => s.id === id);
  const narrow = () => window.innerWidth < 760;

  // ---------- The board's parts (same markup as the mw-* renderers) ----------
  const ic = (n) => `<svg aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const btn = (label, { v = "secondary", icon, attrs = "", disabled = false } = {}) =>
    `<button type="button" class="mw-btn mw-btn--${v} mw-btn--sm" data-slot="button" data-cat="Button"${disabled ? " disabled" : ""} ${attrs}>${icon ? ic(icon) : ""}<span data-slot="button-label">${label}</span></button>`;
  const iconBtn = (label, icon, attrs = "", cls = "") =>
    `<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon mw-btn--icon-only${cls ? ` ${cls}` : ""}" data-slot="button" aria-label="${esc(label)}" ${attrs}>${ic(icon)}<span class="mw-sr-only">${label}</span></button>`;
  const status = (label, tone, ring, plain = false) =>
    `<span class="mw-status mw-status--${tone}${plain ? " mw-status--plain" : ""}" data-slot="status" data-cat="Status mark">${ring && window.mwRings[ring] ? window.mwRings[ring] : ""}<span>${label}</span></span>`;
  const badge = (label, tone = "neutral") => `<span class="mw-badge mw-badge--${tone}" data-slot="badge" data-cat="Badge">${label}</span>`;
  const alert = (tone, title, body = "", actions = "") =>
    `<div class="mw-alert mw-alert--${tone}" data-slot="alert" role="status" data-cat="Alert"><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}${actions ? `<div class="mw-ix-actions">${actions}</div>` : ""}</div>`;
  const select = (attrs, options) => `<select class="mw-select" data-slot="select" data-cat="Select" ${attrs}>${options}</select>`;
  const opts = (list, cur) => list.map(([v, n]) => `<option value="${v}"${v === cur ? " selected" : ""}>${n}</option>`).join("");
  const item = (mark, title, meta, end, attrs = "") =>
    `<li class="mw-item" data-cat="Item Row" ${attrs}>${mark}<span><strong>${title}</strong><small>${meta}</small></span><span class="mw-item__end">${end}</span></li>`;
  const mark = (icon) => `<span class="mw-mark" data-cat="Mark" aria-hidden="true">${ic(icon)}</span>`;
  const card = (title, desc, action, body, attrs = "") =>
    `<article class="mw-card" data-slot="card" data-cat="Card" ${attrs}><header class="mw-card__header"><div><h2 class="mw-card__title">${title}</h2>${desc ? `<p class="mw-card__description">${desc}</p>` : ""}</div>${action || ""}</header><div class="mw-card__panel">${body}</div></article>`;
  const progress = (pct, label) => `<div class="mw-progress" data-slot="progress" data-cat="Progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(label)}"><span style="width:${pct}%"></span></div>`;
  const empty = (icon, title, body, actions = "", error = false) =>
    `<div class="mw-empty${error ? " mw-empty--error" : ""}" data-slot="empty" data-cat="Empty"${error ? ' role="alert"' : ""}><span class="mw-empty__mark">${ic(icon)}</span>${error ? `<strong>${title}</strong>` : `<h2>${title}</h2>`}<p>${body}</p>${actions ? `<div class="mw-empty__actions">${actions}</div>` : ""}</div>`;
  const search = (value, placeholder, attrs = "") =>
    `<div class="mw-input-group" data-slot="input-group" data-cat="Input Group">${ic("search")}<input class="mw-input" data-slot="input" type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" ${attrs}></div>`;
  const toggles = (label, list, cur, key) =>
    `<div class="mw-toggle-group" data-slot="toggle-group" data-cat="Toggle Group" role="group" aria-label="${esc(label)}">${list.map(([v, n]) => `<button type="button" class="mw-toggle${v === cur ? " is-current" : ""}" aria-pressed="${v === cur}" value="${v}" data-${key}="${v}">${n}</button>`).join("")}</div>`;
  const who = (kind, text, label) => `<span class="mw-who" data-kind="${kind}" role="img" aria-label="${esc(label)}" data-cat="Who">${text}</span>`;
  const dirRow = ({ icon, title, meta, count, stat, current, note = "", attrs = "" }) =>
    `<button type="button" title="${esc(title)}" class="mw-dir-row mw-dir-row--meta directory-list-row${current ? " is-selected" : ""}" data-slot="directory-row" data-cat="Directory Row"${current ? ' aria-current="page"' : ""} ${attrs}><span class="mw-dir-row__icon">${ic(icon)}</span><span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>${title}</strong>${count != null ? `<span class="mw-dir-row__count">${count}</span>` : ""}${stat || ""}</span>${meta ? `<small>${meta}</small>` : ""}${note}</span></button>`;
  const dirHeading = (text) => `<h2 class="mw-dir__heading" data-slot="directory-heading">${text}</h2>`;
  const NEW_NOTE = () => L("Directory Row 的提示行：行尾的 Status mark 只放得下两三个字，这里的话要写全，不能靠悬停；提示行排在标题下面，能折行",
    "Directory Row hint line: the Status mark at the row's end fits two or three words, and this has to be said in full, not on hover. It sits under the title and may wrap");
  const NEW_LOG = () => L("外部会话原文：组件板只有助理与 Coding 的气泡，没有「别的工具里的一段对话」——要分清你、那个工具和它调用的工具步骤，长历史能往上读、能就地搜索",
    "External conversation log: the board has assistant and Coding bubbles only, nothing for “a conversation from another tool” that separates you, that tool and its tool steps, reads upward through long history and searches in place");

  // ---------- Derived facts ----------
  const toolIcon = (id) => ({ cli: "terminal", cloud: "cloud", ide: "code" })[tool(id).kind];
  const discState = () => (S.block === "discover" ? st("discover") : "done");
  const srcState = (id) => D.sourceStates[discState()][id] || ["off"];
  const SRC = {
    ok: ["done", () => L("已读完", "Read"), null],
    reading: ["progress", () => L("在读", "Reading"), "running"],
    queued: ["idle", () => L("等着读", "Queued"), null],
    login: ["attention", () => L("需要登录", "Sign-in needed"), null],
    version: ["attention", () => L("这一版读不了", "Can't read this version"), null],
    failed: ["blocked", () => L("没读成", "Failed"), null],
    gap: ["quiet", () => L("暂不支持", "Not supported yet"), null],
    none: ["quiet", () => L("没有会话", "No sessions"), null],
    off: ["idle", () => L("未允许", "Not allowed"), null],
  };
  const srcStatus = (id, plain = false) => { const [code] = srcState(id); const [tone, w, ring] = SRC[code]; return status(w(), tone, ring, plain); };
  function srcMeta(id) {
    const [code, n, est] = srcState(id); const t = tool(id);
    return ({
      ok: () => L(`${n} 个会话 · 刚刚读完`, `${n} sessions · just now`),
      reading: () => L(`已找到 ${n} 个（约 ${est} 个），先列出来的可以先看`, `${n} of about ${est} found; open any listed one now`),
      queued: () => L("排在 Codex 后面", "After Codex"),
      login: () => L(`${toolName(id)} 的会话在云端，要先登录你的账号`, `${toolName(id)} sessions live in the cloud; sign in to your account first`),
      version: () => L(`${t.ver} 改了记录格式，这一版还读不了；会话都还在 ${toolName(id)} 里`, `${t.ver} changed its record format, so this version can't be read yet; the sessions are still in ${toolName(id)}`),
      failed: () => L("读 ~/.copilot 时没有权限；已读到的保留，可以重试", "No permission to read ~/.copilot; what was read is kept, retry any time"),
      gap: () => L("没有公开的读取方式，不去破解它的本地文件；可以回到原工具", "No public way to read it, and its local files aren't cracked open; go back to the tool"),
      none: () => L("读完了，允许的范围里没有会话", "Read; no sessions in the allowed scope"),
      off: () => L("还没允许读取", "Reading not allowed yet"),
    })[code]();
  }
  function srcAction(id) {
    const [code] = srcState(id);
    if (code === "reading") return btn(L("停止", "Stop"), { icon: "pause", attrs: 'data-act="noop"' });
    if (code === "login") return btn(L("去登录", "Sign in"), { icon: "user", attrs: 'data-act="login"' });
    if (code === "version" || code === "gap") return btn(L(`打开 ${toolName(id)}`, `Open ${toolName(id)}`), { icon: "external", attrs: 'data-act="noop"' });
    if (code === "failed") return btn(L("重试", "Retry"), { icon: "refresh", attrs: 'data-act="retry"' });
    if (code === "off") return btn(L("允许", "Allow"), { icon: "check", attrs: 'data-act="sheet"' });
    return "";
  }

  // Which project a session sits in now: your choice beats everything; otherwise the folder link or your earlier pick.
  function ownerOf(s) {
    const o = st("owner");
    if (S.decided[s.id] !== undefined) return S.decided[s.id];
    if (o === "changed" && s.id === "s4") return "site";
    if (o === "done" && !s.project) { const g = D.suggestions[s.id]; return g && g.kind === "suggest" ? g.to : "skip"; }
    return s.project;
  }
  const pending = (s) => ownerOf(s) == null;
  // Tool-reported projects, shown to you only. "reported" needs your confirmation; "toolOther" is a hint, the folder still decides.
  const toolState = () => S.block === "owner" && st("owner") === "tool";
  const isReported = (s) => s.how === "reported" && S.decided[s.id] === undefined;
  const toolOtherOf = (s) => (toolState() && s.toolOther && S.decided[s.id] === undefined ? proj(s.toolOther) : null);
  const REPORTED = () => L("工具报的，不是你确认的", "Reported by a tool, not confirmed by you");
  const TOOL_OTHER = () => L("工具报的是另一个项目", "The tool reported another project");
  function found() {
    const d = discState();
    return D.sessions.filter((s) => {
      const [code] = srcState(s.tool);
      if (s.reportedOnly && !toolState()) return false;
      if (code === "reading") return s.id !== "s9";
      if (code !== "ok") return false;
      if (S.block === "history" && st("history") === "revoked" && s.tool === "qwen") return false;
      if (d === "narrowed") return s.dir === "~/code/goalboard" || s.dir === "~/code/site";
      return true;
    });
  }
  function listed() {
    let list = found();
    if (S.view === "molis") list = list.filter((s) => ownerOf(s) === "molis");
    if (S.view === "sort") list = list.filter(pending);
    if (S.tool !== "all") list = list.filter((s) => s.tool === S.tool);
    if (S.q) list = list.filter((s) => T(s.title).toLowerCase().includes(S.q.toLowerCase()));
    return list;
  }
  const sortCount = () => found().filter(pending).length;
  const ownerLine = (s) => {
    const o = ownerOf(s);
    if (o == null) return L("待归类", "To sort");
    if (o === "skip") return L("不归到项目", "No project");
    return T(proj(o).name);
  };

  // ---------- Review strip ----------
  function strip() {
    const b = block();
    document.getElementById("p-title").textContent = L("原型 · 外部会话（第 22 批）", "Prototype · External sessions (batch 22)");
    document.getElementById("p-block").textContent = L("块", "Area");
    document.getElementById("p-opt").textContent = L("方案", "Option");
    document.getElementById("p-state").textContent = L("状态", "State");
    document.getElementById("reset").textContent = L("还原", "Reset");
    const cb = document.getElementById("cat");
    cb.textContent = L("标出组件", "Show components");
    cb.setAttribute("aria-pressed", String(S.cat));
    document.body.classList.toggle("cat", S.cat);
    document.getElementById("block").innerHTML = D.blocks.map((x) => `<option value="${x.id}"${x.id === b.id ? " selected" : ""}>${T(x.name)}</option>`).join("");
    document.getElementById("opt").innerHTML = b.options.map((x) => `<option value="${x.id}"${x.id === opt(b.id) ? " selected" : ""}>${T(x.name)}${x.rec ? L("（推荐）", " (recommended)") : ""}</option>`).join("");
    document.getElementById("state").innerHTML = b.states.map((x) => `<option value="${x.id}"${x.id === st(b.id) ? " selected" : ""}>${T(x.name)}</option>`).join("");
    document.querySelectorAll("#lang button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === S.lang)));
    document.querySelectorAll("#theme button").forEach((x) => { x.setAttribute("aria-pressed", String(x.dataset.themeSet === S.theme)); x.textContent = x.dataset.themeSet === "light" ? L("浅色", "Light") : L("深色", "Dark"); });
    const root = document.documentElement;
    root.dataset.theme = S.theme; root.dataset.resolvedTheme = S.theme;
    root.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.title = L("外部会话定样 · Molis Work 原型", "External sessions review · Molis Work prototype");
  }

  // ---------- Shell: the board's rail + directory sidebar + frame ----------
  function rail() {
    const items = [["target", "Goals"], ["note", "Pages"], ["code", "Coding"], ["history", L("外部会话", "External sessions"), !inMock()]];
    return `<aside class="mw-sidebar mw-sidebar--rail" data-slot="sidebar" data-cat="Sidebar"><div class="mw-sidebar__body mw-scroll">${items.map(([i, n, cur]) =>
      `<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon mw-btn--icon-only" data-slot="button" aria-label="${esc(n)}"${cur ? ' aria-current="page"' : ""} title="${esc(n)}">${ic(i)}<span class="mw-sr-only">${n}</span></button>`).join("")}</div></aside>`;
  }
  function toolbar() {
    const viewOpts = [["all", L("全部", "All")], ["molis", "Molis Work"], ["sort", L(`待归类 ${sortCount()}`, `To sort ${sortCount()}`)], ...(opt("permit") === "C" ? [["ai", L("项目的 AI", "Project AI")]] : [])];
    const toolSel = opt("discover") === "B" || (opt("discover") === "C" && narrow())
      ? select(`data-field="tool" aria-label="${L("工具", "Tool")}"`, opts([["all", L("全部工具", "All tools")], ...D.tools.filter((t) => !t.gap).map((t) => [t.id, T(t.name)])], S.tool)) : "";
    return `<div class="mw-toolbar ss-toolbar" data-slot="toolbar" role="toolbar" data-cat="Toolbar">
      ${S.pmLeft && S.view !== "ai" ? btn(pmBackLabel(), { icon: "chevron-left", attrs: 'data-act="pmback"' }) : ""}<div class="ss-search">${search(S.q, L("搜索会话标题", "Search session titles"), 'data-field="q"')}</div>
      ${toggles(L("范围", "Scope"), viewOpts, S.view, "view")}${toolSel}
      <span class="ss-spacer"></span>${btn(L("读取范围", "Reading scope"), { icon: "tune", attrs: 'data-act="sheet"' })}</div>`;
  }

  // ---------- Area 1 · Discovery ----------
  function discoveryBanner() {
    const d = discState(); const o = opt("discover");
    const n = found().length;
    if (d === "reading") {
      const head = alert("info", L(`正在读 Codex · 已找到 ${n} 个会话`, `Reading Codex · ${n} sessions found`), `${L("先列出来的可以先打开；还有 4 个工具排着，结果边读边出。", "Open any listed session now; 4 more tools are queued and results keep arriving.")}</p>${progress(38, L("读取进度 38%", "38% read"))}<p hidden>`, btn(L("停止读取", "Stop reading"), { attrs: 'data-act="noop"' }));
      return `<div class="ss-banner">${head}</div>`;
    }
    if (o === "B") {
      const bad = D.tools.filter((t) => ["login", "version", "failed"].includes(srcState(t.id)[0]));
      const gaps = D.tools.filter((t) => srcState(t.id)[0] === "gap");
      const okN = D.tools.filter((t) => srcState(t.id)[0] === "ok").length;
      const list = `<ul class="mw-items ss-src-list">${D.tools.map((t) => item(mark(toolIcon(t.id)), T(t.name), srcMeta(t.id), `${srcStatus(t.id)}${srcAction(t.id)}`)).join("")}</ul>`;
      const toggle = btn(S.srcOpen ? L("收起来源", "Hide sources") : L("看每个来源", "See each source"), { v: "ghost", icon: S.srcOpen ? "chevron-up" : "chevron-down", attrs: 'data-act="srcOpen"' });
      const head = bad.length
        ? alert("warning", L(`${bad.length} 个来源没读成，读到的照常显示`, `${bad.length} sources weren't read; everything else shows as usual`), bad.map((t) => `${T(t.name)}：${SRC[srcState(t.id)[0]][1]()}`).join(L("；", "; ")), toggle)
        : `<p class="ss-quiet">${status(L(`${okN} 个来源已读完`, `${okN} sources read`), "done")}<span>${L(`${gaps.length} 个工具暂不支持自动发现 · 刚刚`, `${gaps.length} tools not supported yet · just now`)}</span>${toggle}</p>`;
      return `<div class="ss-banner">${head}${S.srcOpen ? list : ""}</div>`;
    }
    return "";
  }
  function sourceList(current) {
    const order = D.tools;
    return order.map((t) => {
      const [code, num] = srcState(t.id);
      return dirRow({ icon: toolIcon(t.id), title: T(t.name), meta: code === "ok" ? t.where && T(t.where) : SRC[code][1](), count: code === "ok" ? num : null,
        stat: code === "ok" ? "" : srcStatus(t.id, true), current: current === t.id, attrs: `data-src="${t.id}"` });
    }).join("");
  }
  function sessionRow(s) {
    const t = tool(s.tool);
    const grouped = opt("discover") === "A" && S.block === "discover";
    const meta = [grouped ? null : T(t.name), s.when ? T(s.when) : null].filter(Boolean).join(" · ");
    const stat = pending(s) ? status(L("待归类", "To sort"), "attention", null, true) : s.running ? status(L("在运行", "Running"), "progress", "running", true) : "";
    // A hinted row has two lines anyway, so the tool and time move down with the hint instead of being squeezed out by the title.
    const note = isReported(s) ? `<small class="ss-dir-note" data-new="${esc(NEW_NOTE())}">${meta} · <span data-tone="attention">${REPORTED()}</span></small>`
      : toolOtherOf(s) ? `<small class="ss-dir-note">${meta} · ${TOOL_OTHER()}</small>` : "";
    return dirRow({ icon: s.forkOf ? "git-branch" : toolIcon(s.tool), title: T(s.title), meta: note ? "" : meta, stat, note, current: S.sel === s.id && !S.src, attrs: `data-sel="${s.id}"` });
  }
  function listPanel() {
    const d = discState(); const o = opt("discover");
    const list = listed();
    let body;
    if (d === "first" || d === "empty") body = narrow() ? `<div class="ss-pad">${firstOrEmpty()}</div>` : `<p class="ss-pad ss-muted">${d === "first" ? L("还没有会话。", "No sessions yet.") : L("没有会话。", "No sessions.")}</p>`;
    else if (!list.length) body = `<div class="ss-pad">${S.view === "sort" ? empty("check", L("没有待归类的会话", "Nothing to sort"), L("每个会话都有了归属，或者你选了不归到项目。", "Every session has a project, or you chose no project.")) : empty("search", L("没有匹配的会话", "No matching sessions"), L("换个词，或清除筛选。", "Try another word or clear the filters."), btn(L("清除筛选", "Clear filters"), { attrs: 'data-act="clear"' }))}</div>`;
    else if (o === "A" && S.block === "discover") {
      body = D.tools.map((t) => {
        const [code, num] = srcState(t.id);
        const rows = list.filter((s) => s.tool === t.id);
        const head = dirHeading(`${T(t.name)}${code === "ok" || code === "reading" ? ` · ${num}` : ""}`);
        if (code === "ok" || code === "reading") return rows.length ? head + rows.map(sessionRow).join("") + (code === "reading" ? `<p class="mw-loading ss-dir-loading" role="status">${L("还在读…", "Still reading…")}</p>` : "") : "";
        if (code === "none" || code === "off") return "";
        return head + dirRow({ icon: code === "gap" ? "external" : "circle-alert", title: SRC[code][1](), meta: code === "gap" ? L("回到原工具", "Go back to the tool") : code === "queued" ? L("排着", "Queued") : L("点开看原因和处理", "Open for the reason and a fix"), current: S.src === t.id, attrs: `data-src="${t.id}"` });
      }).join("");
    } else body = list.map(sessionRow).join("");
    const label = o === "C" && S.block === "discover" && !narrow() ? L("会话", "Sessions") : L("外部会话", "External sessions");
    return `<aside class="mw-sidebar mw-sidebar--directory ss-list" data-slot="sidebar"><div class="mw-sidebar__body mw-scroll"><section class="mw-dir desktop-directory-panel" data-slot="directory" data-cat="Directory Panel"><div class="mw-dir__tools"><span class="mw-dir__label">${label}</span><span class="ss-count">${list.length}</span></div><div class="mw-dir__body">${body}</div></section></div></aside>`;
  }
  function firstOrEmpty() {
    return discState() === "first"
      ? empty("history", L("还没有允许读任何工具", "No tool allowed yet"), L("这台 Mac 上找到 7 个 AI 开发工具。选好允许读的，已有会话会自动出现，不用一个个导入。", "7 AI coding tools were found on this Mac. Pick which ones may be read and their existing sessions appear on their own—no importing one by one."), btn(L("选择要读的工具", "Choose tools to read"), { v: "primary", attrs: 'data-act="sheet"' }))
      : empty("search", L("允许的范围里没有会话", "No sessions in the allowed scope"), L("Claude Code、Codex、Kimi Code 都读完了，确实没有，不是没读成。还有 4 个工具没允许读。", "Claude Code, Codex and Kimi Code were all read and really have none—this isn't a failure. 4 more tools aren't allowed yet."), btn(L("调整读取范围", "Adjust reading scope"), { attrs: 'data-act="sheet"' }));
  }
  function sourcesPanel() {
    return `<aside class="mw-sidebar mw-sidebar--directory ss-sources" data-slot="sidebar"><div class="mw-sidebar__body mw-scroll"><section class="mw-dir desktop-directory-panel" data-slot="directory" data-cat="Directory Panel"><div class="mw-dir__tools"><span class="mw-dir__label">${L("来源", "Sources")}</span></div><div class="mw-dir__body">${dirRow({ icon: "history", title: L("全部来源", "All sources"), count: found().length, current: S.tool === "all" && !S.src, attrs: 'data-tool="all"' })}${dirHeading(L("工具", "Tools"))}${sourceList(S.src || (S.tool !== "all" ? S.tool : null))}</div></section></div></aside>`;
  }
  function sourceDetail(id) {
    const [code] = srcState(id); const t = tool(id); const n = toolName(id);
    const map = {
      login: ["lock", L(`${n} 需要登录`, `${n} needs sign-in`), L(`${n} 的会话在云端。登录走服务连接，登录后从刚才的位置接着读，不会重复列出。`, `${n} sessions live in the cloud. Sign in through Service connections; reading picks up where it stopped without listing anything twice.`), btn(L("去服务连接登录", "Sign in via Service connections"), { v: "primary", attrs: 'data-act="login"' }), false],
      version: ["circle-alert", L(`这一版 ${n}（${t.ver}）的记录读不了`, `This version of ${n} (${t.ver}) can't be read`), L(`它改了会话记录的格式，Molis Work 还没跟上。这不是没有会话：会话都在 ${n} 里，可以在那里打开。`, `It changed its session format and Molis Work hasn't caught up. This is not “no sessions”: they're all in ${n} and you can open them there.`), btn(L(`打开 ${n}`, `Open ${n}`), { icon: "external", attrs: 'data-act="noop"' }), true],
      failed: ["circle-alert", L(`${n} 没读成`, `${n} wasn't read`), srcMeta(id), btn(L("重试", "Retry"), { icon: "refresh", attrs: 'data-act="retry"' }), true],
      gap: ["external", L(`${n} 的会话暂时读不了`, `${n} sessions can't be read yet`), L(`${n} 没有公开的读取方式，记录在它自己的本地文件里，Molis Work 不去破解。已记为缺口；要用这些会话就回到 ${n}。`, `${n} offers no public way to read sessions; they sit in its own local files, which Molis Work won't crack open. Recorded as a gap; open ${n} to use them.`), btn(L(`打开 ${n}`, `Open ${n}`), { icon: "external", attrs: 'data-act="noop"' }), false],
      queued: ["clock", L(`${n} 排着`, `${n} is queued`), srcMeta(id), "", false],
      none: ["search", L(`${n} 里没有会话`, `No sessions in ${n}`), srcMeta(id), "", false],
      off: ["lock", L(`还没允许读 ${n}`, `${n} isn't allowed yet`), L("允许后自动发现已有会话。", "Once allowed, existing sessions are found automatically."), btn(L("允许读取", "Allow reading"), { v: "primary", attrs: 'data-act="sheet"' }), false],
      ok: ["check", L(`${n} 已读完`, `${n} read`), srcMeta(id), "", false],
      reading: ["history", L(`在读 ${n}`, `Reading ${n}`), srcMeta(id), "", false],
    };
    const [icon, title, body, act, err] = map[code];
    return `<section class="mw-frame" data-slot="frame" data-cat="Frame"><header class="mw-frame__header"><div class="mw-frame__heading"><h2>${n}</h2><p>${T(t.where)}${t.ver ? ` · ${t.ver}` : ""}</p></div></header><div class="mw-frame__panel"><div class="ss-center">${empty(icon, title, body, act, err)}</div></div></section>`;
  }

  // ---------- Area 2 · Project suggestions ----------
  const projOpts = (cur) => opts([["", L("选择项目…", "Choose a project…")], ...D.projects.map((p) => [p.id, T(p.name)]), ["skip", L("不归到项目", "No project")]], cur || "");
  function suggestionFor(s) {
    const g = D.suggestions[s.id];
    if (!g || st("owner") === "failed") return null;
    return g;
  }
  // Cards come with the list; suggestions are a separate request and fill in afterwards.
  const arriving = () => S.block === "owner" && st("owner") === "arriving" && opt("owner") === "B";
  const waitingOn = () => found().filter(pending).filter((s) => D.suggestions[s.id]);
  const suggWaiting = (s) => arriving() && D.suggestions[s.id] && waitingOn().indexOf(s) >= S.arrived;
  const sortDisclosure = () => L("打开这里时，这些会话的标题、目录和开头几句，连同你的项目名和项目目录，会发给你配置的模型，用来给建议。这和项目的 AI 能不能读是两件事：内容不进任何项目 AI 的对话。", "Opening this sends these sessions' titles, folders and first few lines, along with your project names and folders, to the model you configured, to make suggestions. That's separate from what a project's AI may read: nothing here enters any project AI's conversation.");
  function suggBody(s, fresh) {
    if (suggWaiting(s)) return `<div class="ss-sugg-wait" aria-hidden="true"><span class="mw-skeleton" data-cat="Skeleton" style="width:88%"></span><span class="mw-skeleton" style="width:64%"></span></div>`;
    const g = suggestionFor(s);
    const picked = S.picks[s.id];
    const kept = g && g.kind === "suggest" && picked && picked !== g.to ? `<p class="ss-sugg-kept">${L(`你已选 ${picked === "skip" ? "不归到项目" : T(proj(picked).name)}，建议没有改你的选择。`, `You picked ${picked === "skip" ? "no project" : T(proj(picked).name)}; the suggestion didn't change that.`)}</p>` : "";
    const html = !g ? `<p class="ss-muted">${L("没有建议。自己选一个，或先不归。", "No suggestion. Pick one or leave it for now.")}</p>`
      : g.kind === "none" ? `<p><b>${L("AI 没找到合适的项目", "No fitting project")}</b> ${T(g.reason)}</p>${evidence(g)}`
      : `<p><b>${L(`建议：${T(proj(g.to).name)}`, `Suggested: ${T(proj(g.to).name)}`)}</b> ${T(g.reason)}</p>${evidence(g)}${kept}`;
    return fresh ? `<div class="ss-sugg-in">${html}</div>` : html;
  }
  const arriveLine = () => { const total = waitingOn().length; return `<p class="ss-lead-more" role="status">${window.mwRings.running}<span>${L(`建议到了 ${Math.min(S.arrived, total)} / ${total}，没到的也能先自己选。`, `${Math.min(S.arrived, total)} of ${total} suggestions in; you can pick yourself in the meantime.`)}</span></p>`; };
  let arriveRun = 0;
  function startArriving() {
    const run = ++arriveRun; S.arrived = 0;
    const tick = () => {
      if (run !== arriveRun || !arriving()) return;
      const list = waitingOn(); const s = list[S.arrived]; if (!s) return;
      S.arrived += 1;
      const g = suggestionFor(s);
      const slot = app.querySelector(`[data-sugg="${s.id}"]`); if (slot) slot.innerHTML = suggBody(s, true);
      const pick = app.querySelector(`[data-pick="${s.id}"]`);
      if (pick && g && g.kind === "suggest" && S.picks[s.id] === undefined) { pick.value = g.to; const c = app.querySelector(`[data-confirm="${s.id}"]`); if (c) c.disabled = false; }
      const line = app.querySelector(".ss-lead-more");
      if (line) { if (S.arrived >= list.length) line.remove(); else line.outerHTML = arriveLine(); }
      setTimeout(tick, 900);
    };
    setTimeout(tick, 1200);
  }
  function evidence(g) { return `<ul class="ss-evidence">${g.evidence.map((e) => `<li>${ic("evidence")}${T(e)}</li>`).join("")}</ul>`; }
  function inlineSuggestion(s) {
    const g = suggestionFor(s);
    const pick = select(`data-pick="${s.id}" aria-label="${L("改选项目", "Choose another project")}"`, projOpts(""));
    if (!g) return alert("warning", L("建议没生成：模型暂时不可用", "No suggestion: the model is unavailable"), L("这个会话保持待归类，照样能看历史。可以自己选，或稍后重试。", "This session stays unsorted and its history is still readable. Pick one yourself or retry later."), `${pick}${btn(L("重试", "Retry"), { icon: "refresh", attrs: 'data-act="noop"' })}`);
    if (g.kind === "none") return alert("info", L("AI 没找到合适的项目", "AI found no fitting project"), `${T(g.reason)}${evidence(g)}`, `${pick}${btn(L("保持不归", "Keep unsorted"), { v: "ghost", attrs: `data-decide="${s.id}:skip"` })}`);
    return alert("info", L(`建议归到「${T(proj(g.to).name)}」`, `Suggested: “${T(proj(g.to).name)}”`), `${T(g.reason)}${evidence(g)}`,
      `${btn(L(`归到 ${T(proj(g.to).name)}`, `Move to ${T(proj(g.to).name)}`), { v: "primary", attrs: `data-decide="${s.id}:${g.to}"` })}${pick}${btn(L("先不归", "Not now"), { v: "ghost", attrs: `data-decide="${s.id}:skip"` })}`);
  }
  function sortIntro() {
    return st("owner") === "failed"
      ? alert("warning", L("建议没生成：模型暂时不可用", "No suggestions: the model is unavailable"), L("这些会话保持待归类，照样能看历史。可以自己选，也可以稍后重试；不会替你猜一个项目。", "These sessions stay unsorted and remain readable. Pick yourself or retry later; nothing is guessed for you."), btn(L("重试", "Retry"), { icon: "refresh", attrs: 'data-act="noop"' }))
      : `<p class="ss-lead">${L("这些会话的目录没有唯一连着一个项目。你确认之前它们不归进任何项目，照样能看历史；确认只改这一个会话，不改目录和项目的关系，也不搬文件。", "These sessions' folders aren't linked to exactly one project. Until you confirm they belong to none and stay readable. Confirming changes just this session—not the folder's link, and no files move.")}</p><p class="ss-lead">${sortDisclosure()}</p>${arriving() && S.arrived < waitingOn().length ? arriveLine() : ""}`;
  }
  function sortQueueB() {
    const list = found().filter(pending);
    if (!list.length) return `<div class="ss-center">${empty("check", L("没有待归类的会话", "Nothing to sort"), L("每个会话都有了归属，或者你选了不归到项目。以后新发现的、目录关系不明确的会出现在这里。", "Every session has a project or you chose none. Newly found sessions with unclear folders show up here."))}</div>`;
    return `${sortIntro()}<div class="ss-cards">${list.map((s) => {
      const g = suggWaiting(s) ? null : suggestionFor(s); const t = tool(s.tool);
      const head = `<div class="ss-card-who">${mark(toolIcon(s.tool))}<span><strong>${T(s.title)}</strong><small>${T(t.name)} · ${T(s.dir)} · ${T(s.when)}</small></span></div>`;
      const chosen = S.picks[s.id] ?? (g && g.kind === "suggest" ? g.to : "");
      const pick = select(`data-pick="${s.id}" aria-label="${L("选择项目", "Choose a project")}"`, projOpts(chosen));
      const body = `<div data-sugg="${s.id}">${suggBody(s)}</div>`;
      const acts = `<div class="mw-ix-actions">${pick}${btn(L("确认", "Confirm"), { v: "primary", disabled: arriving() && !chosen, attrs: `data-confirm="${s.id}"` })}${btn(L("先不归", "Not now"), { v: "ghost", attrs: `data-decide="${s.id}:skip"` })}${btn(L("看历史", "View history"), { v: "ghost", attrs: `data-sel="${s.id}"` })}</div>`;
      return card(head, "", "", body + acts, `data-card="${s.id}"`);
    }).join("")}</div>`;
  }
  function sortQueueC() {
    const list = found().filter(pending);
    if (!list.length) return `<div class="ss-center">${empty("check", L("没有待归类的会话", "Nothing to sort"), L("每个会话都有了归属，或者你选了不归到项目。", "Every session has a project, or you chose none."))}</div>`;
    const groups = {};
    list.forEach((s) => { const g = suggestionFor(s); const k = g && g.kind === "suggest" ? g.to : g ? "none" : "failed"; (groups[k] ||= []).push(s); });
    const order = ["molis", "site", "none", "failed"].filter((k) => groups[k]);
    return `${sortIntro()}<div class="ss-cards">${order.map((k) => {
      const rows = groups[k];
      const named = k === "molis" || k === "site";
      const title = named ? L(`建议归到 ${T(proj(k).name)} · ${rows.length} 个`, `Suggested for ${T(proj(k).name)} · ${rows.length}`) : k === "none" ? L(`AI 没找到合适的项目 · ${rows.length} 个`, `No fitting project · ${rows.length}`) : L(`没有建议 · ${rows.length} 个`, `No suggestion · ${rows.length}`);
      const checks = `<fieldset class="mw-check-group" data-slot="checkbox-group" data-cat="Checkbox Group"><legend class="mw-sr-only">${title}</legend>${rows.map((s) => {
        const g = suggestionFor(s);
        return `<label class="mw-check-row ss-check"><input class="mw-check" data-slot="checkbox" type="checkbox"${named ? " checked" : ""} data-gpick="${s.id}"><span><strong>${T(s.title)}</strong><small>${toolName(s.tool)} · ${T(s.dir)}${g ? ` · ${T(g.reason)}` : ""}</small></span></label>`;
      }).join("")}</fieldset>`;
      const acts = named
        ? `<div class="mw-ix-actions">${btn(L(`归入选中的`, `Move selected`), { v: "primary", attrs: `data-group="${k}"` })}${btn(L("逐个看", "Review one by one"), { v: "ghost", attrs: `data-sel="${rows[0].id}"` })}</div>`
        : `<div class="mw-ix-actions">${select(`data-gproj="${k}" aria-label="${L("选择项目", "Choose a project")}"`, projOpts(""))}${btn(L("归入选中的", "Move selected"), { attrs: `data-group="${k}"` })}${btn(L("先不归", "Not now"), { v: "ghost", attrs: `data-groupskip="${k}"` })}</div>`;
      return card(title, "", "", checks + acts);
    }).join("")}</div>`;
  }
  function ownershipLine(s) {
    const o = ownerOf(s);
    const changeBtn = btn(L("改归属", "Change project"), { v: "ghost", attrs: `data-move="${s.id}"` });
    if (st("owner") === "changed" && s.id === "s4" && S.decided.s4 === undefined)
      return alert("info", L("归到 官网改版 · 你在 11 月 3 日改选的", "In Website redesign · you changed it on Nov 3"), L("之后 AI 给了新建议「Molis Work」，没有改你的选择。", "AI later suggested “Molis Work”; your choice was left as is."), `${btn(L("改成 Molis Work", "Use Molis Work"), { attrs: 'data-decide="s4:molis"' })}${changeBtn}`);
    if (o == null) {
      if (opt("owner") === "A") return inlineSuggestion(s);
      return alert("warning", L("待归类", "To sort"), L("目录没有唯一连着一个项目，照样能看历史。", "Its folder isn't linked to exactly one project; history is still readable."), btn(L("去待归类处理", "Open To sort"), { attrs: `data-view="sort"` }));
    }
    if (isReported(s)) return `<p class="ss-owner">${ic("folder")}<b>${T(proj(o).name)}</b><span>${REPORTED()}${L("。确认之后才算，这个项目的 AI 现在读不到它。", ". It counts once you confirm; this project's AI can't read it until then.")}</span>${btn(L("确认归到这里", "Confirm this project"), { attrs: `data-decide="${s.id}:${o}"` })}${changeBtn}</p>`;
    const other = toolOtherOf(s);
    const basis = o === "skip" ? L("你选了不归到项目", "You chose no project")
      : S.decided[s.id] !== undefined ? L("你刚确认的", "You just confirmed it")
      : s.how === "dir" ? L(`依据：目录 ${s.dir} 只连着这个项目`, `Because folder ${s.dir} is linked only to this project`)
      : s.how === "manual" ? L(`你在 11 月 1 日指定；目录连着官网改版，不改你的指定`, `You picked it on Nov 1; the folder is linked to Website redesign, your pick stays`)
      : L("按 AI 建议确认", "Confirmed from the AI suggestion");
    return `<p class="ss-owner">${ic("folder")}<b>${o === "skip" ? L("不归到项目", "No project") : T(proj(o).name)}</b><span>${basis}</span>${changeBtn}${other ? `<span class="ss-owner__hint">${L(`${TOOL_OTHER()}：${T(other.name)}。归属按你连的目录算，工具改不了。`, `${TOOL_OTHER()}: ${T(other.name)}. The project follows the folder you linked; tools can't change it.`)}</span>` : ""}</p>`;
  }
  function moveDialog() {
    const s = sess(S.move); if (!s) return "";
    return `<dialog class="mw-dialog" data-slot="dialog" data-cat="Dialog" aria-labelledby="ss-move-title" data-ss-dialog="move">
      <form method="dialog" class="mw-form mw-dialog__shell">
        <header class="mw-form__header"><div><h2 id="ss-move-title">${L("改归到哪个项目", "Move to which project")}</h2><p>${esc(T(s.title))}</p></div>${iconBtn(L("关闭", "Close"), "x", 'data-act="movex"', "mw-dialog__close")}</header>
        <div class="mw-form__body"><label class="mw-field" data-slot="field" data-cat="Field"><span class="mw-field__label">${L("项目", "Project")}</span>${select('id="moveTo"', projOpts(ownerOf(s) || ""))}<small class="mw-field__hint">${L("只改这一个会话：不改目录和项目的关系，不搬文件，不改原工具里的记录。它连着的工具调用仍落在旧项目。", "Changes only this session: not the folder's link, no files move, nothing in the original tool changes. Tool calls connected to it still land in the old project.")}</small></label></div>
        <footer class="mw-form__footer">${btn(L("取消", "Cancel"), { attrs: 'data-act="movex"' })}${btn(L("保存", "Save"), { v: "primary", attrs: 'data-act="moveok"' })}</footer>
      </form></dialog>`;
  }

  // ---------- Area 3 · History ----------
  function hl(text) {
    if (st("history") !== "search" || S.block !== "history") return esc(text);
    const term = T(D.searchTerm);
    return esc(text).split(esc(term)).join(`<mark class="ss-hit">${esc(term)}</mark>`);
  }
  function entry(e, i, s) {
    const t = tool(s.tool);
    if (e.who === "note") return `<li class="ss-note" data-i="${i}">${T(e.text)}</li>`;
    if (e.who === "tool") return `<li class="ss-step" data-i="${i}">${ic("terminal")}<span><b>${T(e.tool)}</b> <code>${esc(e.detail)}</code></span><small>${T(e.result)}</small></li>`;
    const me = e.who === "you";
    const face = me ? who("person", L("你", "Y"), L("你（人）", "You (person)")) : who("ai", T(t.name).slice(0, 1), `${T(t.name)}（AI）`);
    return `<li class="ss-turn" data-who="${e.who}" data-i="${i}">${face}<div><p class="ss-turn__head"><b>${me ? L("你", "You") : T(t.name)}</b><time>${e.t || ""}</time>${e.live ? status(L("在运行", "Running"), "progress", "running", true) : ""}</p><p>${hl(T(e.text))}</p></div></li>`;
  }
  function transcript(s, upto) {
    const all = s.id === "s1" ? D.transcript : [
      { who: "note", text: [`会话开始 · ${T(s.when)} · ${T(s.dir)}`, `Session started · ${T(s.when)} · ${T(s.dir)}`] },
      { who: "you", t: "", text: [`（${T(s.title)} 的第一句提问，原文照录）`, `(The first prompt of “${T(s.title)}”, as written)`] },
      { who: "ai", t: "", text: ["（工具的回答，原文照录；工具步骤按原样列出）", "(The tool's reply as written; tool steps listed as they happened)"] },
    ];
    const rows = (upto != null ? all.slice(0, upto) : all).map((e, i) => entry(e, i, s)).join("");
    return `<ol class="ss-log" data-new="${esc(NEW_LOG())}" aria-label="${L("会话原文", "Conversation")}">${rows}</ol>`;
  }
  function hitCount(s) {
    const term = T(D.searchTerm);
    return (s.id === "s1" ? D.transcript : []).reduce((n, e) => n + (e.text && e.who !== "note" ? T(e.text).split(term).length - 1 : 0), 0);
  }
  function historyHeader(s) {
    const t = tool(s.tool);
    const resume = t.resume === "terminal"
      ? btn(L("在终端接着做", "Continue in terminal"), { icon: "terminal", attrs: 'data-act="noop"' })
      : btn(L(`在 ${T(t.name)} 里打开`, `Open in ${T(t.name)}`), { icon: "external", attrs: 'data-act="noop"' });
    const meta = [T(t.name), T(t.where), T(s.dir), L(`${s.turns} 条`, `${s.turns} entries`), T(s.when)].filter(Boolean).join(" · ");
    return `<header class="mw-frame__header"><div class="mw-frame__heading">${narrow() ? iconBtn(L("返回列表", "Back to list"), "chevron-left", 'data-act="back"', "ss-back") : ""}<h2>${T(s.title)}</h2><p>${meta}</p></div><div class="mw-frame__action ss-actions">${resume}</div></header>`;
  }
  function historyBody(s) {
    const hs = S.block === "history" ? st("history") : "normal";
    const t = tool(s.tool);
    const ro = `<p class="ss-readonly"><span>${ic("eye")}${L(`只读：查看和搜索不会让 ${T(t.name)} 运行，也不会发消息。`, `Read only: viewing and searching never runs ${T(t.name)} or sends anything.`)}</span>${s.forkOf ? `<span>${ic("git-branch")}${L(`从「${T(sess(s.forkOf).title)}」分叉出来的新会话`, `A new session forked from “${T(sess(s.forkOf).title)}”`)}</span>` : ""}</p>`;
    if (hs === "version") return `${ro}<div class="ss-center">${empty("circle-alert", L(`这一版 ${T(t.name)}（${t.ver}）的记录读不了`, `This version of ${T(t.name)} (${t.ver}) can't be read`), L(`它改了会话记录的格式，Molis Work 还没跟上。这不是没有历史：会话还在 ${T(t.name)} 里。`, `It changed its session format and Molis Work hasn't caught up. This is not “no history”: the session is still in ${T(t.name)}.`), `${btn(L(`在 ${T(t.name)} 里打开`, `Open in ${T(t.name)}`), { icon: "external", attrs: 'data-act="noop"' })}`, true)}</div>`;
    if (hs === "revoked") return `<div class="ss-center">${empty("eye-off", L(`你已停止读取 ${T(t.name)} 的会话`, `You stopped reading ${T(t.name)} sessions`), L(`之前读到的也不再显示。会话本身还在 ${T(t.name)} 里，没有被改动。`, `What was read before isn't shown either. The sessions themselves are untouched in ${T(t.name)}.`), btn(L("重新允许读取", "Allow reading again"), { attrs: 'data-act="sheet"' }))}</div>`;
    const live = s.running ? alert("info", L(`${T(t.name)} 正在这个会话里工作`, `${T(t.name)} is working in this session`), L("你看到的是 14:20 以前的内容；新内容读到就接在下面。", "You're seeing everything up to 14:20; new entries are appended as they're read."), "") : "";
    const searchRow = `<div class="ss-insearch">${search(hs === "search" ? T(D.searchTerm) : "", L("在这个会话里搜索", "Search this session"), 'data-field="hq"')}${hs === "search" ? `<span class="ss-hits">${L(`${hitCount(s)} 处`, `${hitCount(s)} matches`)}</span>${iconBtn(L("上一处", "Previous match"), "chevron-up")}${iconBtn(L("下一处", "Next match"), "chevron-down")}` : ""}</div>`;
    const earlier = hs === "long"
      ? `<div class="ss-earlier"><p class="mw-loading" role="status" data-cat="Loading">${L("正在读更早的 74 条…", "Loading 74 earlier entries…")}</p><span class="mw-skeleton" data-cat="Skeleton" style="width:62%"></span><span class="mw-skeleton" style="width:84%"></span><span class="mw-skeleton" style="width:48%"></span></div>`
      : s.id === "s1" ? `<div class="ss-earlier">${btn(L("读更早的 73 条", "Load 73 earlier entries"), { v: "ghost", icon: "chevron-up", attrs: 'data-act="noop"' })}</div>` : "";
    const failed = hs === "failed"
      ? `<div class="ss-fail">${empty("circle-alert", L("后面的读不到了", "The rest couldn't be read"), L("读到第 7 条时 Claude Code 的记录文件被占用。已读到的照常显示，不会当成整段会话。", "Claude Code's record file was locked at entry 7. What was read shows as usual and isn't treated as the whole session."), btn(L("重试", "Retry"), { icon: "refresh", attrs: 'data-act="noop"' }), true)}</div>` : "";
    const log = transcript(s, hs === "failed" ? 7 : null);
    const ho = opt("history");
    if (ho === "B" && s.id === "s1") {
      const outline = narrow()
        ? select(`aria-label="${L("跳到提问", "Jump to prompt")}"`, opts(D.outline.map((o) => [String(o.at), `${o.t} · ${T(o.text)}`]), "1"))
        : `<section class="mw-dir ss-outline" data-slot="directory" data-cat="Directory Panel"><div class="mw-dir__tools"><span class="mw-dir__label">${L("你的提问", "Your prompts")}</span></div><div class="mw-dir__body">${D.outline.map((o, i) => dirRow({ icon: "message", title: T(o.text), meta: o.t, current: i === 0, attrs: `data-jump="${o.at}"` })).join("")}</div></section>`;
      return `${ro}${ownershipLine(s)}${live}<div class="ss-two">${outline}<div class="ss-main">${searchRow}${earlier}${log}${failed}</div></div>`;
    }
    let points = "";
    if (ho === "C" && s.id === "s1") {
      const body = hs === "failed"
        ? alert("warning", L("要点没整理成", "Key points weren't made"), L("模型没有回应。原文都在下面，可以重试。", "The model didn't respond. The full conversation is below; retry any time."), btn(L("重试", "Retry"), { icon: "refresh", attrs: 'data-act="noop"' }))
        : `<div class="ss-points">${D.keyPoints.map((k) => `<section><h3>${T(k.name)}</h3><ul>${k.items.map(([txt, at]) => `<li>${T(txt)} ${btn(L(`第 ${at + 1} 条`, `Entry ${at + 1}`), { v: "link", attrs: `data-jump="${at}"` })}</li>`).join("")}</ul></section>`).join("")}</div><p class="ss-muted">${L("按 14:21 前的原文整理；之后又多了 1 条。AI 推断的不算你说的，可以纠正。", "Made from the conversation up to 14:21; 1 entry has arrived since. AI inferences aren't your words and can be corrected.")}</p>`;
      points = card(L("要点（AI 按原文整理）", "Key points (AI, from the conversation)"), "", `<div class="ss-card-acts">${btn(L("纠正", "Correct"), { v: "ghost", icon: "edit", attrs: 'data-act="noop"' })}${btn(L("按最新内容整理", "Update"), { v: "ghost", icon: "refresh", attrs: 'data-act="noop"' })}</div>`, body);
    }
    return `${ro}${ownershipLine(s)}${live}${points}${searchRow}${earlier}${log}${failed}`;
  }
  function detail() {
    if (S.view === "ai" && opt("permit") === "C") return permitFrame();
    if (S.src) return sourceDetail(S.src);
    const v = S.view === "sort" && (opt("owner") === "B" || opt("owner") === "C") && S.block !== "history";
    if (v) return `<section class="mw-frame" data-slot="frame" data-cat="Frame"><header class="mw-frame__header"><div class="mw-frame__heading">${narrow() ? iconBtn(L("返回列表", "Back to list"), "chevron-left", 'data-act="back"', "ss-back") : ""}<h2>${L("待归类", "To sort")}</h2><p>${L(`${sortCount()} 个会话等你确认归属`, `${sortCount()} sessions waiting for a project`)}</p></div></header><div class="mw-frame__panel">${opt("owner") === "B" ? sortQueueB() : sortQueueC()}</div></section>`;
    const d = discState();
    if (d === "first" || d === "empty") return `<section class="mw-frame" data-slot="frame" data-cat="Frame"><div class="mw-frame__panel"><div class="ss-center">${firstOrEmpty()}</div></div></section>`;
    if (S.block === "history" && st("history") === "gap") return sourceDetail("cursor");
    const list = found();
    let s = sess(S.sel);
    const revoked = S.block === "history" && st("history") === "revoked" && s && s.tool === "qwen";
    if (!revoked && (!s || !list.includes(s))) s = listed()[0] || list[0];
    if (!s) return `<section class="mw-frame" data-slot="frame"><div class="mw-frame__panel"></div></section>`;
    return `<section class="mw-frame" data-slot="frame" data-cat="Frame">${historyHeader(s)}<div class="mw-frame__panel ss-panel">${historyBody(s)}</div></section>`;
  }

  // ---------- Area 4 · Project AI reading ----------
  // One permit per project, off by default, set once, only by you. It lives in the reading scope; it never widens it.
  const PM_MOCK = ["agent", "scene", "scene-tools"];
  const pmState = () => (S.block === "permit" ? st("permit") : null);
  const pmSet = () => D.permitSets[({ agent: "base", scene: "base", "scene-tools": "base" })[pmState()] || pmState() || "base"];
  const pmProj = (id) => D.permitProjects.find((p) => p.id === id);
  const pmAll = () => { const ids = pmSet().ids; return ids ? ids.map(pmProj) : D.permitProjects; };
  const pmOn = (id) => !!S.pm[id];
  const pmCur = () => (S.cur ? pmProj(S.cur) : null);
  const pmCount = () => { const all = pmAll(); return [all.filter((p) => pmOn(p.id)).length, all.length]; };
  const noTools = () => ["tooloff", "scene-tools"].includes(pmState()) && !S.pmTools;
  const inMock = () => PM_MOCK.includes(pmState()) && !S.pmLeft;
  const pmBackLabel = () => (pmState() === "agent" ? L("回到对话", "Back to the conversation") : L("回到项目首页", "Back to project home"));
  const monogram = (p) => `<span class="project-monogram" aria-hidden="true" data-cat="Project monogram">${esc(Array.from(T(p.name))[0].toLocaleUpperCase())}</span>`;
  const NEW_PM = () => L("项目许可行：Setting Row 只有标题、说明和控件，放不下项目标识，也没有「保存中、已开、已关、没存上」这种写在行里的回执；这里的回执要说清后果，不能用一闪而过的 Toast",
    "Project permit row: a Setting Row has a title, a hint and a control, with no project mark and no in-row receipt for saving, on, off and failed. The receipt here explains consequences, so a passing Toast won't do");

  const pmTeamWhy = () => L("团队项目里不止你一个人，AI 读到的成员也可能看到，所以先不开放。你自己照常能看这些会话。", "A team project has other members who could see what its AI reads, so this isn't open yet. You can still view these sessions yourself.");
  // counts in sessions.scope.read@1: filed = ai_readable + reported + blocked. Tools never allowed have nothing indexed,
  // so they add to no count; blocked is only tools read and then stopped.
  const neverRead = () => pmState() === "scene-tools" && !S.pmTools;
  const pmFiled = (p) => (neverRead() ? 0 : p.n);
  const pmBlocked = (p) => (S.pmTools ? [] : p.blocked || []);
  const pmReadableN = (p) => p.n - (p.reported || 0) - pmBlocked(p).reduce((sum, x) => sum + x.n, 0);
  function pmMeta(p) {
    const n = pmFiled(p);
    if (p.team) return n ? L(`${p.dir} · ${n} 个会话`, `${p.dir} · ${n} sessions`) : p.dir;
    if (!n) return L(`${p.dir} · 还没有归到这里的会话`, `${p.dir} · no sessions here yet`);
    if (!pmOn(p.id)) return L(`${p.dir} · ${n} 个会话归到这里`, `${p.dir} · ${n} sessions here`);
    if (noTools()) return L(`${p.dir} · 开着，现在读不到`, `${p.dir} · on, nothing readable right now`);
    const blocked = pmBlocked(p); const parts = [];
    if (blocked.length) parts.push(L(`另 ${blocked.reduce((sum, x) => sum + x.n, 0)} 个在没允许的工具里（${blocked.map((x) => `${toolName(x.tool)} ${x.n}`).join("、")}）`, `${blocked.reduce((sum, x) => sum + x.n, 0)} more in tools that aren't allowed (${blocked.map((x) => `${toolName(x.tool)} ${x.n}`).join(", ")})`));
    if (p.reported) parts.push(L(`另 ${p.reported} 个是工具报的，你确认后才算`, `${p.reported} more reported by a tool, counted once you confirm`));
    if (parts.length) return L(`${p.dir} · AI 能读 ${pmReadableN(p)} 个；${parts.join("；")}`, `${p.dir} · AI can read ${pmReadableN(p)}; ${parts.join("; ")}`);
    return L(`${p.dir} · AI 能读这 ${n} 个会话`, `${p.dir} · AI can read these ${n} sessions`);
  }
  function pmNote(p) {
    const note = S.pmNote[p.id]; if (!note) return "";
    if (note.k === "saving") return `<p class="mw-loading" role="status">${L("正在保存…", "Saving…")}</p>`;
    if (note.k === "fail") return `${L(`没存上，${note.want ? "还是关着" : "还是开着"}。`, `Not saved; it's still ${note.want ? "off" : "on"}.`)}${btn(L("重试", "Retry"), { icon: "refresh", attrs: `data-pm-retry="${p.id}"` })}`;
    if (note.k === "on") return `${status(L("已开", "On"), "done", null, true)}<span>${noTools() ? L("允许工具之后就读得到。", "Readable once a tool is allowed.") : L("一直有效，随时可以在这里关。", "Stays on until you turn it off here.")}</span>`;
    return `${status(L("已关", "Off"), "quiet", null, true)}<span>${L("之前读到的不再给 AI，在跑的读取也会停下。已经写进回答的内容不会收回；你自己照常能看。", "What was read is no longer given to AI, and reads in progress stop. Text already in its replies isn't taken back; you can still see everything yourself.")}</span>`;
  }
  const pmSwitch = (p) => `<span class="mw-switch" data-slot="switch" data-cat="Switch"><input type="checkbox" role="switch" data-pm-switch="${p.id}"${pmOn(p.id) ? " checked" : ""} aria-label="${esc(L(`允许 ${T(p.name)} 的 AI 读这里的外部会话`, `Let ${T(p.name)}'s AI read external sessions here`))}" aria-describedby="pm-meta-${p.id}"><span class="mw-switch__track" aria-hidden="true"></span></span>`;
  const pmViewBtn = (p, label) => btn(label, { attrs: `data-pm-view="${p.id}"` });
  function pmEnd(p, readOnly) {
    if (p.team) return `${status(L("暂不开放", "Not open yet"), "quiet", null, true)}${p.n ? pmViewBtn(p, L("看这些会话", "View sessions")) : ""}`;
    if (readOnly) return `${status(pmOn(p.id) ? L("开着", "On") : L("关着", "Off"), pmOn(p.id) ? "done" : "quiet", null, true)}${btn(L("切过去", "Switch"), { attrs: `data-pm-go="${p.id}"` })}`;
    return pmSwitch(p);
  }
  const pmName = (p) => `<span class="ss-pm__name"><strong title="${esc(T(p.name))}">${T(p.name)}</strong>${p.id === S.cur ? badge(L("当前", "Current")) : ""}${p.team ? badge(L("团队", "Team")) : ""}</span>`;
  const pmLook = (p) => (p.id === S.pmTarget && pmFiled(p) && !p.team ? ` ${btn(L("看是哪些", "See which"), { v: "link", attrs: `data-pm-view="${p.id}"` })}` : "");
  function permitRow(p, { first = false, readOnly = false } = {}) {
    const n = S.pmNote[p.id];
    return `<div class="mw-setting ss-pm${p.team || readOnly ? " ss-pm--action" : ""}${p.id === S.pmTarget ? " is-target" : ""}${first ? "" : " rep"}" data-pm-row="${p.id}" data-cat="Setting Row" data-new="${esc(NEW_PM())}">
      <div>${monogram(p)}<div class="ss-pm__copy">${pmName(p)}<p class="ss-pm-meta" id="pm-meta-${p.id}">${pmMeta(p)}${pmLook(p)}</p><div class="ss-pm-note"${n ? ` data-kind="${n.k}"` : ""}>${pmNote(p)}</div></div></div>
      <div>${pmEnd(p, readOnly)}</div></div>`;
  }
  // Groups are taken when the list opens, so a row never jumps away from under the switch you just pressed.
  function pmGroups(list) {
    const groups = [];
    const cur = list.find((p) => p.id === S.cur && !p.team);
    const teams = list.filter((p) => p.team).sort((a, b) => (b.id === S.cur) - (a.id === S.cur));
    const team = teams.length ? [{ name: L("团队项目", "Team projects"), note: pmTeamWhy(), rows: teams }] : [];
    if (S.cur && pmProj(S.cur).team) groups.push(...team);
    if (cur) groups.push({ name: L("当前项目", "Current project"), rows: [cur] });
    const rest = list.filter((p) => !p.team && p !== cur);
    const on = rest.filter((p) => S.pmSnap[p.id]); const off = rest.filter((p) => !S.pmSnap[p.id]);
    if (on.length) groups.push({ name: L("开着", "On"), rows: on });
    if (off.length) groups.push({ name: cur || on.length ? L("关着", "Off") : L("项目", "Projects"), rows: off });
    if (!(S.cur && pmProj(S.cur).team)) groups.push(...team);
    return groups;
  }
  function pmListHtml() {
    const q = S.pmQ.trim().toLowerCase();
    const list = pmAll().filter((p) => !q || T(p.name).toLowerCase().includes(q));
    if (!list.length) return `<p class="ss-muted">${L("没有叫这个的项目。", "No project by that name.")}</p>`;
    let firstDone = false;
    return pmGroups(list).map((g) => `<section class="ss-pm-group"><h3>${g.name}</h3>${g.note ? `<p>${g.note}</p>` : ""}<div class="mw-settings" data-cat="Settings">${g.rows.map((p) => { const r = permitRow(p, { first: !firstDone }); firstDone = true; return r; }).join("")}</div></section>`).join("");
  }
  const pmNoToolsAlert = () => (noTools() ? alert("info", neverRead() ? L("还没允许读任何工具", "No tool is allowed yet") : L("现在没有允许读的工具", "No tool is allowed right now"), L("开着的项目现在也读不到：这个开关只决定项目的 AI 能不能用，不会多读任何工具。", "Projects that are on can't read anything yet: this switch decides whether a project's AI may use what's read, it never reads more tools."), btn(L("选择工具", "Choose tools"), { attrs: 'data-act="pmtools"' })) : "");
  const pmLeadText = () => `${L("开着时，这个项目的 AI（对话、工作流、生成页面）能读归到这个项目的外部会话，列表和原文都算。默认关着，开一次一直有效，只有你能改。待归类和别的项目的会话不给。", "When on, the project's AI (conversations, workflows, generated pages) can read the external sessions filed under it: the list and the text. Off by default, stays as you set it, and only you can change it. Unsorted sessions and other projects' sessions are never included.")}`;
  const pmLead = () => `<p class="ss-pm-lead">${pmLeadText()}</p>`;
  const pmMcp = () => `<p class="ss-muted">${L("MCP 客户端除了这里，还要在它自己的授权里单独允许。", "An MCP client also needs its own authorization on top of this.")}</p>`;
  const pmNoProjects = () => empty("folder", L("还没有项目", "No projects yet"), L("这个开关一项目一个，有了项目才会出现。你自己看外部会话不受影响。", "This switch comes one per project, so it appears once you have one. Viewing external sessions yourself isn't affected."), btn(L("管理项目", "Manage projects"), { attrs: 'data-act="noop"' }));
  const pmSearch = () => (pmAll().length > 8 ? `<div class="ss-pm-search">${search(S.pmQ, L("搜索项目", "Search projects"), 'data-field="pmq"')}</div>` : "");
  function pmPanelA() {
    if (!pmAll().length) return `<div class="ss-sheet-panel" role="tabpanel">${pmNoProjects()}</div>`;
    return `<div class="ss-sheet-panel" role="tabpanel">${pmLead()}${pmNoToolsAlert()}${pmSearch()}<div class="ss-pm-list" id="ss-pm-list">${pmListHtml()}</div>${pmMcp()}</div>`;
  }
  function pmPanelB() {
    const cur = pmCur();
    const others = pmAll().filter((p) => p !== cur);
    const [on] = pmCount();
    const q = S.pmQ.trim().toLowerCase();
    const head = cur
      ? `<section class="ss-pm-group"><h3>${L("这个项目的 AI", "This project's AI")}</h3>${cur.team ? `<p>${pmTeamWhy()}</p>` : ""}<div class="mw-settings" data-cat="Settings">${permitRow(cur, { first: true })}</div></section>`
      : `<section class="ss-pm-group"><h3>${L("这个项目的 AI", "This project's AI")}</h3>${pmNoProjects()}</section>`;
    const more = others.length ? `<details class="mw-disclosure ss-scope-more"${S.pmMoreOpen ? " open" : ""} data-pm-more><summary>${L(`其他项目 · ${others.length} 个，开着 ${on - (cur && pmOn(cur.id) ? 1 : 0)} 个`, `Other projects · ${others.length}, ${on - (cur && pmOn(cur.id) ? 1 : 0)} on`)}</summary>${pmAll().length > 8 ? pmSearch() : ""}<div class="mw-settings" data-cat="Settings" id="ss-pm-others">${others.filter((p) => !q || T(p.name).toLowerCase().includes(q)).map((p) => permitRow(p, { readOnly: true })).join("")}</div></details>` : "";
    return `${pmNoToolsAlert()}${pmLead()}${head}${toolsForm()}${more}${cur ? pmMcp() : ""}`;
  }
  function pmSummaryC() {
    const [on, all] = pmCount();
    return `<div class="mw-settings" data-cat="Settings"><div class="mw-setting"><div><strong>${L("项目的 AI", "Project AI")}</strong><p>${all ? L(`${all} 个项目里开着 ${on} 个`, `${on} of ${all} projects on`) : L("还没有项目", "No projects yet")}</p></div><div>${btn(L("管理", "Manage"), { attrs: 'data-act="pmmanage"' })}</div></div></div>`;
  }
  function pmTable() {
    const q = S.pmQ.trim().toLowerCase();
    const list = pmAll().filter((p) => !q || T(p.name).toLowerCase().includes(q));
    const rows = pmGroups(list).flatMap((g) => g.rows).map((p) => {
      const n = S.pmNote[p.id];
      return `<tr data-pm-row="${p.id}" data-pm-table="1"${p.id === S.pmTarget ? ' class="is-target"' : ""}><td><div class="ss-pm-cell">${monogram(p)}<div class="ss-pm__copy">${pmName(p)}<small class="ss-muted" id="pm-meta-${p.id}">${p.dir}</small><div class="ss-pm-note"${n ? ` data-kind="${n.k}"` : ""}>${pmNote(p)}</div></div></div></td><td class="is-num ss-pm-num">${pmFiled(p)}</td><td class="is-num ss-pm-num ss-pm-ok">${pmReadable(p)}</td><td><span class="ss-pm-end">${pmEnd(p)}</span></td></tr>`;
    }).join("");
    return `<div class="mw-dt ss-pm-table" data-cat="Data Table"><div class="mw-dt__bar"><div>${search(S.pmQ, L("搜索项目", "Search projects"), 'data-field="pmq"')}<span id="ss-pm-count">${pmCountLabel()}</span></div></div><div class="mw-dt__scroll"><table><thead><tr><th>${L("项目", "Project")}</th><th class="is-num">${L("归到这里", "Filed here")}</th><th class="is-num">${L("AI 现在读得到", "AI can read now")}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  const pmCountLabel = () => { const [on, all] = pmCount(); return L(`${all} 个里开着 ${on} 个`, `${on} of ${all} on`); };
  function pmReadable(p) {
    if (p.team || !pmOn(p.id)) return "—";
    if (noTools()) return "0";
    return String(pmReadableN(p));
  }
  function permitFrame() {
    const back = S.pmLeft ? btn(pmBackLabel(), { icon: "chevron-left", attrs: 'data-act="pmback"' }) : "";
    const mobileBack = narrow() && !S.pmLeft ? iconBtn(L("返回列表", "Back to list"), "chevron-left", 'data-act="back"', "ss-back") : "";
    const body = !pmAll().length ? `<div class="ss-center">${pmNoProjects()}</div>`
      : `<div class="ss-sheet-panel">${pmNoToolsAlert()}${pmLead()}${narrow() ? `${pmSearch()}<div class="ss-pm-list" id="ss-pm-list">${pmListHtml()}</div>` : `<div id="ss-pm-list">${pmTable()}</div>${pmAll().some((p) => p.team) ? `<p class="ss-muted">${pmTeamWhy()}</p>` : ""}`}${pmMcp()}</div>`;
    return `<section class="mw-frame" data-slot="frame" data-cat="Frame"><header class="mw-frame__header"><div class="mw-frame__heading">${mobileBack}<h2>${L("项目的 AI", "Project AI")}</h2><p>${L("读取范围的一部分", "Part of the reading scope")}</p></div>${back ? `<div class="mw-frame__action ss-actions">${back}</div>` : ""}</header><div class="mw-frame__panel">${body}</div></section>`;
  }

  // Where it's met first: a stopped AI step in a conversation, a scene card that isn't ready. Nothing here is a failure.
  function pmAskCard() {
    const p = pmCur();
    return alert("info", L(`${T(p.name)} 的 AI 还不能读外部会话`, `${T(p.name)}'s AI can't read external sessions yet`),
      L("这个开关默认关着，不是出错了。不开也能接着做，只是 AI 看不到你在别的工具里的记录。", "This switch is off by default; nothing went wrong. You can carry on without it, the AI just won't see your records from other tools."),
      `${btn(L("看看这个开关", "See this switch"), { attrs: 'data-act="pmopen"' })}${btn(L("这次不用", "Not this time"), { v: "ghost", attrs: 'data-act="pmlater"' })}`);
  }
  function mockAgent() {
    const p = pmCur(); const a = S.blockAnswer;
    const ai = who("ai", "AI", L("Molis 的 AI", "Molis AI"));
    const say = (text, cls = "") => `<li class="ss-turn${cls}" data-who="ai">${ai}<div><p class="ss-turn__head"><b>${L("助理", "Assistant")}</b></p><p>${text}</p></div></li>`;
    const step = (r) => `<li class="ss-step">${ic("history")}<span><b>${L("读外部会话", "Read external sessions")}</b></span><small>${r}</small></li>`;
    let tail;
    if (a === "retried") tail = step(L(`读到 ${p.n} 个，看最近 3 个`, `${p.n} found, reading the latest 3`)) + say(L("找到了。「统一输入的回执放进气泡里」停在 390 宽下按钮折行，我从这里接着做。", "Found it. “Move input receipts into the bubble” stopped at buttons wrapping at 390 wide; I'll pick up from there."), " ss-arrive");
    else if (a === "on") tail = `<li class="ss-arrive">${alert("success", L(`已开。${T(p.name)} 的 AI 能读这 ${p.n} 个会话了`, `On. ${T(p.name)}'s AI can read these ${p.n} sessions`), "", btn(L("让它再试一次", "Let it try again"), { attrs: 'data-act="pmagain" data-after-focus' }))}</li>`;
    else if (a === "later") tail = `<li class="ss-quiet-note ss-arrive" data-after-focus tabindex="-1">${L("这次不读。想开的时候在「读取范围 › 项目的 AI」。", "Not reading this time. It's in Reading scope › Project AI whenever you want it.")}</li>${say(L("好，我不看那些记录。说一下昨天做到哪了？", "All right, I'll leave those records alone. Where did yesterday's work stop?"), " ss-arrive")}`;
    else tail = `<li class="ss-arrive">${pmAskCard()}</li>`;
    return `<section class="mw-frame" data-slot="frame" data-cat="Frame"><header class="mw-frame__header"><div class="mw-frame__heading"><div class="ss-frame-mono">${monogram(p)}<h2>${L("接着做回执", "Continue the receipts")}</h2></div><p>${T(p.name)} · ${L("助理对话（示意）", "Assistant conversation (mock)")}</p></div></header><div class="mw-frame__panel ss-panel"><ol class="ss-log" aria-label="${L("对话", "Conversation")}">
      <li class="ss-turn" data-who="you">${who("person", L("你", "Y"), L("你（人）", "You (person)"))}<div><p class="ss-turn__head"><b>${L("你", "You")}</b></p><p>${L("接着我昨天在 Claude Code 里改回执那件事。", "Carry on with the receipts work I did in Claude Code yesterday.")}</p></div></li>
      ${say(L("我先看看这个项目在别的工具里的记录。", "Let me check this project's records from other tools first."))}
      ${a === "retried" ? "" : step(L("这个项目没开", "Not on for this project"))}${tail}</ol></div></section>`;
  }
  function mockScene() {
    const p = pmCur();
    const toolsGate = noTools();
    const ready = !toolsGate && pmOn(p.id);
    const gate = (title, body, acts) => `<div class="ss-gate" data-after-focus-wrap>${status(L("未就绪", "Not ready"), "quiet", null, true)}<p><b>${title}</b></p><p class="ss-muted">${body}</p><div class="mw-ix-actions">${acts}</div></div>`;
    const recent = ready ? `<ul class="mw-items">${D.recentForScene.map((id) => { const s = sess(id); return item(mark(toolIcon(s.tool)), T(s.title), `${toolName(s.tool)} · ${T(s.when)}`, "", 'style="animation:ss-rise var(--dur-arrive) var(--ease-quint) both"'); }).join("")}</ul>`
      : toolsGate ? gate(L("还没允许读任何工具", "No tool is allowed yet"), L("这张卡要列出别的工具里的最近会话，先选要读哪些工具。", "This card lists recent sessions from other tools. Choose which tools may be read first."), btn(L("选择工具", "Choose tools"), { attrs: 'data-act="pmopentools"' }))
      : S.blockAnswer === "later" ? gate(L("这个项目的 AI 不读外部会话", "This project's AI doesn't read external sessions"), L("你选了先不用，这张卡先空着。", "You chose not to for now, so this card stays empty."), btn(L("看看这个开关", "See this switch"), { attrs: 'data-act="pmopen"' }))
      : gate(L(`${T(p.name)} 的 AI 还不能读外部会话`, `${T(p.name)}'s AI can't read external sessions yet`), L("这个开关默认关着，不是出错了。不开，其他卡片不受影响。", "This switch is off by default; nothing went wrong. Other cards work either way."), `${btn(L("看看这个开关", "See this switch"), { attrs: 'data-act="pmopen"' })}${btn(L("先不用", "Not now"), { v: "ghost", attrs: 'data-act="pmlater"' })}`);
    return `<section class="mw-frame" data-slot="frame" data-cat="Frame"><header class="mw-frame__header"><div class="mw-frame__heading"><div class="ss-frame-mono">${monogram(p)}<h2>${T(p.name)}</h2></div><p>${L("项目首页的场景（示意）", "Scene on project home (mock)")}</p></div></header><div class="mw-frame__panel"><div class="ss-scene">
      ${card(L("最近会话", "Recent sessions"), "", "", recent)}
      ${card(L("进行中的 Goal", "Goals in progress"), "", "", `<p>${L("3 个进行中，1 个等你确认。", "3 in progress, 1 waiting for you.")}</p>`)}
      ${card(L("最近的成果", "Latest results"), "", "", `<p>${L("回执定样 v3 · 今天 13:25", "Receipt sample v3 · Today 13:25")}</p>`)}</div></div></section>`;
  }

  // In-place updates: a switch is never re-created, so its thumb travels and focus stays where it is.
  function pmPatchRow(id) {
    const p = pmProj(id);
    app.querySelectorAll(`[data-pm-row="${id}"]`).forEach((row) => {
      const note = row.querySelector(".ss-pm-note"); const n = S.pmNote[id];
      note.innerHTML = pmNote(p);
      if (n) note.dataset.kind = n.k; else delete note.dataset.kind;
      note.style.animation = "none"; void note.offsetWidth; note.style.animation = "";
      if (row.dataset.pmTable) { row.querySelector(".ss-pm-ok").textContent = pmReadable(p); return; }
      row.querySelector(".ss-pm-meta").innerHTML = `${pmMeta(p)}${pmLook(p)}`;
    });
    const tabCount = app.querySelector("[data-pm-tabcount]"); if (tabCount) tabCount.textContent = pmTabCount();
    const count = app.querySelector("#ss-pm-count"); if (count) count.textContent = pmCountLabel();
  }
  const pmTabCount = () => { const [on, all] = pmCount(); return all > 1 ? `${on}/${all}` : ""; };
  function pmSave(id, want) {
    const input = app.querySelector(`[data-pm-switch="${id}"]`);
    if (input) { input.checked = want; input.setAttribute("aria-busy", "true"); }
    S.pmNote[id] = { k: "saving", want }; pmPatchRow(id);
    setTimeout(() => {
      const el = app.querySelector(`[data-pm-switch="${id}"]`);
      if (el) el.removeAttribute("aria-busy");
      if (pmState() === "fail" && S.failLeft > 0) {
        S.failLeft -= 1; S.pmNote[id] = { k: "fail", want };
        if (el) el.checked = !want;
        pmPatchRow(id); announce(L("没存上，可以重试", "Not saved; you can retry"));
        return;
      }
      const hadFocus = document.activeElement && document.activeElement.closest(`[data-pm-row="${id}"]`);
      S.pm[id] = want; S.pmNote[id] = { k: want ? "on" : "off", want };
      if (want && inMock() && id === S.cur) S.blockAnswer = "on";
      pmPatchRow(id);
      if (hadFocus && el && !document.activeElement.closest(`[data-pm-row="${id}"]`)) el.focus();
      announce(want ? L(`已开 ${T(pmProj(id).name)}`, `${T(pmProj(id).name)} on`) : L(`已关 ${T(pmProj(id).name)}`, `${T(pmProj(id).name)} off`));
      save();
    }, 480);
  }

  // ---------- Reading scope (the one place that grants reading) ----------
  function toolsForm() {
    const detected = D.tools;
    const none = noTools();
    return `<fieldset class="mw-check-group" data-slot="checkbox-group" data-cat="Checkbox Group"><legend>${L("这台 Mac 上找到的工具", "Tools found on this Mac")}</legend>
          ${detected.map((t) => `<label class="mw-check-row ss-check"><input class="mw-check" data-slot="checkbox" type="checkbox"${t.gap ? " disabled" : !none && ["claude", "codex", "kimi"].includes(t.id) ? " checked" : ""}><span><strong>${T(t.name)}</strong><small>${t.gap ? L("暂不支持自动发现：没有公开的读取方式", "Not supported yet: no public way to read") : t.kind === "cloud" ? L("云端：需要登录你的账号", "Cloud: needs your account sign-in") : `${T(t.where)}${t.ver ? ` · ${t.ver}` : ""}`}</small></span></label>`).join("")}</fieldset>
          <fieldset class="mw-radio-group" data-slot="radio-group" data-cat="Radio Group" role="radiogroup"><legend>${L("读哪些目录里的会话", "Sessions from which folders")}</legend>
            <label class="mw-check-row"><input class="mw-radio" data-slot="radio" type="radio" name="ss-scope" checked><span>${L("所有目录", "All folders")}</span></label>
            <label class="mw-check-row ss-check"><input class="mw-radio" data-slot="radio" type="radio" name="ss-scope"><span class="ss-radio-copy"><span>${L("只读项目连着的目录：~/code/goalboard、~/code/site", "Only folders linked to projects: ~/code/goalboard, ~/code/site")}</span><small>${L("包含这些目录的子目录，和这些项目的 git worktree。已删或认不出的 worktree、没有目录的云端会话不在内，要选「所有目录」才看得到。", "Includes their subfolders and these projects' git worktrees. Deleted or unrecognised worktrees and cloud sessions without a folder are left out; choose “All folders” to see them.")}</small></span></label></fieldset>
          <p class="ss-muted">${L("收窄或停止后，范围外的会话和历史立刻不再显示；原工具里的记录不受影响。", "When narrowed or stopped, sessions outside the scope disappear at once; records in the tools are untouched.")}</p>`;
  }
  function sheetTabs() {
    const tab = (id, label, count = "") => `<button type="button" class="mw-tabs__tab${S.sheetTab === id ? " is-active" : ""}" role="tab" aria-selected="${S.sheetTab === id}" tabindex="${S.sheetTab === id ? 0 : -1}" data-sheet-tab="${id}">${label}${id === "projects" ? `<b data-pm-tabcount>${count}</b>` : ""}</button>`;
    return `<div class="mw-tabs ss-sheet-tabs" data-slot="tabs" data-cat="Tabs"><div class="mw-tabs__list" role="tablist" aria-label="${L("读取范围", "Reading scope")}">${tab("tools", L("工具与目录", "Tools and folders"))}${tab("projects", L("项目的 AI", "Project AI"), pmTabCount())}</div></div>`;
  }
  function sheetInner() {
    const o = opt("permit");
    const projects = o === "A" && S.sheetTab === "projects";
    const intro = L("只读：找出已有会话、看历史和搜索。不会让这些工具运行、发消息或改文件；以后要接着做或交接，另外问你。", "Read only: find existing sessions, view and search history. These tools are never run, sent messages or have files changed; continuing or handing over asks you separately.");
    const body = o === "A" ? (projects ? pmPanelA() : `<div class="ss-sheet-panel" role="tabpanel"><p class="ss-pm-lead">${intro}</p>${toolsForm()}</div>`)
      : o === "B" ? `<div class="ss-sheet-panel">${pmPanelB()}</div>`
      : `<div class="ss-sheet-panel">${toolsForm()}${pmSummaryC()}</div>`;
    const foot = projects ? btn(S.fromBlock ? pmBackLabel() : L("完成", "Done"), { v: "primary", attrs: 'data-act="sheetx"' })
      : `${btn(L("取消", "Cancel"), { attrs: 'data-act="sheetx"' })}${btn(L("允许并开始读取", "Allow and start reading"), { v: "primary", attrs: 'data-act="sheetok"' })}`;
    return `<form method="dialog" class="mw-form mw-sheet__shell">
        <header class="mw-form__header"><div><h2 id="ss-sheet-title" tabindex="-1" autofocus>${L("读取范围", "Reading scope")}</h2>${o === "A" ? "" : `<p>${intro}</p>`}</div>${iconBtn(L("关闭", "Close"), "x", 'data-act="sheetx"', "mw-dialog__close")}</header>
        ${o === "A" ? sheetTabs() : ""}
        <div class="mw-form__body">${body}</div>
        <footer class="mw-form__footer">${foot}</footer>
      </form>`;
  }
  const sheet = () => `<dialog class="mw-sheet" data-slot="sheet" data-cat="Sheet" aria-labelledby="ss-sheet-title" data-ss-dialog="sheet">${sheetInner()}</dialog>`;
  // Redraw inside the open Sheet without closing it; the review strip rides along in the top layer.
  function patchSheet(focusSel) {
    const dlg = app.querySelector("dialog[data-ss-dialog=sheet]"); if (!dlg) { render(); return; }
    const form = dlg.querySelector("form"); const tmp = document.createElement("div"); tmp.innerHTML = sheetInner();
    form.replaceWith(tmp.firstElementChild);
    if (focusSel) { const el = dlg.querySelector(focusSel); if (el) el.focus(); }
    save();
  }

  // ---------- Page ----------
  const stripEl = document.querySelector(".proto");
  let focusAfter = null; let stripTimer = 0;
  // A modal dialog makes the page inert, so the review strip moves into it to stay usable. Not part of the product.
  function dockStrip(dlg, wait) {
    clearTimeout(stripTimer);
    const put = () => { if (dlg.isConnected && dlg.open) { document.documentElement.style.setProperty("--proto-h", `${stripEl.offsetHeight}px`); dlg.append(stripEl); } };
    if (wait && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) stripTimer = setTimeout(put, 270); else put();
  }
  function render() {
    const wasOpen = !!app.querySelector("dialog[data-ss-dialog=sheet][open]");
    if (stripEl.parentElement !== document.body) document.body.insertBefore(stripEl, app);
    strip();
    const o = opt("discover");
    const three = o === "C" && S.block === "discover" && !narrow();
    const narrowScope = discState() === "narrowed" ? `<div class="ss-banner">${alert("info", L("只读项目连着的 2 个目录", "Reading only the 2 project folders"), L("范围外的 23 个会话不显示；原工具里的记录不受影响。", "23 sessions outside the scope are hidden; records in the tools are untouched."), btn(L("调整读取范围", "Adjust reading scope"), { attrs: 'data-act="sheet"' }))}</div>` : "";
    const mobileDetail = narrow() && (S.mDetail || S.src);
    const work = inMock()
      ? `<div class="ss-mock">${pmState() === "agent" ? mockAgent() : mockScene()}</div>`
      : `${toolbar()}${narrowScope}${S.block === "discover" || o === "B" ? discoveryBanner() : ""}
        <div class="ss-split">${three ? sourcesPanel() : ""}${listPanel()}<div class="ss-detail">${detail()}</div></div>`;
    app.innerHTML = `<div class="mw-layout-primitives ss-shell${three ? " ss-shell--three" : ""}${mobileDetail ? " ss-shell--detail" : ""}">
      ${rail()}
      <div class="ss-work">${work}</div></div>${S.sheet ? sheet() : ""}${S.move ? moveDialog() : ""}`;
    const dlg = app.querySelector("dialog[data-ss-dialog]");
    if (dlg && !dlg.open) {
      if (wasOpen) dlg.classList.add("ss-still");
      dlg.showModal();
      if (dlg.dataset.ssDialog === "sheet") dockStrip(dlg, !wasOpen);
    }
    if (focusAfter) { const el = app.querySelector(focusAfter); if (el) el.focus(); focusAfter = null; }
    save();
  }
  function announce(msg) { const live = document.getElementById("live"); live.textContent = ""; setTimeout(() => { live.textContent = msg; }, 30); }

  // When a state is picked, put the page where that state shows.
  function applyState() {
    const b = S.block, s = st(b);
    S.src = null; S.q = ""; S.tool = "all"; S.sheet = false; S.fromBlock = false; S.pmTarget = null; S.pmQ = ""; S.picks = {};
    arriveRun += 1;
    S.pmNote = {}; S.pmLeft = false; S.pmTools = false; S.blockAnswer = null; S.failLeft = 1; S.pmMoreOpen = s === "many";
    S.pm = Object.fromEntries(pmSet().on.map((id) => [id, true])); S.pmSnap = { ...S.pm };
    S.cur = b === "permit" && s === "none" ? null : b === "permit" && s === "team" ? "clinic" : "molis";
    if (b === "discover") { S.view = "all"; if (s === "mixed" && opt("discover") !== "B") S.src = "amp"; }
    if (b === "owner") {
      S.decided = {};
      if (s === "changed") { S.view = "all"; S.sel = "s4"; }
      else if (s === "tool") { S.view = "all"; S.sel = "s12"; }
      else if (opt("owner") === "A") { S.view = "sort"; S.sel = "s4"; }
      else S.view = "sort";
    }
    if (b === "history") { S.view = "all"; S.sel = ({ version: "s10", revoked: "s3" })[s] || "s1"; }
    S.mDetail = narrow() && (b !== "discover") && !(b === "owner" && s === "tool");
    if (b === "owner" && s === "arriving") startArriving();
    if (b === "permit") {
      S.view = "all";
      if (!PM_MOCK.includes(s)) {
        if (opt("permit") === "C") { S.view = "ai"; S.mDetail = true; }
        else { S.sheet = true; S.sheetTab = "projects"; }
      }
      if (s === "fail") focusAfter = '[data-pm-switch="molis"]';
    }
  }
  // Open the switch from where it stopped you: the Sheet lands on this project; in C the page itself has to change.
  function pmOpen() {
    S.fromBlock = true; S.pmTarget = S.cur; S.pmSnap = { ...S.pm };
    if (opt("permit") === "C") { S.pmLeft = true; S.view = "ai"; S.mDetail = true; }
    else { S.sheet = true; S.sheetTab = "projects"; }
    focusAfter = `[data-pm-switch="${S.cur}"]`;
  }
  function closeSheet() {
    S.sheet = false;
    if (inMock()) { if (pmOn(S.cur) && !S.blockAnswer) S.blockAnswer = "on"; focusAfter = '[data-after-focus], [data-act="pmopen"], [data-act="pmopentools"]'; }
    else focusAfter = '.ss-toolbar [data-act="sheet"]';
  }

  document.getElementById("block").addEventListener("change", (e) => { S.block = e.target.value; applyState(); render(); });
  document.getElementById("opt").addEventListener("change", (e) => { S.opt[S.block] = e.target.value; applyState(); render(); });
  document.getElementById("state").addEventListener("change", (e) => { S.state[S.block] = e.target.value; applyState(); render(); });
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; render(); } });
  document.getElementById("cat").addEventListener("click", () => { S.cat = !S.cat; render(); });
  document.getElementById("reset").addEventListener("click", () => { S = { ...fresh(), lang: S.lang, theme: S.theme }; applyState(); render(); });
  let lastNarrow = narrow();
  window.addEventListener("resize", () => { if (narrow() !== lastNarrow) { lastNarrow = narrow(); render(); } });

  function pickedProject(sid) { const el = app.querySelector(`[data-pick="${sid}"]`); return el ? el.value : ""; }
  app.addEventListener("click", (e) => {
    const t = e.target;
    const sel = t.closest("[data-sel]"); if (sel) { S.sel = sel.dataset.sel; S.src = null; if (S.view === "sort" && opt("owner") !== "A") S.view = "all"; S.mDetail = true; render(); return; }
    const src = t.closest("[data-src]"); if (src) { S.src = src.dataset.src; S.mDetail = true; render(); return; }
    const tl = t.closest("[data-tool]"); if (tl) { S.tool = tl.dataset.tool; S.src = null; render(); return; }
    const v = t.closest("[data-view]"); if (v) { S.view = v.dataset.view; S.src = null; S.mDetail = narrow() && (S.view === "ai" || (S.view === "sort" && opt("owner") !== "A")); render(); return; }
    const dec = t.closest("[data-decide]"); if (dec) { const [sid, p] = dec.dataset.decide.split(":"); S.decided[sid] = p; announce(p === "skip" ? L("先不归", "Left unsorted") : L(`已归到 ${T(proj(p).name)}`, `Moved to ${T(proj(p).name)}`)); render(); return; }
    const cf = t.closest("[data-confirm]"); if (cf) { const sid = cf.dataset.confirm; const p = pickedProject(sid); if (!p) { announce(L("先选一个项目", "Choose a project first")); return; } S.decided[sid] = p; announce(L("已确认", "Confirmed")); render(); return; }
    const gr = t.closest("[data-group]"); if (gr) {
      const k = gr.dataset.group; const target = k === "molis" || k === "site" ? k : (app.querySelector(`[data-gproj="${k}"]`) || {}).value;
      if (!target) { announce(L("先选一个项目", "Choose a project first")); return; }
      app.querySelectorAll("[data-gpick]").forEach((c) => { if (c.checked && c.closest(".mw-card") === gr.closest(".mw-card")) S.decided[c.dataset.gpick] = target; });
      render(); return;
    }
    const gs = t.closest("[data-groupskip]"); if (gs) { app.querySelectorAll("[data-gpick]").forEach((c) => { if (c.checked && c.closest(".mw-card") === gs.closest(".mw-card")) S.decided[c.dataset.gpick] = "skip"; }); render(); return; }
    const mv = t.closest("[data-move]"); if (mv) { S.move = mv.dataset.move; render(); return; }
    const j = t.closest("[data-jump]"); if (j) { const li = app.querySelector(`.ss-log [data-i="${j.dataset.jump}"]`); if (li) { li.scrollIntoView({ block: "center", behavior: "smooth" }); li.classList.add("is-focus"); setTimeout(() => li.classList.remove("is-focus"), 1200); } return; }
    const tab = t.closest("[data-sheet-tab]"); if (tab) { S.sheetTab = tab.dataset.sheetTab; patchSheet(`[data-sheet-tab="${S.sheetTab}"]`); return; }
    const pv = t.closest("[data-pm-view]"); if (pv) {
      e.preventDefault();
      const id = pv.dataset.pmView; S.sheet = false; S.pmLeft = true; S.src = null; S.view = id === "molis" ? "molis" : "all"; S.mDetail = false;
      if (id !== "molis") announce(L("原型只接了 Molis Work 的筛选", "The prototype only filters Molis Work"));
      render(); return;
    }
    const go = t.closest("[data-pm-go]"); if (go) { e.preventDefault(); S.cur = go.dataset.pmGo; S.pmTarget = S.cur; S.pmQ = ""; S.pmSnap = { ...S.pm }; patchSheet(`[data-pm-row="${S.cur}"] input, [data-pm-row="${S.cur}"] button`); announce(L(`已切到 ${T(pmCur().name)}`, `Switched to ${T(pmCur().name)}`)); return; }
    const rt = t.closest("[data-pm-retry]"); if (rt) { e.preventDefault(); const id = rt.dataset.pmRetry; const want = S.pmNote[id].want; const sw = app.querySelector(`[data-pm-switch="${id}"]`); if (sw) sw.focus(); pmSave(id, want); return; }
    const a = t.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "sheet") { S.sheet = true; S.sheetTab = "tools"; S.pmSnap = { ...S.pm }; }
    else if (act === "sheetx") { e.preventDefault(); closeSheet(); }
    else if (act === "sheetok" && S.block === "permit") {
      e.preventDefault(); S.pmTools = true; announce(L("已允许读取", "Reading allowed"));
      if (inMock() || opt("permit") === "C") { closeSheet(); render(); return; }
      S.sheetTab = "projects"; patchSheet(opt("permit") === "A" ? '[data-sheet-tab="projects"]' : null); return;
    }
    else if (act === "pmopen") pmOpen();
    else if (act === "pmopentools") { S.fromBlock = true; S.sheet = true; S.sheetTab = "tools"; }
    else if (act === "pmlater") { S.blockAnswer = "later"; focusAfter = "[data-after-focus], [data-act=pmopen]"; }
    else if (act === "pmagain") { S.blockAnswer = "retried"; }
    else if (act === "pmback") { S.pmLeft = false; S.view = "all"; S.mDetail = false; if (pmOn(S.cur) && !S.blockAnswer) S.blockAnswer = "on"; focusAfter = '[data-after-focus], [data-act="pmopen"]'; }
    else if (act === "pmmanage") { e.preventDefault(); S.sheet = false; S.view = "ai"; S.mDetail = true; }
    else if (act === "pmtools") {
      e.preventDefault();
      if (opt("permit") === "A") { S.sheetTab = "tools"; patchSheet('[data-sheet-tab="tools"]'); return; }
      if (opt("permit") === "B") { const c = app.querySelector("dialog .mw-check:not(:disabled)"); if (c) { c.scrollIntoView({ block: "center" }); c.focus(); } return; }
      S.sheet = true; S.sheetTab = "tools";
    }
    else if (act === "sheetok") { e.preventDefault(); S.sheet = false; S.block = "discover"; S.state.discover = "reading"; applyState(); announce(L("开始读取", "Reading started")); render(); setTimeout(() => { if (S.block === "discover" && S.state.discover === "reading") { S.state.discover = "done"; render(); } }, 2400); return; }
    else if (act === "movex") { e.preventDefault(); S.move = null; }
    else if (act === "moveok") { e.preventDefault(); const p = document.getElementById("moveTo").value; if (p) S.decided[S.move] = p; S.move = null; announce(L("已改归属", "Project changed")); }
    else if (act === "srcOpen") S.srcOpen = !S.srcOpen;
    else if (act === "back") { S.mDetail = false; S.src = null; }
    else if (act === "clear") { S.q = ""; S.tool = "all"; S.view = "all"; }
    else if (act === "retry") { announce(L("重新读取", "Retrying")); return; }
    else if (act === "login" || act === "noop") return;
    else return;
    render();
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.field === "tool") { S.tool = t.value; render(); }
    if (t.dataset.pmSwitch) pmSave(t.dataset.pmSwitch, t.checked);
    if (t.dataset.pick) {
      S.picks[t.dataset.pick] = t.value;
      const c = app.querySelector(`[data-confirm="${t.dataset.pick}"]`); if (c && arriving()) c.disabled = !t.value;
      const slot = app.querySelector(`[data-sugg="${t.dataset.pick}"]`); const s = sess(t.dataset.pick); if (slot && arriving() && !suggWaiting(s)) slot.innerHTML = suggBody(s);
    }
  });
  app.addEventListener("toggle", (e) => { if (e.target.matches("[data-pm-more]")) S.pmMoreOpen = e.target.open; }, true);
  app.addEventListener("keydown", (e) => {
    const tab = e.target.closest("[data-sheet-tab]");
    if (tab && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); S.sheetTab = S.sheetTab === "tools" ? "projects" : "tools"; patchSheet(`[data-sheet-tab="${S.sheetTab}"]`); }
  });
  app.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.field === "q") { S.q = t.value; const pos = t.selectionStart; render(); const n = app.querySelector('[data-field="q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
    if (t.dataset.field === "pmq") {
      S.pmQ = t.value;
      const list = app.querySelector("#ss-pm-list"); const others = app.querySelector("#ss-pm-others");
      if (others) { const q = S.pmQ.trim().toLowerCase(); others.innerHTML = pmAll().filter((p) => p !== pmCur() && (!q || T(p.name).toLowerCase().includes(q))).map((p) => permitRow(p, { readOnly: true })).join(""); }
      else if (list && list.querySelector(".ss-pm-table")) list.querySelector("tbody").outerHTML = new DOMParser().parseFromString(pmTable(), "text/html").querySelector("tbody").outerHTML;
      else if (list) list.innerHTML = pmListHtml();
    }
  });
  app.addEventListener("cancel", (e) => { if (e.target.matches("[data-ss-dialog]")) { e.preventDefault(); if (S.sheet) closeSheet(); S.move = null; render(); } }, true);

  if (S.block === "permit" || (S.block === "owner" && st("owner") === "arriving")) applyState();
  render();
})();
