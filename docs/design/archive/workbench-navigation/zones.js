// Zoning comparison for batch 07-1: which part of the window holds which kind of thing.
// Reference prototype only. It reuses the specimen's shell classes (shell.css) and the board's kit.
(() => {
  const K = window.mwKit;
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const esc = K.escapeHtml;
  const ic = (n) => K.icon(n);
  const q = new URLSearchParams(location.search);
  const pick = (v, ok, d) => (ok.includes(v) ? v : d);
  const S = {
    plan: pick(q.get("plan"), ["1", "2", "now"], "1"),
    side: pick(q.get("side"), ["open", "closed"], "open"),
    lang: pick(q.get("lang"), ["zh", "en"], "zh"),
    theme: pick(q.get("theme"), ["light", "dark"], "light"),
    notes: q.get("notes") !== "0",
    focus: pick(q.get("focus"), ["main", "side"], "main"),
    menu: pick(q.get("menu"), ["layout", "switcher"], ""),
    hover: q.get("hover") || "",
    comp: "talk",
    opened: ["talk", "materials"],
  };
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const phone = () => window.innerWidth <= 760;

  const P = {
    home: ["项目首页", "Project home", "home"],
    goals: ["Goals", "Goals", "target", "blue"],
    pages: ["Pages", "Pages", "note", "cyan"],
    coding: ["Coding", "Coding", "code", "purple"],
    feed: ["Feed", "Feed", "rss", "brown"],
    talk: ["讨论", "Discussion", "message"],
    lingguang: ["灵光", "Lingguang", "idea"],
    shelf: ["Shelf", "Shelf", "library"],
    materials: ["项目资料", "Materials", "folder-tree"],
    tasks: ["后台任务", "Background tasks", "activity"],
    jelly: ["Jelly", "Jelly", "calendar"],
    todo: ["待办", "Todo", "list"],
    cognia: ["Cognia", "Cognia", "book"],
  };
  const nm = (k) => L(P[k][0], P[k][1]);
  const COMPANIONS = ["talk", "lingguang", "shelf", "materials", "tasks"];
  const PERSONAL = ["jelly", "todo", "cognia"];
  const DOCK = ["goals", "pages", "coding", "feed"];
  const TASKS_OPEN = 2;
  const GROUPS = [
    { k: "goals", recs: [["品牌规范", "Brand rules"]] },
    { k: "pages", recs: [["改版方案", "Revamp plan"], ["第二轮修改", "Second pass"]] },
    { k: "coding", recs: [["修首屏布局", "Fix the first screen", true]] },
  ];

  const T = {
    zh: {
      title: "原型 · 分区比较", planL: "分法", p1: "一：陪着的放右上", p2: "二：入口都在底栏", now: "现在（对照）",
      sideL: "右侧", open: "开", closed: "收起", langL: "语言", themeL: "外观", light: "浅", dark: "深",
      notesL: "分区说明", backL: "回到定样", layout: "布局", plus: "打开插件", close: "关闭", hideSide: "收起右侧",
      composer: "让助理做点什么，或按 ⌘K 搜索", main: "主区", sideW: "右侧", switcher: "切换器",
    },
    en: {
      title: "Prototype · zoning", planL: "Zoning", p1: "1: companions top right", p2: "2: every entry in the bar", now: "Today (reference)",
      sideL: "Side", open: "Open", closed: "Closed", langL: "Language", themeL: "Theme", light: "Light", dark: "Dark",
      notesL: "Zone notes", backL: "Back to specimen", layout: "Layout", plus: "Open a plugin", close: "Close", hideSide: "Hide the side",
      composer: "Ask the Assistant, or ⌘K to search", main: "Main", sideW: "Side", switcher: "Switcher",
    },
  };
  const t = (k) => T[S.lang][k] ?? k;

  // ---------- notes: what each zone holds, per plan ----------
  const NOTES = {
    "1": {
      title: ["分法一：陪着的放右上（推荐）", "Plan 1: companions at the top right (recommended)"],
      zones: [
        ["开着的", "What's open", "主区的标签和「＋」。项目首页、窗格按钮、状态都不放。", "The main tabs and ＋. No project home, pane button or status."],
        ["陪着的", "Companions", "讨论、灵光、Shelf、资料、后台任务：图标靠右，停一下原地展开。右侧收起时图标还在原处。", "Discussion, Lingguang, Shelf, Materials, Background tasks: icons on the right that widen in place. They stay put when the side is closed."],
        ["布局", "Layout", "全窗口只有这一个按钮：分屏、独看、右侧开关。", "One button for the window: split, focus, show or hide the side."],
        ["去哪里", "Where to go", "项目首页和项目的插件，只有图标。", "Project home and the project's plugins, icons only."],
        ["说话", "Ask", "助理输入框。", "The Assistant."],
        ["你自己的", "Your own", "个人插件和项目按钮。", "Personal plugins and the project button."],
      ],
      gain: ["每样东西只有一个入口，位置不变。", "Each thing has one way in, always in the same place."],
      cost: ["Shelf、灵光、讨论从右下搬到右上，要重新习惯；1024 宽开着右侧时，主区标签窄一些。", "Shelf, Lingguang and Discussion move from the bottom right to the top right; at 1024 with the side open the main tabs get less room."],
      mind: ["按「哪类东西」找位置，不用上下对照。", "You look by kind of thing; no matching top and bottom."],
    },
    "2": {
      title: ["分法二：入口都在底栏", "Plan 2: every entry in the bar"],
      zones: [
        ["开着的", "What's open", "主区和右侧各自的标签。右侧只列开着的那几张。", "Each pane's tabs. The side lists only what is open in it."],
        ["去哪里＋布局", "Go + layout", "切换器写出每一栏，分屏、独看在它的菜单里；后面是项目首页、插件、个人插件。", "The switcher names each pane and holds split and focus; then project home, plugins and personal plugins."],
        ["说话", "Ask", "助理输入框。", "The Assistant."],
        ["陪着的", "Companions", "讨论、灵光、Shelf、资料、后台任务：点一下开右侧，再点收起。最后是项目。", "Discussion, Lingguang, Shelf, Materials, Background tasks: press to open the side, again to hide it. Then the project."],
      ],
      gain: ["和现在最像；入口都在底栏一处，顶上最安静。", "Closest to today; every way in sits in the bar and the top is quietest."],
      cost: ["在底下选、在右上看，要上下对照；右下一排六个，比现在更满；分屏、独看藏进菜单。", "You pick at the bottom and look at the top right; the bottom right holds six; split and focus hide in a menu."],
      mind: ["入口集中，但一件事要分两处看。", "Entries in one place, but one thing is read in two."],
    },
    now: {
      title: ["现在（最初的 A，作对照）", "Today (the first A, for reference)"],
      zones: [
        ["首页和固定标签", "Home and pinned", "标签条里有项目首页和一张固定的 Pages。", "The strip carries project home and a pinned Pages tab."],
        ["每条都有", "On every strip", "每条标签栏都有「＋」和窗格按钮；后台任务在标题栏。", "Every strip has ＋ and the pane button; background tasks sit in the titlebar."],
        ["右侧另一套", "A second set", "右侧自带一套写着名字的标签。", "The side has its own named tabs."],
        ["和右上重复", "Repeats the top", "右下的常驻和右侧开关，与右上的标签是同一批东西。", "The bottom-right residents and side switch repeat the side's tabs."],
      ],
    },
  };

  // ---------- pieces ----------
  const hueVars = (hue) => `--g:var(--hue-${hue});--gf:var(--hue-${hue}-fill)`;
  const recTab = (icon, label, cur) => `<div class="tw rt"><button type="button" class="tab" role="tab" aria-selected="${cur}">${ic(icon)}<span class="t">${esc(label)}</span></button><button type="button" class="x" tabindex="-1" aria-label="${esc(t("close"))}">${ic("x")}</button></div>`;
  const headTab = (k) => `<div class="tw head-w"><button type="button" class="tab head fixed" role="tab" aria-selected="false">${ic(P[k][2])}<span class="t">${esc(nm(k))}</span></button></div>`;
  function groups() {
    // On a phone only the current group shows; the rest wait in 「全部标签」.
    const list = phone() ? GROUPS.filter((g) => g.recs.some((r) => r[2])) : GROUPS;
    const g = list.map(({ k, recs }) => {
      const cur = recs.some((r) => r[2]);
      return `<div class="grp${cur ? " cur" : ""}" style="${hueVars(P[k][3])}">${headTab(k)}<span class="sep" aria-hidden="true"></span>${recs.map((r) => recTab(P[k][2], L(r[0], r[1]), !!r[2])).join("")}</div>`;
    }).join("");
    const user = `<div class="grp" style="${hueVars("orange")}"><button type="button" class="label">${esc(L("发布周", "Launch week"))}</button><span class="count">2</span></div>`;
    return phone() ? g : g + user;
  }
  const iconBtn = (act, icon, label, extra = "") => `<button type="button" data-act="${act}" aria-label="${esc(label)}" title="${esc(label)}"${extra}>${ic(icon)}</button>`;
  const badge = (k) => (k === "tasks" ? `<span class="zbadge">${TASKS_OPEN}</span>` : "");
  // Companion tabs: icon only, widen in place after a short pause (hover intent).
  function rail(where) {
    const open = S.side === "open";
    return `<div class="rail" role="tablist" aria-label="${esc(L("陪着你的", "Companions"))}" data-where="${where}">${COMPANIONS.map((k) => `<button type="button" class="tab ctab${S.hover === k ? " grow" : ""}" role="tab" data-act="comp" data-k="${k}" aria-selected="${open && S.comp === k}" aria-label="${esc(nm(k))}">${ic(P[k][2])}<span class="t">${esc(nm(k))}</span>${badge(k)}</button>`).join("")}</div>`;
  }
  const layoutBtn = () => `<span class="tdiv" aria-hidden="true"></span><div class="tools wtools">${iconBtn("layout", "columns", t("layout"), ` aria-haspopup="menu" aria-expanded="${S.menu === "layout"}"`)}</div>`;
  const winsel = () => (phone() && S.side === "open" ? `<span class="mw-toggle-group winsel" role="group">${["main", "side"].map((f) => `<button type="button" class="mw-toggle${S.focus === f ? " is-current" : ""}" data-act="win" data-f="${f}" aria-pressed="${S.focus === f}">${esc(t(f === "main" ? "main" : "sideW"))}</button>`).join("")}</span>` : "");

  function mainStrip() {
    const focus = !phone() || S.focus === "main" || S.side === "closed";
    const hist = `<div class="hist">${iconBtn("noop", "back", L("后退", "Back"))}${iconBtn("noop", "arrow", L("前进", "Forward"))}</div>`;
    const lead = S.plan === "now" && !phone() ? `<div class="lead"><div class="tw"><button type="button" class="tab fixed" role="tab" aria-selected="false">${ic("home")}<span class="t">${esc(nm("home"))}</span></button></div><div class="tw"><button type="button" class="tab icon" role="tab" aria-selected="false" aria-label="${esc(L("品牌指南", "Brand guide"))}">${ic("note")}</button></div></div><span class="leadsep" aria-hidden="true"></span>` : "";
    const more = phone() ? `<button type="button" class="more" aria-label="${esc(L("全部标签 8", "All tabs 8"))}">${ic("rows")}<span>${esc(L("全部标签", "All tabs"))}</span><span class="n">8</span></button>` : "";
    let tools = `<div class="tools">${more}${iconBtn("noop", "plus", t("plus"))}`;
    if (S.plan === "now") tools += iconBtn("noop", "columns", L("窗格", "Panes"));
    tools += "</div>";
    const status = S.plan === "now" && !phone() ? `<div class="tbstatus">${K.renderButton({ label: L("后台任务 1", "Background tasks 1"), variant: "secondary", size: "sm", icon: "activity" })}</div>` : "";
    const tail = S.plan === "1" && S.side === "closed" && !phone() ? rail("main") + layoutBtn() : "";
    return `<div class="strip main${focus ? " focus" : ""}" data-zone="main">${hist}${winsel()}${lead}<div class="tabs" role="tablist">${groups()}</div>${tools}${status}${tail}</div>`;
  }
  function sideStrip() {
    const focus = phone() && S.focus === "side";
    let inner = "";
    if (S.plan === "1") inner = `${winsel()}${rail("side")}${phone() ? "" : layoutBtn()}`;
    else if (S.plan === "2") inner = `${winsel()}<div class="tabs" role="tablist">${S.opened.map((k) => `<div class="tw"><button type="button" class="tab fixed" role="tab" data-act="comp" data-k="${k}" aria-selected="${S.comp === k}">${ic(P[k][2])}<span class="t">${esc(nm(k))}</span></button></div>`).join("")}</div><div class="tools">${iconBtn("hide", "sidebar", t("hideSide"))}</div>`;
    else inner = `${winsel()}<div class="tabs" role="tablist">${["talk", "shelf", "materials"].map((k) => `<div class="tw"><button type="button" class="tab fixed" role="tab" data-act="comp" data-k="${k}" aria-selected="${S.comp === k}">${ic(P[k][2])}<span class="t">${esc(nm(k))}</span></button></div>`).join("")}</div><div class="tools">${iconBtn("noop", "plus", t("plus"))}${iconBtn("hide", "sidebar", t("hideSide"))}</div>`;
    return `<div class="strip side${focus ? " focus" : ""}${S.plan === "1" ? " railstrip" : ""}">${inner}</div>`;
  }

  function sidePage() {
    const k = S.comp;
    const head = `<div class="phead"><div class="grow"><h1>${esc(nm(k))}</h1></div></div>`;
    const rows = (items) => `<div class="rows">${items.map(([n, i]) => `<div class="row">${ic(i)}<span class="nm"><strong>${esc(n)}</strong></span></div>`).join("")}</div>`;
    if (k === "talk") return `<div class="stage">${head}
      <div class="bubble"><div class="who">${L("林舟", "Lin Zhou")}</div>${L("首屏那句主张我改了两版，放在改版方案第 2 节。", "I wrote two versions of the headline, in section 2 of the revamp plan.")}</div>
      <div class="bubble me"><div class="who">${L("你", "You")}</div>${L("我看第二版更直接，配色等字体授权确认后再定。", "The second reads more directly; colours wait for the font licence.")}</div>
      <div class="bubble"><div class="who">${L("周敏", "Zhou Min")}</div>${L("法务那边已经回了，Inbox 里有。", "Legal replied, it's in Inbox.")}</div></div>`;
    if (k === "tasks") return `<div class="stage">${head}<div class="rows">${[["running", L("Coding · 修首屏布局", "Coding · Fix the first screen")], ["answer", L("Coding · 换字体，等你回答", "Coding · Swap fonts, waiting on you")], ["done", L("导入品牌指南", "Import the brand guide")]].map(([s, n]) => `<div class="row">${K.renderStateRing({ state: s })}<span class="nm"><strong>${esc(n)}</strong></span></div>`).join("")}</div></div>`;
    if (k === "lingguang") return `<div class="stage">${head}${rows([[L("首屏只留一个按钮", "Keep one button on the first screen"), "idea"], [L("用访谈原话当副标题", "Use an interview quote as the subtitle"), "idea"]])}</div>`;
    if (k === "shelf") return `<div class="stage">${head}${rows([[L("品牌指南 2026.pdf · 第 3 页", "Brand guide 2026.pdf · p. 3"), "file"], [L("竞品首屏截图 ×4", "Competitor first screens ×4"), "image"]])}</div>`;
    return `<div class="stage">${head}${rows([["品牌指南 2026.pdf", "file"], ["index.tsx", "code"], ["hero.png", "image"]])}</div>`;
  }
  const mainPage = () => `<div class="stage"><div class="turn"><div class="who">${ic("user")}${L("你", "You")}</div><p>${L("按品牌指南把首屏改成一句主张加一个主按钮。", "Rework the first screen into one claim and one primary button, per the brand guide.")}</p></div><div class="turn"><div class="who">${ic("code")}Coding</div><p>${L("看过品牌指南第 3 页，主色只用在按钮上；正在改 Hero 组件。", "Read page 3 of the brand guide; the main colour only goes on the button. Editing the Hero component.")}</p></div><div class="step">${K.renderStateRing({ state: "running" })}<span>${L("正在改 src/components/Hero.tsx", "Editing src/components/Hero.tsx")}</span></div></div>`;

  // ---------- the bar ----------
  const dock = (k, cur, act = "noop") => `<button type="button" class="dock" data-act="${act}" data-k="${k}"${cur ? ' aria-current="page"' : ""} aria-label="${esc(nm(k))}" title="${esc(nm(k))}">${ic(P[k][2])}${badge(k)}</button>`;
  const fold = (n) => `<button type="button" class="dock fold" aria-label="${esc(L(`还有 ${n} 个`, `${n} more`))}">+${n}</button>`;
  const bdiv = '<span class="bdiv" aria-hidden="true"></span>';
  function switcher() {
    if (S.plan === "1") return `<button type="button" class="switcher sw-glyph" data-act="noop" aria-label="${esc(t("switcher"))}" title="${esc(t("switcher"))}">${ic("grid")}</button>`;
    if (S.plan === "2") {
      const chips = S.side === "open" ? `<span class="chips"><span class="chip cur">${ic("code")}Coding</span><span class="chip">${ic(P[S.comp][2])}${esc(nm(S.comp))}</span></span>` : `<span class="nm">Coding</span>`;
      return `<button type="button" class="switcher" data-act="switcher" aria-haspopup="menu" aria-expanded="${S.menu === "switcher"}">${ic("grid")}${chips}${ic("chevron-up")}</button>`;
    }
    return `<button type="button" class="switcher" data-act="noop"><span class="chips"><span class="chip cur">${ic("code")}Coding</span>${S.side === "open" ? `<span class="chip">${ic("message")}${esc(nm("talk"))}</span>` : ""}</span>${ic("chevron-up")}</button>`;
  }
  function bar() {
    const ph = phone();
    const dockItems = ph ? dock("coding", true) + fold(3) : DOCK.map((k) => dock(k, k === "coding")).join("");
    let left = switcher() + (S.plan === "now" ? "" : bdiv) + dock("home", false) + dockItems;
    if (S.plan === "2" && !ph) left += bdiv + PERSONAL.map((k) => dock(k, false)).join("");
    let right;
    if (S.plan === "1") right = ph ? dock("jelly", false) + fold(2) : PERSONAL.map((k) => dock(k, false)).join("");
    else if (S.plan === "2") right = ph ? `<button type="button" class="dock" data-act="comp" data-k="${S.comp}" aria-label="${esc(L("陪着你的", "Companions"))}"${S.side === "open" ? ' aria-current="page"' : ""}>${ic("sidebar")}<span class="zbadge">${TASKS_OPEN}</span></button>` : COMPANIONS.map((k) => dock(k, S.side === "open" && S.comp === k, "comp")).join("");
    else right = ["shelf", "lingguang", "talk"].map((k) => dock(k, false)).join("") + `<button type="button" class="dock" data-act="hide"${S.side === "open" ? ' aria-current="page"' : ""} aria-label="${esc(t("hideSide"))}">${ic("sidebar")}</button>`;
    return `<div class="bar"><div class="tray tl" data-zone="left">${left}</div><div class="composer" data-zone="composer"><span class="ph">${esc(t("composer"))}</span><button type="button" class="send" aria-label="${esc(L("发送", "Send"))}">${ic("send")}</button></div><div class="tray tr" data-zone="right">${right}</div><button type="button" class="mono" aria-label="${esc(L("项目：网站改版", "Project: Website revamp"))}">${esc(L("网", "W"))}</button></div>`;
  }

  // ---------- menus ----------
  function menuHtml() {
    const it = (label, iconName, shortcut, extra = {}) => K.renderMenuItem({ label, iconName, shortcut, ...extra });
    if (S.menu === "layout") return K.renderMenuGroup({ label: t("layout"), items: [it(L("向右分屏", "Split right"), "columns"), it(L("向下分屏", "Split down"), "rows"), it(L("独看这一栏", "Focus this pane"), "maximize", "⌘⇧↵"), it(L("合并成一栏", "Merge into one"), "minus")].join("") }) + K.renderMenuGroup({ items: it(L("显示右侧", "Show the side"), undefined, "⌘\\", { checked: S.side === "open" }) }) + K.renderMenuGroup({ label: L("切到", "Go to"), items: it(`${t("main")} · Coding`, "code") + (S.side === "open" ? it(`${t("sideW")} · ${nm(S.comp)}`, P[S.comp][2]) : "") });
    if (S.menu === "switcher") return K.renderMenuGroup({ label: L("这个窗口", "This window"), items: it(`${t("main")} · Coding`, "code", "", { checked: true }) + (S.side === "open" ? it(`${t("sideW")} · ${nm(S.comp)}`, P[S.comp][2], "", { checked: false }) : "") }) + K.renderMenuGroup({ label: t("layout"), items: [it(L("向右分屏", "Split right"), "columns"), it(L("向下分屏", "Split down"), "rows"), it(L("独看这一栏", "Focus this pane"), "maximize", "⌘⇧↵")].join("") }) + K.renderMenuGroup({ label: L("插件", "Plugins"), items: DOCK.map((k) => it(nm(k), P[k][2])).join("") });
    return "";
  }
  function placeMenu() {
    document.querySelector(".pop")?.remove();
    if (!S.menu) return;
    const anchor = document.querySelector(`[data-act="${S.menu}"]`);
    if (!anchor) return;
    const pop = document.createElement("div");
    pop.className = `pop mw-menu${S.menu === "switcher" ? " up" : ""}`;
    pop.setAttribute("role", "menu");
    pop.innerHTML = menuHtml();
    document.body.append(pop);
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    if (S.menu === "switcher") { pop.style.left = `${Math.max(8, r.left)}px`; pop.style.top = `${r.top - h - 8}px`; }
    else { pop.style.left = `${Math.min(window.innerWidth - w - 8, r.right - w)}px`; pop.style.top = `${r.bottom + 6}px`; }
  }

  // ---------- zones ----------
  function union(els) {
    const rs = els.filter(Boolean).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    if (!rs.length) return null;
    return { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
  }
  function zoneTargets() {
    const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
    const main = [$(".strip.main .tabs"), $(".strip.main > .tools:not(.wtools)")];
    if (S.plan === "1") return [[main], [[$(".rail")]], [[$(".wtools")]], [[$(".tray.tl")]], [[$(".composer")]], [[$(".tray.tr"), $(".mono")]]];
    if (S.plan === "2") return [[main, [$(".strip.side .tabs")]], [[$(".tray.tl")]], [[$(".composer")]], [[$(".tray.tr"), $(".mono")]]];
    return [[[$(".strip.main .lead")]], [[$(".strip.main > .tools"), $(".tbstatus")], [...$$(".strip.side .tools")]], [[$(".strip.side .tabs")]], [[$(".tray.tr")]]];
  }
  function drawZones() {
    const layer = document.getElementById("zlayer");
    layer.innerHTML = "";
    if (!S.notes) return;
    const notes = NOTES[S.plan];
    zoneTargets().forEach((boxes, i) => {
      boxes.forEach((els, j) => {
        const u = union(els);
        if (!u) return;
        const pad = 3, bottom = u.t > window.innerHeight / 2;
        const box = document.createElement("div");
        box.className = "zbox";
        Object.assign(box.style, { left: `${u.l - pad}px`, top: `${u.t - pad}px`, width: `${u.r - u.l + pad * 2}px`, height: `${u.b - u.t + pad * 2}px` });
        layer.append(box);
        if (j > 0) return;
        const chip = document.createElement("div");
        chip.className = `zchip${bottom ? " up" : ""}`;
        chip.innerHTML = `<span class="zn">${i + 1}</span>${esc(L(notes.zones[i][0], notes.zones[i][1]))}`;
        layer.append(chip);
        const cw = chip.offsetWidth;
        chip.style.left = `${Math.max(4, Math.min(window.innerWidth - cw - 4, u.l - pad))}px`;
        chip.style.top = bottom ? `${u.t - pad - 24}px` : `${u.b + pad + 4}px`;
      });
    });
  }
  function explain() {
    const el = document.getElementById("explain");
    el.toggleAttribute("data-hide", !S.notes);
    const n = NOTES[S.plan];
    const li = n.zones.map((z, i) => `<li><span class="zn">${i + 1}</span><span><b>${esc(L(z[0], z[1]))}</b> ${esc(L(z[2], z[3]))}</span></li>`).join("");
    const tail = n.gain ? `<dl><dt>${L("好处", "Gain")}</dt><dd>${esc(L(...n.gain))}</dd><dt>${L("代价", "Cost")}</dt><dd>${esc(L(...n.cost))}</dd><dt>${L("注意力", "Attention")}</dt><dd>${esc(L(...n.mind))}</dd></dl>` : "";
    el.innerHTML = `<strong>${esc(L(...n.title))}</strong><ol class="zlist">${li}</ol>${tail}`;
  }

  // ---------- render ----------
  function render() {
    const html = document.documentElement;
    html.lang = S.lang === "zh" ? "zh-CN" : "en";
    html.dataset.theme = S.theme; html.dataset.resolvedTheme = S.theme;
    for (const n of document.querySelectorAll("[data-t]")) n.textContent = t(n.dataset.t);
    const labels = { plan: { 1: t("p1"), 2: t("p2"), now: t("now") }, side: { open: t("open"), closed: t("closed") }, theme: { light: t("light"), dark: t("dark") } };
    for (const id of ["plan", "side", "lang", "theme"]) for (const b of document.querySelectorAll(`#${id} button`)) {
      if (labels[id]) b.textContent = labels[id][b.dataset.v];
      const on = b.dataset.v === S[id];
      b.setAttribute("aria-pressed", String(on)); b.classList.toggle("is-current", on);
    }
    document.getElementById("notes").setAttribute("aria-pressed", String(S.notes));
    const app = document.getElementById("app");
    const open = S.side === "open";
    const sideW = window.innerWidth > 1180 ? "380px" : "320px";
    app.style.setProperty("--cols", open ? `minmax(0,1fr) 8px ${sideW}` : "minmax(0,1fr)");
    app.dataset.plan = S.plan;
    const mainFocus = !phone() || S.focus === "main" || !open;
    app.innerHTML = `<div class="titlebar">${mainStrip()}${open ? `<span class="gap" aria-hidden="true"></span>${sideStrip()}` : ""}</div>
      <div class="desk"><section class="pane${mainFocus ? " focus" : ""}"><div class="body">${mainPage()}</div></section>${open ? `<span class="gap" aria-hidden="true"></span><section class="pane side${mainFocus ? "" : " focus"}"><div class="body">${sidePage()}</div></section>` : ""}</div>
      ${bar()}`;
    for (const tabs of app.querySelectorAll(".strip .tabs")) {
      const sel = tabs.querySelector('[aria-selected="true"]');
      const grp = sel?.closest(".grp");
      // Keep the whole current group in view when it fits, else the current tab.
      const cur = grp && grp.getBoundingClientRect().width <= tabs.clientWidth - 48 ? grp : sel;
      if (cur && tabs.scrollWidth > tabs.clientWidth + 2) {
        const r = cur.getBoundingClientRect(), b = tabs.getBoundingClientRect();
        if (r.right > b.right - 28) tabs.scrollLeft += r.right - b.right + 36;
      }
      const edge = () => { tabs.toggleAttribute("data-start", tabs.scrollLeft > 2); tabs.toggleAttribute("data-end", tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 2); };
      tabs.addEventListener("scroll", () => { edge(); drawZones(); }, { passive: true });
      edge();
    }
    explain();
    placeMenu();
    requestAnimationFrame(drawZones);
    const u = new URL(location.href);
    for (const [k, d] of [["plan", "1"], ["side", "open"], ["lang", "zh"], ["theme", "light"]]) S[k] === d ? u.searchParams.delete(k) : u.searchParams.set(k, S[k]);
    S.notes ? u.searchParams.delete("notes") : u.searchParams.set("notes", "0");
    history.replaceState(null, "", u);
  }

  // ---------- events ----------
  for (const id of ["plan", "side", "lang", "theme"]) document.getElementById(id).addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S[id] = b.dataset.v; S.menu = ""; S.hover = "";
    if (id === "side" && S.side === "closed") S.focus = "main";
    render();
  });
  document.getElementById("notes").addEventListener("click", () => { S.notes = !S.notes; render(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) { if (S.menu && !e.target.closest(".pop")) { S.menu = ""; placeMenu(); render(); } return; }
    const act = b.dataset.act;
    if (act === "layout" || act === "switcher") { S.menu = S.menu === act ? "" : act; render(); return; }
    S.menu = "";
    if (act === "comp") {
      const k = b.dataset.k;
      if (S.plan === "2" && b.classList.contains("dock") && S.side === "open" && S.comp === k) S.side = "closed";
      else { S.comp = k; S.side = "open"; if (!S.opened.includes(k)) S.opened.push(k); if (phone()) S.focus = "side"; }
    } else if (act === "hide") { S.side = S.side === "open" ? "closed" : "open"; S.focus = "main"; }
    else if (act === "win") S.focus = b.dataset.f;
    render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.menu) { S.menu = ""; render(); }
  });
  // Hover intent: a companion icon widens in place after a short pause; the next one widens at once.
  let timer = 0;
  document.addEventListener("pointerover", (e) => {
    const tab = e.target.closest(".rail .ctab");
    if (!tab || tab.classList.contains("grow")) return;
    clearTimeout(timer);
    const quick = document.querySelector(".rail .ctab.grow");
    timer = setTimeout(() => { for (const x of document.querySelectorAll(".rail .ctab.grow")) x.classList.remove("grow"); tab.classList.add("grow"); drawZones(); }, quick ? 0 : 140);
  });
  document.addEventListener("pointerout", (e) => {
    const tab = e.target.closest(".rail .ctab");
    if (!tab || tab.contains(e.relatedTarget)) return;
    clearTimeout(timer);
    timer = setTimeout(() => { tab.classList.remove("grow"); drawZones(); }, 60);
  });
  document.addEventListener("focusin", (e) => {
    const tab = e.target.closest(".rail .ctab");
    if (tab && tab.matches(":focus-visible")) tab.classList.add("grow");
  });
  document.addEventListener("focusout", (e) => e.target.closest?.(".rail .ctab")?.classList.remove("grow"));
  let rz = 0;
  window.addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(render); });
  render();
  setTimeout(() => document.documentElement.classList.remove("booting"), 400);
})();
