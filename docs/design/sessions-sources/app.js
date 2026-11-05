// 22 · External sessions: discovery, project suggestions and history, each with 2-3 options and their normal and
// failure states. Built on the component board's real parts: markup mirrors the mw-* renderers in
// packages/plugin-sdk/src/ui and packages/design-system/src/primitives, the shell is the board's "栏与内容框"
// (rail + directory sidebar + frame, scoped by .mw-layout-primitives), styles come from mw.css (a snapshot of the board).
// Sample data only (data.js). Nothing reads a tool, a Home or the disk; no tool is started.
(() => {
  const D = window.protoData;
  document.getElementById("icons").innerHTML = window.mwSprite;
  const app = document.getElementById("app");
  const KEY = "molis-proto.sessions-sources.v1";

  const fresh = () => ({
    block: "discover", opt: { discover: "B", owner: "B", history: "A" },
    state: { discover: "reading", owner: "pending", history: "normal" },
    lang: "zh", theme: "light", cat: false,
    sel: "s1", src: null, view: "all", tool: "all", q: "", mDetail: false, srcOpen: false,
    decided: {}, sheet: false, move: null, kpFix: false,
  });
  let S = load();
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.v === 1) return { ...fresh(), ...v.s, sheet: false, move: null }; } catch { /* preview without storage */ }
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
  const dirRow = ({ icon, title, meta, count, stat, current, attrs = "" }) =>
    `<button type="button" title="${esc(title)}" class="mw-dir-row mw-dir-row--meta directory-list-row${current ? " is-selected" : ""}" data-slot="directory-row" data-cat="Directory Row"${current ? ' aria-current="page"' : ""} ${attrs}><span class="mw-dir-row__icon">${ic(icon)}</span><span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>${title}</strong>${count != null ? `<span class="mw-dir-row__count">${count}</span>` : ""}${stat || ""}</span>${meta ? `<small>${meta}</small>` : ""}</span></button>`;
  const dirHeading = (text) => `<h2 class="mw-dir__heading" data-slot="directory-heading">${text}</h2>`;
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
  function found() {
    const d = discState();
    return D.sessions.filter((s) => {
      const [code] = srcState(s.tool);
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
    const items = [["target", "Goals"], ["note", "Pages"], ["code", "Coding"], ["history", L("外部会话", "External sessions"), true]];
    return `<aside class="mw-sidebar mw-sidebar--rail" data-slot="sidebar" data-cat="Sidebar"><div class="mw-sidebar__body mw-scroll">${items.map(([i, n, cur]) =>
      `<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon mw-btn--icon-only" data-slot="button" aria-label="${esc(n)}"${cur ? ' aria-current="page"' : ""} title="${esc(n)}">${ic(i)}<span class="mw-sr-only">${n}</span></button>`).join("")}</div></aside>`;
  }
  function toolbar() {
    const viewOpts = [["all", L("全部", "All")], ["molis", "Molis Work"], ["sort", L(`待归类 ${sortCount()}`, `To sort ${sortCount()}`)]];
    const toolSel = opt("discover") === "B" || (opt("discover") === "C" && narrow())
      ? select(`data-field="tool" aria-label="${L("工具", "Tool")}"`, opts([["all", L("全部工具", "All tools")], ...D.tools.filter((t) => !t.gap).map((t) => [t.id, T(t.name)])], S.tool)) : "";
    return `<div class="mw-toolbar ss-toolbar" data-slot="toolbar" role="toolbar" data-cat="Toolbar">
      <div class="ss-search">${search(S.q, L("搜索会话标题", "Search session titles"), 'data-field="q"')}</div>
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
    return dirRow({ icon: s.forkOf ? "git-branch" : toolIcon(s.tool), title: T(s.title), meta, stat, current: S.sel === s.id && !S.src, attrs: `data-sel="${s.id}"` });
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
      : `<p class="ss-lead">${L("这些会话的目录没有唯一连着一个项目。你确认之前它们不归进任何项目，照样能看历史；确认只改这一个会话，不改目录和项目的关系，也不搬文件。", "These sessions' folders aren't linked to exactly one project. Until you confirm they belong to none and stay readable. Confirming changes just this session—not the folder's link, and no files move.")}</p>`;
  }
  function sortQueueB() {
    const list = found().filter(pending);
    if (!list.length) return `<div class="ss-center">${empty("check", L("没有待归类的会话", "Nothing to sort"), L("每个会话都有了归属，或者你选了不归到项目。以后新发现的、目录关系不明确的会出现在这里。", "Every session has a project or you chose none. Newly found sessions with unclear folders show up here."))}</div>`;
    return `${sortIntro()}<div class="ss-cards">${list.map((s) => {
      const g = suggestionFor(s); const t = tool(s.tool);
      const head = `<div class="ss-card-who">${mark(toolIcon(s.tool))}<span><strong>${T(s.title)}</strong><small>${T(t.name)} · ${T(s.dir)} · ${T(s.when)}</small></span></div>`;
      const pick = select(`data-pick="${s.id}" aria-label="${L("选择项目", "Choose a project")}"`, projOpts(g && g.kind === "suggest" ? g.to : ""));
      const body = !g ? `<p class="ss-muted">${L("没有建议。自己选一个，或先不归。", "No suggestion. Pick one or leave it for now.")}</p>`
        : g.kind === "none" ? `<p><b>${L("AI 没找到合适的项目", "No fitting project")}</b> ${T(g.reason)}</p>${evidence(g)}`
        : `<p><b>${L(`建议：${T(proj(g.to).name)}`, `Suggested: ${T(proj(g.to).name)}`)}</b> ${T(g.reason)}</p>${evidence(g)}`;
      const acts = `<div class="mw-ix-actions">${pick}${btn(L("确认", "Confirm"), { v: "primary", attrs: `data-confirm="${s.id}"` })}${btn(L("先不归", "Not now"), { v: "ghost", attrs: `data-decide="${s.id}:skip"` })}${btn(L("看历史", "View history"), { v: "ghost", attrs: `data-sel="${s.id}"` })}</div>`;
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
    const basis = o === "skip" ? L("你选了不归到项目", "You chose no project")
      : S.decided[s.id] !== undefined ? L("你刚确认的", "You just confirmed it")
      : s.how === "dir" ? L(`依据：目录 ${s.dir} 只连着这个项目`, `Because folder ${s.dir} is linked only to this project`)
      : s.how === "manual" ? L(`你在 11 月 1 日指定；目录连着官网改版，不改你的指定`, `You picked it on Nov 1; the folder is linked to Website redesign, your pick stays`)
      : L("按 AI 建议确认", "Confirmed from the AI suggestion");
    return `<p class="ss-owner">${ic("folder")}<b>${o === "skip" ? L("不归到项目", "No project") : T(proj(o).name)}</b><span>${basis}</span>${changeBtn}</p>`;
  }
  function moveDialog() {
    const s = sess(S.move); if (!s) return "";
    return `<dialog class="mw-dialog" data-slot="dialog" data-cat="Dialog" aria-labelledby="ss-move-title" data-ss-dialog="move">
      <form method="dialog" class="mw-form mw-dialog__shell">
        <header class="mw-form__header"><div><h2 id="ss-move-title">${L("改归到哪个项目", "Move to which project")}</h2><p>${esc(T(s.title))}</p></div>${iconBtn(L("关闭", "Close"), "x", 'data-act="movex"', "mw-dialog__close")}</header>
        <div class="mw-form__body"><label class="mw-field" data-slot="field" data-cat="Field"><span class="mw-field__label">${L("项目", "Project")}</span>${select('id="moveTo"', projOpts(ownerOf(s) || ""))}<small class="mw-field__hint">${L("只改这一个会话：不改目录和项目的关系，不搬文件，不改原工具里的记录。", "Changes only this session: not the folder's link, no files move, nothing in the original tool changes.")}</small></label></div>
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

  // ---------- Reading scope (the one place that grants reading) ----------
  function sheet() {
    const detected = D.tools;
    return `<dialog class="mw-sheet" data-slot="sheet" data-cat="Sheet" aria-labelledby="ss-sheet-title" data-ss-dialog="sheet">
      <form method="dialog" class="mw-form mw-sheet__shell">
        <header class="mw-form__header"><div><h2 id="ss-sheet-title">${L("允许读取哪些工具的会话", "Which tools' sessions may be read")}</h2><p>${L("只读：找出已有会话、看历史和搜索。不会让这些工具运行、发消息或改文件；以后要接着做或交接，另外问你。", "Read only: find existing sessions, view and search history. These tools are never run, sent messages or have files changed; continuing or handing over asks you separately.")}</p></div>${iconBtn(L("关闭", "Close"), "x", 'data-act="sheetx"', "mw-dialog__close")}</header>
        <div class="mw-form__body">
          <fieldset class="mw-check-group" data-slot="checkbox-group" data-cat="Checkbox Group"><legend>${L("这台 Mac 上找到的工具", "Tools found on this Mac")}</legend>
          ${detected.map((t) => `<label class="mw-check-row ss-check"><input class="mw-check" data-slot="checkbox" type="checkbox"${t.gap ? " disabled" : ["claude", "codex", "kimi"].includes(t.id) ? " checked" : ""}><span><strong>${T(t.name)}</strong><small>${t.gap ? L("暂不支持自动发现：没有公开的读取方式", "Not supported yet: no public way to read") : t.kind === "cloud" ? L("云端：需要登录你的账号", "Cloud: needs your account sign-in") : `${T(t.where)}${t.ver ? ` · ${t.ver}` : ""}`}</small></span></label>`).join("")}</fieldset>
          <fieldset class="mw-radio-group" data-slot="radio-group" data-cat="Radio Group" role="radiogroup"><legend>${L("读哪些目录里的会话", "Sessions from which folders")}</legend>
            <label class="mw-check-row"><input class="mw-radio" data-slot="radio" type="radio" name="ss-scope" checked><span>${L("所有目录", "All folders")}</span></label>
            <label class="mw-check-row"><input class="mw-radio" data-slot="radio" type="radio" name="ss-scope"><span>${L("只读项目连着的目录：~/code/goalboard、~/code/site", "Only folders linked to projects: ~/code/goalboard, ~/code/site")}</span></label></fieldset>
          <p class="ss-muted">${L("收窄或停止后，范围外的会话和历史立刻不再显示；原工具里的记录不受影响。", "When narrowed or stopped, sessions outside the scope disappear at once; records in the tools are untouched.")}</p>
        </div>
        <footer class="mw-form__footer">${btn(L("取消", "Cancel"), { attrs: 'data-act="sheetx"' })}${btn(L("允许并开始读取", "Allow and start reading"), { v: "primary", attrs: 'data-act="sheetok"' })}</footer>
      </form></dialog>`;
  }

  // ---------- Page ----------
  function render() {
    strip();
    const o = opt("discover");
    const three = o === "C" && S.block === "discover" && !narrow();
    const narrowScope = discState() === "narrowed" ? `<div class="ss-banner">${alert("info", L("只读项目连着的 2 个目录", "Reading only the 2 project folders"), L("范围外的 23 个会话不显示；原工具里的记录不受影响。", "23 sessions outside the scope are hidden; records in the tools are untouched."), btn(L("调整读取范围", "Adjust reading scope"), { attrs: 'data-act="sheet"' }))}</div>` : "";
    const mobileDetail = narrow() && (S.mDetail || S.src);
    app.innerHTML = `<div class="mw-layout-primitives ss-shell${three ? " ss-shell--three" : ""}${mobileDetail ? " ss-shell--detail" : ""}">
      ${rail()}
      <div class="ss-work">
        ${toolbar()}${narrowScope}${S.block === "discover" || o === "B" ? discoveryBanner() : ""}
        <div class="ss-split">${three ? sourcesPanel() : ""}${listPanel()}<div class="ss-detail">${detail()}</div></div>
      </div></div>${S.sheet ? sheet() : ""}${S.move ? moveDialog() : ""}`;
    const dlg = app.querySelector("dialog[data-ss-dialog]");
    if (dlg && !dlg.open) dlg.showModal();
    save();
  }
  function announce(msg) { const live = document.getElementById("live"); live.textContent = ""; setTimeout(() => { live.textContent = msg; }, 30); }

  // When a state is picked, put the page where that state shows.
  function applyState() {
    const b = S.block, s = st(b);
    S.src = null; S.q = ""; S.tool = "all";
    if (b === "discover") { S.view = "all"; if (s === "mixed" && opt("discover") !== "B") S.src = "amp"; }
    if (b === "owner") {
      S.decided = {};
      if (s === "changed") { S.view = "all"; S.sel = "s4"; }
      else if (opt("owner") === "A") { S.view = "sort"; S.sel = "s4"; }
      else S.view = "sort";
    }
    if (b === "history") { S.view = "all"; S.sel = ({ version: "s10", revoked: "s3" })[s] || "s1"; }
    S.mDetail = narrow() && (b !== "discover");
  }

  document.getElementById("block").addEventListener("change", (e) => { S.block = e.target.value; applyState(); render(); });
  document.getElementById("opt").addEventListener("change", (e) => { S.opt[S.block] = e.target.value; applyState(); render(); });
  document.getElementById("state").addEventListener("change", (e) => { S.state[S.block] = e.target.value; applyState(); render(); });
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; render(); } });
  document.getElementById("cat").addEventListener("click", () => { S.cat = !S.cat; render(); });
  document.getElementById("reset").addEventListener("click", () => { S = { ...fresh(), lang: S.lang, theme: S.theme }; render(); });
  let lastNarrow = narrow();
  window.addEventListener("resize", () => { if (narrow() !== lastNarrow) { lastNarrow = narrow(); render(); } });

  function pickedProject(sid) { const el = app.querySelector(`[data-pick="${sid}"]`); return el ? el.value : ""; }
  app.addEventListener("click", (e) => {
    const t = e.target;
    const sel = t.closest("[data-sel]"); if (sel) { S.sel = sel.dataset.sel; S.src = null; if (S.view === "sort" && opt("owner") !== "A") S.view = "all"; S.mDetail = true; render(); return; }
    const src = t.closest("[data-src]"); if (src) { S.src = src.dataset.src; S.mDetail = true; render(); return; }
    const tl = t.closest("[data-tool]"); if (tl) { S.tool = tl.dataset.tool; S.src = null; render(); return; }
    const v = t.closest("[data-view]"); if (v) { S.view = v.dataset.view; S.src = null; S.mDetail = narrow() && S.view === "sort" && opt("owner") !== "A"; render(); return; }
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
    const a = t.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "sheet") S.sheet = true;
    else if (act === "sheetx") { e.preventDefault(); S.sheet = false; }
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
  });
  app.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.field === "q") { S.q = t.value; const pos = t.selectionStart; render(); const n = app.querySelector('[data-field="q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  });
  app.addEventListener("cancel", (e) => { if (e.target.matches("[data-ss-dialog]")) { e.preventDefault(); S.sheet = false; S.move = null; render(); } }, true);

  render();
})();
