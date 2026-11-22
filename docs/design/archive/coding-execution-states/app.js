// 12 · Coding 执行定样 — standalone prototype drawn with the component board's own parts (kit/kit.js: renderButton,
// renderStatusMark, renderStateRing, renderBadge, renderToggleGroup, the mw-menu and mw-toast markup, the icon sprite and
// the visual foundation client script). All data is sample data (data.js); nothing reads a folder, runs a command or calls a model.
(() => {
  const D = window.protoData;
  const K = window.mwKit;
  document.getElementById("icons").innerHTML = window.mwKitSprite;

  const KEY = "molis-proto.coding-execution-states.v2";
  const BLOCKS = D.blocks.map((b) => b.id);
  const fresh = () => ({
    block: "dir", scheme: { ...D.decided },
    state: { dir: "normal", rules: "normal", recover: "failed", steps: "normal" },
    lang: "zh", mode: "edit", draft: "", files: false, board: false, verified: {},
  });
  let S = load();
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && v.scheme && v.state && BLOCKS.includes(v.block)) return Object.assign(fresh(), v, { verified: {} });
    } catch { /* storage unavailable: start fresh */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ ...S, verified: {} })); } catch { /* storage unavailable: keep in memory */ } }

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const P = (pair) => pair[S.lang === "zh" ? 0 : 1];
  const esc = K.escapeHtml;
  const sch = () => S.scheme[S.block];
  const st = () => S.state[S.block];

  // ---------- the shared parts ----------
  const ic = (n, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const btn = (label, o = {}) => K.renderButton({
    label, variant: o.v || "secondary", size: o.size || "sm", icon: o.icon, iconOnly: o.iconOnly, disabled: o.disabled, loading: o.loading,
    className: o.cls, attrs: { "data-act": o.act, "data-arg": o.arg, "aria-haspopup": o.menu ? "menu" : undefined, "aria-expanded": o.expanded, title: o.title },
  });
  const ring = (state, size) => K.renderStateRing({ state, size });
  const tag = (label, state, tone) => K.renderStatusMark({ label, state, tone });
  const badge = (label, tone = "neutral") => K.renderBadge({ label, tone });
  // Outcome → the shared ring family and status tone (DESIGN Shapes: one ring library; the caller keeps its own words).
  const OUT = {
    ok: ["done", "done"], err: ["failed", "blocked"], unk: ["verify", "attention"], cx: ["cancelled", "quiet"],
    warn: ["interrupted", "attention"], skip: ["idle", "quiet"], wait: ["waiting", "idle"], run: ["running", "progress"],
  };

  const W = {
    waitPrev: () => L("等待前一步", "Waiting for the previous step"),
    unknown: () => L("结果未知", "Result unknown"),
    toCheck: () => L("结果未知，待核对", "Result unknown — check it"),
    signal: () => L("被系统结束", "Ended by the system"),
    exitN: (n) => L(`退出 ${n}`, `Exit ${n}`),
    ok: () => L("成功", "Succeeded"),
    notRun: () => L("没有运行", "Not run"),
    done: () => L("完成", "Done"),
    running: () => L("进行中", "In progress"),
    failed: () => L("失败", "Failed"),
    checked: () => L("核对过：已完成", "Checked: finished"),
  };
  const MODES = [
    { id: "discuss", ro: true, n: ["讨论", "Discuss"], d: ["只回答，不改文件", "Answers only, changes no files"] },
    { id: "plan", ro: true, n: ["规划", "Plan"], d: ["列步骤，不改文件", "Lists steps, changes no files"] },
    { id: "edit", ro: false, n: ["修改", "Edit"], d: ["改文件，跑测试和构建", "Changes files, runs tests and builds"] },
    { id: "execute", ro: false, n: ["执行", "Execute"], d: ["按计划一步步做完", "Works through the plan"] },
    { id: "review", ro: true, n: ["评审", "Review"], d: ["看改动、提意见，不改文件", "Reviews changes, changes no files"] },
  ];
  const modeOf = (id) => MODES.find((m) => m.id === id) || MODES[2];
  const RULES = [
    { file: "website/AGENTS.md", where: ["整个仓库", "Whole repo"], ver: ["10-31 改过", "changed 10-31"] },
    { file: "website/src/AGENTS.md", where: ["src/ 下的文件", "Files under src/"], ver: ["10-28 改过", "changed 10-28"] },
  ];

  // ---------- prototype strip ----------
  function proto() {
    const seg = (label, items, cls = "") => K.renderToggleGroup({ label, items, className: cls }).replace('data-slot="toggle-group"', 'data-slot="toggle-group" data-seg-thumb');
    const decided = D.decided[S.block];
    const schemes = seg(L("方案", "Scheme"), ["A", "B", "C"].map((x) => ({ value: x, label: x + (decided === x ? " ✓" : ""), current: x === sch(), attrs: { "data-proto": "scheme", title: P(D.schemes[S.block][x]) } })));
    const lang = seg(L("语言", "Language"), [["zh", "中"], ["en", "EN"]].map(([v, l]) => ({ value: v, label: l, current: S.lang === v, attrs: { "data-proto": "lang" } })));
    const resolved = document.documentElement.dataset.theme || "system";
    const theme = seg(L("外观", "Theme"), [["light", L("浅", "Light")], ["dark", L("深", "Dark")], ["system", L("跟随", "Auto")]].map(([v, l]) => ({ value: v, label: l, current: resolved === v, attrs: { "data-theme-option": v } })));
    document.getElementById("proto").innerHTML = `<b>${L("原型 · 模拟数据", "Prototype · sample data")}</b>
      <label>${L("块", "Block")}<select id="p-block">${D.blocks.map((b) => `<option value="${b.id}"${b.id === S.block ? " selected" : ""}>${esc(P(b.name))}</option>`).join("")}</select></label>
      <label>${L("方案", "Scheme")}${schemes}</label><span class="sname">${esc(P(D.schemes[S.block][sch()]))}${decided === sch() ? L(" · 已定", " · decided") : ""}</span>
      <label>${L("状态", "State")}<select id="p-state">${D.states[S.block].map(([id, zh, en]) => `<option value="${id}"${id === st() ? " selected" : ""}>${esc(L(zh, en))}</option>`).join("")}</select></label>
      <label>${L("语言", "Language")}${lang}</label><label>${L("外观", "Theme")}${theme}</label>
      ${btn(L("重置", "Reset"), { act: "reset", v: "ghost" })}`;
  }

  // ---------- frame ----------
  function head(extraTools = "") {
    const filesBtn = btn(L("文件", "Files"), { icon: "folder-tree", act: "toggle-files", cls: "only-narrow", expanded: String(S.files) });
    const boardBtn = S.block === "steps" ? btn(L("任务板", "TaskBoard"), { icon: "list-ordered", act: "toggle-board", cls: "only-board-narrow", expanded: String(S.board) }) : "";
    return `<header class="c-head"><h1>Coding</h1><span class="sub ell grow">${L("首页改版：换成新的首屏", "Home redesign: a new hero")}</span>
      <span class="facts only-wide"><span>${ic("git-branch", "sm")}main</span><span>${L("2 处改动", "2 changes")}</span></span>${extraTools}<span class="tools">${filesBtn}${boardBtn}</span></header>`;
  }
  function frame(p) {
    const cls = ["c-body", S.block === "steps" ? "has-board" : "", S.files ? "files-open" : "", S.board && S.block === "steps" ? "board-open" : ""].join(" ");
    return `${head()}${p.top || ""}<div class="${cls}">${p.dir}<div class="c-main"><div class="c-scroll"><div class="c-column">${p.work}</div></div>${p.composer}</div>${p.board || ""}<button class="scrim" data-act="close-drawers" aria-label="${L("关闭", "Close")}"></button></div>`;
  }
  let riseIndex = 0;
  const rise = (html) => `<div class="rise" style="--i:${Math.min(riseIndex++, 11)}">${html}</div>`;
  const you = (text) => rise(`<div style="display:grid"><div class="you">${esc(text)}</div></div>`);
  const round = (mode, extra = "") => rise(`<div class="round">${ic("history", "sm")}<span class="ell"><b>${L("本轮", "This round")}</b> · ${esc(P(modeOf(mode).n))} · ${L("10:42 开始", "started 10:42")}${extra}</span></div>`);
  const ai = (html) => rise(`<div class="ai"><div class="who">${ic("sparkles", "sm")}Coding</div>${html}</div>`);
  const working = (text) => rise(`<div class="working">${K.renderStatusMark({ label: text, state: "running", tone: "progress", plain: true })}</div>`);
  function treeRows(folderId) {
    return (D.tree[folderId] || []).map(([icon, name, depth, mark]) => `<button type="button" class="mw-dir-row${name === "Hero.tsx" ? " is-selected" : ""}" style="padding-left:${8 + depth * 16}px">${ic(icon, "sm")}<span class="nm">${esc(name)}</span>${mark ? `<span class="m">${mark}</span>` : "<span></span>"}</button>`).join("");
  }
  function dirCol(o) {
    return `<aside class="c-dir${o.dim ? " is-dim" : ""}" aria-label="${L("文件", "Files")}"><div class="c-dir__head">${o.head}</div><div class="c-dir__list">${o.list ?? treeRows(o.folder)}</div></aside>`;
  }
  const simpleDirHead = (name, kindBadge) => `<div class="c-dir__label">${ic("folder-tree", "xs")}<span class="ell grow" style="color:var(--ink-soft);font-size:12px;font-weight:500">${esc(name)}</span>${kindBadge}${btn(L("看别的文件夹", "View another folder"), { icon: "chevron-down", iconOnly: true, v: "ghost", act: "view-menu", menu: true })}</div>`;
  const workBadge = () => badge(L("工作目录", "Working folder"), "info");
  const roBadge = () => badge(L("只读参考", "Read-only reference"), "neutral");

  function composer(o = {}) {
    const m = modeOf(S.mode);
    const modeCtl = o.seg ? "" : btn(P(m.n), { icon: m.ro ? "lock" : "edit", act: "mode-menu", menu: true, title: P(m.d) });
    const segCtl = o.seg ? `<div class="modes">${K.renderToggleGroup({ label: L("模式", "Mode"), items: MODES.map((x) => ({ value: x.id, label: P(x.n) + (x.ro ? " · " + L("只读", "RO") : ""), current: x.id === S.mode, attrs: { "data-act": "set-mode", "data-arg": x.id, title: P(x.d) } })) }).replace('data-slot="toggle-group"', 'data-slot="toggle-group" data-seg-thumb')}</div>` : "";
    const send = btn(L("发送", "Send"), { v: "primary", icon: "send", iconOnly: true, size: "md", act: "send", cls: "send", disabled: o.sendDisabled, title: o.sendNote });
    return `<div class="c-compose"><div class="c-compose__in">${o.chips ? `<div class="chips">${o.chips}</div>` : ""}${o.above || ""}
      <div class="box${m.ro && o.tint ? " is-ro" : ""}">${segCtl}<textarea id="draft" rows="2" aria-label="${L("消息", "Message")}" placeholder="${esc(L("告诉 Coding 要做什么", "Tell Coding what to do"))}">${esc(S.draft)}</textarea>
      <div class="box__foot">${modeCtl}${rulesChip()}<span class="cap only-wide">MiniMax-M3</span><span class="grow"></span>${o.sendNote ? `<span class="cap ell">${esc(o.sendNote)}</span>` : ""}${send}</div></div></div></div>`;
  }
  function rulesChip() {
    const s = S.block === "rules" ? st() : "normal";
    const extra = s === "untrusted" ? badge(L("没加载", "Not loaded"), "warning") : s === "changed" ? badge(L("1 份有新版本", "1 updated"), "warning") : "";
    return `<span style="display:inline-flex;align-items:center;gap:4px">${btn(L("规则 2", "Rules 2"), { icon: "book", v: "ghost", act: "rules-menu", menu: true })}${extra}</span>`;
  }

  // ---------- block: 目录 ----------
  function dirFacts() {
    const s = st();
    return { s, out: s === "none" ? null : s === "frozen" ? "website-v2" : "website", runAt: s === "worktree" ? ".worktrees/home-hero" : ["none", "missing"].includes(s) ? null : "website", viewing: s === "browsing" ? "brand-assets" : null, running: !["none", "missing"].includes(s) };
  }
  function dirNotices(f, kind) {
    const wrap = (tone, icon, text, acts = "") => kind === "banner"
      ? `<div class="banner ${tone}">${ic(icon, "sm")}<span class="grow">${text}</span>${acts ? `<span class="acts">${acts}</span>` : ""}</div>`
      : `<div class="hint ${tone}">${ic(icon, "sm")}<span class="grow">${text}</span>${acts ? `<span class="acts">${acts}</span>` : ""}</div>`;
    const out = [];
    if (f.viewing) out.push(wrap("tone-info", "eye", L(`正在看 ${f.viewing}（只读参考），Coding 仍在工作目录里做`, `Viewing ${f.viewing} (read-only reference); Coding keeps working in the working folder`), btn(L("回到工作目录", "Back to working folder"), { act: "back-to-work" })));
    if (f.s === "frozen" && kind === "banner") out.push(wrap("tone-wait", "clock", L("本轮仍在 website（开始时的设置），下一轮起用 website-v2", "This round stays in website (its starting setting); website-v2 from the next round")));
    if (f.s === "worktree" && kind === "banner") out.push(wrap("tone-info", "git-branch", L("本轮在临时副本里做，完成后经你审查交回 website", "This round works in a temporary copy; it comes back to website after your review"), btn(L("看差异", "See diff"), { icon: "git-compare", act: "toast", arg: L("打开差异（模拟）", "Opening the diff (sample)") })));
    if (f.s === "missing") out.push(wrap("tone-err", "circle-alert", L("找不到 ~/code/website。下一轮发不出去；之前的改动记录还在。", "~/code/website is gone. The next round can't start; earlier change records are kept."), btn(L("重新找到位置", "Locate it"), { v: "primary", act: "relocate" }) + btn(L("换一个输出", "Pick another output"), { act: "io-menu", menu: true })));
    if (f.s === "none") out.push(wrap("tone-wait", "folder", L("这个项目还没有输出文件夹，Coding 不知道在哪里做。", "This project has no output folder yet, so Coding doesn't know where to work."), btn(L("选文件夹", "Choose folder"), { v: "primary", act: "pick-output" }) + btn(L("用引导设置", "Set up with guide"), { act: "toast", arg: L("打开引导「从 Coding 的缺项进入」，设好后回到这里（见 04 定样）", "Opens the onboarding “from a Coding gap” path, then returns here (see 04)") })));
    return out.join("");
  }
  function dirWork(f, scheme) {
    const where = scheme === "A" ? "" : f.s === "frozen" ? ` · ${L("在 website", "in website")} ${badge(L("下一轮起用 website-v2", "website-v2 from next round"), "warning")}` : f.s === "worktree" ? ` · ${L("在临时副本", "in a temporary copy")}` : f.runAt ? ` · ${L(`在 ${f.runAt}`, `in ${f.runAt}`)}` : "";
    let html = you(L("按品牌指南把首屏改成一句主张加一个主按钮。", "Following the brand guide, make the hero one claim and one primary button."));
    if (!f.running) return html + rise(`<div class="round">${ic("history", "sm")}<span class="ell"><b>${L("上一轮", "Last round")}</b> · ${L("修改", "Edit")} · ${L("昨天 17:20 结束", "ended yesterday 17:20")}</span></div>`) + ai(`<p>${L("首屏已改成一句主张和一个主按钮，测试通过。", "The hero is now one claim and one button; tests pass.")}</p>`);
    html += round("edit", where);
    html += ai(`<p>${L("看过品牌指南第 3 页和配色说明，首屏改成一句主张、一个主按钮，主色只用在按钮上。", "Read page 3 of the brand guide and the colour notes; the hero becomes one claim and one button, brand colour only on the button.")}</p><div class="cites"><span class="cite">${ic("link", "xs")}品牌指南 2026.pdf · brand-assets</span><span class="cite">${ic("link", "xs")}配色说明.md · brand-assets</span></div>`);
    html += working(L(`正在改 ${f.s === "worktree" ? ".worktrees/home-hero/" : ""}src/components/Hero.tsx`, `Editing ${f.s === "worktree" ? ".worktrees/home-hero/" : ""}src/components/Hero.tsx`));
    return html;
  }
  function dirBlock() {
    const f = dirFacts(), scheme = sch();
    const shown = f.viewing || (f.s === "worktree" ? "home-hero" : f.out || "—");
    const folder = f.viewing ? "brand" : f.s === "none" ? null : "website";
    const sendDisabled = !f.out || f.s === "missing";
    const sendNote = f.s === "missing" ? L("先处理输出文件夹", "Fix the output folder first") : !f.out ? L("先选输出文件夹", "Choose an output folder first") : "";
    const emptyList = `<div class="mw-empty"><span class="mw-empty__mark">${K.icon("folder")}</span><strong>${L("还没有文件夹", "No folder yet")}</strong><p>${L("选一个输出文件夹，Coding 就在那里做。", "Choose an output folder and Coding works there.")}</p><div class="mw-empty__actions">${btn(L("选文件夹", "Choose folder"), { act: "pick-output" })}</div></div>`;
    if (scheme === "A" || scheme === "B") {
      const dir = dirCol({ head: simpleDirHead(shown, f.viewing ? roBadge() : workBadge()), folder, list: folder ? undefined : emptyList, dim: f.s === "missing" });
      if (scheme === "A") {
        const outV = f.out ? `<b>${esc(f.out)}</b>` : `<b>${L("未设置", "Not set")}</b>`;
        const outTag = f.s === "missing" ? badge(L("不见了", "Missing"), "danger") : !f.out ? badge(L("先选一个", "Choose one"), "warning") : "";
        const top = `<div class="c-loc"><span class="f">${ic("output", "sm")}${L("项目输出", "Project output")} ${outV}${outTag}</span>${f.runAt ? `<span class="f">${ic("terminal", "sm")}${L("本轮在", "This round in")} <b>${esc(f.runAt)}</b></span>` : ""}<span class="grow"></span>${btn(L("参考 2 个（只读）", "2 references (read-only)"), { icon: "input", v: "ghost", act: "io-menu", menu: true, cls: "hide-xs" })}</div>${dirNotices(f, "banner")}`;
        return frame({ top, dir, work: dirWork(f, "A"), composer: composer({ sendDisabled, sendNote }) });
      }
      const where = f.s === "missing" ? btn(L("website 不见了", "website is missing"), { icon: "circle-alert", act: "io-menu", menu: true }) : !f.out ? btn(L("还没选在哪里做", "Where to work? Not chosen"), { icon: "folder", act: "pick-output" }) : btn(L(`在 ${f.out} 里做`, `In ${f.out}`), { icon: "terminal", act: "io-menu", menu: true });
      const refs = btn(L("参考 2 个", "2 references"), { icon: "input", v: "ghost", act: "io-menu", menu: true });
      const above = f.viewing || f.s === "missing" || f.s === "none" ? dirNotices({ ...f, s: ["frozen", "worktree"].includes(f.s) ? "normal" : f.s }, "hint") : "";
      return frame({ dir, work: dirWork(f, "B"), composer: composer({ chips: where + refs, above, sendDisabled, sendNote }) });
    }
    // C · the Files column header carries the working folder (decided 2026-11-04).
    const pickTag = f.viewing ? roBadge() : f.s === "missing" ? badge(L("不见了", "Missing"), "danger") : workBadge();
    const note = f.viewing ? `<div class="dir-note tone tone-info"><span>${L("临时查看；Coding 仍在 website 里做", "Just viewing; Coding keeps working in website")}</span><div class="acts">${btn(L("回到工作目录", "Back to working folder"), { act: "back-to-work" })}</div></div>`
      : f.s === "frozen" ? `<div class="dir-note tone tone-wait"><span>${L("本轮仍在 website（开始时的设置）；下一轮起用 website-v2", "This round stays in website (its starting setting); website-v2 from next round")}</span></div>`
      : f.s === "worktree" ? `<div class="dir-note tone tone-info"><span>${L("本轮在临时副本里做，完成后经你审查交回 website", "Temporary copy; comes back to website after your review")}</span><div class="acts">${btn(L("看差异", "See diff"), { icon: "git-compare", act: "toast", arg: L("打开差异（模拟）", "Opening the diff (sample)") })}</div></div>`
      : f.s === "missing" ? `<div class="dir-note tone tone-err"><span>${L("找不到 ~/code/website；下一轮发不出去，之前的改动记录还在", "~/code/website is gone; the next round can't start, earlier records are kept")}</span><div class="acts">${btn(L("重新找到位置", "Locate it"), { v: "primary", act: "relocate" })}${btn(L("换一个", "Pick another"), { act: "io-menu", menu: true })}</div></div>`
      : `<div class="dir-note">${L("本轮在这里做 · 也是项目输出", "This round works here · also the project output")}</div>`;
    const headC = f.s === "none"
      ? `<div class="c-dir__label">${L("Coding 在哪里做", "Where Coding works")}</div>`
      : `<div class="c-dir__label">${L("Coding 在哪里做", "Where Coding works")}</div><button type="button" class="picker" data-act="view-menu" aria-haspopup="menu">${ic("folder-tree", "sm")}<span class="nm">${esc(shown)}</span>${pickTag}${ic("chevron-down", "sm")}</button>${note}`;
    const emptyC = `<div class="mw-empty"><span class="mw-empty__mark">${K.icon("folder")}</span><strong>${L("这个项目还没有输出文件夹", "This project has no output folder yet")}</strong><p>${L("选一个，Coding 就在那里做；也可以用引导一步步设。", "Choose one and Coding works there, or set it up with the guide.")}</p><div class="mw-empty__actions">${btn(L("选文件夹", "Choose folder"), { act: "pick-output" })}${btn(L("用引导设置", "Use the guide"), { act: "toast", arg: L("打开引导「从 Coding 的缺项进入」（见 04 定样）", "Opens the onboarding “from a Coding gap” path (see 04)") })}</div></div>`;
    const dir = dirCol({ head: headC, folder, list: f.s === "none" ? emptyC : undefined, dim: f.s === "missing" });
    const narrowTone = f.s === "missing" ? "tone-err" : f.s === "none" || f.s === "frozen" ? "tone-wait" : "tone-info";
    const narrow = `<div class="hint ${narrowTone} only-narrow">${ic("terminal", "sm")}<span class="grow">${f.viewing ? L(`正在看 ${f.viewing}；本轮在 website`, `Viewing ${f.viewing}; this round in website`) : f.runAt ? L(`本轮在 ${f.runAt}`, `This round in ${f.runAt}`) : f.s === "missing" ? L("website 不见了", "website is missing") : L("还没有工作目录", "No working folder yet")}</span><span class="acts">${btn(L("文件", "Files"), { act: "toggle-files" })}</span></div>`;
    return frame({ dir, work: rise(narrow) + dirWork(f, "C"), composer: composer({ sendDisabled, sendNote }) });
  }

  // ---------- block: 规则和模式 ----------
  const devIntent = (s) => /改|删|加|修|换|写|重构|fix|change|delete|remove|add|edit|rename|refactor/i.test(s || "");
  function rulesWork(s) {
    if (s === "review") {
      return you(L("看一下首屏这次的改动。", "Review the hero changes.")) + round("review") + ai(`<p>${L("看了 2 个文件的改动，有 3 条意见：", "Reviewed changes in 2 files; 3 notes:")}</p><ol style="margin:0;padding-left:20px;display:grid;gap:4px"><li>${L("主按钮在窄屏下被截断", "The primary button is clipped on narrow screens")}</li><li>${L("旧的 Banner 组件已经没人用了", "The old Banner component is unused")}</li><li>${L("主张文案超过 24 个字", "The claim is over 24 characters")}</li></ol>`) + rise(`<div class="self">${ic("info", "sm")}${L("评审只看不改：这一轮没有改任何文件。", "Review only reads: no files changed this round.")}</div>`);
    }
    if (s === "readonly") return you(L("首屏现在为什么这么挤？", "Why does the hero feel so crowded?")) + round("discuss") + ai(`<p>${L("首屏同时放了主张、两段说明、三个按钮和一张大图，视线没有落点。", "The hero holds a claim, two paragraphs, three buttons and a large image; the eye has nowhere to land.")}</p>`) + rise(`<div class="self">${ic("info", "sm")}${L("讨论只回答：这一轮没有改任何文件。", "Discuss only answers: no files changed this round.")}</div>`);
    const rulesLink = S.scheme.rules === "B" ? ` · ${L("规则：AGENTS.md 等 2 份", "Rules: AGENTS.md and 1 more")}` : "";
    let html = you(L("按品牌指南把首屏改成一句主张加一个主按钮。", "Following the brand guide, make the hero one claim and one primary button.")) + round("edit", rulesLink);
    if (s === "changed") html += rise(`<div class="recover tone-info"><div class="recover__title">${ic("info", "sm")}${L("规则文件在运行中改了", "A rules file changed during this round")}</div><p>${L("website/AGENTS.md 在 10:47 改过。本轮仍按 10:02 的版本做，下一轮起用新版本。", "website/AGENTS.md changed at 10:47. This round keeps the 10:02 version; the new one applies from the next round.")}</p><div class="acts">${btn(L("看改了什么", "See what changed"), { act: "toast", arg: L("显示两版差异（模拟）", "Showing the two versions (sample)") })}</div></div>`);
    if (s === "untrusted") html += rise(`<div class="recover tone-wait"><div class="recover__title">${ic("circle-alert", "sm")}${L("website 里的规则没有生效", "The rules in website are not in effect")}</div><p>${L("这个项目还没被信任，所以 AGENTS.md 没有加载。信任只决定读不读这些规则，不会给 Coding 多开权限。", "This project isn't trusted yet, so AGENTS.md wasn't loaded. Trust only decides whether these rules are read; it gives Coding no extra permissions.")}</p><div class="acts">${btn(L("信任这个项目", "Trust this project"), { v: "primary", act: "toast", arg: L("打开平台的信任确认（模拟）", "Opens the platform trust confirmation (sample)") })}${btn(L("先看看规则写了什么", "Read the rules first"), { act: "rules-menu", menu: true })}</div></div>`);
    return html + ai(`<p>${L("首屏改成一句主张、一个主按钮。", "The hero becomes one claim and one button.")}</p>`) + working(L("正在改 src/components/Hero.tsx", "Editing src/components/Hero.tsx"));
  }
  function rulesBlock() {
    const scheme = sch(), m = modeOf(S.mode);
    let above = "";
    if (scheme === "A" && m.ro) above = `<div class="hint tone-info" role="status">${ic("lock", "sm")}<span class="grow">${L(`「${P(m.n)}」只读：这一轮不改文件，也不跑会改东西的命令`, `“${P(m.n)}” is read-only: no file changes, no commands that change things`)}</span><span class="acts">${btn(L("换成修改", "Switch to Edit"), { act: "set-mode", arg: "edit" })}</span></div>`;
    if (scheme === "C" && S.autoSwitched) above = `<div class="hint tone-info" role="status">${ic("wand", "sm")}<span class="grow">${L("Coding 看这条要改文件，换成「修改」后发出了", "Coding saw this needs file changes, switched to “Edit” and sent it")}</span><span class="acts">${btn(L("撤销", "Undo"), { act: "undo-switch" })}</span></div>`;
    return frame({ dir: dirCol({ head: simpleDirHead("website", workBadge()), folder: "website" }), work: rulesWork(st()), composer: composer({ above, seg: scheme === "C", tint: scheme !== "B" }) });
  }

  // ---------- block: 恢复 ----------
  function recoverFacts() {
    const s = st(), v = !!S.verified.recover;
    const install = { k: "ok", cmd: "npm install", t: "8.1s", word: W.ok() };
    const test = { k: "ok", cmd: "npm test", t: "21.4s", word: W.ok() };
    const build = { k: "ok", cmd: "npm run build", t: "34.0s", word: W.ok() };
    const e2e = { k: "skip", cmd: "npx playwright test home", t: "", word: W.notRun() };
    const kept = [L("2 个文件的改动在磁盘上", "Changes to 2 files are on disk"), L("命令输出已保存", "Command output saved")];
    const again = L("已重新运行（模拟）", "Re-run (sample)"), output = L("打开输出（模拟）", "Opening output (sample)");
    let cmds, focus, rec, running = false;
    switch (s) {
      case "failed":
        focus = { k: "err", cmd: "npm test", t: "19.8s", word: W.exitN(1) };
        cmds = [install, focus, { ...build, k: "skip", t: "", word: W.notRun() }, e2e];
        rec = { tone: "err", title: L("npm test 没过：2 个测试失败", "npm test failed: 2 tests"), body: L("Hero.test.tsx 里找不到旧的「免费试用」按钮。可以让 Coding 按新首屏改测试，或先看失败输出。", "Hero.test.tsx can't find the old “Free trial” button. Let Coding update the test for the new hero, or read the output first."), kept, acts: [["primary", "fix", L("让 Coding 修", "Let Coding fix it")], ["secondary", "toast", L("看失败输出", "See the output"), output]], tech: "exit 1 · 19.8s · cwd ~/code/website\nFAIL src/components/Hero.test.tsx (2)" };
        break;
      case "unknown":
        focus = v ? { k: "ok", cmd: "npm run build", t: "≈34s", word: W.checked(), landed: true } : { k: "unk", cmd: "npm run build", t: "34.0s", word: W.unknown() };
        cmds = [install, test, focus, e2e];
        rec = v ? { tone: "ok", title: L("核对过：构建已经完成", "Checked: the build finished"), body: L("dist/ 在 10:44 更新，构建进程已经不在了。没有重新运行。", "dist/ was updated at 10:44 and the build process is gone. Nothing was re-run."), kept: [], acts: [["secondary", "toast", L("还是重新跑一次", "Run it again anyway"), again]], tech: "dist/index.html mtime 10:44:12 · pid 48213 not running" }
          : { tone: "wait", title: L("npm run build 结果未知", "npm run build: result unknown"), body: L("没收到退出码：可能做完了，也可能中途断了。先核对产物和进程，不会自动重跑。", "No exit code came back: it may have finished or stopped midway. Check the output and process first; nothing re-runs by itself."), kept, acts: [["primary", "verify", L("先核对", "Check first")], ["secondary", "toast", L("重新运行", "Run again"), again]], tech: "exit ? · no exit event received · 34.0s · cwd ~/code/website" };
        break;
      case "cancelled":
        focus = { k: "cx", cmd: "npm test", t: "6.2s", word: L("已取消（你在 10:43 停的）", "Cancelled (you stopped it at 10:43)") };
        cmds = [install, focus, { ...build, k: "skip", t: "", word: W.notRun() }, e2e];
        rec = { tone: "info", title: L("你停了 npm test", "You stopped npm test"), body: L("后面的命令没有运行。想接着做就从 npm test 重新开始。", "The commands after it didn't run. To carry on, start again from npm test."), kept, acts: [["primary", "toast", L("从这里重新运行", "Run again from here"), again]], tech: "exit cancelled · 6.2s · cwd ~/code/website" };
        break;
      case "timeout":
        focus = { k: "warn", cmd: "npm run build", t: "120s", word: L("超时（120 秒）", "Timed out (120 s)") };
        cmds = [install, test, focus, e2e];
        rec = { tone: "wait", title: L("npm run build 120 秒没结束，已停止", "npm run build ran past 120 s and was stopped"), body: L("这个项目第一次构建通常更久。可以放宽到 5 分钟再跑一次。", "A first build in this project often takes longer. Allow 5 minutes and run it again."), kept, acts: [["primary", "toast", L("放宽到 5 分钟再跑", "Allow 5 min and run"), L("已按 5 分钟重新运行（模拟）", "Re-run with 5 min (sample)")], ["secondary", "toast", L("看输出", "See output"), output]], tech: "exit timed-out · limit 120s · cwd ~/code/website" };
        break;
      case "signal":
        focus = { k: "warn", cmd: "npm test", t: "41.0s", word: W.signal() };
        cmds = [install, focus, { ...build, k: "skip", t: "", word: W.notRun() }, e2e];
        rec = { tone: "wait", title: L("npm test 被系统结束了", "npm test was ended by the system"), body: L("没有正常退出，常见原因是内存不够或被别的程序关掉。测试有没有过不知道。", "It didn't exit normally — often low memory or another program closed it. Whether the tests passed is unknown."), kept, acts: [["primary", "toast", L("重新运行", "Run again"), again], ["secondary", "toast", L("看输出", "See output"), output]], tech: "exit none (a signal ended it) · SIGKILL · 41.0s" };
        break;
      case "interrupted":
        focus = v ? { k: "ok", cmd: "npm run build", t: "≈30s", word: W.checked(), landed: true } : { k: "unk", cmd: "npm run build", t: "", word: W.unknown() };
        cmds = [install, test, focus, e2e];
        rec = v ? { tone: "ok", title: L("核对过：构建在关掉前已经完成", "Checked: the build finished before the app closed"), body: L("可以接着跑后面的命令。", "You can continue with the next command."), kept: [], acts: [["primary", "toast", L("接着做", "Continue"), L("已接着做（模拟）", "Continuing (sample)")]], tech: "dist/ mtime 10:44 · no process" }
          : { tone: "wait", title: L("Molis Work 在这一轮运行时关掉了", "Molis Work closed while this round was running"), body: L("重新打开后先核对：npm run build 那时在跑，不知道做完没有。不会自动重跑。", "Check first after reopening: npm run build was running and may not have finished. Nothing re-runs by itself."), kept, acts: [["primary", "verify", L("先核对", "Check first")]], tech: "round 7f3a · last event 10:43:58 · host restarted 10:51" };
        break;
      default:
        running = true;
        focus = { k: "run", cmd: "npm test", t: "12s", word: W.running() };
        cmds = [install, focus, { ...build, k: "wait", t: "", word: W.waitPrev() }, { ...e2e, k: "wait", word: W.waitPrev() }];
        rec = null;
    }
    const c = cmds.reduce((a, x) => { a[x.k] = (a[x.k] || 0) + 1; return a; }, {});
    const parts = (zh) => [[c.ok, zh ? "条成功" : "succeeded"], [c.err, zh ? "条失败" : "failed"], [c.unk, zh ? "条结果未知" : "unknown"], [c.warn, zh ? "条没正常结束" : "didn't end normally"], [c.cx, zh ? "条已取消" : "cancelled"], [c.skip, zh ? "条没有运行" : "not run"]].filter(([n]) => n).map(([n, w]) => zh ? `${n} ${w}` : `${n} ${w}`);
    const end = running ? L(`运行中 · 第 2 条，共 ${cmds.length} 条`, `Running · 2 of ${cmds.length}`) : L(`本轮结束 · ${cmds.length} 条命令：${parts(true).join("，")}`, `Round ended · ${cmds.length} commands: ${parts(false).join(", ")}`);
    return { s, cmds, focus, rec, end, running };
  }
  function cmdRow(x, open) {
    const [r, tone] = OUT[x.k];
    const stop = x.k === "run" ? btn(L("停止", "Stop"), { icon: "pause", act: "toast", arg: L("已请求停止（模拟）", "Stop requested (sample)") }) : "";
    return `<div class="row${["skip", "wait", "cx"].includes(x.k) ? " is-quiet" : ""}${open ? ` is-open${x.k === "err" ? " is-err" : ""}` : ""}"${x.landed ? " data-craft-new" : ""}>${ring(r)}<span class="nm mono">${esc(x.cmd)}</span>${x.t ? `<span class="t">${esc(x.t)}</span>` : ""}${tag(x.word, undefined, tone)}${stop}</div>`;
  }
  function recHtml(rec, compact = false) {
    if (!rec) return "";
    const icon = { err: "circle-alert", wait: "circle-alert", info: "info", ok: "check" }[rec.tone];
    const acts = rec.acts.map(([v, act, label, arg]) => btn(label, { v, act, arg, loading: act === "verify" && S.checking })).join("");
    const carry = rec.tone === "ok" || rec.tone === "info" ? "" : btn(L("先往下走", "Carry on"), { v: "ghost", act: "toast", arg: L("先往下走；这一条留在待处理里", "Carrying on; this stays in to-do") });
    const kept = rec.kept.length ? `<div class="kept">${rec.kept.map((k) => `<span>${ic("check", "xs")}${esc(k)}</span>`).join("")}</div>` : "";
    const inner = `<div class="recover__title">${ic(icon, "sm")}${esc(rec.title)}</div><p>${esc(rec.body)}</p>${kept}<div class="acts">${acts}${carry}</div><details class="tech"><summary>${ic("chevron-right", "xs")}${L("技术细节", "Details")}</summary><code>${esc(rec.tech)}</code></details>`;
    return compact ? `<div class="row-x ${rec.tone === "err" ? "is-err" : rec.tone === "info" || rec.tone === "ok" ? "is-info" : ""}"><div class="recover" style="padding:0;background:none">${inner}</div></div>`
      : `<div class="recover tone-${rec.tone}" role="${rec.tone === "info" || rec.tone === "ok" ? "status" : "alert"}">${inner}</div>`;
  }
  function recoverBlock() {
    const f = recoverFacts(), scheme = sch();
    const rows = f.cmds.map((x) => (scheme === "B" && x === f.focus && f.rec ? cmdRow(x, true) + recHtml(f.rec, true) : cmdRow(x, false))).join("");
    const list = `<div class="list"><div class="list__head"><span class="grow">${ic("terminal", "sm")}${L("命令", "Commands")} · ${f.cmds.length}</span></div>${rows}${scheme === "C" ? "" : `<div class="list__foot">${f.running ? ring("running") : ic("history", "sm")}<span class="ell" title="${esc(f.end)}"><b>${esc(f.end)}</b></span></div>`}</div>`;
    let work = you(L("跑一遍测试和构建，确认首屏改动没弄坏别的。", "Run the tests and build to make sure the hero change broke nothing.")) + round("execute", ` · ${L("在 website", "in website")}`);
    if (f.s === "interrupted" && scheme === "A") work += rise(recHtml(f.rec));
    work += rise(list);
    if (scheme === "A" && f.s !== "interrupted") work += f.rec ? rise(recHtml(f.rec)) : "";
    let above = "";
    if (scheme === "C") {
      const tone = !f.rec ? "tone-info" : `tone-${f.rec.tone}`;
      const lead = f.running ? ring("running") : ic(f.rec && f.rec.tone !== "info" && f.rec.tone !== "ok" ? "circle-alert" : "info", "sm");
      const verify = f.rec && f.rec.acts[0][1] === "verify" ? btn(f.rec.acts[0][2], { v: "primary", act: "verify", loading: S.checking }) : "";
      above = `<div class="hint ${tone}" role="status">${lead}<span class="grow">${esc(f.rec ? f.rec.title : f.end)}</span>${f.rec ? `<span class="acts">${verify}${btn(L("怎么办", "Options"), { act: "rec-pop", menu: true })}</span>` : ""}</div>`;
    }
    return frame({ dir: dirCol({ head: simpleDirHead("website", workBadge()), folder: "website" }), work, composer: composer({ above }) });
  }

  // ---------- block: 计划卡与任务板 ----------
  function stepsModel() {
    const s = st(), v = !!S.verified.steps;
    const list = D.steps.map((x) => ({ ...x }));
    if (s === "revised") list.splice(2, 0, { ...D.inserted, isNew: true });
    const status = { normal: "ddrww", nested: "ddrww", unknown: v ? "ddddr" : "ddduw", failed: "dddew", revised: "ddrwww" }[s];
    const K2 = { d: "done", r: "run", w: "wait", e: "err", u: "unk" };
    list.forEach((x, i) => { x.k = K2[status[i]]; x.pos = i + 1; if (v && s === "unknown" && i === 3) x.landed = true; });
    return { s, list, cur: list.find((x) => ["run", "unk", "err"].includes(x.k)) };
  }
  const STEP = { done: ["done", "done"], run: ["running", "progress"], wait: ["waiting", "idle"], err: ["failed", "blocked"], unk: ["verify", "attention"] };
  const stepWord = (k) => ({ done: W.done(), run: W.running(), wait: W.waitPrev(), err: W.failed(), unk: W.toCheck() })[k];
  function lead(x, scheme, where, label) {
    const n = label || String(x.pos);
    if (scheme === "B") return x.k === "wait" ? `<span class="dotnum">${n}</span>` : `<span style="display:inline-grid;place-items:center;width:22px;height:22px" aria-label="${esc(L(`第 ${n} 步`, `Step ${n}`))}">${ring(STEP[x.k][0], 20)}</span>`;
    if (scheme === "C") return where === "card" ? ring(STEP[x.k][0]) : `<span class="num is-faint${label ? " is-sub" : ""}">${n}</span>`;
    return `<span class="num${["run", "unk", "err"].includes(x.k) ? " is-cur" : ""}${label ? " is-sub" : ""}">${n}</span>`;
  }
  function stepRow(x, scheme, where, label) {
    const [r, tone] = STEP[x.k];
    const showWord = scheme !== "B" || ["run", "err", "unk"].includes(x.k);
    const word = showWord ? (scheme === "C" && where === "card" ? tag(stepWord(x.k), undefined, tone) : K.renderStatusMark({ label: stepWord(x.k), state: r, tone, plain: x.k === "wait" || x.k === "done" })) : "";
    return `<div class="row${label ? " is-sub" : ""}${x.k === "wait" ? " is-quiet" : ""}"${x.landed ? " data-craft-new" : ""}>${lead(x, scheme, where, label)}<span class="nm">${esc(P(x.name))}</span>${x.isNew ? badge(L("新插入", "Inserted"), "info") : ""}${word}</div>`;
  }
  function planCard(m, scheme) {
    const done = m.list.filter((x) => x.k === "done").length, total = m.list.length, unk = m.list.filter((x) => x.k === "unk").length;
    const right = scheme === "C" && m.cur ? `<span class="cap">${L(`第 ${m.cur.pos} 步，共 ${total} 步`, `Step ${m.cur.pos} of ${total}`)}</span>` : `<span class="cap">${L(`${done}/${total} 完成`, `${done}/${total} done`)}</span>`;
    const rows = m.list.map((x) => stepRow(x, scheme, "card") + (x.pos === 3 && m.s === "nested" ? `<div class="note">${ic("list", "xs")}${L("第 3 步拆成 2 个小步，详见任务板", "Step 3 has 2 sub-steps — see the TaskBoard")}</div>` : "")).join("");
    const revised = m.s === "revised" ? `<div class="note is-wide">${ic("info", "xs")}${L("计划改过：插入了第 3 步，后面的步骤顺延一位", "Plan revised: a new step 3 was inserted; later steps moved down by one")}</div>` : "";
    return `<div class="list plan"><div class="list__head"><span class="grow">${ic("list-ordered", "sm")}${L("计划", "Plan")}</span>${right}</div><div class="meter" role="img" aria-label="${esc(L(`${done}/${total} 完成`, `${done}/${total} done`))}"><i style="width:${(done / total) * 100}%"></i>${unk ? `<i class="unk" style="width:${(unk / total) * 100}%"></i>` : ""}</div>${rows}${revised}</div>`;
  }
  function board(m, scheme) {
    const cards = m.list.map((x) => {
      let subs = "";
      if (m.s === "nested" && x.subs) subs = x.subs.map((n, i) => stepRow({ k: i === 0 ? "done" : "run", pos: x.pos, name: n }, scheme, "board", `${x.pos}.${i + 1}`)).join("");
      let acts = "";
      if (x.k === "unk") acts = `<div class="acts">${btn(L("核对", "Check"), { v: "primary", act: "verify-step", loading: S.checking })}${btn(L("重新运行", "Run again"), { act: "toast", arg: L("已重新运行（模拟）", "Re-run (sample)") })}</div>`;
      if (x.k === "err") acts = `<div class="acts">${btn(L("让 Coding 修", "Let Coding fix it"), { v: "primary", act: "fix" })}${btn(L("看输出", "See output"), { act: "toast", arg: L("打开输出（模拟）", "Opening output (sample)") })}</div>`;
      return `<div class="bcard${x.k === "run" ? " is-cur" : x.k === "unk" ? " is-unk" : x.k === "err" ? " is-err" : ""}">${stepRow(x, scheme, "board")}${subs}${acts}</div>`;
    }).join("");
    return `<aside class="c-board" aria-label="${L("任务板", "TaskBoard")}"><div class="c-board__head">${ic("list-ordered", "sm")}${L("任务板", "TaskBoard")}<span class="cap">· ${L(`${m.list.length} 步`, `${m.list.length} steps`)}</span><span class="grow"></span>${btn(L("关闭", "Close"), { icon: "x", iconOnly: true, v: "ghost", act: "toggle-board", cls: "only-board-narrow" })}</div><div class="c-board__list">${cards}</div></aside>`;
  }
  function stepsBlock() {
    const m = stepsModel(), scheme = sch(), cur = m.cur;
    let work = you(L("按品牌指南把首屏改成一句主张加一个主按钮，改完跑测试再打开看看。", "Make the hero one claim and one button per the brand guide, then run tests and open it.")) + round("execute", ` · ${L("在 website", "in website")}`) + rise(planCard(m, scheme));
    if (cur && cur.k === "run") work += working(L(`正在做第 ${cur.pos} 步：${P(cur.name)}`, `Working on step ${cur.pos}: ${P(cur.name)}`));
    if (cur && cur.k === "unk") work += rise(`<div class="recover tone-wait"><div class="recover__title">${ic("circle-alert", "sm")}${L(`第 ${cur.pos} 步的 npm run build 结果未知`, `Step ${cur.pos}: npm run build result unknown`)}</div><p>${L("没收到退出码，先核对，不会自动重跑。", "No exit code came back. Check first; nothing re-runs by itself.")}</p><div class="acts">${btn(L("核对", "Check"), { v: "primary", act: "verify-step", loading: S.checking })}</div></div>`);
    if (cur && cur.k === "err") work += rise(`<div class="recover tone-err"><div class="recover__title">${ic("circle-alert", "sm")}${L(`第 ${cur.pos} 步失败：npm test 退出 1`, `Step ${cur.pos} failed: npm test exited 1`)}</div><p>${L("2 个测试没过。第 5 步等待前一步。", "2 tests failed. Step 5 is waiting for the previous step.")}</p></div>`);
    return frame({ dir: dirCol({ head: simpleDirHead("website", workBadge()), folder: "website" }), work, board: board(m, scheme), composer: composer({}) });
  }

  // ---------- popovers: the shared mw-menu, grown from its trigger ----------
  let pop = null;
  function closePop(restore = true) { if (!pop) return; const back = pop.back; pop.el.remove(); pop = null; if (restore && back && document.contains(back)) back.focus(); }
  function openPop(anchor, inner, cls = "") {
    closePop(false);
    const el = document.createElement("div"); el.className = "pop";
    el.innerHTML = `<div class="mw-menu ${cls}" role="menu">${inner}</div>`; document.body.appendChild(el);
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let top = r.bottom + 6, up = false;
    if (top + h > innerHeight - 8) { top = Math.max(56, r.top - h - 6); up = true; }
    const left = Math.min(Math.max(8, r.right - w > 8 && r.left + w > innerWidth - 8 ? r.right - w : r.left), innerWidth - w - 8);
    if (up) el.firstElementChild.classList.add("is-up");
    el.style.left = left + "px"; el.style.top = top + "px";
    pop = { el, back: anchor };
    (el.querySelector("button:not([disabled])") || el).focus();
  }
  const item = (o) => `<button type="button" class="mw-menu__item" role="${o.role || "menuitem"}"${o.checked !== undefined ? ` aria-checked="${o.checked}"` : ""} data-act="${o.act || "close-pop"}"${o.arg ? ` data-arg="${esc(o.arg)}"` : ""}>${o.icon ? K.icon(o.icon) : ""}<span class="grow">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</span>${o.badge || ""}${o.checked ? K.icon("check") : ""}</button>`;
  const group = (label, items) => `<div class="mw-menu__group" role="group">${label ? `<div class="mw-menu__label">${esc(label)}</div>` : ""}${items}</div>`;
  function ioMenu(anchor) {
    const v2 = S.block === "dir" && st() === "frozen";
    const folders = [...D.folders, ...(v2 ? [{ id: "v2", name: "website-v2", path: "~/code/website-v2", roles: ["output"] }] : [])];
    const rows = folders.map((f) => {
      const roles = f.id === "website" && v2 ? ["input"] : f.roles;
      return item({ icon: "folder", label: f.name, sub: f.path, act: "toast", arg: f.path, badge: roles.map((r) => (r === "output" ? badge(L("输出", "Output"), "info") : badge(L("参考", "Reference")))).join("") });
    }).join("");
    openPop(anchor, `${group(L("输入与输出", "Inputs and output"), rows)}<div class="foot">${L("同一个文件夹既是参考也是输出：任务可以直接改这里的原文件；其他参考文件夹只读。改了只对之后的轮次生效。", "One folder can be both reference and output: tasks may change its files; other references stay read-only. Changes apply from the next round.")}</div><div class="pacts">${btn(L("管理输入与输出", "Manage inputs and output"), { act: "toast", arg: L("打开项目设置里的「输入与输出」（03 定样）", "Opens “Inputs and output” in project settings (03)") })}</div>`, "wide");
  }
  function viewMenu(anchor) {
    const rows = D.folders.map((f) => {
      const work = f.id === "website";
      const on = work ? S.state.dir !== "browsing" : S.state.dir === "browsing" && f.id === "brand";
      return item({ role: "menuitemradio", checked: on, icon: work ? "folder-tree" : "eye", label: f.name, act: work ? "back-to-work" : "view-folder", arg: f.id, badge: work ? workBadge() : badge(L("只读", "Read-only")) });
    }).join("");
    openPop(anchor, `${group(L("看哪个文件夹", "Which folder to view"), rows)}<div class="foot">${L("看别的文件夹只是临时查看，不改 Coding 在哪里做。", "Viewing another folder is temporary; it doesn't change where Coding works.")}</div>`, "wide");
  }
  function modeMenu(anchor) {
    const ro = MODES.filter((m) => m.ro), rw = MODES.filter((m) => !m.ro);
    const mk = (m) => item({ role: "menuitemradio", checked: m.id === S.mode, icon: m.ro ? "lock" : "edit", label: P(m.n), sub: P(m.d), act: "set-mode", arg: m.id });
    openPop(anchor, group(L("会改文件", "Changes files"), rw.map(mk).join("")) + group(L("只读", "Read-only"), ro.map(mk).join("")), "wide");
  }
  function rulesMenu(anchor) {
    const s = S.block === "rules" ? st() : "normal";
    const rows = RULES.map((r, i) => item({
      icon: "file", label: r.file,
      sub: s === "untrusted" ? P(r.where) : `${P(r.where)} · ${L("本轮用", "this round uses")} ${i === 0 && s === "changed" ? L("10:02 版", "the 10:02 version") : P(r.ver)}`,
      act: "toast", arg: L("打开规则文件（模拟）", "Opening the rules file (sample)"),
      badge: s === "untrusted" ? badge(L("没加载", "Not loaded"), "warning") : i === 0 && s === "changed" ? badge(L("有新版本", "Updated"), "warning") : badge(L("生效中", "In effect"), "success"),
    })).join("");
    openPop(anchor, `${group(L("本轮的规则", "Rules for this round"), rows)}<div class="foot">${L("规则按 Coding 真实所在的文件夹加载；规则只能约束 Coding，不能给它多开权限。改了规则文件，下一轮起生效。", "Rules load by the folder Coding really works in; they can only constrain Coding, never grant it more. A changed rules file applies from the next round.")}</div>`, "wide");
  }
  function sendConfirm(anchor) {
    const m = modeOf(S.mode);
    openPop(anchor, `<div class="body"><b>${L(`这条看起来要改文件，但现在是「${P(m.n)}」（只读）`, `This looks like it changes files, but the mode is “${P(m.n)}” (read-only)`)}</b><br>${L("按只读发，Coding 只回答、不改文件。", "Sent read-only, Coding only answers and changes nothing.")}</div><div class="pacts">${btn(L(`仍按${P(m.n)}发`, `Send as ${P(m.n)}`), { act: "send-as-is" })}${btn(L("换成修改再发", "Switch to Edit and send"), { v: "primary", act: "switch-send" })}</div>`, "wide");
  }
  function recPop(anchor) {
    const f = recoverFacts(); if (!f.rec) return;
    openPop(anchor, recHtml(f.rec), "wide");
  }

  // ---------- toast: the shared graphite capsule ----------
  let toastTimer;
  function toast(msg, state, undo) {
    const slot = document.getElementById("toast"); clearTimeout(toastTimer);
    const mark = state ? K.renderStateRing({ state: state === "failed" ? "failed" : "done" }) : "";
    slot.innerHTML = `<div class="mw-toast${state === "failed" ? " is-error" : ""}" role="status"${state ? ` data-mw-state="${state}" data-ring-mounted` : ""}>${mark}<span>${esc(msg)}</span>${undo ? `<button type="button" class="mw-toast__action mw-toast__action--primary" data-act="${undo}">${L("撤销", "Undo")}</button>` : ""}</div>`;
    toastTimer = setTimeout(() => { slot.innerHTML = ""; }, 4000);
  }

  // ---------- render ----------
  let lastView = "";
  function applyStateDefaults() {
    if (S.block === "rules") {
      const s = st();
      S.mode = s === "readonly" ? "discuss" : s === "review" ? "review" : "edit";
      S.draft = s === "readonly" ? L("那把首屏按钮改成品牌蓝，顺便删掉旧的 Banner 组件", "Then change the hero button to brand blue and delete the old Banner component") : s === "review" ? L("按这三条改掉", "Fix these three") : "";
      S.autoSwitched = false;
    } else { S.mode = S.block === "recover" || S.block === "steps" ? "execute" : "edit"; S.draft = ""; }
    S.verified = {}; S.checking = false;
  }
  function render() {
    closePop(false);
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    proto();
    riseIndex = 0;
    const view = `${S.block}/${sch()}/${st()}`;
    const app = document.getElementById("app");
    app.innerHTML = { dir: dirBlock, rules: rulesBlock, recover: recoverBlock, steps: stepsBlock }[S.block]();
    // A view rises once, the first time it is shown; a re-render of the same view (a mode, a language) never replays it.
    app.classList.toggle("is-arriving", view !== lastView);
    lastView = view;
    save();
  }

  // ---------- events ----------
  document.addEventListener("change", (e) => {
    if (e.target.id === "p-block") { S.block = e.target.value; S.files = S.board = false; applyStateDefaults(); render(); }
    if (e.target.id === "p-state") { S.state[S.block] = e.target.value; applyStateDefaults(); render(); }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "draft") { S.draft = e.target.value; save(); } });
  const after = (ms, f) => setTimeout(f, ms);
  const ACT = {
    toast: (el) => toast(el.dataset.arg || ""),
    "close-pop": () => closePop(),
    reset: () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } S = fresh(); lastView = ""; applyStateDefaults(); render(); },
    "toggle-files": () => { S.files = !S.files; S.board = false; render(); },
    "toggle-board": () => { S.board = !S.board; S.files = false; render(); },
    "close-drawers": () => { S.files = S.board = false; render(); },
    "io-menu": (el) => ioMenu(el),
    "view-menu": (el) => viewMenu(el),
    "view-folder": () => { S.state.dir = "browsing"; render(); },
    "back-to-work": () => { const was = S.state.dir === "browsing"; S.state.dir = "normal"; render(); if (was) toast(L("回到工作目录 website", "Back in the working folder website"), "done"); },
    relocate: () => { S.state.dir = "normal"; render(); toast(L("已重新找到 ~/code/website", "Found ~/code/website again"), "done"); },
    "pick-output": () => { S.state.dir = "normal"; render(); toast(L("输出设为 website；之后的轮次在这里做", "Output set to website; later rounds work here"), "done"); },
    "mode-menu": (el) => modeMenu(el),
    "rules-menu": (el) => rulesMenu(el),
    "set-mode": (el) => { const prev = S.mode; S.mode = el.dataset.arg; S.autoSwitched = false; render(); if (prev !== S.mode) toast(L(`已换成「${P(modeOf(S.mode).n)}」，从这条消息起生效`, `Switched to “${P(modeOf(S.mode).n)}” from this message`), "done"); },
    send: (el) => {
      const m = modeOf(S.mode);
      if (S.block === "rules" && m.ro && devIntent(S.draft)) {
        if (sch() === "B") return sendConfirm(el);
        if (sch() === "C") { S.prevMode = S.mode; S.mode = "edit"; S.autoSwitched = true; render(); return; }
        return toast(L(`已按「${P(m.n)}」发出：只回答，不改文件（模拟）`, `Sent as “${P(m.n)}”: answers only, no file changes (sample)`), "done");
      }
      toast(L("已发出（模拟）", "Sent (sample)"), "done");
    },
    "send-as-is": () => { closePop(); toast(L(`已按「${P(modeOf(S.mode).n)}」发出（模拟）`, `Sent as “${P(modeOf(S.mode).n)}” (sample)`), "done"); },
    "switch-send": () => { S.mode = "edit"; render(); toast(L("已换成「修改」并发出（模拟）", "Switched to “Edit” and sent (sample)"), "done"); },
    "undo-switch": () => { S.mode = S.prevMode || "discuss"; S.autoSwitched = false; render(); toast(L("已撤销，回到原来的模式", "Undone; back to the previous mode")); },
    // Checking keeps the button's width and shows the shared spinner, then the row lands with one wash (DESIGN Motion: moments).
    verify: () => { if (S.checking) return; closePop(false); S.checking = true; render(); after(900, () => { S.checking = false; S.verified.recover = true; render(); toast(L("核对完：看了 dist/ 的时间和进程，没有重跑", "Checked dist/ times and processes; nothing re-run"), "done"); }); },
    "verify-step": () => { if (S.checking) return; S.checking = true; render(); after(900, () => { S.checking = false; S.verified.steps = true; render(); toast(L("核对完：第 4 步其实已完成，接着做第 5 步", "Checked: step 4 had finished; on to step 5"), "done"); }); },
    fix: () => toast(L("交给 Coding 修（模拟）", "Handed to Coding (sample)"), "done"),
    "rec-pop": (el) => recPop(el),
  };
  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-proto]");
    if (p) {
      if (p.dataset.proto === "scheme") { S.scheme[S.block] = p.getAttribute("value"); S.autoSwitched = false; render(); }
      if (p.dataset.proto === "lang") { S.lang = p.getAttribute("value"); if (S.block === "rules") { const keep = S.mode; applyStateDefaults(); S.mode = keep; } render(); }
      return;
    }
    if (e.target.closest("[data-theme-option]")) { setTimeout(proto, 0); return; }
    const el = e.target.closest("[data-act]");
    if (pop && !e.target.closest(".pop") && !(el && el === pop.back)) closePop(false);
    if (!el || el.disabled) return;
    const f = ACT[el.dataset.act];
    if (f) { e.preventDefault(); f(el); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (pop) { closePop(); return; }
    if (S.files || S.board) { S.files = S.board = false; render(); }
  });

  if (S.block === "rules" && !S.draft) applyStateDefaults();
  render();
  // The visual foundation client: theme and skin choices, press give, segmented thumb travel, the running ring.
  const client = document.createElement("script"); client.textContent = window.mwKitClient; document.body.appendChild(client);
})();
