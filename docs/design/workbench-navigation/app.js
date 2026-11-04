// 07-1 · 工作台导航、布局与个人插件接入 — standalone prototype. Sample data only (data.js); nothing reads or writes a Home.
(() => {
  const { T, P, R } = window.protoData;
  const K = window.mwKit;
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const KEY = "molis-proto.workbench-navigation.v1";
  const esc = K.escapeHtml;
  const ic = (name, cls = "") => K.icon(name, cls);

  // ---------- state ----------
  const q = new URLSearchParams(location.search);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { /* no storage: defaults */ }
  const S = {
    scheme: q.get("scheme") || saved.scheme || "A", home: q.get("home") || saved.home || "1", scene: q.get("scene") || saved.scene || "daily",
    state: q.get("state") || saved.state || "ok", lang: q.get("lang") || saved.lang || "zh", theme: q.get("theme") || saved.theme || "light",
    explain: q.has("explain") ? q.get("explain") !== "0" : saved.explain !== false,
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ scheme: S.scheme, home: S.home, scene: S.scene, state: S.state, lang: S.lang, theme: S.theme, explain: S.explain })); } catch { /* ignore */ } };
  const t = (k, ...a) => { const v = T[S.lang][k]; return typeof v === "function" ? v(...a) : v ?? k; };
  const pname = (p) => P[p]?.[S.lang] ?? p;
  const W = () => innerWidth;
  const compact = () => W() <= 760;

  // ---------- workspace model ----------
  // A pane: { id, side, tabs: [{ id, kind: home|plugin|record, plug, rec?, pinned?, group?, flag? }], cur, groups: { gid: { plug|label, hue, collapsed } } }
  const head = (plug, extra = {}) => ({ id: "h-" + plug, kind: "plugin", plug, group: "p:" + plug, ...extra });
  const rec = (plug, r, extra = {}) => ({ id: "r-" + r, kind: "record", plug, rec: r, group: "p:" + plug, ...extra });
  const homeTab = () => ({ id: "home", kind: "home", plug: "home" });
  const autoGroups = (tabs) => Object.fromEntries(tabs.filter((x) => x.group?.startsWith("p:")).map((x) => [x.group, { plug: x.plug, hue: P[x.plug].hue }]));
  const pane = (id, side, tabs, cur, manual = {}) => ({ id, side, tabs, cur, groups: { ...autoGroups(tabs), ...manual } });
  const launch = { "m:launch": { label: { zh: "发布周", en: "Launch week" }, hue: "orange" } };

  function build() {
    const st = S.state, sc = S.scene;
    let panes, sideOpen = true, solo = null, focus = "m1";
    if (sc === "split") {
      panes = [pane("m1", false, [homeTab(), head("goals"), rec("goals", "goal1"), rec("goals", "goal2")], "r-goal1"),
        pane("m2", false, [head("pages"), rec("pages", "doc1"), rec("pages", "doc2")], "r-doc1"),
        pane("s", true, [head("talk"), head("lingguang"), head("shelf"), head("materials"), head("tasks")], "h-talk")];
      sideOpen = false; focus = "m2";
    } else if (sc === "many") {
      const m = [homeTab(), rec("pages", "doc3", { pinned: true, group: null }), rec("workflows", "wf1", { pinned: true, group: null }),
        head("goals"), rec("goals", "goal1"), rec("goals", "goal2"), rec("goals", "goal3"),
        head("pages"), rec("pages", "doc1"), rec("pages", "doc2"), rec("pages", "doc4"),
        head("coding"), rec("coding", "code1"), rec("coding", "code2"),
        head("feed"), rec("feed", "feed1"), rec("feed", "feed2"),
        head("inbox"), rec("inbox", "inbox1"),
        head("ppt"), rec("ppt", "ppt1"), head("diff"), rec("diff", "diff1"),
        rec("feed", "feed3", { group: "m:launch" }), rec("inbox", "inbox2", { group: "m:launch" })];
      panes = [pane("m1", false, m, "r-doc4", launch), pane("s", true, [head("talk"), head("lingguang"), head("shelf"), head("materials"), head("tasks")], "h-materials")];
    } else if (sc === "personal") {
      panes = [pane("m1", false, [homeTab(), head("coding"), rec("coding", "code1"), head("timer")], "h-timer"),
        pane("s", true, [head("talk"), head("lingguang"), head("shelf"), head("reading"), head("tasks")], "h-reading")];
    } else {
      const m = [homeTab(),
        head("goals"), rec("goals", "goal1"), rec("goals", "goal2", st === "gone" ? { flag: "gone" } : {}),
        head("pages"), rec("pages", "doc1"), rec("pages", "doc2"),
        head("coding"), rec("coding", "code1"),
        rec("feed", "feed1", { group: "m:launch" }), rec("inbox", "inbox1", { group: "m:launch" })];
      let cur = "r-code1";
      const side = [head("talk"), head("lingguang"), head("shelf"), head("materials"), head("tasks")];
      let sideCur = "h-talk";
      if (st === "locate") {
        const g = m.splice(1, 3); side.splice(4, 0, ...g); sideCur = "r-goal1"; focus = "s";
      }
      if (st === "gone") cur = "r-goal2";
      if (st === "removed") { m.push(head("feed", { flag: "removed" }), rec("feed", "feed2", { flag: "removed" }), rec("feed", "feed3", { flag: "removed" })); cur = "r-feed2"; }
      if (st === "fail") { m.push(head("receipts", { flag: "fail" })); cur = "h-receipts"; }
      panes = [pane("m1", false, m, cur, launch), pane("s", true, side, sideCur)];
      if (st === "removed") panes[0].groups["p:feed"].off = true;
      // A person's group folds to its label, as Chrome does, so the day's plugins fit beside the side.
      if (panes[0].groups["m:launch"]) panes[0].groups["m:launch"].collapsed = true;
      if (sc === "solo") { solo = "m1"; }
    }
    return { panes, sideOpen, solo, focus, undo: st === "undo" ? { plug: "feed", tabs: [head("feed"), rec("feed", "feed2"), rec("feed", "feed3")] } : null, ring: st === "locate" ? "r-goal1" : null, pressed: st === "locate" ? "goals" : null };
  }
  let WS = build();

  const paneById = (id) => WS.panes.find((p) => p.id === id);
  const visiblePanes = () => WS.panes.filter((p) => (!p.side || WS.sideOpen) && (!WS.solo || WS.solo === p.id));
  const focused = () => paneById(WS.focus) && visiblePanes().includes(paneById(WS.focus)) ? paneById(WS.focus) : visiblePanes()[0];
  const tabOf = (p, id) => p.tabs.find((x) => x.id === id);
  const curTab = (p) => tabOf(p, p.cur) || p.tabs[0];
  const title = (x) => x.kind === "home" ? t("projectHome") : x.kind === "plugin" ? pname(x.plug) : R[x.rec][S.lang];
  const glyph = (x) => P[x.plug].icon;
  const hueVars = (hue) => `--g:var(--hue-${hue});--gf:var(--hue-${hue}-fill)`;
  const groupOf = (p, x) => x.group ? p.groups[x.group] : null;
  const TASKS_OPEN = 2; // one running, one waiting on you (sample)
  const paneName = (p) => p.side ? t("winSide") : WS.panes.filter((x) => !x.side).length > 1 ? t("winN", WS.panes.filter((x) => !x.side).indexOf(p) + 1) : t("winMain");
  const where = (p) => p.side ? (S.lang === "zh" ? "右侧" : "on the right") : (WS.panes.filter((x) => !x.side).length > 1 ? t("winN", WS.panes.filter((x) => !x.side).indexOf(p) + 1) : (S.lang === "zh" ? "主区" : "in main"));

  // Consecutive tabs of one group form a unit; home and pinned tabs lead the strip on their own.
  function units(p) {
    const out = [];
    for (const x of p.tabs) {
      if (x.kind === "home" || x.pinned) continue;
      const last = out[out.length - 1];
      if (x.group && last && last.gid === x.group) last.tabs.push(x);
      else out.push({ gid: x.group || null, tabs: [x] });
    }
    return out;
  }
  const unitHasCur = (p, u) => u.tabs.some((x) => x.id === p.cur);

  // ---------- strip renderers ----------
  // The right side and pinned tabs show glyphs only. Resting on one (or focusing it) grows that tab in place to show its
  // name. On the right the row is pinned to the right edge and a tab grows leftward, so its glyph stays under the pointer.
  const iconOnly = (p, x, opts) => opts.icon || x.pinned || (p.side && !compact() && !opts.text);
  function tabEl(p, x, opts = {}) {
    const sel = p.cur === x.id, cls = ["tab"];
    const io = iconOnly(p, x, opts);
    if (opts.fixed && !io) cls.push("fixed");
    if (io) cls.push("icon");
    if (opts.head) cls.push("head");
    if (x.flag === "gone" || x.flag === "removed") cls.push("gone");
    if (WS.ring === x.id) cls.push("focusring");
    const closable = !opts.noClose && x.kind !== "home" && !io;
    const label = title(x);
    const badge = x.plug === "tasks" ? `<span class="badge" aria-hidden="true">${TASKS_OPEN}</span>` : "";
    return `<span class="tw${opts.head ? " head-w" : ""}${!opts.head && !opts.fixed && !io ? " rt" : ""}"><button type="button" class="${cls.join(" ")}" role="tab" aria-selected="${sel}" data-act="${opts.head ? "head" : "tab"}" data-p="${p.id}" data-t="${x.id}"${io ? ` aria-label="${esc(label)}${x.plug === "tasks" ? ` · ${esc(t("tasksOpen", TASKS_OPEN))}` : ""}"` : ` title="${esc(label)}"`}>${ic(glyph(x))}<span class="t">${esc(label)}</span>${badge}${x.flag === "fail" ? '<span class="warn" aria-hidden="true"></span>' : ""}</button>${closable && !opts.head ? `<button type="button" class="x" data-act="close" data-p="${p.id}" data-t="${x.id}" aria-label="${esc(t("closeTab"))} · ${esc(label)}">${ic("x")}</button>` : ""}</span>`;
  }
  function leadTabs(p) {
    const pins = p.tabs.filter((x) => x.pinned);
    return pins.map((x) => tabEl(p, x, { icon: true, noClose: true })).join("") + (pins.length ? '<span class="pindiv" aria-hidden="true"></span>' : "");
  }
  function groupUnit(p, u, mode) {
    const g = u.gid && p.groups[u.gid];
    if (!g) return u.tabs.map((x) => tabEl(p, x)).join("");
    const isCur = unitHasCur(p, u);
    const items = u.tabs.filter((x) => x.kind !== "plugin");
    const headTab = u.tabs.find((x) => x.kind === "plugin");
    // On the right a plugin with no records open is a plain glyph: no wash, so the row reads as one calm set of glyphs.
    if (p.side && !compact() && !g.label && !items.length && headTab) return tabEl(p, headTab, { head: true });
    const folded = g.collapsed || (mode === "B" && !isCur && items.length > 0 && !g.open);
    const count = items.length ? (mode === "B" && folded ? `<button type="button" class="count" data-act="count" data-p="${p.id}" data-g="${u.gid}" aria-label="${esc(t("groupOf", items.length))}" aria-haspopup="menu">${items.length}</button>` : folded ? `<span class="count" aria-hidden="true">${items.length}</span>` : "") : "";
    let inner;
    if (g.label) inner = `<button type="button" class="label" data-act="glabel" data-p="${p.id}" data-g="${u.gid}" aria-expanded="${!folded}">${esc(g.label[S.lang])}</button>${folded ? count : items.map((x) => tabEl(p, x)).join("")}`;
    else inner = `${headTab ? tabEl(p, headTab, { fixed: true, head: true }) : ""}${g.off ? `<span class="gtag">${esc(t("removedTag"))}</span>` : ""}${folded ? count : (items.length && headTab ? '<span class="sep" aria-hidden="true"></span>' : "") + items.map((x) => tabEl(p, x)).join("")}`;
    return `<span class="grp${isCur ? " cur" : ""}${g.off ? " off" : ""}" role="group" aria-label="${esc(g.label ? g.label[S.lang] : pname(g.plug))}" style="${hueVars(g.hue)}">${inner}</span>`;
  }
  function stripAB(p, mode, first) {
    const cp = compact();
    let body;
    if (cp) {
      // A phone has room for home, the current group and a list of the rest.
      const u = units(p).find((x) => unitHasCur(p, x));
      const g = u?.gid && p.groups[u.gid];
      const ct = curTab(p);
      body = (u && g ? `<span class="grp cur" style="${hueVars(g.hue)}">${g.label ? `<span class="label">${esc(g.label[S.lang])}</span>` : ""}${tabEl(p, ct, ct.kind === "plugin" ? { fixed: true, head: true } : {})}</span>` : (ct && ct.kind !== "home" ? tabEl(p, ct) : ""));
    } else {
      body = units(p).map((u) => groupUnit(p, u, mode)).join("");
    }
    return { lead: cp ? "" : leadTabs(p), body };
  }
  function stripC(p) {
    const cp = compact();
    const heads = units(p).map((u) => {
      const g = u.gid && p.groups[u.gid];
      if (!g) return u.tabs.map((x) => tabEl(p, x)).join("");
      const items = u.tabs.filter((x) => x.kind !== "plugin").length;
      const sel = unitHasCur(p, u);
      const name = g.label ? g.label[S.lang] : pname(g.plug);
      const icon = g.label ? "frame" : P[g.plug].icon;
      return `<button type="button" class="c-head${g.off ? " off" : ""}" role="tab" aria-selected="${sel}" data-act="chead" data-p="${p.id}" data-g="${u.gid}" style="${hueVars(g.hue)}" title="${esc(name)}"${cp ? ` aria-label="${esc(name)}"` : ""}>${ic(icon)}${cp || p.side ? "" : `<span>${esc(name)}</span>`}${items && !cp && !p.side ? `<span class="count">${items}</span>` : ""}${u.tabs.some((x) => x.flag === "fail") ? '<span class="warn" aria-hidden="true" style="width:6px;height:6px;border-radius:50%;background:var(--amber)"></span>' : ""}</button>`;
    }).join("");
    return { lead: cp ? "" : leadTabs(p), body: heads };
  }
  function subtabs(p) {
    const u = units(p).find((x) => unitHasCur(p, x));
    const g = u?.gid && p.groups[u.gid];
    if (!g) return "";
    const items = u.tabs.filter((x) => x.kind !== "plugin");
    if (!items.length) return "";
    const headTab = u.tabs.find((x) => x.kind === "plugin");
    const list = (headTab ? tabEl(p, headTab, { fixed: true, head: true }).replace(`<span class="t">${esc(title(headTab))}</span>`, `<span class="t">${esc(S.lang === "zh" ? "列表" : "List")}</span>`) : "") + items.map((x) => tabEl(p, x)).join("");
    return `<div class="subtabs" role="tablist" aria-label="${esc(g.label ? g.label[S.lang] : pname(g.plug))}" style="${hueVars(g.hue)}">${list}</div>`;
  }
  function railAndTools() {
    if (compact()) return "";
    const side = paneById("s"), shown = visiblePanes().includes(side);
    const rail = side && !shown ? `<span class="rail" role="tablist" aria-label="${esc(t("winSide"))}">${side.tabs.map((x) => tabEl(side, x, { head: x.kind === "plugin", icon: true, noClose: true }).replace(/data-act="(head|tab)"/, 'data-act="rail"').replace('aria-selected="true"', 'aria-selected="false"')).join("")}</span>` : "";
    return `${rail}<span class="wintools"><span class="tdiv" aria-hidden="true"></span><button type="button" data-act="pane-menu" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t("panes"))}" title="${esc(t("panes"))}">${ic("columns")}</button></span>`;
  }
  function strip(p, first, last) {
    const vis = visiblePanes();
    const isFocus = focused() === p;
    const parts = S.scheme === "C" ? stripC(p) : stripAB(p, S.scheme, first);
    // On a phone the Dock already carries the project home; pinned tabs live in the list.
    const lead = compact() ? "" : parts.lead;
    const winsel = compact() && vis.length > 1 ? `<span class="mw-toggle-group winsel" data-slot="toggle-group" data-seg-thumb role="group" aria-label="${esc(t("panes"))}">${vis.map((x) => `<button type="button" class="mw-toggle${x === p ? " is-current" : ""}" data-act="win" data-p="${x.id}" aria-pressed="${x === p}">${esc(x.side ? t("winSide") : vis.filter((y) => !y.side).length > 1 ? String(vis.filter((y) => !y.side).indexOf(x) + 1) : t("winMain"))}</button>`).join("")}</span>` : "";
    const hist = first ? `<span class="hist"><button type="button" aria-label="${esc(t("back"))}" title="${esc(t("back"))}">${ic("back")}</button><button type="button" aria-label="${esc(t("forward"))}" title="${esc(t("forward"))}">${ic("arrow")}</button></span>` : "";
    const undo = WS.undo && !p.side ? `<button type="button" class="undo" data-act="undo" style="${hueVars(P[WS.undo.plug].hue)}">${ic("undo")}<span>${esc(t("undoClose", pname(WS.undo.plug)))}</span></button>` : "";
    const solo = WS.solo === p.id ? `<button type="button" class="solochip" data-act="unsolo">${ic("maximize")}<span>${esc(t("soloChip"))}</span></button>` : "";
    const more = `<button type="button" class="more" data-act="more" data-p="${p.id}" aria-haspopup="menu" aria-expanded="false" hidden>${ic("rows")}<span>${esc(t("more"))}</span><span class="n">${p.tabs.filter((x) => x.kind !== "home").length}</span></button>`;
    const personal = first && S.home === "2" && !compact() ? personalTray() : "";
    const status = personal ? `<span class="tbstatus">${personal}</span>` : "";
    // Pane settings live once, in the bar; the strip keeps only what opens into this pane.
    // The side opens from its own icons (and 「在旁边打开」 in the main ＋ menu), so its strip has no ＋.
    const plus = p.side ? "" : `<button type="button" data-act="plus" data-p="${p.id}" aria-label="${esc(t("open"))}" title="${esc(t("open"))}" aria-haspopup="menu">${ic("plus")}</button>`;
    const tools = `<span class="tools">${more}${plus}</span>`;
    return `<div class="strip${isFocus ? " focus" : ""}${p.side ? " side" : ""}" data-p="${p.id}">${hist}${winsel}<div class="lead">${lead}</div><div class="tabs" role="tablist" aria-label="${esc(where(p))}">${parts.body}</div>${undo}${solo}${tools}${status}${last ? railAndTools() : ""}</div>`;
  }
  function personalTray() {
    const list = ["issue", "timer", "reading", ...(S.state === "fail" ? ["receipts"] : [])];
    return `<span class="mw-group" role="group" aria-label="${esc(t("personalTray"))}" style="display:flex;gap:2px;padding:2px;border-radius:10px;background:var(--control-fill)">${list.map((x) => `<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only" data-slot="button" data-act="dock" data-plug="${x}" aria-label="${esc(pname(x))}" title="${esc(pname(x))}${P[x].keys ? " " + P[x].keys : ""}" style="position:relative;height:26px;width:28px;min-height:26px">${ic(P[x].icon)}${x === "receipts" ? '<span style="position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:var(--amber)"></span>' : ""}</button>`).join("")}</span>`;
  }

  // ---------- page renderers (sample content) ----------
  const ring = (state) => K.renderStateRing({ state });
  const L2 = (zh, en) => S.lang === "zh" ? zh : en;
  function page(p, x) {
    if (!x) return "";
    if (x.flag === "gone") return errorPage("circle-alert", t("goneTitle"), t("goneBody"), [["goneClose", "close-cur"], ["goneList", "goto-goals"]]);
    if (x.flag === "removed") return errorPage("rss", t("removedTitle"), t("removedBody"), [["addBack", "add-back", "primary"], ["closeGroup", "close-group-cur"]]);
    if (x.flag === "fail") return errorPage("package", t("failTitle"), t("failBody"), [["failOpen", "noop"]]);
    if (x.kind === "home") return `<div class="stage"><div class="phead"><div class="grow"><h1>${esc(t("project"))}</h1><p>${L2("先等你 1 件，接着做 3 件。", "1 waits on you, 3 to continue.")}</p></div></div>
      <div class="cards"><div class="card"><h3>${ring("answer")}${esc(R.inbox1[S.lang])}</h3><p>${L2("要你确认能不能用在首屏。", "Needs your yes before it goes on the first screen.")}</p></div><div class="card"><h3>${ring("running")}${esc(R.goal1[S.lang])}</h3><p>${L2("Coding 正在改首屏布局。", "Coding is reworking the layout.")}</p></div><div class="card"><h3>${ic("note")}${esc(R.doc1[S.lang])}</h3><p>${L2("昨天改到第二屏。", "Edited up to the second screen yesterday.")}</p></div></div></div>`;
    const narrow = p.side;
    if (x.kind === "plugin") {
      switch (x.plug) {
        case "goals": return listPage("goals", L2("这个项目要达成的事，以及它们走到哪一步。", "What this project sets out to do, and how far each has got."), [["goal1", "running", L2("进行中 · 截止 11/12", "In progress · due 11/12")], ["goal2", "waiting", L2("等资料", "Waiting for material")], ["goal3", "idle", L2("还没开始", "Not started")]]);
        case "pages": return listPage("pages", L2("这个项目的文稿。", "This project's documents."), [["doc1", "", L2("昨天 18:20", "Yesterday 18:20")], ["doc2", "", L2("11/02", "11/02")], ["doc3", "", L2("固定", "Pinned")]], "note");
        case "coding": return listPage("coding", L2("在工作目录里做的每一轮。", "Every round worked in the project folder."), [["code1", "running", L2("正在跑 · website", "Running · website")], ["code2", "done", L2("已完成", "Done")]]);
        case "feed": return listPage("feed", L2("订阅来的更新。", "Updates you subscribe to."), [["feed1", "", "11/03"], ["feed2", "", "11/01"], ["feed3", "", "10/30"]], "rss");
        case "talk": return `<div class="stage"><div class="phead"><div class="grow"><h1>${esc(pname("talk"))}</h1></div></div>
          <div class="bubble"><div class="who">${L2("林舟", "Lin Zhou")}</div>${L2("首屏那句主张我改了两版，放在改版方案第 2 节。", "I wrote two versions of the headline, in section 2 of the revamp plan.")}</div>
          <div class="bubble me"><div class="who">${L2("你", "You")}</div>${L2("我看第二版更直接，配色等字体授权确认后再定。", "The second reads more directly; colours wait for the font licence.")}</div>
          <div class="bubble"><div class="who">${L2("周敏", "Zhou Min")}</div>${L2("法务那边已经回了，Inbox 里有。", "Legal replied, it's in Inbox.")}</div></div>`;
        case "shelf": return `<div class="stage"><div class="phead"><div class="grow"><h1>Shelf</h1><p>${L2("随手放的引用和片段。", "Quotes and clips you set aside.")}</p></div></div><div class="rows">${[[L2("品牌指南 2026.pdf · 第 3 页", "Brand guide 2026.pdf · p. 3"), "file"], [L2("竞品首屏截图 ×4", "Competitor first screens ×4"), "image"], [L2("「一句主张，一个按钮」", "“One claim, one button”"), "text"]].map(([n, i]) => `<div class="row">${ic(i)}<span class="nm"><strong>${esc(n)}</strong></span></div>`).join("")}</div></div>`;
        case "materials": return `<div class="stage"><div class="phead"><div class="grow"><h1>${esc(pname("materials"))}</h1><p>${L2("参考 2 个文件夹 · 输出到 website", "2 reference folders · output to website")}</p></div></div><div class="rows">${["品牌指南 2026.pdf", "index.tsx", "访谈记录.md", "hero.png"].map((n) => `<div class="row">${ic(n.endsWith(".pdf") || n.endsWith(".md") ? "file" : n.endsWith(".png") ? "image" : "code")}<span class="nm"><strong>${esc(n)}</strong></span></div>`).join("")}</div></div>`;
        case "lingguang": return `<div class="stage"><div class="phead"><div class="grow"><h1>${esc(pname("lingguang"))}</h1><p>${L2("随手记下的想法，之后再放进事项。", "Ideas jotted down, to file into work later.")}</p></div>${K.renderButton({ label: L2("记一条", "Jot one"), icon: "plus", variant: "primary", size: "sm" })}</div><div class="rows">${[L2("首屏可以放一段 6 秒的产品动图", "A 6-second product loop on the first screen"), L2("访谈里「散落」这个词可以直接用", "Use “scattered” straight from the interviews")].map((n) => `<div class="row">${ic("idea")}<span class="nm"><strong>${esc(n)}</strong></span></div>`).join("")}</div></div>`;
        case "tasks": return `<div class="stage"><div class="phead"><div class="grow"><h1>${esc(pname("tasks"))}</h1><p>${L2("助理和插件在后台做的事，做完、要你定的都在这里。", "What the Assistant and plugins do in the background; finished and waiting ones stay here.")}</p></div></div><div class="rows">${[["running", L2("修首屏布局", "Fix the first-screen layout"), L2("Coding · 正在改 Hero.tsx", "Coding · editing Hero.tsx")], ["answer", L2("整理三位访谈的原话", "Pull quotes from three interviews"), L2("助理 · 等你选用哪几句", "Assistant · waits for you to pick quotes")], ["done", L2("核对字体授权", "Check the font licences"), L2("助理 · 10:42 完成", "Assistant · done at 10:42")]].map(([st, n, f]) => `<div class="row">${ring(st)}<span class="nm"><strong>${esc(n)}</strong><span class="fact">${esc(f)}</span></span></div>`).join("")}</div></div>`;
        case "timer": return `<div class="stage"><div class="phead"><div class="grow"><h1>${esc(pname("timer"))}</h1><p>${L2("个人插件 · 在所有项目里都是同一份。", "Personal plugin · the same one in every project.")}</p></div>${K.renderButton({ label: L2("开始", "Start"), icon: "play", variant: "primary", size: "sm" })}</div><div class="card"><div class="timer">24:10</div><p>${L2("今天第 3 个番茄 · 正在做「修首屏布局」", "3rd focus block today · on “Fix the first-screen layout”")}</p></div></div>`;
        case "reading": return `<div class="stage"><div class="phead"><div class="grow"><h1>${esc(pname("reading"))}</h1></div></div><div class="rows">${[L2("《设计中的设计》· 摘 3 条", "Designing Design · 3 notes"), L2("《写给大家看的设计书》· 摘 5 条", "The Non-Designer's Design Book · 5 notes")].map((n) => `<div class="row">${ic("bookmark")}<span class="nm"><strong>${esc(n)}</strong></span></div>`).join("")}</div></div>`;
        default: return listPage(x.plug, "", [], P[x.plug].icon);
      }
    }
    // record
    if (x.plug === "pages") return `<div class="stage doc"><h1>${esc(title(x))}</h1><p>${L2("首屏只说一件事：我们帮团队把散落的资料变成能推进的工作。主按钮只有一个，写「开始一个项目」。", "The first screen says one thing: we turn scattered material into work that moves. One primary button, “Start a project”.")}</p><h2>${L2("第二屏", "Second screen")}</h2><p>${L2("用三位访谈对象的原话说明为什么需要它，每段不超过两行。", "Three interviewees, in their own words, on why they need it — two lines each at most.")}</p></div>`;
    if (x.plug === "coding") return `<div class="stage"><div class="turn"><div class="who">${ic("user")}${L2("你", "You")}</div><p>${L2("按品牌指南把首屏改成一句主张加一个主按钮。", "Rework the first screen into one claim and one primary button, per the brand guide.")}</p></div><div class="turn"><div class="who">${ic("code")}Coding</div><p>${L2("看过品牌指南第 3 页，主色只用在按钮上；正在改 Hero 组件。", "Read page 3 of the brand guide; the main colour only goes on the button. Editing the Hero component.")}</p></div><div class="step">${ring("running")}<span>${L2("正在改 src/components/Hero.tsx", "Editing src/components/Hero.tsx")}</span></div></div>`;
    return `<div class="stage rec"><h1>${esc(title(x))}</h1><div class="facts">${x.plug === "goals" ? `${ring(x.rec === "goal1" ? "running" : "waiting")}<span class="fact">${x.rec === "goal1" ? L2("进行中 · 截止 11/12", "In progress · due 11/12") : L2("等资料", "Waiting for material")}</span>` : `<span class="fact">${esc(pname(x.plug))} · 11/03</span>`}</div><p>${L2("新首屏要在一句话里说清楚我们做什么，再给一个最明确的下一步。现有版本有三个按钮、两段说明，访谈里五个人有四个没看完。", "The new first screen must say what we do in one sentence and give one clear next step. Today's has three buttons and two paragraphs; four of five interviewees didn't finish reading it.")}</p><h2>${L2("要求", "Requirements")}</h2><p>${L2("一句主张、一个主按钮；移动端首屏不滚动就能看到按钮；字体用已授权的版本。", "One claim, one primary button; on mobile the button shows without scrolling; licensed fonts only.")}</p></div>`;
  }
  function listPage(plug, sentence, items, iconName) {
    return `<div class="stage"><div class="phead"><div class="grow"><h1>${esc(pname(plug))}</h1>${sentence ? `<p>${esc(sentence)}</p>` : ""}</div>${K.renderButton({ label: L2("新建", "New"), icon: "plus", variant: "primary", size: "sm" })}</div><div class="rows">${items.map(([r, st, fact]) => `<div class="row">${st ? ring(st) : ic(iconName || "file")}<span class="nm"><strong>${esc(R[r][S.lang])}</strong><span class="fact">${esc(fact)}</span></span></div>`).join("")}</div></div>`;
  }
  function errorPage(iconName, h, body, actions) {
    return `<div class="paneempty"><div class="mw-empty mw-empty--error" role="alert"><span class="mw-empty__mark">${ic(iconName)}</span><strong>${esc(h)}</strong><p>${esc(body)}</p><div class="mw-empty__actions">${actions.map(([k, act, v]) => `<button type="button" class="mw-btn mw-btn--${v || "secondary"} mw-btn--sm" data-slot="button" data-act="${act}">${esc(t(k))}</button>`).join("")}</div></div></div>`;
  }

  // ---------- bar ----------
  function bar() {
    const f = focused(), vis = visiblePanes();
    const fp = curTab(f)?.plug;
    const mains = vis;
    // The switcher is its glyph alone: the strip above already names what each pane shows.
    const now = mains.map((p) => { const x = curTab(p); return x.kind === "home" ? t("projectHome") : pname(x.plug); }).join(" · ");
    const pins = ["goals", "pages", "coding", "feed"];
    // Zoning 1: the person's own things sit at the right of the bar, before the project.
    const mine = S.home === "1" ? ["jelly", "todo", "cognia", ...(S.scene === "personal" || S.state === "fail" ? ["timer"] : []), ...(S.state === "fail" ? ["receipts"] : [])] : [];
    const dock = (plug) => `<button type="button" class="dock${WS.pressed === plug ? " pressed" : ""}" data-act="dock" data-plug="${plug}" aria-label="${esc(pname(plug))}" title="${esc(pname(plug))}${P[plug].keys ? " " + P[plug].keys : ""}"${fp === plug ? ' aria-current="page"' : ""}>${ic(P[plug].icon)}${plug === "receipts" ? '<span class="warn" aria-hidden="true"></span>' : ""}</button>`;
    const mineTray = mine.length ? `<div class="tray mine" role="group" aria-label="${esc(t("personalTray"))}">${compact() ? dock(mine.includes(fp) ? fp : mine[0]) + `<button type="button" class="dock fold" aria-label="+${mine.length - 1}">+${mine.length - 1}</button>` : mine.map(dock).join("")}</div>` : "";
    return `<div class="bar">
      <div class="tray"><button type="button" class="dock switcher" data-act="switcher" aria-haspopup="menu" aria-expanded="false" aria-label="${esc((S.lang === "zh" ? "切换插件 · 现在：" : "Switch plugin · now: ") + now)}" title="${esc(S.lang === "zh" ? "切换插件" : "Switch plugin")} ⌘K">${ic("grid")}</button><span class="bdiv" aria-hidden="true"></span>
        <button type="button" class="dock" data-act="dock" data-plug="home" aria-label="${esc(t("projectHome"))}" title="${esc(t("projectHome"))}"${fp === "home" ? ' aria-current="page"' : ""}>${ic("home")}</button>${compact() ? `<button type="button" class="dock fold" aria-label="+${pins.length}">+${pins.length}</button>` : pins.map(dock).join("")}</div>
      <div class="composer"><span class="ph">${esc(t("composer"))}</span><button type="button" class="send" aria-label="${esc(t("send"))}">${ic("send")}</button></div>
      ${mineTray}<button type="button" class="mono" aria-label="${esc(t("project"))}" title="${esc(t("project"))}">${S.lang === "zh" ? "网" : "W"}</button>
    </div>`;
  }

  // ---------- render ----------
  function cols() {
    const vis = visiblePanes();
    const sideW = W() > 1180 ? "380px" : "320px";
    return vis.map((p) => p.side ? sideW : "minmax(0,1fr)").join(" 8px ");
  }
  function render(opts = {}) {
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.resolvedTheme = S.theme;
    try { localStorage.setItem("molis-work:theme", S.theme); } catch { /* ignore */ }
    for (const n of document.querySelectorAll("[data-t]")) n.textContent = t(n.dataset.t);
    for (const [id, key, attr] of [["scheme", "scheme", "v"], ["home", "home", "v"], ["lang", "lang", "v"], ["theme", "theme", "v"]]) for (const b of document.querySelectorAll(`#${id} button`)) b.setAttribute("aria-pressed", String(b.dataset[attr] === S[key]));
    document.querySelector('#scheme [data-v="A"]').textContent = t("sA"); document.querySelector('#scheme [data-v="B"]').textContent = t("sB"); document.querySelector('#scheme [data-v="C"]').textContent = t("sC");
    document.querySelector('#home [data-v="1"]').textContent = t("h1"); document.querySelector('#home [data-v="2"]').textContent = t("h2");
    document.getElementById("explainBtn").setAttribute("aria-pressed", String(S.explain));
    fill("scene", ["daily", "split", "many", "solo", "personal"].map((v) => [v, t("sc_" + v)]), S.scene);
    fill("state", ["ok", "locate", "undo", "gone", "removed", "fail"].map((v) => [v, t("st_" + v)]), S.state, S.scene === "daily");
    const vis = visiblePanes(), f = focused();
    const app = document.getElementById("app");
    app.style.setProperty("--cols", cols());
    app.innerHTML = `<div class="titlebar">${vis.map((p, i) => strip(p, i === 0, i === vis.length - 1)).join('<span class="gap" aria-hidden="true"></span>')}</div>
      <div class="desk">${vis.map((p) => `<section class="pane${p === f ? " focus" : ""}${p.side ? " side" : ""}${opts.arrive === p.id ? " arrive" : ""}" data-p="${p.id}" aria-label="${esc(where(p))}">${S.scheme === "C" ? subtabs(p) : ""}<div class="body">${page(p, curTab(p))}</div></section>`).join('<span class="gap" aria-hidden="true"></span>')}</div>
      ${bar()}`;
    // Overflow: the list of every tab appears only where the strip cannot show them all (always on a phone).
    for (const s of app.querySelectorAll(".strip")) {
      const tabs = s.querySelector(".tabs"), more = s.querySelector(".more");
      const over = tabs.scrollWidth > tabs.clientWidth + 2;
      if (over) tabs.dataset.more = "";
      const edge = () => { tabs.toggleAttribute("data-start", tabs.scrollLeft > 2); tabs.toggleAttribute("data-end", tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 2); };
      tabs.addEventListener("scroll", edge, { passive: true }); requestAnimationFrame(edge);
      if (more && (over || (compact() && S.scheme !== "C"))) more.hidden = false;
      const sel = tabs.querySelector('[aria-selected="true"]');
      // Keep the whole current group in view when it fits, so its head (the plugin) stays beside the tab.
      const grp = sel && sel.closest(".grp");
      const cur = grp && grp.getBoundingClientRect().width <= tabs.clientWidth - 48 ? grp : sel;
      if (cur && over) { const r = cur.getBoundingClientRect(), b = tabs.getBoundingClientRect(); if (r.right > b.right - 28) tabs.scrollLeft += r.right - b.right + 36; else if (r.left < b.left + 24) tabs.scrollLeft -= b.left - r.left + 28; }
    }
    for (const st of app.querySelectorAll(".subtabs")) {
      const sel = st.querySelector('[aria-selected="true"]');
      if (sel && st.scrollWidth > st.clientWidth + 2) { const r = sel.getBoundingClientRect(), b = st.getBoundingClientRect(); if (r.right > b.right - 12) st.scrollLeft += r.right - b.right + 24; }
      st.toggleAttribute("data-start", st.scrollLeft > 2);
    }
    // The board's toggle reads .mw-toggle and .is-current; keep them in step with aria-pressed.
    for (const b of document.querySelectorAll(".mw-toggle-group > button")) { b.classList.add("mw-toggle"); b.classList.toggle("is-current", b.getAttribute("aria-pressed") === "true"); }
    const ex = document.getElementById("explain");
    const key = S.scene === "daily" && S.state !== "ok" ? "ex_" + S.state : S.scene === "personal" ? "ex_personal_h" + S.home : S.scene === "solo" ? "ex_solo" : S.scene === "split" ? "ex_split" : "ex_" + S.scheme;
    const [h, b] = t(key);
    ex.innerHTML = `<strong>${esc(h)}</strong>${esc(b)}`;
    ex.toggleAttribute("data-hide", !S.explain);
    save();
    if (q.get("menu") && !opened) { opened = true; setTimeout(() => openFromQuery(q.get("menu")), 60); }
    if (q.get("hover")) document.querySelector(`.tab.icon[data-t="${q.get("hover")}"]`)?.classList.add("grow");
  }
  let opened = false;
  function fill(id, opts, cur, enabled = true) { const el = document.getElementById(id); el.innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join(""); el.disabled = !enabled; }

  // ---------- menus ----------
  let pop = null;
  function closePop(refocus = true) { if (!pop) return; pop.el.remove(); pop.back?.setAttribute("aria-expanded", "false"); if (refocus) pop.back?.focus(); pop = null; }
  function openPop(anchor, html, { up = false, label = "", wide = false, cls = "" } = {}) {
    closePop(false);
    const el = document.createElement("div");
    el.className = `pop mw-menu${up ? " up" : ""}${cls ? " " + cls : ""}`; el.setAttribute("role", "menu"); el.setAttribute("data-slot", "menu"); if (label) el.setAttribute("aria-label", label);
    el.innerHTML = html; document.body.appendChild(el);
    if (wide) el.style.minWidth = "340px";
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let left = r.left, top = up ? r.top - h - 8 : r.bottom + 6;
    if (left + w > innerWidth - 8) left = Math.max(8, r.right - w);
    if (!up && top + h > innerHeight - 8) top = Math.max(48, r.top - h - 6);
    if (up && top < 48) top = 48;
    el.style.left = Math.max(8, left) + "px"; el.style.top = top + "px";
    // A menu never runs under the bar: it scrolls inside the room above it.
    const barTop = document.querySelector(".bar")?.getBoundingClientRect().top ?? innerHeight;
    if (!up && top + h > barTop - 8) el.style.maxHeight = Math.max(160, barTop - 8 - top) + "px";
    anchor.setAttribute("aria-expanded", "true");
    pop = { el, back: anchor };
    (el.querySelector("input") || el.querySelector(".mw-menu__item:not(:disabled)"))?.focus();
  }
  const item = (label, iconName, act, data = {}, extra = {}) => K.renderMenuItem({ label, iconName, attrs: { "data-act": act, ...Object.fromEntries(Object.entries(data).map(([k, v]) => ["data-" + k, v])) }, ...extra });
  const cap = (s) => `<span class="cap" aria-hidden="true">${esc(s)}</span>`;
  function plugRow(plug, paneId) {
    const loc = WS.panes.find((p) => visiblePanes().includes(p) && p.tabs.some((x) => x.plug === plug && x.kind === "plugin"));
    const fail = plug === "receipts";
    const whereHint = loc ? `<span class="where">${esc(loc.side ? t("openRight") : t("openHere"))}</span>` : fail ? `<span class="warnword">${esc(t("failed"))}</span>` : P[plug].keys ? `<span class="where">${esc(P[plug].keys)}</span>` : "";
    return `<div class="prow"><button type="button" class="mw-menu__item" role="menuitem" data-act="m-open" data-plug="${plug}" data-p="${paneId}" style="${P[plug].hue ? hueVars(P[plug].hue) : ""}">${ic(P[plug].icon, "gl")}<span data-slot="menu-item-label">${esc(pname(plug))}</span>${whereHint}</button>${K.renderButton({ label: t("openBeside"), icon: "columns", variant: "ghost", size: "sm", iconOnly: true, className: "side-btn" }).replace("<button ", `<button data-act="m-beside" data-plug="${plug}" tabindex="-1" `)}</div>`;
  }
  function plusMenu(anchor, paneId) {
    const project = ["goals", "pages", "coding", "feed", "inbox", "workflows", "lingguang", "materials", "talk"];
    const personal = ["todo", "jelly", "cognia", "issue", "shelf", "timer", "reading", "receipts"];
    const closed = WS.undo ? `<button type="button" class="mw-menu__item" role="menuitem" data-act="undo" style="${hueVars(P.feed.hue)}">${ic("rss", "gl")}<span class="two"><span>Feed</span><small>${esc(t("groupOf", 2))} · ⌘⇧T</small></span></button>` : `<button type="button" class="mw-menu__item" role="menuitem" data-act="noop" style="${hueVars(P.diff.hue)}">${ic("git-compare", "gl")}<span class="two"><span>${esc(R.diff1[S.lang])}</span><small>Diff · ⌘⇧T</small></span></button>`;
    openPop(anchor, `<label class="find">${ic("search")}<input type="text" placeholder="${esc(t("plusFind"))}" aria-label="${esc(t("plusFind"))}" data-act="filter"></label>
      ${cap(t("capProject"))}${project.map((x) => plugRow(x, paneId)).join("")}
      ${cap(t("capPersonal"))}${personal.map((x) => plugRow(x, paneId)).join("")}
      ${cap(t("capClosed"))}${closed}<span class="foot">${esc(t("plusFoot"))}</span>`, { label: t("open"), wide: true });
  }
  function paneMenu(anchor, paneId) {
    const p = paneById(paneId), x = curTab(p), mains = WS.panes.filter((y) => !y.side);
    const vis = visiblePanes();
    openPop(anchor, `<span class="head">${esc(t("paneMenuOf", paneName(p)))}</span>
      ${item(t("splitRight"), "columns", "m-split", { p: paneId })}${item(t("splitDown"), "rows", "m-split", { p: paneId, dir: "down" }, { disabled: true })}<hr>
      ${item(p.side ? t("moveMain") : t("moveRight"), "arrow", "m-move", { p: paneId, t: x.id }, { disabled: x.kind === "home" })}
      ${item(WS.solo ? t("unsolo") : t("solo"), "maximize", "m-solo", { p: paneId }, { shortcut: "⌘⇧↵", disabled: vis.length < 2 && !WS.solo })}
      ${item(t("merge"), "minus", "m-merge", {}, { disabled: mains.length < 2 })}
      ${item(WS.sideOpen ? t("hideSide") : t("showSide"), "sidebar", "side-toggle", {}, { shortcut: "⌘\\" })}
      ${item(t("equal"), "grid", "noop", {}, { disabled: vis.length < 2 })}
      ${item(t("closePane"), "x", "m-closepane", { p: paneId }, { disabled: mains.length < 2 })}
      ${vis.length > 1 ? `<hr>${cap(t("focusCap"))}${vis.map((y) => K.renderMenuItem({ label: `${paneName(y)} · ${title(curTab(y))}`, checked: y === focused(), attrs: { "data-act": "win", "data-p": y.id } })).join("")}` : ""}`, { label: t("paneMenu") });
  }
  function tabMenu(anchor, paneId, tabId) {
    const p = paneById(paneId), x = tabOf(p, tabId);
    if (x.kind === "plugin") return groupMenu(anchor, paneId, x.group);
    openPop(anchor, `<span class="head">${esc(title(x))}</span>
      ${item(x.pinned ? t("unpin") : t("pin"), x.pinned ? "pin-off" : "pin", "m-pin", { p: paneId, t: tabId })}
      ${item(p.side ? t("moveTabMain") : t("moveTabRight"), "arrow", "m-move", { p: paneId, t: tabId })}
      ${item(t("beside"), "columns", "m-beside-tab", { p: paneId, t: tabId })}
      ${item(t("newGroup"), "frame", "noop")}${x.group !== "m:launch" ? item(t("joinGroup", launch["m:launch"].label[S.lang]), "frame", "m-join", { p: paneId, t: tabId }) : ""}<hr>
      ${item(t("closeTab"), "x", "close", { p: paneId, t: tabId })}`, { label: title(x) });
  }
  function groupMenu(anchor, paneId, gid) {
    const p = paneById(paneId), g = p.groups[gid];
    const name = g.label ? g.label[S.lang] : pname(g.plug);
    const folded = g.collapsed;
    openPop(anchor, `<span class="head">${esc(name)}</span>
      ${item(folded ? t("expand") : t("collapse"), folded ? "chevron-down" : "chevron-up", "m-collapse", { p: paneId, g: gid })}
      ${item(p.side ? t("moveGroupMain") : t("moveGroupRight"), "arrow", "m-movegroup", { p: paneId, g: gid })}<hr>
      ${item(t("closeGroup"), "x", "m-closegroup", { p: paneId, g: gid })}`, { label: name });
  }
  function listRows(p, tabs) {
    return tabs.map((x) => `<button type="button" class="mw-menu__item" role="menuitem" data-act="tab" data-p="${p.id}" data-t="${x.id}"${p.cur === x.id ? ' aria-current="true"' : ""} style="${P[x.plug].hue ? hueVars(P[x.plug].hue) : ""}">${ic(glyph(x), "gl")}<span class="two"><span>${esc(title(x))}</span>${x.kind === "plugin" ? `<small>${esc(S.lang === "zh" ? "插件首页" : "Plugin page")}</small>` : ""}</span>${x.pinned ? `<span class="kv">${esc(S.lang === "zh" ? "固定" : "Pinned")}</span>` : ""}</button>`).join("");
  }
  function moreMenu(anchor, paneId) {
    const p = paneById(paneId);
    const lead = p.tabs.filter((x) => x.pinned);
    const groups = units(p).map((u) => { const g = u.gid && p.groups[u.gid]; return (g ? cap(`${g.label ? g.label[S.lang] : pname(g.plug)} · ${t("groupOf", u.tabs.length)}`) : "") + listRows(p, u.tabs); }).join("");
    openPop(anchor, `<label class="find">${ic("search")}<input type="text" placeholder="${esc(t("moreFind"))}" aria-label="${esc(t("moreFind"))}" data-act="filter"></label>${listRows(p, lead)}${groups}`, { label: t("more"), wide: true });
  }
  function countMenu(anchor, paneId, gid) {
    const p = paneById(paneId), g = p.groups[gid];
    const u = units(p).find((x) => x.gid === gid);
    openPop(anchor, `<span class="head">${esc(g.label ? g.label[S.lang] : pname(g.plug))}</span>${listRows(p, u.tabs)}<hr>${item(t("expand"), "chevron-down", "m-open-group", { p: paneId, g: gid })}`, { label: pname(g.plug) });
  }
  function switcherMenu(anchor) {
    const project = ["goals", "pages", "coding", "feed", "inbox", "workflows", "lingguang"];
    const personal = ["todo", "jelly", "cognia", "issue", "shelf", "timer", "reading", "receipts"];
    const fp = curTab(focused())?.plug;
    const row = (x) => `<button type="button" class="mw-menu__item" role="menuitem" data-act="dock" data-plug="${x}"${fp === x ? ' aria-current="true"' : ""}>${ic(P[x].icon)}<span data-slot="menu-item-label">${esc(pname(x))}</span>${x === "receipts" ? `<span class="warnword">${esc(t("failed"))}</span>` : P[x].pkg ? `<span class="kv">${esc(S.lang === "zh" ? "装进 Home 的包" : "Home package")}</span>` : P[x].keys ? `<span class="kv">${esc(P[x].keys)}</span>` : ""}</button>`;
    openPop(anchor, `<div class="tools-row"><label class="find">${ic("search")}<input type="text" placeholder="${esc(t("switchFind"))}" aria-label="${esc(t("switchFind"))}"><kbd>⌘K</kbd></label>${K.renderButton({ label: t("market"), variant: "secondary", size: "sm" })}${K.renderButton({ label: t("studio"), variant: "secondary", size: "sm" })}</div>
      ${cap(t("inProject"))}${project.map(row).join("")}${cap(t("personalCap"))}${personal.map(row).join("")}`, { up: true, label: S.lang === "zh" ? "切换插件" : "Switch plugin", cls: "switch" });
  }
  function openFromQuery(m) {
    const f = focused();
    const sel = { plus: `.strip[data-p="${f.id}"] [data-act="plus"]`, pane: '.wintools [data-act="pane-menu"]', more: `.strip[data-p="${f.id}"] [data-act="more"]`, switcher: '[data-act="switcher"]', tab: `.strip[data-p="${f.id}"] .tab[aria-selected="true"]`, count: `.strip[data-p="${f.id}"] [data-act="count"]` }[m];
    const el = sel && document.querySelector(sel);
    if (!el) return;
    if (m === "tab") { const x = curTab(f); return x.kind === "plugin" ? groupMenu(el, f.id, x.group) : tabMenu(el, f.id, x.id); }
    el.click();
  }

  // ---------- operations ----------
  function ensureHead(p, plug) {
    if (!P[plug].hue || p.tabs.some((x) => x.id === "h-" + plug)) return;
    p.tabs.push(head(plug)); p.groups["p:" + plug] = p.groups["p:" + plug] || { plug, hue: P[plug].hue };
  }
  function moveTab(fromId, tabId, toPane) {
    const from = paneById(fromId), x = tabOf(from, tabId);
    if (!x || x.kind === "home") return;
    from.tabs = from.tabs.filter((y) => y.id !== tabId);
    if (from.cur === tabId) from.cur = (from.tabs.find((y) => y.group === x.group) || from.tabs[0])?.id;
    if (x.group?.startsWith("p:")) { ensureHead(toPane, x.plug); const i = toPane.tabs.map((y) => y.group).lastIndexOf(x.group); toPane.tabs.splice(i + 1, 0, x); }
    else { toPane.tabs.push(x); if (x.group && from.groups[x.group]) toPane.groups[x.group] = from.groups[x.group]; }
    toPane.cur = x.id; WS.focus = toPane.id;
  }
  function moveGroup(fromId, gid, toPane) {
    const from = paneById(fromId);
    const tabs = from.tabs.filter((y) => y.group === gid);
    from.tabs = from.tabs.filter((y) => y.group !== gid);
    toPane.tabs.push(...tabs); toPane.groups[gid] = from.groups[gid];
    if (tabs.some((y) => y.id === from.cur)) { toPane.cur = from.cur; from.cur = from.tabs[0]?.id; }
    WS.focus = toPane.id;
  }
  function closeGroup(paneId, gid) {
    const p = paneById(paneId), g = p.groups[gid];
    const tabs = p.tabs.filter((y) => y.group === gid);
    p.tabs = p.tabs.filter((y) => y.group !== gid);
    if (tabs.some((y) => y.id === p.cur)) p.cur = p.tabs.find((y) => y.kind === "home")?.id || p.tabs[0]?.id;
    if (g?.plug) { WS.undo = { plug: g.plug, tabs, pane: paneId, gid, g }; toast(t("closedGroup", pname(g.plug))); }
  }
  function besidePane(fromId) {
    const side = paneById("s");
    if (side && !paneById(fromId).side) { WS.sideOpen = true; WS.solo = null; return side; }
    return WS.panes.find((p) => !p.side && p.id !== fromId) || paneById("m1");
  }
  function openPlug(plug, { beside = false, paneId = null, from = "" } = {}) {
    const vis = visiblePanes();
    const at = WS.panes.find((p) => (vis.includes(p) || (p.side && from === "resident")) && p.tabs.some((x) => x.id === "h-" + plug));
    if (at && !beside) {
      if (at.side) WS.sideOpen = true;
      const inGroup = tabOf(at, at.cur)?.group === "p:" + plug;
      if (!inGroup) at.cur = "h-" + plug;
      WS.focus = at.id; WS.ring = at.cur; WS.pressed = from === "dock" ? plug : null;
      if (at !== paneById(paneId || focused().id)) toast(t("located", where(at)));
      return render({ arrive: at.id });
    }
    let target = beside ? besidePane(paneId || focused().id) : paneById(paneId || focused().id);
    if (from === "resident") { target = paneById("s"); WS.sideOpen = true; WS.solo = null; }
    if (plug === "home") { if (target.side) target = visiblePanes().find((y) => !y.side) || paneById("m1"); let h = target.tabs.find((x) => x.kind === "home"); if (!h) { h = homeTab(); target.tabs.unshift(h); } target.cur = h.id; }
    else if (P[plug].hue) { ensureHead(target, plug); target.cur = "h-" + plug; if (plug === "receipts") tabOf(target, "h-receipts").flag = "fail"; }
    WS.focus = target.id; WS.ring = null;
    if (beside) toast(t("openedBeside", where(target)));
    render({ arrive: target.id });
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    document.querySelector(".mw-toast")?.remove();
    const el = document.createElement("div"); el.className = "mw-toast"; el.setAttribute("role", "status"); el.textContent = msg;
    document.body.appendChild(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 3200);
  }

  // Hover intent: a glyph-only tab grows after a short rest, so sweeping across the row does not set it rippling.
  let growTimer = 0;
  document.addEventListener("pointerover", (e) => {
    const b = e.target.closest(".tab.icon");
    if (!b || b.classList.contains("grow")) return;
    clearTimeout(growTimer);
    const was = document.querySelector(".tab.icon.grow");
    growTimer = setTimeout(() => { document.querySelectorAll(".tab.icon.grow").forEach((x) => x.classList.remove("grow")); b.classList.add("grow"); }, was ? 0 : 140);
  });
  document.addEventListener("pointerout", (e) => {
    const b = e.target.closest(".tab.icon");
    if (!b || b.contains(e.relatedTarget)) return;
    clearTimeout(growTimer);
    if (!e.relatedTarget?.closest?.(".tab.icon")) b.classList.remove("grow");
  });
  document.addEventListener("focusin", (e) => { const b = e.target.closest?.(".tab.icon"); document.querySelectorAll(".tab.icon.grow").forEach((x) => x !== b && x.classList.remove("grow")); if (b?.matches(":focus-visible")) b.classList.add("grow"); });

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-v]");
    if (pop && !e.target.closest(".pop") && !(b && pop.back === b)) closePop(false);
    if (!b) return;
    const ctl = b.closest(".proto");
    if (ctl && b.dataset.v) {
      const grp = b.parentElement.id;
      if (grp === "scheme") S.scheme = b.dataset.v; else if (grp === "home") S.home = b.dataset.v; else if (grp === "lang") S.lang = b.dataset.v; else if (grp === "theme") S.theme = b.dataset.v;
      return render();
    }
    const a = b.dataset.act, d = b.dataset;
    const p = d.p && paneById(d.p);
    switch (a) {
      case "tab": { if (!p) return; p.cur = d.t; WS.focus = p.id; WS.ring = null; WS.pressed = null; closePop(false); const x = tabOf(p, d.t); if (x?.group && p.groups[x.group]) p.groups[x.group].last = x.id; break; }
      case "head": { const x = tabOf(p, d.t); const g = p.groups[x.group]; p.cur = d.t; WS.focus = p.id; WS.ring = null; if (S.scheme === "B" && g) g.open = false; break; }
      case "chead": { const u = units(p).find((x) => x.gid === d.g); const g = p.groups[d.g]; const remembered = u.tabs.find((x) => x.id === g.last) || u.tabs.find((x) => x.kind === "plugin") || u.tabs[0]; p.cur = remembered.id; WS.focus = p.id; WS.ring = null; break; }
      case "glabel": { p.groups[d.g].collapsed = !p.groups[d.g].collapsed; break; }
      case "count": e.stopPropagation(); return countMenu(b, d.p, d.g);
      case "close": { e.stopPropagation(); closePop(false); const pp = paneById(d.p), x = tabOf(pp, d.t); if (x.kind === "plugin") closeGroup(d.p, x.group); else { pp.tabs = pp.tabs.filter((y) => y.id !== d.t); if (pp.cur === d.t) pp.cur = (pp.tabs.find((y) => y.group && y.group === x.group) || pp.tabs[pp.tabs.length - 1])?.id; } break; }
      case "undo": if (WS.undo) { const pp = paneById(WS.undo.pane || "m1"); pp.tabs.push(...WS.undo.tabs); pp.groups["p:" + WS.undo.plug] = WS.undo.g || { plug: WS.undo.plug, hue: P[WS.undo.plug].hue }; pp.cur = WS.undo.tabs[1]?.id || WS.undo.tabs[0].id; WS.focus = pp.id; toast(t("reopened", pname(WS.undo.plug))); WS.undo = null; } closePop(false); break;
      case "plus": e.stopPropagation(); return plusMenu(b, d.p);
      case "pane-menu": e.stopPropagation(); return paneMenu(b, focused().id);
      case "more": e.stopPropagation(); return moreMenu(b, d.p);
      case "switcher": e.stopPropagation(); return switcherMenu(b);
      case "hide-side": WS.sideOpen = false; if (focused().side) WS.focus = "m1"; break;
      case "side-toggle": closePop(false); WS.sideOpen = !WS.sideOpen; WS.solo = null; if (!WS.sideOpen && WS.focus === "s") WS.focus = "m1"; return render({ arrive: WS.sideOpen ? "s" : null });
      case "unsolo": WS.solo = null; break;
      case "win": closePop(false); WS.focus = d.p; WS.ring = null; break;
      case "dock": closePop(false); return openPlug(d.plug, { from: "dock" });
      case "resident": closePop(false); return openPlug(d.plug, { from: "resident" });
      case "rail": { closePop(false); const sp = paneById("s"); WS.sideOpen = true; WS.solo = null; sp.cur = d.t; WS.focus = "s"; return render({ arrive: "s" }); }
      case "m-open": closePop(false); return openPlug(d.plug, { paneId: d.p, beside: e.altKey });
      case "m-beside": e.stopPropagation(); closePop(false); return openPlug(d.plug, { beside: true });
      case "m-split": { closePop(false); const src = paneById(d.p), x = curTab(src); const id = "m" + (WS.panes.filter((y) => !y.side).length + 1); const np = pane(id, false, [{ ...x, id: x.id + "-2" }], x.id + "-2"); if (x.group?.startsWith("p:") && x.kind !== "plugin") { np.tabs.unshift(head(x.plug)); np.groups["p:" + x.plug] = { plug: x.plug, hue: P[x.plug].hue }; } WS.panes.splice(WS.panes.indexOf(src) + 1, 0, np); WS.focus = id; WS.solo = null; return render({ arrive: id }); }
      case "m-move": closePop(false); { const src = paneById(d.p); const dst = src.side ? WS.panes.find((y) => !y.side) : besidePane(d.p); moveTab(d.p, d.t, dst); WS.sideOpen = WS.sideOpen || dst.side; return render({ arrive: dst.id }); }
      case "m-beside-tab": closePop(false); { const src = paneById(d.p), x = tabOf(src, d.t); const dst = besidePane(d.p); ensureHead(dst, x.plug); const copy = { ...x, id: x.id + "-b" }; dst.tabs.push(copy); dst.cur = copy.id; WS.focus = dst.id; toast(t("openedBeside", where(dst))); return render({ arrive: dst.id }); }
      case "m-solo": closePop(false); WS.solo = WS.solo ? null : d.p; break;
      case "m-merge": closePop(false); { const mains = WS.panes.filter((y) => !y.side); const keep = mains[0]; for (const o of mains.slice(1)) { for (const x of o.tabs) if (!keep.tabs.some((y) => y.id === x.id) && x.kind !== "home") { keep.tabs.push(x); if (x.group && o.groups[x.group]) keep.groups[x.group] = o.groups[x.group]; } WS.panes.splice(WS.panes.indexOf(o), 1); } WS.focus = keep.id; break; }
      case "m-closepane": closePop(false); { const pp = paneById(d.p); if (!pp.side && WS.panes.filter((y) => !y.side).length > 1) { WS.panes.splice(WS.panes.indexOf(pp), 1); WS.focus = WS.panes[0].id; } break; }
      case "m-pin": closePop(false); { const x = tabOf(p, d.t); x.pinned = !x.pinned; if (x.pinned) { x.prevGroup = x.group; x.group = null; } else x.group = x.prevGroup || "p:" + x.plug; break; }
      case "m-join": closePop(false); { const x = tabOf(p, d.t); x.group = "m:launch"; p.groups["m:launch"] = launch["m:launch"]; p.tabs = p.tabs.filter((y) => y !== x); const i = p.tabs.map((y) => y.group).lastIndexOf("m:launch"); p.tabs.splice(i < 0 ? p.tabs.length : i + 1, 0, x); break; }
      case "m-collapse": closePop(false); p.groups[d.g].collapsed = !p.groups[d.g].collapsed; break;
      case "m-open-group": closePop(false); p.groups[d.g].open = true; break;
      case "m-movegroup": closePop(false); { const dst = p.side ? WS.panes.find((y) => !y.side) : besidePane(d.p); moveGroup(d.p, d.g, dst); return render({ arrive: dst.id }); }
      case "m-closegroup": closePop(false); closeGroup(d.p, d.g); break;
      case "close-cur": { const f = focused(); const x = curTab(f); f.tabs = f.tabs.filter((y) => y !== x); f.cur = f.tabs.find((y) => y.group === x.group)?.id || f.tabs[0].id; break; }
      case "goto-goals": { const f = focused(); f.cur = "h-goals"; break; }
      case "add-back": { const f = focused(); delete f.groups["p:feed"].off; for (const x of f.tabs) if (x.flag === "removed") delete x.flag; break; }
      case "close-group-cur": { const f = focused(); closeGroup(f.id, curTab(f).group); break; }
      default: return;
    }
    render();
  });
  document.addEventListener("contextmenu", (e) => {
    const b = e.target.closest(".tab[data-t], .c-head, .grp .label");
    if (!b) return;
    e.preventDefault();
    const d = b.dataset;
    if (b.classList.contains("c-head") || b.classList.contains("label")) return groupMenu(b, d.p, d.g);
    tabMenu(b, d.p, d.t);
  });
  document.addEventListener("input", (e) => {
    if (e.target.dataset.act !== "filter" || !pop) return;
    const v = e.target.value.trim().toLowerCase();
    for (const r of pop.el.querySelectorAll(".prow, .mw-menu__item")) { if (r.closest(".prow") && !r.classList.contains("prow")) continue; r.hidden = !!v && !r.textContent.toLowerCase().includes(v); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop) { closePop(); e.preventDefault(); return; }
    if (pop && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const its = [...pop.el.querySelectorAll(".mw-menu__item:not(:disabled), input")].filter((x) => x.offsetParent);
      const i = its.indexOf(document.activeElement);
      its[(i + (e.key === "ArrowDown" ? 1 : -1) + its.length) % its.length]?.focus(); e.preventDefault(); return;
    }
    if (pop && e.key === "Enter" && e.altKey && document.activeElement?.dataset.act === "m-open") { const d = document.activeElement.dataset; closePop(false); openPlug(d.plug, { beside: true }); e.preventDefault(); return; }
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") { const b = document.activeElement?.closest?.(".tab[data-t], .c-head"); if (b) { e.preventDefault(); b.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })); } }
    const inStrip = document.activeElement?.closest?.(".strip, .subtabs");
    if (inStrip && (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End")) {
      const its = [...inStrip.querySelectorAll(".lead .tab, .tabs .tab, .tabs .c-head, .tabs .label, .tabs .count, .subtabs .tab")];
      const i = its.indexOf(document.activeElement);
      const n = e.key === "Home" ? 0 : e.key === "End" ? its.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + its.length) % its.length;
      its[n]?.focus(); e.preventDefault();
    }
    if (e.key === "Enter" && e.metaKey && e.shiftKey) { WS.solo = WS.solo ? null : focused().id; render(); }
    if (e.key === "\\" && e.metaKey) { WS.sideOpen = !WS.sideOpen; render(); }
  });
  document.getElementById("scene").addEventListener("change", (e) => { S.scene = e.target.value; if (S.scene !== "daily") S.state = "ok"; WS = build(); render(); });
  document.getElementById("state").addEventListener("change", (e) => { S.state = e.target.value; WS = build(); render(); });
  document.getElementById("explainBtn").addEventListener("click", () => { S.explain = !S.explain; render(); });
  document.getElementById("reset").addEventListener("click", () => { WS = build(); render(); });
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { closePop(false); render(); }, 80); });
  render();
  setTimeout(() => document.documentElement.classList.remove("booting"), 400);
  setTimeout(() => { const c = document.createElement("script"); c.textContent = window.mwKitClient; document.body.appendChild(c); }, 0);
})();
