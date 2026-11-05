// 12 · Coding 执行定样 — standalone prototype. All data is sample data (data.js); nothing reads a folder, runs a command or calls a model.
(() => {
  const D = window.protoData;
  document.getElementById("icons").innerHTML = window.protoIcons;

  const KEY = "molis-proto.coding-execution-states.v1";
  const BLOCKS = D.blocks.map((b) => b.id);
  const fresh = () => ({
    block: "dir",
    scheme: { ...D.decided },
    state: { dir: "normal", rules: "normal", recover: "failed", steps: "normal" },
    lang: "zh",
    theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    mode: "edit", draft: "", files: false, board: false, verified: {},
  });
  let S = load();
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && v.scheme && v.state && BLOCKS.includes(v.block)) return Object.assign(fresh(), v);
    } catch { /* storage unavailable: start fresh */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable: keep in memory */ } }

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const P = (pair) => pair[S.lang === "zh" ? 0 : 1];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ic = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const sch = () => S.scheme[S.block];
  const st = () => S.state[S.block];

  const T = {
    protoTitle: ["原型 · 模拟数据", "Prototype · sample data"], block: ["块", "Block"], scheme: ["方案", "Scheme"], state: ["状态", "State"],
    lang: ["语言", "Language"], theme: ["外观", "Theme"], light: ["浅", "Light"], dark: ["深", "Dark"], reset: ["重置", "Reset"],
  };

  // ---------- shared words (one wording per meaning, both views use these) ----------
  const W = {
    waitPrev: () => L("等待前一步", "Waiting for the previous step"),
    unknown: () => L("结果未知", "Result unknown"),
    toCheck: () => L("结果未知，待核对", "Result unknown — check it"),
    cancelled: () => L("已取消", "Cancelled"),
    timedOut: () => L("超时", "Timed out"),
    signal: () => L("被系统结束", "Ended by the system"),
    exitN: (n) => L(`退出 ${n}`, `Exit ${n}`),
    ok: () => L("成功", "Succeeded"),
    notRun: () => L("没有运行", "Not run"),
    done: () => L("完成", "Done"),
    running: () => L("进行中", "In progress"),
    failed: () => L("失败", "Failed"),
    checked: () => L("核对过：已完成", "Checked: it finished"),
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

  // ---------- proto strip ----------
  function syncProto() {
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = P(T[el.dataset.t]); });
    const bs = document.getElementById("block");
    bs.innerHTML = D.blocks.map((b) => `<option value="${b.id}"${b.id === S.block ? " selected" : ""}>${esc(P(b.name))}</option>`).join("");
    const ss = document.getElementById("state");
    ss.innerHTML = D.states[S.block].map(([id, zh, en]) => `<option value="${id}"${id === st() ? " selected" : ""}>${esc(L(zh, en))}</option>`).join("");
    document.querySelectorAll("#scheme button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.scheme === sch()));
      const won = D.decided[S.block] === b.dataset.scheme;
      b.textContent = b.dataset.scheme + (won ? " ✓" : "");
      b.title = P(D.schemes[S.block][b.dataset.scheme]) + (won ? L("（已定 2026-11-04）", " (decided 2026-11-04)") : "");
    });
    document.getElementById("sname").textContent = P(D.schemes[S.block][sch()]) + (D.decided[S.block] === sch() ? L(" · 已定", " · decided") : "");
    document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
    document.querySelectorAll("#theme button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === S.theme)));
  }

  // ---------- frame ----------
  function head() {
    const git = `<span class="loc fact only-wide">${ic("git-branch", "sm")}main · ${L("2 处改动", "2 changes")}</span>`;
    const filesBtn = `<button class="btn sm sec only-narrow" data-act="toggle-files" aria-expanded="${S.files}">${ic("folder-tree", "sm")}${L("文件", "Files")}</button>`;
    const boardBtn = S.block === "steps" ? `<button class="btn sm sec only-narrow" data-act="toggle-board" aria-expanded="${S.board}">${ic("list", "sm")}${L("任务板", "TaskBoard")}</button>` : "";
    return `<div class="chead"><div class="ttl"><span class="tile hue-blue">${ic("terminal", "sm")}</span><b>Coding</b><span class="sep">/</span><span class="ell">${L("首页改版：换成新的首屏", "Home redesign: a new hero")}</span></div><div class="tools">${git}${filesBtn}${boardBtn}</div></div>`;
  }
  function frame(parts) {
    const bodyCls = ["cbody", S.block === "steps" ? "board-on" : "", S.files ? "files-open" : "", S.board && S.block === "steps" ? "board-open" : ""].join(" ");
    return `<div class="pane" role="main" aria-label="Coding">${head()}${parts.top || ""}
      <div class="${bodyCls}">${parts.files}<div class="work" aria-live="polite">${parts.work}</div>${parts.board || ""}<button class="drawer-scrim" data-act="close-drawers" aria-label="${L("关闭", "Close")}"></button></div>
      ${parts.composer}<span class="tag sim simmark">${L("模拟", "Sample")}</span></div>`;
  }
  function runhead(mode, extra = "") {
    return `<div class="runhead">${ic("history", "sm")}<span class="ell"><b>${L("本轮", "This round")}</b> · ${esc(P(modeOf(mode).n))} · ${L("10:42 开始", "started 10:42")}${extra}</span></div>`;
  }
  function youTurn(text) { return `<div class="turn you"><div class="who">${L("你", "You")}</div><p>${esc(text)}</p></div>`; }
  function aiTurn(html) { return `<div class="turn"><div class="who">${ic("sparkles", "sm")}Coding</div>${html}</div>`; }
  function tree(folderId, dim = false) {
    const items = D.tree[folderId] || [];
    return `<ul class="tree${dim ? " dim" : ""}" aria-label="${L("文件", "Files")}">${items.map(([icon, name, depth, mark]) => `<li class="${depth === 1 ? "sub" : depth === 2 ? "sub2" : ""}${name === "Hero.tsx" ? " cur" : ""}">${ic(icon, "sm")}<span>${esc(name)}</span>${mark ? `<span class="m">${mark}</span>` : ""}</li>`).join("")}</ul>`;
  }
  function filesCol(name, tag, folderId, opts = {}) {
    if (opts.custom) return `<aside class="files" aria-label="${L("文件", "Files")}">${opts.custom}</aside>`;
    return `<aside class="files" aria-label="${L("文件", "Files")}"><div class="fhead">${ic("folder-tree", "sm")}<span class="nm">${esc(name)}</span>${tag}<button class="btn icon sm ghost" data-act="view-menu" aria-haspopup="menu" aria-label="${L("看别的文件夹", "View another folder")}">${ic("chevron-down", "sm")}</button></div>${folderId ? tree(folderId, opts.dim) : `<div class="fempty">${opts.empty || ""}</div>`}</aside>`;
  }
  function composer(o = {}) {
    const m = modeOf(S.mode);
    const modeCtl = o.seg
      ? `<div class="modeseg" role="radiogroup" aria-label="${L("模式", "Mode")}">${MODES.map((x) => `<button type="button" role="radio" aria-pressed="${x.id === S.mode}" aria-checked="${x.id === S.mode}" class="${x.ro ? "ro" : ""}" data-act="set-mode" data-arg="${x.id}" title="${esc(P(x.d))}">${x.ro ? ic("lock", "sm") : ""}${esc(P(x.n))}</button>`).join("")}</div>`
      : `<button class="mode${m.ro ? " ro" : ""}" data-act="mode-menu" aria-haspopup="menu">${m.ro ? ic("lock", "sm") : ic("edit", "sm")}${esc(P(m.n))}${ic("chevron-down", "sm")}</button>`;
    const rules = o.rulesChip === false ? "" : rulesChip();
    const ph = o.placeholder || L("告诉 Coding 要做什么", "Tell Coding what to do");
    return `<div class="composer">${o.chips ? `<div class="cchips">${o.chips}</div>` : ""}${o.above || ""}
      <div class="box${m.ro && o.tint ? " ro" : ""}">${o.seg ? `<div class="bfoot" style="padding-bottom:0">${modeCtl}</div>` : ""}<textarea id="draft" rows="2" aria-label="${L("消息", "Message")}" placeholder="${esc(ph)}">${esc(S.draft)}</textarea>
      <div class="bfoot">${o.seg ? "" : modeCtl}${rules}<span class="fact ell only-wide" style="margin-left:4px">MiniMax-M2</span><span class="grow"></span>${o.sendNote ? `<span class="fact ell">${o.sendNote}</span>` : ""}<button class="send" data-act="send" aria-label="${L("发送", "Send")}"${o.sendDisabled ? " disabled" : ""}>${ic("send", "sm")}</button></div></div></div>`;
  }
  function rulesChip() {
    const s = S.block === "rules" ? st() : "normal";
    if (s === "untrusted") return `<button class="cchip warn" data-act="rules-menu" aria-haspopup="menu">${ic("book", "sm")}${L("规则没加载", "Rules not loaded")}</button>`;
    if (s === "changed") return `<button class="cchip warn" data-act="rules-menu" aria-haspopup="menu">${ic("book", "sm")}${L("规则 2 · 1 份有新版本", "Rules 2 · 1 updated")}</button>`;
    return `<button class="cchip" data-act="rules-menu" aria-haspopup="menu">${ic("book", "sm")}${L("规则 2", "Rules 2")}</button>`;
  }

  // ---------- block: 目录 ----------
  function dirFacts() {
    const s = st();
    return {
      s,
      out: s === "none" ? null : s === "frozen" ? "website-v2" : "website",
      runAt: s === "worktree" ? ".worktrees/home-hero" : s === "none" || s === "missing" ? null : "website",
      viewing: s === "browsing" ? "brand-assets" : null,
      running: !["none", "missing"].includes(s),
    };
  }
  const refsLabel = () => L("参考 2 个（只读）", "2 references (read-only)");
  function dirBanners(f, inline = false) {
    const cls = inline ? "hint" : "banner";
    const out = [];
    if (f.viewing) out.push(`<div class="${cls} ${inline ? "info" : "view"}">${ic("eye", "sm")}<span class="grow">${L(`正在看 ${f.viewing}（只读参考），Coding 仍在工作目录里做`, `Viewing ${f.viewing} (read-only reference); Coding keeps working in the working folder`)}</span><button class="btn sm sec" data-act="back-to-work">${L("回到工作目录", "Back to working folder")}</button></div>`);
    if (f.s === "frozen") out.push(`<div class="${cls} ${inline ? "warn" : "frozen"}">${ic("clock", "sm")}<span class="grow">${L("本轮仍在 website（开始时的设置），下一轮起用 website-v2", "This round stays in website (its starting setting); website-v2 from the next round")}</span></div>`);
    if (f.s === "worktree") out.push(`<div class="${cls} ${inline ? "info" : "view"}">${ic("git-branch", "sm")}<span class="grow">${L("本轮在临时副本里做，完成后经你审查交回 website", "This round works in a temporary copy; it comes back to website after your review")}</span><button class="btn sm sec" data-act="toast" data-arg="${esc(L("打开差异（模拟）", "Opening the diff (sample)"))}">${ic("git-compare", "sm")}${L("看差异", "See diff")}</button></div>`);
    if (f.s === "missing") out.push(`<div class="${cls} err" role="alert">${ic("alert", "sm")}<span class="grow">${L("找不到 ~/code/website。下一轮发不出去；之前的改动记录还在。", "~/code/website is gone. The next round can't start; earlier change records are kept.")}</span><button class="btn sm primary" data-act="relocate">${L("重新找到位置", "Locate it")}</button><button class="btn sm sec" data-act="io-menu">${L("换一个输出", "Pick another output")}</button></div>`);
    if (f.s === "none") out.push(`<div class="${cls} warn">${ic("folder", "sm")}<span class="grow">${L("这个项目还没有输出文件夹，Coding 不知道在哪里做。", "This project has no output folder yet, so Coding doesn't know where to work.")}</span><button class="btn sm primary" data-act="pick-output">${L("选文件夹", "Choose folder")}</button><button class="btn sm sec" data-act="toast" data-arg="${esc(L("打开引导「从 Coding 的缺项进入」，设好后回到这里（见 04 定样）", "Opens the onboarding “from a Coding gap” path, then returns here (see 04)"))}">${L("用引导设置", "Set up with guide")}</button></div>`);
    return out.join("");
  }
  function dirWork(f, scheme) {
    const extra = scheme === "A" ? "" : f.s === "frozen" ? ` · ${L("在 website", "in website")} <span class="tag warn">${L("下一轮起用 website-v2", "website-v2 from next round")}</span>` : f.s === "worktree" ? ` · ${L("在临时副本", "in a temporary copy")}` : f.runAt ? ` · ${L(`在 ${f.runAt}`, `in ${f.runAt}`)}` : "";
    const ask = youTurn(L("按品牌指南把首屏改成一句主张加一个主按钮。", "Following the brand guide, make the hero one claim and one primary button."));
    if (!f.running) {
      return `${ask}${runhead("edit", "").replace(L("10:42 开始", "started 10:42"), L("昨天 17:20 结束", "ended yesterday 17:20"))}${aiTurn(`<p>${L("首屏已改成一句主张和一个主按钮，测试通过。", "The hero is now one claim and one button; tests pass.")}</p>`)}`;
    }
    return `${ask}${runhead("edit", extra)}${aiTurn(`<p>${L("看过品牌指南第 3 页和配色说明，首屏改成一句主张、一个主按钮，主色只用在按钮上。", "Read page 3 of the brand guide and the colour notes; the hero becomes one claim and one button, brand colour only on the button.")}</p><p><span class="cite">${ic("link", "sm")}品牌指南 2026.pdf · brand-assets</span></p>`)}<div class="stepline"><span class="dotp"></span>${L(`正在改 ${f.s === "worktree" ? ".worktrees/home-hero/" : ""}src/components/Hero.tsx`, `Editing ${f.s === "worktree" ? ".worktrees/home-hero/" : ""}src/components/Hero.tsx`)}</div>`;
  }
  function dirBlock() {
    const f = dirFacts(), scheme = sch();
    const workTag = `<span class="tag out">${L("工作目录", "Working folder")}</span>`;
    const roTag = `<span class="tag ro">${L("只读参考", "Read-only reference")}</span>`;
    const filesName = f.viewing || (f.s === "worktree" ? "home-hero" : f.out || "—");
    const filesTree = f.viewing ? "brand" : f.s === "none" ? null : f.s === "frozen" ? "website" : "website";
    const sendDisabled = !f.out || f.s === "missing";
    const sendNote = f.s === "missing" ? L("先处理输出文件夹", "Fix the output folder first") : !f.out ? L("先选输出文件夹", "Choose an output folder first") : "";
    const emptyFiles = `${L("还没有文件夹", "No folder yet")}<div style="margin-top:8px"><button class="btn sm sec" data-act="pick-output">${L("选文件夹", "Choose folder")}</button></div>`;

    if (scheme === "A") {
      const outV = f.out ? `<b>${esc(f.out)}</b>` : `<b>${L("未设置", "Not set")}</b>`;
      const outTag = f.s === "missing" ? ` <span class="tag err">${L("不见了", "Missing")}</span>` : !f.out ? ` <span class="tag warn">${L("先选一个", "Choose one")}</span>` : "";
      const runV = f.runAt ? `<span class="sep">·</span><span class="loc">${ic("terminal", "sm")}${L("本轮在", "This round in")} <b>${esc(f.runAt)}</b></span>` : "";
      const top = `<div class="locbar"><span class="loc">${ic("output", "sm")}${L("项目输出", "Project output")} ${outV}${outTag}</span>${runV}<span class="grow"></span><button class="loc btnish" data-act="io-menu" aria-haspopup="menu">${ic("input", "sm")}<span class="hide-xs">${refsLabel()}</span>${ic("chevron-down", "sm")}</button></div>${dirBanners(f)}`;
      return frame({ top, files: filesCol(filesName, f.viewing ? roTag : workTag, filesTree, { empty: emptyFiles, dim: f.s === "missing" }), work: dirWork(f, "A"), composer: composer({ sendDisabled, sendNote }) });
    }
    if (scheme === "B") {
      const where = f.s === "missing" ? `<button class="cchip err" data-act="io-menu" aria-haspopup="menu">${ic("alert", "sm")}${L("website 不见了", "website is missing")}</button>`
        : !f.out ? `<button class="cchip warn" data-act="pick-output">${ic("folder", "sm")}${L("还没选在哪里做", "Where to work? Not chosen")}</button>`
        : `<button class="cchip" data-act="io-menu" aria-haspopup="menu" title="${L("下一轮在这里做", "Next round works here")}">${ic("terminal", "sm")}${L("在", "In")} <b>${esc(f.out)}</b> ${L("里做", "")}${ic("chevron-down", "sm")}</button>`;
      const refs = `<button class="cchip" data-act="io-menu" aria-haspopup="menu">${ic("input", "sm")}${refsLabel()}</button>`;
      const above = [f.viewing || f.s === "missing" || f.s === "none" ? dirBanners({ ...f, s: f.s === "frozen" || f.s === "worktree" ? "normal" : f.s }, true) : ""].join("");
      return frame({ files: filesCol(filesName, f.viewing ? roTag : workTag, filesTree, { empty: emptyFiles, dim: f.s === "missing" }), work: dirWork(f, "B"), composer: composer({ chips: where + refs, above, sendDisabled, sendNote }) });
    }
    // C: the Files column header carries the working folder.
    const pickTag = f.viewing ? roTag : f.s === "missing" ? `<span class="tag err">${L("不见了", "Missing")}</span>` : workTag;
    const note = f.viewing ? `<div class="fnote">${L("临时查看；Coding 仍在 website 里做", "Just viewing; Coding keeps working in website")}</div><button class="btn sm sec" data-act="back-to-work">${L("回到工作目录", "Back to working folder")}</button>`
      : f.s === "frozen" ? `<div class="fnote warn">${L("本轮仍在 website；下一轮起用 website-v2", "This round stays in website; website-v2 from next round")}</div>`
      : f.s === "worktree" ? `<div class="fnote">${L("本轮在临时副本里做，完成后经你审查交回 website", "Temporary copy; comes back to website after your review")}</div><button class="btn sm sec" data-act="toast" data-arg="${esc(L("打开差异（模拟）", "Opening the diff (sample)"))}">${ic("git-compare", "sm")}${L("看差异", "See diff")}</button>`
      : f.s === "missing" ? `<div class="fnote err">${L("找不到 ~/code/website；下一轮发不出去", "~/code/website is gone; the next round can't start")}</div><div class="acts"><button class="btn sm primary" data-act="relocate">${L("重新找到位置", "Locate it")}</button><button class="btn sm sec" data-act="io-menu">${L("换一个", "Pick another")}</button></div>`
      : `<div class="fnote">${L("本轮在这里做 · 也是项目输出", "This round works here · also the project output")}</div>`;
    const custom = f.s === "none"
      ? `<div class="fhead picker"><div class="fnote">${L("Coding 在哪里做", "Where Coding works")}</div></div><div class="fempty">${L("这个项目还没有输出文件夹", "This project has no output folder yet")}<div style="margin-top:8px" class="acts"><button class="btn sm primary" data-act="pick-output">${L("选文件夹", "Choose folder")}</button><button class="btn sm sec" data-act="toast" data-arg="${esc(L("打开引导「从 Coding 的缺项进入」（见 04 定样）", "Opens the onboarding “from a Coding gap” path (see 04)"))}">${L("用引导设置", "Use the guide")}</button></div></div>`
      : `<div class="fhead picker"><button class="fpick" data-act="view-menu" aria-haspopup="menu">${ic("folder-tree", "sm")}<span class="nm">${esc(filesName)}</span>${pickTag}${ic("chevron-down", "sm")}</button>${note}</div>${tree(filesTree, f.s === "missing")}`;
    const narrow = `<div class="hint info only-narrow">${ic("terminal", "sm")}<span class="grow">${f.runAt ? L(`本轮在 ${f.runAt}`, `This round in ${f.runAt}`) : L("还没有工作目录", "No working folder yet")}</span><button class="btn sm sec" data-act="toggle-files">${L("文件", "Files")}</button></div>`;
    return frame({ files: filesCol("", "", null, { custom }), work: narrow + dirWork(f, "C"), composer: composer({ sendDisabled, sendNote }) });
  }

  // ---------- block: 规则和模式 ----------
  const devIntent = (s) => /改|删|加|修|换|写|重构|fix|change|delete|remove|add|edit|rename|refactor/i.test(s || "");
  function rulesTimeline(s) {
    if (s === "review") {
      return `${youTurn(L("看一下首屏这次的改动。", "Review the hero changes."))}${runhead("review")}${aiTurn(`<p>${L("看了 2 个文件的改动，有 3 条意见：", "Reviewed changes in 2 files; 3 notes:")}</p><ol style="margin:4px 0 0;padding-left:20px"><li>${L("主按钮在窄屏下被截断", "The primary button is clipped on narrow screens")}</li><li>${L("旧的 Banner 组件已经没人用了", "The old Banner component is unused")}</li><li>${L("主张文案超过 24 个字", "The claim is over 24 characters")}</li></ol><p class="fact" style="margin-top:6px">${L("评审只看不改，文件没动。", "Review only reads; no files changed.")}</p>`)}`;
    }
    if (s === "readonly") {
      return `${youTurn(L("首屏现在为什么这么挤？", "Why does the hero feel so crowded?"))}${runhead("discuss")}${aiTurn(`<p>${L("首屏同时放了主张、两段说明、三个按钮和一张大图，视线没有落点。", "The hero holds a claim, two paragraphs, three buttons and a large image; the eye has nowhere to land.")}</p>`)}`;
    }
    const base = `${youTurn(L("按品牌指南把首屏改成一句主张加一个主按钮。", "Following the brand guide, make the hero one claim and one primary button."))}${runhead("edit", S.scheme.rules === "B" ? ` · <button class="link" data-act="rules-menu" style="background:none;border:0;padding:0;color:var(--accent);font-weight:500;cursor:pointer">${L("规则：AGENTS.md 等 2 份", "Rules: AGENTS.md and 1 more")}</button>` : "")}`;
    const changed = s === "changed" ? `<div class="alert info">${ic("info", "sm")}<span>${L("website/AGENTS.md 在 10:47 改过：本轮仍按 10:02 的版本做，下一轮起用新版本。", "website/AGENTS.md changed at 10:47: this round keeps the 10:02 version; the new one applies from the next round.")} <button class="btn sm sec" data-act="toast" data-arg="${esc(L("显示两版差异（模拟）", "Showing the two versions (sample)"))}">${L("看改了什么", "See what changed")}</button></span></div>` : "";
    const untrusted = s === "untrusted" ? `<div class="alert block warn">${ic("alert", "sm")}<div><b>${L("website 里的规则没有生效", "The rules in website are not in effect")}</b><p>${L("这个项目还没被信任，所以 AGENTS.md 没有加载。信任只决定读不读这些规则，不会给 Coding 多开权限。", "This project isn't trusted yet, so AGENTS.md wasn't loaded. Trust only decides whether these rules are read; it gives Coding no extra permissions.")}</p><div class="acts"><button class="btn sm primary" data-act="toast" data-arg="${esc(L("打开平台的信任确认（模拟）", "Opens the platform trust confirmation (sample)"))}">${L("信任这个项目", "Trust this project")}</button><button class="btn sm sec" data-act="rules-menu">${L("先看看规则写了什么", "Read the rules first")}</button></div></div></div>` : "";
    return `${base}${changed}${untrusted}${aiTurn(`<p>${L("首屏改成一句主张、一个主按钮。", "The hero becomes one claim and one button.")}</p>`)}<div class="stepline"><span class="dotp"></span>${L("正在改 src/components/Hero.tsx", "Editing src/components/Hero.tsx")}</div>`;
  }
  function rulesBlock() {
    const s = st(), scheme = sch(), m = modeOf(S.mode);
    let above = "";
    if (scheme === "A" && m.ro) {
      above = `<div class="hint ro" role="status">${ic("lock", "sm")}<span class="grow">${L(`「${P(m.n)}」只读：这一轮不改文件，也不跑会改东西的命令`, `“${P(m.n)}” is read-only: no file changes, no commands that change things`)}</span><button class="btn sm sec" data-act="set-mode" data-arg="edit">${L("换成修改", "Switch to Edit")}</button></div>`;
    }
    if (scheme === "C" && S.autoSwitched) {
      above = `<div class="hint info" role="status">${ic("wand", "sm")}<span class="grow">${L("Coding 看这条要改文件，换成「修改」后发出了", "Coding saw this needs file changes, switched to “Edit” and sent it")}</span><button class="btn sm sec" data-act="undo-switch">${L("撤销", "Undo")}</button></div>`;
    }
    return frame({ files: filesCol("website", `<span class="tag out">${L("工作目录", "Working folder")}</span>`, "website"), work: rulesTimeline(s), composer: composer({ above, seg: scheme === "C", tint: scheme !== "B" }) });
  }

  // ---------- block: 恢复 ----------
  function cmdRow(c) {
    const icon = { ok: "status-done", err: "alert", unk: "circle-alert", warn: "clock", cx: "x", wait: "status-waiting", run: "", skip: "status-blocked" }[c.k];
    const tagCls = { ok: "ok", err: "err", unk: "warn", warn: "warn", cx: "", wait: "", run: "out", skip: "" }[c.k];
    const lead = c.k === "run" ? '<span class="spin" aria-hidden="true"></span>' : ic(icon, "sm");
    const k = c.k === "cx" || c.k === "skip" ? "wait" : c.k;
    const stop = c.k === "run" ? `<button class="btn sm sec" data-act="toast" data-arg="${esc(L("已请求停止（模拟）", "Stop requested (sample)"))}">${ic("pause", "sm")}${L("停止", "Stop")}</button>` : "";
    return `<div class="cmd ${k}${c.open ? " open" : ""}${c.open && c.k === "err" ? " err" : ""}">${lead}<span class="c">${esc(c.cmd)}</span><span class="t">${esc(c.t || "")}</span><span class="tag ${tagCls}">${esc(c.word)}</span>${stop}</div>`;
  }
  function recoverFacts() {
    const s = st(), v = !!S.verified.recover;
    const install = { k: "ok", cmd: "npm install", t: "8.1s", word: W.ok() };
    const test = { k: "ok", cmd: "npm test", t: "21.4s", word: W.ok() };
    const build = { k: "ok", cmd: "npm run build", t: "34.0s", word: W.ok() };
    const e2e = { k: "skip", cmd: "npx playwright test home", t: "", word: W.notRun() };
    let cmds, focus, rec, end, running = false;
    const keep = (arr) => arr.map((x) => `<span class="cite">${ic("check", "sm")}${esc(x)}</span>`).join("");
    const kept2 = [L("2 个文件的改动在磁盘上", "Changes to 2 files are on disk"), L("命令输出已保存", "Command output saved")];
    switch (s) {
      case "failed":
        focus = { k: "err", cmd: "npm test", t: "19.8s", word: W.exitN(1) };
        cmds = [install, focus, { ...build, k: "skip", t: "", word: W.notRun() }, e2e];
        rec = { tone: "err", title: L("npm test 没过：2 个测试失败", "npm test failed: 2 tests"), body: L("Hero.test.tsx 里找不到旧的「免费试用」按钮。可以让 Coding 按新首屏改测试，或先看失败输出。", "Hero.test.tsx can't find the old “Free trial” button. Let Coding update the test for the new hero, or read the output first."), kept: kept2, acts: [["primary", "fix", L("让 Coding 修", "Let Coding fix it")], ["sec", "toast", L("看失败输出", "See the output"), L("打开输出（模拟）", "Opening output (sample)")]], tech: "exit 1 · 19.8s · cwd ~/code/website\nFAIL src/components/Hero.test.tsx (2)" };
        break;
      case "unknown":
        focus = v ? { k: "ok", cmd: "npm run build", t: "≈34s", word: W.checked() } : { k: "unk", cmd: "npm run build", t: "34.0s", word: W.unknown() };
        cmds = [install, test, focus, e2e];
        rec = v ? { tone: "info", title: L("核对过：构建已经完成", "Checked: the build finished"), body: L("dist/ 在 10:44 更新，构建进程已经不在了。没有重新运行。", "dist/ was updated at 10:44 and the build process is gone. Nothing was re-run."), kept: [], acts: [["sec", "toast", L("还是重新跑一次", "Run it again anyway"), L("已重新运行（模拟）", "Re-run (sample)")]], tech: "dist/index.html mtime 10:44:12 · pid 48213 not running" }
          : { tone: "warn", title: L("npm run build 结果未知", "npm run build: result unknown"), body: L("没收到退出码：可能做完了，也可能中途断了。先核对产物和进程，不会自动重跑。", "No exit code came back: it may have finished or stopped midway. Check the output and process first; nothing re-runs by itself."), kept: kept2, acts: [["primary", "verify", L("先核对", "Check first")], ["sec", "toast", L("重新运行", "Run again"), L("已重新运行（模拟）", "Re-run (sample)")]], tech: "exit ? · no exit event received · 34.0s · cwd ~/code/website" };
        break;
      case "cancelled":
        focus = { k: "cx", cmd: "npm test", t: "6.2s", word: L("已取消（你在 10:43 停的）", "Cancelled (you stopped it at 10:43)") };
        cmds = [install, focus, { ...build, k: "skip", t: "", word: W.notRun() }, e2e];
        rec = { tone: "info", title: L("你停了 npm test", "You stopped npm test"), body: L("后面的命令没有运行。想接着做就从 npm test 重新开始。", "The commands after it didn't run. To carry on, start again from npm test."), kept: kept2, acts: [["primary", "toast", L("从这里重新运行", "Run again from here"), L("已重新运行（模拟）", "Re-run (sample)")]], tech: "exit cancelled · 6.2s · cwd ~/code/website" };
        break;
      case "timeout":
        focus = { k: "warn", cmd: "npm run build", t: "120s", word: L("超时（120 秒）", "Timed out (120 s)") };
        cmds = [install, test, focus, e2e];
        rec = { tone: "warn", title: L("npm run build 120 秒没结束，已停止", "npm run build ran past 120 s and was stopped"), body: L("这个项目第一次构建通常更久。可以放宽到 5 分钟再跑一次。", "A first build in this project often takes longer. Allow 5 minutes and run it again."), kept: kept2, acts: [["primary", "toast", L("放宽到 5 分钟再跑", "Allow 5 min and run"), L("已按 5 分钟重新运行（模拟）", "Re-run with 5 min (sample)")], ["sec", "toast", L("看输出", "See output"), L("打开输出（模拟）", "Opening output (sample)")]], tech: "exit timed-out · limit 120s · cwd ~/code/website" };
        break;
      case "signal":
        focus = { k: "warn", cmd: "npm test", t: "41.0s", word: W.signal() };
        cmds = [install, focus, { ...build, k: "skip", t: "", word: W.notRun() }, e2e];
        rec = { tone: "warn", title: L("npm test 被系统结束了", "npm test was ended by the system"), body: L("没有正常退出，常见原因是内存不够或被别的程序关掉。测试有没有过不知道。", "It didn't exit normally — often low memory or another program closed it. Whether the tests passed is unknown."), kept: kept2, acts: [["primary", "toast", L("重新运行", "Run again"), L("已重新运行（模拟）", "Re-run (sample)")], ["sec", "toast", L("看输出", "See output"), L("打开输出（模拟）", "Opening output (sample)")]], tech: "exit none (a signal ended it) · SIGKILL · 41.0s" };
        break;
      case "interrupted":
        focus = v ? { k: "ok", cmd: "npm run build", t: "≈30s", word: W.checked() } : { k: "unk", cmd: "npm run build", t: "", word: W.unknown() };
        cmds = [install, test, focus, e2e];
        rec = v ? { tone: "info", title: L("核对过：构建在关掉前已经完成", "Checked: the build finished before the app closed"), body: L("可以接着跑后面的命令。", "You can continue with the next command."), kept: [], acts: [["primary", "toast", L("接着做", "Continue"), L("已接着做（模拟）", "Continuing (sample)")]], tech: "dist/ mtime 10:44 · no process" }
          : { tone: "warn", title: L("Molis Work 在这一轮运行时关掉了", "Molis Work closed while this round was running"), body: L("重新打开后先核对：npm run build 那时在跑，不知道做完没有。不会自动重跑。", "Check first after reopening: npm run build was running and may not have finished. Nothing re-runs by itself."), kept: kept2, acts: [["primary", "verify", L("先核对", "Check first")], ["ghost", "toast", L("先不管，往下走", "Skip for now"), L("已跳过（模拟）", "Skipped (sample)")]], tech: "round 7f3a · last event 10:43:58 · host restarted 10:51" };
        break;
      default: // waiting
        running = true;
        focus = { k: "run", cmd: "npm test", t: "12s", word: W.running() };
        cmds = [install, focus, { ...build, k: "wait", t: "", word: W.waitPrev() }, { ...e2e, k: "wait", word: W.waitPrev() }];
        rec = null;
    }
    const counts = cmds.reduce((a, c) => { a[c.k] = (a[c.k] || 0) + 1; return a; }, {});
    end = running ? L(`运行中 · 第 2 条，共 ${cmds.length} 条`, `Running · 2 of ${cmds.length}`)
      : L(`本轮结束 · ${cmds.length} 条命令：${[counts.ok ? `${counts.ok} 条成功` : "", counts.err ? `${counts.err} 条失败` : "", counts.unk ? `${counts.unk} 条结果未知` : "", counts.warn ? `${counts.warn} 条没正常结束` : "", counts.cx ? `${counts.cx} 条已取消` : "", counts.skip ? `${counts.skip} 条没有运行` : ""].filter(Boolean).join("，")}`,
        `Round ended · ${cmds.length} commands: ${[counts.ok ? `${counts.ok} succeeded` : "", counts.err ? `${counts.err} failed` : "", counts.unk ? `${counts.unk} unknown` : "", counts.warn ? `${counts.warn} didn't end normally` : "", counts.cx ? `${counts.cx} cancelled` : "", counts.skip ? `${counts.skip} not run` : ""].filter(Boolean).join(", ")}`);
    return { s, cmds, focus, rec, end, running, keep };
  }
  function recBlockHtml(rec, keep, compact = false) {
    if (!rec) return "";
    const icon = rec.tone === "err" ? "alert" : rec.tone === "warn" ? "circle-alert" : "info";
    const acts = rec.acts.map(([k, act, label, arg]) => `<button class="btn sm ${k}" data-act="${act}"${arg ? ` data-arg="${esc(arg)}"` : ""}>${esc(label)}</button>`).join("");
    const carry = rec.tone === "info" ? "" : `<button class="btn sm ghost" data-act="toast" data-arg="${esc(L("先往下走；这一条留在待处理里", "Carrying on; this stays in to-do"))}">${L("先往下走", "Carry on")}</button>`;
    const kept = rec.kept.length ? `<div class="kept">${keep(rec.kept)}</div>` : "";
    const inner = `<b>${esc(rec.title)}</b><p>${esc(rec.body)}</p>${kept}<div class="acts">${acts}${carry}</div><details class="tech"><summary>${L("技术细节", "Details")}</summary><code>${esc(rec.tech)}</code></details>`;
    if (compact) return `<div class="cmdx ${rec.tone === "info" ? "" : rec.tone === "err" ? "err" : "unk"}">${inner}</div>`;
    return `<div class="alert block ${rec.tone}" role="${rec.tone === "info" ? "status" : "alert"}">${ic(icon, "sm")}<div>${inner}</div></div>`;
  }
  function recoverBlock() {
    const f = recoverFacts(), scheme = sch();
    const interrupted = f.s === "interrupted" && !S.verified.recover && scheme !== "C" ? "" : "";
    let rows;
    if (scheme === "B") rows = f.cmds.map((c) => (c === f.focus && f.rec ? cmdRow({ ...c, open: true }) + recBlockHtml(f.rec, f.keep, true) : cmdRow(c))).join("");
    else rows = f.cmds.map(cmdRow).join("");
    const group = `<div class="cmds"><div class="gh">${ic("terminal", "sm")}${L("命令", "Commands")} · ${f.cmds.length}</div>${rows}${scheme === "C" ? "" : `<div class="endline">${f.running ? '<span class="spin" aria-hidden="true"></span>' : ic("history", "sm")}<span class="ell"><b>${esc(f.end)}</b></span></div>`}</div>`;
    const work = `${youTurn(L("跑一遍测试和构建，确认首屏改动没弄坏别的。", "Run the tests and build to make sure the hero change broke nothing."))}${runhead("execute", ` · ${L("在 website", "in website")}`)}${f.s === "interrupted" && scheme === "A" ? recBlockHtml(f.rec, f.keep) : ""}${group}${scheme === "A" && f.s !== "interrupted" ? recBlockHtml(f.rec, f.keep) : ""}${interrupted}`;
    let above = "";
    if (scheme === "C") {
      const tone = !f.rec ? "info" : f.rec.tone === "err" ? "err" : f.rec.tone === "warn" ? "warn" : "info";
      above = `<div class="hint ${tone}" role="status">${f.running ? '<span class="spin" aria-hidden="true"></span>' : ic(tone === "err" ? "alert" : tone === "warn" ? "circle-alert" : "info", "sm")}<span class="grow">${esc(f.rec ? f.rec.title : f.end)}</span>${f.rec ? `${f.rec.acts[0][1] === "verify" ? `<button class="btn sm primary" data-act="verify">${esc(f.rec.acts[0][2])}</button>` : ""}<button class="btn sm sec" data-act="rec-pop">${L("怎么办", "Options")}</button>` : ""}</div>`;
    }
    return frame({ files: filesCol("website", `<span class="tag out">${L("工作目录", "Working folder")}</span>`, "website"), work, composer: composer({ above }) });
  }

  // ---------- block: 计划卡与任务板 ----------
  function stepsModel() {
    const s = st(), v = !!S.verified.steps;
    const list = D.steps.map((x) => ({ ...x }));
    if (s === "revised") list.splice(2, 0, { ...D.inserted, isNew: true });
    const status = {
      normal: ["done", "done", "run", "wait", "wait"],
      nested: ["done", "done", "run", "wait", "wait"],
      unknown: v ? ["done", "done", "done", "done", "run"] : ["done", "done", "done", "unk", "wait"],
      failed: ["done", "done", "done", "err", "wait"],
      revised: ["done", "done", "run", "wait", "wait", "wait"],
    }[s];
    list.forEach((x, i) => { x.k = status[i]; x.pos = i + 1; });
    return { s, list, cur: list.find((x) => ["run", "unk", "err"].includes(x.k)) };
  }
  function stepWord(k) {
    return { done: [W.done(), "status-done", "done"], run: [W.running(), "", "run"], wait: [W.waitPrev(), "status-waiting", "wait"], err: [W.failed(), "alert", "err"], unk: [W.toCheck(), "circle-alert", "unk"] }[k];
  }
  function lead(x, scheme, faint = false, label) {
    const n = label || String(x.pos);
    if (scheme === "B") {
      if (x.k === "done") return `<span class="num ring" style="border-color:var(--green);color:var(--green)" aria-label="${L(`第 ${n} 步`, `Step ${n}`)}">${ic("check", "sm")}</span>`;
      if (x.k === "run") return `<span class="num ring" style="border-color:var(--accent)" aria-label="${L(`第 ${n} 步`, `Step ${n}`)}"><span class="spin" style="width:12px;height:12px"></span></span>`;
      if (x.k === "err") return `<span class="num ring" style="border-color:var(--red);color:var(--red)" aria-label="${L(`第 ${n} 步`, `Step ${n}`)}">!</span>`;
      if (x.k === "unk") return `<span class="num ring" style="border-color:var(--amber);color:var(--amber)" aria-label="${L(`第 ${n} 步`, `Step ${n}`)}">?</span>`;
      return `<span class="num ring">${n}</span>`;
    }
    if (scheme === "C") return faint ? `<span class="num faint${label ? " sub" : ""}">${n}</span>` : "";
    return `<span class="num${["run", "unk", "err"].includes(x.k) ? " cur" : ""}${label ? " sub" : ""}">${n}</span>`;
  }
  function stepRow(x, scheme, where) {
    const [word, icon, cls] = stepWord(x.k);
    const showWord = scheme !== "B" || ["run", "err", "unk"].includes(x.k);
    const statusIcon = scheme === "B" ? "" : x.k === "run" ? '<span class="spin" aria-hidden="true" style="width:12px;height:12px"></span>' : ic(icon, `sm ic-${cls}`);
    const leadHtml = scheme === "C" && where === "card" ? "" : lead(x, scheme, scheme === "C");
    const newTag = x.isNew ? `<span class="tag out">${L("新插入", "Inserted")}</span>` : "";
    return `<div class="srow ${x.k}">${leadHtml}${scheme === "C" && where === "card" ? statusIcon : ""}<span class="nm">${esc(P(x.name))}</span>${newTag}${showWord ? `<span class="sw ${cls}">${scheme === "C" && where === "card" ? "" : statusIcon}${esc(word)}</span>` : ""}</div>`;
  }
  function planCard(m, scheme) {
    const done = m.list.filter((x) => x.k === "done").length, total = m.list.length;
    const unk = m.list.filter((x) => x.k === "unk").length;
    const headR = scheme === "C" && m.cur ? `<span class="fact">${L(`第 ${m.cur.pos} 步，共 ${total} 步`, `Step ${m.cur.pos} of ${total}`)}</span>` : `<span class="fact">${L(`${done}/${total} 完成`, `${done}/${total} done`)}</span>`;
    const sub = m.s === "nested" ? `<div class="note" style="padding:0 12px 8px 44px">${ic("list", "sm")}${L("第 3 步拆成 2 个小步，详见任务板", "Step 3 has 2 sub-steps — see the TaskBoard")}</div>` : "";
    const rows = m.list.map((x) => stepRow(x, scheme, "card") + (x.pos === 3 && m.s === "nested" ? sub : "")).join("");
    const revised = m.s === "revised" ? `<div class="note" style="padding:8px 12px;border-top:1px solid var(--line)">${ic("info", "sm")}${L("计划改过：插入了第 3 步，后面的步骤顺延一位", "Plan revised: a new step 3 was inserted; later steps moved down by one")}</div>` : "";
    return `<div class="plan" role="group" aria-label="${L("计划", "Plan")}"><div class="ph">${ic("list", "sm")}${L("计划", "Plan")}<span class="grow"></span>${headR}</div><div class="prog" aria-hidden="true"><i style="width:${(done / total) * 100}%"></i>${unk ? `<i class="unk" style="left:${(done / total) * 100}%;width:${(unk / total) * 100}%"></i>` : ""}</div>${rows}${revised}</div>`;
  }
  function boardHtml(m, scheme) {
    const cards = m.list.map((x) => {
      const cls = ["bcard", x.k === "run" ? "cur" : "", x.k === "unk" ? "unk" : "", x.k === "err" ? "err" : ""].join(" ");
      let subs = "";
      if (m.s === "nested" && x.subs) {
        subs = x.subs.map((n, i) => { const y = { k: i === 0 ? "done" : "run", pos: `${x.pos}.${i + 1}`, name: n }; return `<div class="bsub">${stepRow({ ...y }, scheme, "board").replace(/<span class="num([^"]*)">[^<]*<\/span>/, () => lead(y, scheme, scheme === "C", y.pos))}</div>`; }).join("");
      }
      let acts = "";
      if (x.k === "unk") acts = `<div class="bact"><button class="btn sm primary" data-act="verify-step">${L("核对", "Check")}</button><button class="btn sm sec" data-act="toast" data-arg="${esc(L("已重新运行（模拟）", "Re-run (sample)"))}">${L("重新运行", "Run again")}</button></div>`;
      if (x.k === "err") acts = `<div class="bact"><button class="btn sm primary" data-act="toast" data-arg="${esc(L("交给 Coding 修（模拟）", "Handed to Coding (sample)"))}">${L("让 Coding 修", "Let Coding fix it")}</button><button class="btn sm sec" data-act="toast" data-arg="${esc(L("打开输出（模拟）", "Opening output (sample)"))}">${L("看输出", "See output")}</button></div>`;
      return `<div class="${cls}">${stepRow(x, scheme, "board")}${subs}${acts}</div>`;
    }).join("");
    return `<aside class="board" aria-label="${L("任务板", "TaskBoard")}"><div class="bh">${ic("list", "sm")}${L("任务板", "TaskBoard")}<span class="fact" style="font-weight:400">· ${L(`${m.list.length} 步`, `${m.list.length} steps`)}</span><span class="grow"></span><button class="btn icon sm ghost only-narrow" data-act="toggle-board" aria-label="${L("关闭", "Close")}">${ic("x", "sm")}</button></div><div class="blist">${cards}</div></aside>`;
  }
  function stepsBlock() {
    const m = stepsModel(), scheme = sch();
    const cur = m.cur;
    const line = !cur ? "" : cur.k === "run" ? `<div class="stepline"><span class="dotp"></span>${L(`正在做第 ${cur.pos} 步：${P(cur.name)}`, `Working on step ${cur.pos}: ${P(cur.name)}`)}</div>`
      : cur.k === "unk" ? `<div class="alert warn">${ic("circle-alert", "sm")}<span>${L(`第 ${cur.pos} 步的 npm run build 结果未知：没收到退出码，先核对，不会自动重跑。`, `Step ${cur.pos}: npm run build result unknown — no exit code. Check first; nothing re-runs by itself.`)} <button class="btn sm primary" data-act="verify-step">${L("核对", "Check")}</button></span></div>`
      : `<div class="alert err">${ic("alert", "sm")}<span>${L(`第 ${cur.pos} 步失败：npm test 退出 1，2 个测试没过。`, `Step ${cur.pos} failed: npm test exited 1, 2 tests failed.`)}</span></div>`;
    const work = `${youTurn(L("按品牌指南把首屏改成一句主张加一个主按钮，改完跑测试再打开看看。", "Make the hero one claim and one button per the brand guide, then run tests and open it."))}${runhead("execute", ` · ${L("在 website", "in website")}`)}${planCard(m, scheme)}${line}`;
    return frame({ files: filesCol("website", `<span class="tag out">${L("工作目录", "Working folder")}</span>`, "website"), work, board: boardHtml(m, scheme), composer: composer({}) });
  }

  // ---------- popovers ----------
  let pop = null;
  function closePop(restore = true) { if (!pop) return; const back = pop.back; pop.el.remove(); pop = null; if (restore && back && document.contains(back)) back.focus(); }
  function openPop(anchor, html, align = "left") {
    closePop(false);
    const el = document.createElement("div"); el.className = "pop"; el.setAttribute("role", "menu"); el.innerHTML = html; document.body.appendChild(el);
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let left = align === "right" ? r.right - w : r.left, top = r.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(52, r.top - h - 6);
    left = Math.min(Math.max(8, left), innerWidth - w - 8);
    el.style.left = left + "px"; el.style.top = top + "px";
    pop = { el, back: anchor };
    (el.querySelector("button") || el).focus();
  }
  function ioMenu(anchor) {
    const out = S.block === "dir" && st() === "frozen" ? "website-v2" : "website";
    const rows = [...D.folders, ...(out === "website-v2" ? [{ id: "v2", name: "website-v2", path: "~/code/website-v2", roles: ["output"] }] : [])].map((f) => {
      const roles = f.id === "website" && out === "website-v2" ? ["input"] : f.roles;
      const tags = roles.map((r) => (r === "output" ? `<span class="tag out">${L("输出", "Output")}</span>` : `<span class="tag ro">${L("参考", "Reference")}</span>`)).join("");
      return `<button class="mi" role="menuitem" data-act="toast" data-arg="${esc(f.path)}">${ic("folder", "sm")}<span class="grow">${esc(f.name)}<small>${esc(f.path)}</small></span>${tags}</button>`;
    }).join("");
    openPop(anchor, `<h4>${L("输入与输出", "Inputs and output")}</h4>${rows}<hr><div class="pfoot">${L("同一个文件夹既是参考也是输出：任务可以直接改这里的原文件；其他参考文件夹只读。改了只对之后的轮次生效。", "One folder can be both reference and output: tasks may change its files; other references stay read-only. Changes apply from the next round.")}</div><div class="pacts"><button class="btn sm sec" data-act="toast" data-arg="${esc(L("打开项目设置里的「输入与输出」（03 定样）", "Opens “Inputs and output” in project settings (03)"))}">${L("管理输入与输出", "Manage inputs and output")}</button></div>`, "right");
  }
  function viewMenu(anchor) {
    const rows = D.folders.map((f) => {
      const work = f.id === "website";
      return `<button class="mi" role="menuitemradio" aria-checked="${work ? S.state.dir !== "browsing" : S.state.dir === "browsing" && f.id === "brand"}" data-act="${work ? "back-to-work" : "view-folder"}" data-arg="${f.id}">${ic(work ? "folder-tree" : "eye", "sm")}<span class="grow">${esc(f.name)}</span>${work ? `<span class="tag out">${L("工作目录", "Working folder")}</span>` : `<span class="tag ro">${L("只读", "Read-only")}</span>`}</button>`;
    }).join("");
    openPop(anchor, `<h4>${L("看哪个文件夹", "Which folder to view")}</h4>${rows}<hr><div class="pfoot">${L("看别的文件夹只是临时查看，不改 Coding 在哪里做。", "Viewing another folder is temporary; it doesn't change where Coding works.")}</div>`);
  }
  function modeMenu(anchor) {
    openPop(anchor, `<h4>${L("这一轮用什么模式", "Mode for this round")}</h4>${MODES.map((m) => `<button class="mi" role="menuitemradio" aria-checked="${m.id === S.mode}" data-act="set-mode" data-arg="${m.id}">${ic(m.ro ? "lock" : "edit", "sm")}<span class="grow">${esc(P(m.n))}<small>${esc(P(m.d))}</small></span>${m.ro ? `<span class="tag ro">${L("只读", "Read-only")}</span>` : ""}${m.id === S.mode ? ic("check", "sm") : ""}</button>`).join("")}`);
  }
  function rulesMenu(anchor) {
    const s = S.block === "rules" ? st() : "normal";
    const rows = s === "untrusted"
      ? `<div class="pbody">${L("项目还没被信任，下面的规则文件没有加载：", "The project isn't trusted yet; these rules files were not loaded:")}</div>${RULES.map((r) => `<div class="mi">${ic("file", "sm")}<span class="grow">${esc(r.file)}<small>${esc(P(r.where))}</small></span><span class="tag warn">${L("没加载", "Not loaded")}</span></div>`).join("")}`
      : RULES.map((r, i) => `<div class="mi">${ic("file", "sm")}<span class="grow">${esc(r.file)}<small>${esc(P(r.where))} · ${L("本轮用", "This round uses")} ${i === 0 && s === "changed" ? L("10:02 版", "the 10:02 version") : esc(P(r.ver))}</small></span>${i === 0 && s === "changed" ? `<span class="tag warn">${L("有新版本", "Updated")}</span>` : `<span class="tag ok">${L("生效中", "In effect")}</span>`}</div>`).join("");
    openPop(anchor, `<h4>${L("本轮的规则", "Rules for this round")}</h4>${rows}<hr><div class="pfoot">${L("规则按 Coding 真实所在的文件夹加载；规则只能约束 Coding，不能给它多开权限。改了规则文件，下一轮起生效。", "Rules load by the folder Coding really works in; rules can only constrain Coding, never grant it more. A changed rules file applies from the next round.")}</div>`);
  }
  function sendConfirm(anchor) {
    const m = modeOf(S.mode);
    openPop(anchor, `<div class="pbody">${ic("lock", "sm")} <b>${L(`这条看起来要改文件，但现在是「${P(m.n)}」（只读）`, `This looks like it changes files, but the mode is “${P(m.n)}” (read-only)`)}</b></div><div class="pbody fact">${L("按只读发，Coding 只回答、不改文件。", "Sent read-only, Coding only answers and changes nothing.")}</div><div class="pacts"><button class="btn sm sec" data-act="send-as-is">${L(`仍按${P(m.n)}发`, `Send as ${P(m.n)}`)}</button><button class="btn sm primary" data-act="switch-send">${L("换成修改再发", "Switch to Edit and send")}</button></div>`, "right");
  }
  function recPop(anchor) {
    const f = recoverFacts();
    if (!f.rec) return;
    openPop(anchor, `<div style="padding:4px">${recBlockHtml(f.rec, f.keep).replace('class="alert block', 'style="max-width:none" class="alert block')}</div>`, "right");
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, undo) {
    document.querySelector(".toast")?.remove(); clearTimeout(toastTimer);
    const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status");
    el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button data-act="${undo}">${L("撤销", "Undo")}</button>` : ""}`;
    document.body.appendChild(el); toastTimer = setTimeout(() => el.remove(), 3600);
  }

  // ---------- render ----------
  function applyStateDefaults() {
    if (S.block === "rules") {
      const s = st();
      S.mode = s === "readonly" ? "discuss" : s === "review" ? "review" : "edit";
      S.draft = s === "readonly" ? L("那把首屏按钮改成品牌蓝，顺便删掉旧的 Banner 组件", "Then change the hero button to brand blue and delete the old Banner component") : s === "review" ? L("按这三条改掉", "Fix these three") : "";
      S.autoSwitched = false;
    } else { S.mode = S.block === "recover" || S.block === "steps" ? "execute" : "edit"; S.draft = ""; }
    S.verified = {};
  }
  function render() {
    closePop(false);
    syncProto();
    const html = { dir: dirBlock, rules: rulesBlock, recover: recoverBlock, steps: stepsBlock }[S.block]();
    document.getElementById("app").innerHTML = html;
    save();
  }

  // ---------- events ----------
  document.getElementById("block").addEventListener("change", (e) => { S.block = e.target.value; S.files = S.board = false; applyStateDefaults(); render(); });
  document.getElementById("state").addEventListener("change", (e) => { S.state[S.block] = e.target.value; applyStateDefaults(); render(); });
  document.getElementById("scheme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.scheme[S.block] = b.dataset.scheme; S.autoSwitched = false; render(); });
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.lang = b.dataset.lang; if (S.block === "rules") { const keepMode = S.mode; applyStateDefaults(); S.mode = keepMode; } render(); });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.theme = b.dataset.themeSet; render(); });
  document.getElementById("reset").addEventListener("click", () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } S = fresh(); applyStateDefaults(); render(); });
  document.addEventListener("input", (e) => { if (e.target.id === "draft") { S.draft = e.target.value; save(); } });

  const ACT = {
    toast: (el) => toast(el.dataset.arg || ""),
    "toggle-files": () => { S.files = !S.files; S.board = false; render(); },
    "toggle-board": () => { S.board = !S.board; S.files = false; render(); },
    "close-drawers": () => { S.files = S.board = false; render(); },
    "io-menu": (el) => ioMenu(el),
    "view-menu": (el) => viewMenu(el),
    "view-folder": () => { S.state.dir = "browsing"; render(); },
    "back-to-work": () => { const was = S.state.dir === "browsing"; S.state.dir = "normal"; render(); if (was) toast(L("回到工作目录 website", "Back in the working folder website")); },
    relocate: () => { S.state.dir = "normal"; render(); toast(L("已重新找到 ~/code/website", "Found ~/code/website again")); },
    "pick-output": () => { S.state.dir = "normal"; render(); toast(L("输出设为 website；之后的轮次在这里做", "Output set to website; later rounds work here")); },
    "mode-menu": (el) => modeMenu(el),
    "rules-menu": (el) => rulesMenu(el),
    "set-mode": (el) => { const prev = S.mode; S.mode = el.dataset.arg; S.autoSwitched = false; render(); if (prev !== S.mode) toast(L(`已换成「${P(modeOf(S.mode).n)}」，从这条消息起生效`, `Switched to “${P(modeOf(S.mode).n)}” from this message`)); },
    send: (el) => {
      const m = modeOf(S.mode);
      if (S.block === "rules" && m.ro && devIntent(S.draft)) {
        if (sch() === "B") return sendConfirm(el);
        if (sch() === "C") { S.prevMode = S.mode; S.mode = "edit"; S.autoSwitched = true; render(); return; }
        return toast(L(`已按「${P(m.n)}」发出：只回答，不改文件（模拟）`, `Sent as “${P(m.n)}”: answers only, no file changes (sample)`));
      }
      toast(L("已发出（模拟）", "Sent (sample)"));
    },
    "send-as-is": () => { closePop(); toast(L(`已按「${P(modeOf(S.mode).n)}」发出（模拟）`, `Sent as “${P(modeOf(S.mode).n)}” (sample)`)); },
    "switch-send": () => { S.mode = "edit"; render(); toast(L("已换成「修改」并发出（模拟）", "Switched to “Edit” and sent (sample)")); },
    "undo-switch": () => { S.mode = S.prevMode || "discuss"; S.autoSwitched = false; render(); toast(L("已撤销，回到原来的模式", "Undone; back to the previous mode")); },
    verify: () => { closePop(false); S.verified.recover = true; render(); toast(L("核对完：看了 dist/ 的时间和进程，没有重跑", "Checked dist/ times and processes; nothing re-run")); },
    "verify-step": () => { S.verified.steps = true; render(); toast(L("核对完：第 4 步其实已完成，接着做第 5 步", "Checked: step 4 had finished; on to step 5")); },
    fix: () => toast(L("交给 Coding 修（模拟）", "Handed to Coding (sample)")),
    "rec-pop": (el) => recPop(el),
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (pop && !e.target.closest(".pop") && !(el && el === pop.back)) closePop(false);
    if (!el || el.closest(".proto")) return;
    const f = ACT[el.dataset.act];
    if (f) { e.preventDefault(); f(el); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (pop) { closePop(); return; }
    if (S.files || S.board) { S.files = S.board = false; render(); }
  });

  if (!S.draft && S.block === "rules") applyStateDefaults();
  render();
})();
