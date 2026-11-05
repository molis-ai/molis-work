// 03 · 资料、目录与工作台定样 — standalone prototype. All data is sample data (data.js); nothing calls a model or reads a folder.
(() => {
  const D = window.protoData;
  document.getElementById("icons").innerHTML = window.protoIcons;

  const T = {
    zh: {
      protoTitle: "原型 · 模拟数据", scheme: "方案", scenario: "场景", fault: "状态", lang: "语言", theme: "外观", light: "浅", dark: "深", reset: "重置",
      sc_code: "做代码，同时参考资料", sc_writing: "只有研究和写作资料", sc_first: "第一次进入，什么都没有",
      f_none: "正常", f_scanning: "大文件夹还在读", f_missing: "参考文件夹不见了", f_revoked: "停止了一个文件夹的读取", f_frozen: "运行中改了输出位置", f_worktree: "本轮在临时副本里做",
      materials: "项目资料", home: "项目首页", shelf: "Shelf", talk: "讨论", coding: "Coding", pages: "Pages",
      search: "在全部资料里找", inputs: (n) => `参考 ${n} 个文件夹`, output: "输出到", manage: "输入与输出",
      localFolders: "本机文件夹", imports: "导入的文件", content: "项目里的内容", recent: "最近用过", bySource: "按来源",
      workDir: "工作目录", references: "参考资料", roleIn: "参考", roleOut: "输出", readOnly: "只读参考",
      skipped: (n, why) => `另有 ${n} 项没读：${why}`, showSkipped: "看看是哪些",
      addToTask: "加入任务", openOther: "在另一侧打开", openMain: "在主区打开", cite: "复制引用", inCoding: "在 Coding 里看",
      from: "来自", current: "当前文件", readAt: "读取于 10:42", fixedVer: "固定版本", lines: (n) => `${n} 行`, pagesN: (n) => `${n} 页`,
      pickOne: "选一份资料看看", pickOneSub: "点左边的文件或内容，这里显示它，并能加入任务。",
      emptyTitle: "这个项目还没有资料", emptySub: "可以加几个本机文件夹，或导入文件；Pages、Shelf 里的内容会自动出现在这里。产出默认写到下面的位置，随时能改。",
      addFolder: "添加文件夹", importFile: "导入文件", change: "更改",
      ioTitle: "输入与输出", ioIn: "参考哪些文件夹", ioOut: "产出写到哪里", ioOne: "只有一个，所有任务和插件共用",
      setOut: "设为输出", remove: "移除", sameDir: "同一个文件夹既是参考也是输出：任务可以直接改这里的原文件；其他参考文件夹只读。",
      ioFoot: "改了只对之后的任务生效；正在运行的那一轮保留它开始时的位置。移除文件夹不会删除磁盘上的文件。",
      projOut: "项目输出", thisRun: "本轮在", git: "main · 2 处改动", viewing: (f) => `正在看 ${f}（只读参考），Coding 仍在工作目录里做`, backToWork: "回到工作目录",
      frozen: (a, b) => `本轮仍在 ${a}（开始时的设置），下一轮起用 ${b}`, worktree: "本轮在临时副本里做，完成后经你审查交回 website", seeDiff: "看差异",
      scanning: (n) => `正在读取，已发现 ${n} 项；读到的可以先用`, stop: "停止",
      missing: (p) => `找不到 ${p}。之前加入任务的 2 段内容仍能查看。`, relocate: "重新找到位置", fromProject: "从项目移除",
      revoked: "你在 10:20 停止了这个文件夹的读取。新的读取会被拒绝；之前的引用仍显示出处。", resume: "恢复读取",
      unreadable: "这个格式读不了正文，原件还在原处。", showInFinder: "在访达中显示",
      parseFailed: "表格没能解析（第 2 页格式无法识别），原件已保留。", retryParse: "重试解析", openOriginal: "打开原件",
      truncated: (a, b) => `只读了前 ${a} 页（共 ${b} 页）`, readAll: "读全部",
      added: (n) => `已加入任务：${n}`, undo: "撤销", moved: "已移到另一侧", folderAdded: "已添加「访谈记录」为参考文件夹",
      outChanged: (p) => `输出改为 ${p}；之后的任务写到这里`, relocated: "已重新找到 brand-assets", resumed: "已恢复读取 brand-assets",
      newTab: "打开", openHere: "在这一侧打开", sideBySide: "并排", task: "首页改版：换成新的首屏",
      you: "你", ai: "Coding", askHero: "按品牌指南把首屏改成一句主张加一个主按钮。",
      aiReply: "看过品牌指南第 3 页和配色说明，首屏改成一句主张、一个主按钮，主色只用在按钮上。",
      stepEditing: "正在改 src/components/Hero.tsx", composer: "让助理做点什么，或按 ⌘K 搜索", winMain: "主区", winSide: "右侧",
      projectSettings: "项目设置", settingsSub: "名称、成员和这个项目的资料位置。", sim: "模拟", docTitle: "改版方案", writingTurn: "整理三份访谈，写进改版方案的第二屏场景。",
    },
    en: {
      protoTitle: "Prototype · sample data", scheme: "Option", scenario: "Scenario", fault: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      sc_code: "Code, with references", sc_writing: "Research and writing only", sc_first: "First visit, nothing yet",
      f_none: "Normal", f_scanning: "Large folder still reading", f_missing: "A reference folder is gone", f_revoked: "Reading stopped for a folder", f_frozen: "Output changed during a run", f_worktree: "This run is in a temporary copy",
      materials: "Project materials", home: "Project home", shelf: "Shelf", talk: "Discussion", coding: "Coding", pages: "Pages",
      search: "Search all materials", inputs: (n) => `${n} reference folder${n === 1 ? "" : "s"}`, output: "Output to", manage: "Inputs and output",
      localFolders: "Folders on this Mac", imports: "Imported files", content: "Project content", recent: "Recent", bySource: "By source",
      workDir: "Working folder", references: "References", roleIn: "Reference", roleOut: "Output", readOnly: "Read-only reference",
      skipped: (n, why) => `${n} more not read: ${why}`, showSkipped: "Show them",
      addToTask: "Add to task", openOther: "Open on the other side", openMain: "Open in main", cite: "Copy reference", inCoding: "View in Coding",
      from: "From", current: "Current file", readAt: "Read at 10:42", fixedVer: "Fixed version", lines: (n) => `${n} lines`, pagesN: (n) => `${n} page${n === 1 ? "" : "s"}`,
      pickOne: "Pick something to look at", pickOneSub: "Choose a file or item on the left to see it here and add it to a task.",
      emptyTitle: "No materials in this project yet", emptySub: "Add folders from this Mac or import files; content from Pages and Shelf shows up here on its own. Output goes to the place below by default and can be changed any time.",
      addFolder: "Add folder", importFile: "Import file", change: "Change",
      ioTitle: "Inputs and output", ioIn: "Folders to refer to", ioOut: "Where output goes", ioOne: "Just one, shared by every task and plugin",
      setOut: "Make output", remove: "Remove", sameDir: "One folder is both a reference and the output: tasks may change its files directly; other reference folders stay read-only.",
      ioFoot: "Changes apply to later tasks; a run already going keeps the place it started with. Removing a folder does not delete its files.",
      projOut: "Project output", thisRun: "This run in", git: "main · 2 changes", viewing: (f) => `Viewing ${f} (read-only reference); Coding keeps working in the working folder`, backToWork: "Back to working folder",
      frozen: (a, b) => `This run stays in ${a} (as it started); from the next run on, ${b}`, worktree: "This run works in a temporary copy; after your review it goes back to website", seeDiff: "See changes",
      scanning: (n) => `Reading; ${n} items found so far — what is read can be used now`, stop: "Stop",
      missing: (p) => `Can't find ${p}. The 2 passages already added to tasks can still be viewed.`, relocate: "Find it again", fromProject: "Remove from project",
      revoked: "You stopped reading this folder at 10:20. New reads are refused; earlier references still show their source.", resume: "Resume reading",
      unreadable: "This format can't be read as text; the original stays where it is.", showInFinder: "Show in Finder",
      parseFailed: "The sheet could not be parsed (page 2's layout is not recognised); the original is kept.", retryParse: "Retry parsing", openOriginal: "Open original",
      truncated: (a, b) => `Read the first ${a} pages (of ${b})`, readAll: "Read all",
      added: (n) => `Added to task: ${n}`, undo: "Undo", moved: "Moved to the other side", folderAdded: "Added 访谈记录 as a reference folder",
      outChanged: (p) => `Output is now ${p}; later tasks write here`, relocated: "Found brand-assets again", resumed: "Reading brand-assets again",
      newTab: "Open", openHere: "Open on this side", sideBySide: "Side by side", task: "Home redesign: new hero",
      you: "You", ai: "Coding", askHero: "Following the brand guide, make the hero one statement and one main button.",
      aiReply: "Read page 3 of the brand guide and the colour notes; the hero is now one statement and one main button, main colour on the button only.",
      stepEditing: "Editing src/components/Hero.tsx", composer: "Ask the Assistant, or press ⌘K to search", winMain: "Main", winSide: "Right",
      projectSettings: "Project settings", settingsSub: "Name, people and where this project's materials live.", sim: "Simulated", docTitle: "改版方案", writingTurn: "Sum up the three interviews into the second-screen scenarios of the plan.",
    },
  };

  const KEY = "molis-proto.workbench-shared-paths.v1";
  const fresh = () => ({ scheme: "A", scenario: "code", fault: "none", lang: "zh", theme: "light", sideOpen: true, focus: "main", selected: null, viewing: null, chips: [], expanded: ["website", "src", "brand", "website/src"], extraFolder: false, output: null, sideTab: "materials", mainTab: null, materialsSide: "side", b: "recent", query: "", relocated: false, resumed: false });
  let S = load();
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* preview without storage */ } }
  const t = (k, ...a) => { const v = T[S.lang][k]; return typeof v === "function" ? v(...a) : v ?? k; };
  const ic = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const kindIcon = { dir: "folder", code: "code", text: "file", pdf: "book", image: "image", office: "clipboard", page: "note", note: "note", artifact: "package" };

  // ---------- model ----------
  function folders() {
    if (S.scenario === "first") return S.extraFolder ? [D.writingFolders[0]] : [];
    let list = S.scenario === "writing" ? [...D.writingFolders] : D.folders.map((f) => ({ ...f, roles: [...f.roles] }));
    if (S.extraFolder && S.scenario === "code") list.push({ ...D.writingFolders[0] });
    if (S.output) list.forEach((f) => { f.roles = f.roles.filter((r) => r !== "output"); if (f.id === S.output) f.roles.push("output"); });
    // 运行中改了输出：项目设置已经指向 website-v2，正在运行的那一轮仍在 website。
    if (S.fault === "frozen" && S.scenario === "code") { list.forEach((f) => { f.roles = f.roles.filter((r) => r !== "output"); }); list.unshift({ id: "website-v2", name: "website-v2", path: "~/code/website-v2", roles: ["output"], tree: [] }); }
    return list;
  }
  function outputPath() {
    const o = folders().find((f) => f.roles.includes("output"));
    return o ? o.path : D.defaultOutput;
  }
  function outputName() { const o = folders().find((f) => f.roles.includes("output")); return o ? o.name : (S.lang === "zh" ? "默认位置" : "Default place"); }
  function folderState(f) {
    if (f.id !== "brand") return null;
    if (S.fault === "missing" && !S.relocated) return "missing";
    if (S.fault === "revoked" && !S.resumed) return "revoked";
    if (S.fault === "scanning") return "scanning";
    return null;
  }
  function allItems() {
    const out = [];
    for (const f of folders()) walk(f.tree, f, "", out);
    if (S.scenario !== "first") for (const i of D.imports) out.push({ ...i, source: t("imports"), sourceId: "imports" });
    if (S.scenario !== "first") for (const c of D.content) out.push({ ...c, source: S.lang === "en" && c.ownerEn ? c.ownerEn : c.owner, sourceId: "content" });
    return out;
  }
  function walk(nodes, f, prefix, out) { for (const n of nodes) { if (n.kind === "dir") walk(n.children, f, prefix + n.name + "/", out); else out.push({ ...n, source: f.name, sourceId: f.id, path: prefix + n.name }); } }
  function findItem(name) { return allItems().find((i) => i.name === name); }

  // ---------- shell ----------
  function mainTabs() {
    const tabs = [{ id: "home", title: t("home"), icon: "home" }];
    if (S.scenario === "code") tabs.push({ id: "coding", title: t("task"), icon: "code", group: "Coding", hue: "#3c6e98" });
    if (S.scenario === "writing") tabs.push({ id: "pages", title: t("docTitle"), icon: "note", group: "Pages", hue: "#367556" });
    if (S.materialsSide === "main") tabs.push({ id: "materials", title: t("materials"), icon: "library" });
    if (S.mainRecord) tabs.push({ id: "record", title: S.mainRecord, icon: kindIcon[findItem(S.mainRecord)?.kind] || "file" });
    return tabs;
  }
  function sideTabs() {
    const tabs = [];
    if (S.materialsSide === "side") tabs.push({ id: "materials", title: t("materials"), icon: "library" });
    tabs.push({ id: "shelf", title: t("shelf"), icon: "book" }, { id: "talk", title: t("talk"), icon: "review" });
    return tabs;
  }
  function activeMain() { const ids = mainTabs().map((x) => x.id); if (!ids.includes(S.mainTab)) S.mainTab = S.mainRecord ? "record" : S.materialsSide === "main" ? "materials" : ids[1] || ids[0]; return S.mainTab; }
  function activeSide() { const ids = sideTabs().map((x) => x.id); if (!ids.includes(S.sideTab)) S.sideTab = ids[0]; return S.sideTab; }
  function strip(which, tabs, active) {
    const nav = which === "main" ? `<div class="nav"><button aria-label="back">${ic("chevron-left", "sm")}</button><button aria-label="forward">${ic("chevron-right", "sm")}</button></div>` : "";
    const win = `<span class="seg winsel" role="group" aria-label="window"><button data-act="focus" data-v="main" aria-pressed="${S.focus === "main"}">${t("winMain")}</button><button data-act="focus" data-v="side" aria-pressed="${S.focus === "side"}">${t("winSide")}</button></span>`;
    let html = "", group = null;
    for (const tb of tabs) {
      const tab = `<button class="tab" role="tab" aria-selected="${tb.id === active}" data-act="tab" data-pane="${which}" data-id="${tb.id}">${ic(tb.icon, "sm")}<span>${esc(tb.title)}</span>${tb.id === "home" ? "" : `<span class="x" data-act="close" data-pane="${which}" data-id="${tb.id}" aria-label="close">${ic("x", "sm")}</span>`}</button>`;
      if (tb.group) { html += `<span class="group" style="--hue:${tb.hue}"><span class="chip">${tb.group}</span>${tab}</span>`; group = tb.group; } else html += tab;
    }
    return `<div class="strip ${which}">${nav}<div class="tabs" role="tablist">${html}</div><div class="tools">${win}<button data-act="plus" data-pane="${which}" aria-label="${t("newTab")}">${ic("plus")}</button>${which === "main" ? `<button aria-label="split">${ic("columns")}</button>` : `<button data-act="side-close" aria-label="close side">${ic("x")}</button>`}</div></div>`;
  }

  function render() {
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = S.theme;
    document.querySelectorAll("[data-t]").forEach((n) => (n.textContent = t(n.dataset.t)));
    for (const b of document.querySelectorAll("#scheme button")) b.setAttribute("aria-pressed", b.dataset.scheme === S.scheme);
    for (const b of document.querySelectorAll("#lang button")) b.setAttribute("aria-pressed", b.dataset.lang === S.lang);
    for (const b of document.querySelectorAll("#theme button")) b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme);
    fillSelect("scenario", ["code", "writing", "first"].map((v) => [v, t("sc_" + v)]), S.scenario);
    fillSelect("fault", ["none", "scanning", "missing", "revoked", "frozen", "worktree"].filter((v) => S.scenario === "code" || ["none", "scanning"].includes(v)).map((v) => [v, t("f_" + v)]), S.fault);
    const am = activeMain(), as = activeSide(), solo = !S.sideOpen;
    document.getElementById("app").innerHTML = `
      <div class="titlebar${solo ? " solo" : ""}" data-focus="${S.focus}">${strip("main", mainTabs(), am)}<span class="gutter-t"></span>${strip("side", sideTabs(), as)}</div>
      <div class="desk${solo ? " solo" : ""}" data-focus="${S.focus}">
        <section class="pane main${S.focus === "main" ? " focused" : ""}" data-pane="main" aria-label="${t("winMain")}">${paneBody("main", am)}</section>
        <div class="gutter" aria-hidden="true"></div>
        <section class="pane side${S.focus === "side" ? " focused" : ""}" data-pane="side" aria-label="${t("winSide")}">${paneBody("side", as)}</section>
      </div>
      ${bar()}`;
    save();
  }
  function fillSelect(id, opts, cur) { const el = document.getElementById(id); el.innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${esc(l)}</option>`).join(""); }

  function bar() {
    const chips = S.chips.map((c, i) => `<span class="mchip" title="${esc(c.name)} · ${esc(c.source)}">${ic(kindIcon[c.kind] || "file", "sm")}<span>${esc(c.name)}</span><small>${esc(c.source)}</small><button data-act="unchip" data-i="${i}" aria-label="${t("remove")}">${ic("x", "sm")}</button></span>`).join("");
    const plug = S.scenario === "writing" ? t("pages") : S.scenario === "code" ? t("coding") : t("home");
    return `<div class="bar">
      <div class="tray"><button class="switcher">${ic("grid", "sm")}<span>${plug}</span>${ic("chevron-down", "sm")}</button><button class="pin" aria-label="${t("home")}">${ic("home")}</button><button class="pin" aria-label="Goals">${ic("target")}</button><button class="pin" aria-current="page" aria-label="${plug}">${ic(S.scenario === "writing" ? "note" : "code")}</button></div>
      <div class="composer"><span class="chips">${chips}</span><span class="ph">${S.chips.length ? "" : t("composer")}</span><button class="send" aria-label="send">${ic("send", "sm")}</button></div>
      <div class="tray"><button class="resident" data-act="side-toggle" aria-pressed="${S.sideOpen}" aria-label="side">${ic("sidebar")}</button><span class="mono" data-act="settings" role="button" tabindex="0" aria-label="${t("projectSettings")}">${D.project.mono}</span></div>
    </div>`;
  }

  // ---------- pane bodies ----------
  function paneBody(which, id) {
    if (id === "materials") return materials(which);
    if (id === "coding") return coding();
    if (id === "pages") return pagesDoc();
    if (id === "record") return recordView(S.mainRecord, which);
    if (id === "home") return `<div class="empty"><h3>${esc(S.lang === "zh" ? D.project.name : D.project.nameEn)}</h3><p>${t("home")}</p><span class="tag sim">${t("sim")}</span></div>`;
    if (id === "shelf") return `<div class="phead"><h2>Shelf</h2></div><div class="list">${D.content.filter((c) => c.owner === "Shelf").map((c) => `<div class="lrow">${ic("note")}<span class="nm"><strong>${esc(c.name)}</strong><span class="fact">${esc(S.lang === "zh" ? c.when : c.whenEn)}</span></span></div>`).join("")}</div><span class="tag sim simmark">${t("sim")}</span>`;
    return `<div class="empty"><h3>${t("talk")}</h3><span class="tag sim">${t("sim")}</span></div>`;
  }

  function ioLine() {
    const ins = folders().filter((f) => f.roles.includes("input")).length;
    return `<div class="io-line">${ic("folder-tree", "sm")}<span>${t("inputs", ins)}</span><span>·</span><span>${t("output")}</span><span class="tag out">${ic("output", "sm")}${esc(outputName())}</span><button class="btn sm sec" data-act="io">${ic("settings", "sm")}${t("manage")}</button></div>`;
  }

  function materials(which) {
    const head = `<div class="phead"><h2>${t("materials")}</h2><span class="grow"></span><button class="btn sm sec" data-act="add-folder">${ic("plus", "sm")}${t("addFolder")}</button></div>${ioLine()}<label class="search">${ic("search", "sm")}<input data-act="query" value="${esc(S.query)}" placeholder="${t("search")}" aria-label="${t("search")}"></label>`;
    if (S.scenario === "first" && !S.extraFolder) return head + `<div class="empty">${ic("library")}<h3>${t("emptyTitle")}</h3><p>${t("emptySub")}</p><div style="display:flex;gap:8px;margin-top:6px"><button class="btn primary" data-act="add-folder">${ic("folder")}${t("addFolder")}</button><button class="btn sec">${ic("upload")}${t("importFile")}</button></div><p class="fact" style="margin-top:6px">${t("output")} <b style="font-family:var(--mono);font-weight:500">${esc(D.defaultOutput)}</b> · <button class="link" data-act="io">${t("change")}</button></p></div>`;
    let dir;
    if (S.query) dir = searchResults();
    else if (S.scheme === "B") dir = `<div class="tabs2" role="group"><button data-act="b" data-v="recent" aria-pressed="${S.b === "recent"}">${t("recent")}</button><button data-act="b" data-v="source" aria-pressed="${S.b === "source"}">${t("bySource")}</button></div>` + (S.b === "recent" ? recentList() : `<div class="scroll">${bySource()}</div>`);
    else if (S.scheme === "C") dir = `<div class="scroll">${workFirst()}</div>`;
    else dir = `<div class="scroll">${bySource(true)}</div>`;
    return head + `<div class="mat${S.selected ? " previewing" : ""}"><div class="dir">${dir}</div><div class="view">${S.selected ? preview(S.selected, which) : `<div class="empty">${ic("eye")}<h3>${t("pickOne")}</h3><p>${t("pickOneSub")}</p></div>`}</div></div>`;
  }

  function folderBlock(f, open = true) {
    const st = folderState(f), isOpen = S.expanded.includes(f.id) && open;
    const roles = f.roles.map((r) => `<span class="tag ${r === "output" ? "out" : ""}">${r === "output" ? t("roleOut") : t("roleIn")}</span>`).join("");
    const stTag = st === "missing" ? `<span class="tag err">${S.lang === "zh" ? "找不到" : "Missing"}</span>` : st === "revoked" ? `<span class="tag warn">${S.lang === "zh" ? "已停止读取" : "Stopped"}</span>` : "";
    let body = "";
    if (st === "missing") body = `<div class="note err">${t("missing", f.path)}<div class="acts"><button class="btn sm sec" data-act="relocate">${t("relocate")}</button><button class="btn sm ghost">${t("fromProject")}</button></div></div>`;
    else if (st === "revoked") body = `<div class="note warn">${t("revoked")}<div class="acts"><button class="btn sm sec" data-act="resume">${t("resume")}</button></div></div>`;
    else if (isOpen && !f.tree.length) body = `<div class="row muted" style="padding-left:30px"><span class="nm fact">${S.lang === "zh" ? "空文件夹；之后的任务写到这里" : "Empty; later tasks write here"}</span></div>`;
    else if (isOpen) {
      body = (st === "scanning" ? `<div class="note">${t("scanning", "3,214")}<div class="progress"><i></i></div><div class="acts"><button class="btn sm sec">${t("stop")}</button></div></div>` : "") + tree(f.tree, f, f.id, 1) + (f.skipped ? `<div class="row muted" style="padding-left:30px"><span class="nm fact" style="white-space:normal">${t("skipped", f.skipped.count.toLocaleString(), S.lang === "zh" ? f.skipped.why : f.skipped.whyEn)}</span><button class="link" style="font-size:11px;white-space:nowrap">${t("showSkipped")}</button></div>` : "");
    }
    return `<div class="folder-head"><button class="row" data-act="toggle" data-id="${f.id}" aria-expanded="${isOpen}"><span class="tw${isOpen ? " open" : ""}">${ic("chevron-right", "sm")}</span>${ic(isOpen ? "folder-open" : "folder")}<span class="nm">${esc(f.name)}</span>${stTag}${roles}</button></div>${body}`;
  }
  function tree(nodes, f, key, depth) {
    return nodes.map((n) => {
      const k = key + "/" + n.name, pad = `style="padding-left:${8 + depth * 16}px"`;
      if (n.kind === "dir") { const open = S.expanded.includes(k) || S.expanded.includes(n.name); return `<button class="row" ${pad} data-act="toggle" data-id="${esc(k)}" aria-expanded="${open}"><span class="tw${open ? " open" : ""}">${ic("chevron-right", "sm")}</span>${ic(open ? "folder-open" : "folder")}<span class="nm">${esc(n.name)}</span></button>${open ? tree(n.children, f, k, depth + 1) : ""}`; }
      const sel = S.selected === n.name;
      return `<button class="row${n.unreadable ? " muted" : ""}" ${pad} data-act="pick" data-name="${esc(n.name)}" aria-selected="${sel}"><span class="tw"></span>${ic(kindIcon[n.kind])}<span class="nm">${esc(n.name)}</span>${n.changed ? `<span class="tag out">M</span>` : ""}</button>`;
    }).join("");
  }
  function plainRows(items) { return items.map((i) => `<button class="row" data-act="pick" data-name="${esc(i.name)}" aria-selected="${S.selected === i.name}"><span class="tw"></span>${ic(kindIcon[i.kind])}<span class="nm">${esc(i.name)}</span>${i.parseFailed ? `<span class="tag warn">${S.lang === "zh" ? "未解析" : "Not parsed"}</span>` : `<span class="fact">${esc(i.owner ? (S.lang === "en" && i.ownerEn ? i.ownerEn : i.owner) : (S.lang === "zh" ? i.when : i.whenEn))}</span>`}</button>`).join(""); }
  function recentSection() {
    const items = D.recent.map((n) => findItem(n)).filter(Boolean).slice(0, 5);
    if (!items.length) return "";
    return `<div class="sec-h">${ic("history", "sm")}${t("recent")}</div>${items.map((i) => `<button class="row" data-act="pick" data-name="${esc(i.name)}" aria-selected="${S.selected === i.name}"><span class="tw"></span>${ic(kindIcon[i.kind])}<span class="nm">${esc(i.name)}</span><span class="fact">${esc(i.source)}</span></button>`).join("")}`;
  }
  function bySource(withRecent = false) {
    const fs = folders();
    return `${withRecent ? recentSection() : ""}${fs.length ? `<div class="sec-h">${t("localFolders")}</div>${fs.map((f) => folderBlock(f)).join("")}` : ""}
      ${S.scenario !== "first" ? `<div class="sec-h">${t("imports")}<span class="grow"></span><button>${ic("upload", "sm")}</button></div>${plainRows(D.imports)}<div class="sec-h">${t("content")}</div>${plainRows(D.content)}` : ""}`;
  }
  function workFirst() {
    const fs = folders(), out = fs.find((f) => f.roles.includes("output")), refs = fs.filter((f) => f !== out);
    const work = out ? folderBlock(out) : `<div class="note">${ic("output", "sm")} <b style="font-family:var(--mono);font-weight:500">${esc(outputPath())}</b><br><span class="fact">${S.lang === "zh" ? "还没有产出；导出的文件和生成的内容会写到这里。" : "Nothing produced yet; exported and generated files go here."}</span></div>`;
    return `<div class="sec-h">${ic("output", "sm")}${t("workDir")}</div>${work}<div class="sec-h">${ic("book", "sm")}${t("references")}</div>${refs.map((f) => folderBlock(f, true)).join("")}${S.scenario !== "first" ? plainRows(D.imports) + plainRows(D.content) : ""}`;
  }
  function recentList() {
    const items = D.recent.map((n) => findItem(n)).filter(Boolean);
    return `<div class="list">${items.map((i) => `<button class="lrow" data-act="pick" data-name="${esc(i.name)}" aria-selected="${S.selected === i.name}">${ic(kindIcon[i.kind])}<span class="nm"><strong>${esc(i.name)}</strong><span class="fact">${t("from")} ${esc(i.source)}${i.path && i.path !== i.name ? " · " + esc(i.path) : ""}</span></span></button>`).join("") || `<div class="empty"><p>${S.lang === "zh" ? "还没用过资料。" : "Nothing used yet."}</p></div>`}</div>`;
  }
  function searchResults() {
    const q = S.query.toLowerCase(), hits = allItems().filter((i) => i.name.toLowerCase().includes(q) || (D.previews[i.name] || "").toLowerCase().includes(q));
    return `<div class="list">${hits.map((i) => `<button class="lrow" data-act="pick" data-name="${esc(i.name)}" aria-selected="${S.selected === i.name}">${ic(kindIcon[i.kind])}<span class="nm"><strong>${esc(i.name)}</strong><span class="fact">${t("from")} ${esc(i.source)}</span></span></button>`).join("") || `<div class="empty"><p>${S.lang === "zh" ? `没有找到「${esc(S.query)}」。` : `Nothing matches “${esc(S.query)}”.`}</p></div>`}</div>`;
  }

  function preview(name, which) {
    const i = findItem(name); if (!i) return "";
    const f = folders().find((x) => x.id === i.sourceId), st = f && folderState(f);
    const meta = [`${t("from")} ${esc(i.source)}`, i.owner === "成果" || i.ownerEn === "Artifacts" ? t("fixedVer") : t("current"), i.lines ? t("lines", i.lines) : i.pages ? t("pagesN", i.pages) : i.size || "", t("readAt")].filter(Boolean).join(" · ");
    const back = `<button class="btn icon sm ghost winsel-back" data-act="unpick" aria-label="back">${ic("chevron-left", "sm")}</button>`;
    const other = which === "side" ? `<button class="btn sm sec" data-act="open-main" data-name="${esc(name)}">${ic("maximize", "sm")}${t("openMain")}</button>` : `<button class="btn sm sec" data-act="move-materials">${ic("panel", "sm")}${t("openOther")}</button>`;
    const viewC = S.scenario === "code" && f && !f.roles.includes("output") ? `<button class="btn sm ghost" data-act="view-in-coding" data-id="${f.id}">${ic("code", "sm")}${t("inCoding")}</button>` : "";
    let body;
    if (st === "missing" || st === "revoked") body = `<div class="note ${st === "missing" ? "err" : "warn"}">${st === "missing" ? t("missing", f.path) : t("revoked")}</div>`;
    else if (i.unreadable) body = `<div class="note warn">${t("unreadable")}<div class="acts"><button class="btn sm sec">${t("showInFinder")}</button></div></div>`;
    else if (i.parseFailed) body = `<div class="note warn">${t("parseFailed")}<div class="acts"><button class="btn sm sec">${t("retryParse")}</button><button class="btn sm ghost">${t("openOriginal")}</button></div></div>`;
    else if (i.kind === "image") body = `<div class="ph-img">${ic("image")}&nbsp;${esc(i.name)}</div>`;
    else body = (i.pages > 30 ? `<div class="note" style="margin:0 0 12px">${t("truncated", 20, i.pages)} <button class="link">${t("readAll")}</button></div>` : "") + (i.kind === "code" ? `<pre>${esc(D.previews[name] || "// …")}</pre>` : `<div class="reading">${esc(D.previews[name] || "…")}</div>`);
    const can = !(st === "missing" || st === "revoked");
    return `<div class="vhead">${back}${ic(kindIcon[i.kind])}<div class="t"><strong>${esc(i.name)}</strong><span class="fact">${meta}</span></div></div>
      <div class="vhead" style="border-bottom:0;padding-top:8px;padding-bottom:0;flex-wrap:wrap">${can ? `<button class="btn sm primary" data-act="add" data-name="${esc(name)}">${ic("plus", "sm")}${t("addToTask")}</button>` : ""}${other}${viewC}</div>
      <div class="vbody">${body}</div>`;
  }
  function recordView(name, which) { return `<div class="mat previewing" style="flex-direction:column"><div class="view" style="display:flex">${preview(name, which)}</div></div>`; }

  function coding() {
    const viewing = S.viewing ? folders().find((f) => f.id === S.viewing) : null;
    const outN = S.fault === "frozen" ? "website-v2" : outputName();
    const runAt = S.fault === "worktree" ? ".worktrees/home-hero" : S.fault === "frozen" ? "website" : outN;
    const banners = [
      viewing ? `<div class="banner view">${ic("eye", "sm")}<span class="grow">${t("viewing", viewing.name)}</span><button class="btn sm sec" data-act="back-to-work">${t("backToWork")}</button></div>` : "",
      S.fault === "frozen" ? `<div class="banner frozen">${ic("clock", "sm")}<span class="grow">${t("frozen", "website", "website-v2")}</span></div>` : "",
      S.fault === "worktree" ? `<div class="banner view">${ic("git-branch", "sm")}<span class="grow">${t("worktree")}</span><button class="btn sm sec">${ic("git-compare", "sm")}${t("seeDiff")}</button></div>` : "",
    ].join("");
    const showFolder = viewing || (S.fault === "frozen" ? folders().find((f) => f.id === "website") : null) || folders().find((f) => f.roles.includes("output")) || folders()[0];
    const cites = S.chips.length ? S.chips : [{ name: "品牌指南 2026.pdf", source: "brand-assets", kind: "pdf" }];
    return `<div class="code-top"><span class="loc">${ic("output", "sm")}${t("projOut")} <b>${esc(outN)}</b></span><span class="fact">·</span><span class="loc">${ic("terminal", "sm")}${t("thisRun")} <b>${esc(runAt)}</b></span><span class="grow" style="flex:1"></span><span class="loc">${ic("git-branch", "sm")}${t("git")}</span></div>${banners}
      <div class="code-body"><div class="files"><button class="row" data-act="loc-menu" aria-haspopup="menu">${ic("folder-tree")}<span class="nm"><b style="font-weight:500">${esc(showFolder.name)}</b></span>${viewing ? `<span class="tag">${t("readOnly")}</span>` : `<span class="tag out">${t("workDir")}</span>`}${ic("chevron-down", "sm")}</button>${tree(showFolder.tree, showFolder, "c-" + showFolder.id, 0)}</div>
      <div class="work"><div class="turn"><div class="who">${t("you")}</div><p>${t("askHero")}</p></div>
        <div class="turn"><div class="who">${ic("sparkles", "sm")}${t("ai")}</div><p>${t("aiReply")}</p><p>${cites.map((c) => `<span class="cite">${ic("link", "sm")}${esc(c.name)} · ${esc(c.source)}</span>`).join(" ")}</p></div>
        <div class="step"><span class="dotp"></span>${t("stepEditing")}</div></div></div><span class="tag sim simmark">${t("sim")}</span>`;
  }
  function pagesDoc() {
    return `<div class="vbody" style="padding:32px"><div style="max-width:68ch;margin:0 auto"><h1 style="font-size:30px;font-weight:600;letter-spacing:-.03em;margin:0 0 12px">${esc(t("docTitle"))}</h1><div class="reading">${esc(D.previews["改版方案"])}\n\n${esc(S.lang === "zh" ? "第二屏：三个真实场景（待根据访谈补齐）" : "第二屏：三个真实场景（to fill from the interviews）")}</div><div class="turn" style="margin-top:20px"><div class="who">${t("you")}</div><p>${t("writingTurn")}</p></div><p>${(S.chips.length ? S.chips : [{ name: "用户访谈 01.docx", source: "访谈记录" }]).map((c) => `<span class="cite">${ic("link", "sm")}${esc(c.name)} · ${esc(c.source)}</span>`).join(" ")}</p></div></div><span class="tag sim simmark">${t("sim")}</span>`;
  }

  // ---------- popovers ----------
  let pop = null;
  function closePop(restore = true) { if (!pop) return; const back = pop.back; pop.el.remove(); pop = null; if (restore && back) back.focus(); }
  function openPop(anchor, html, align = "right") {
    closePop(false);
    const el = document.createElement("div"); el.className = "pop"; el.setAttribute("role", "menu"); el.innerHTML = html; document.body.appendChild(el);
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let left = align === "right" ? r.right - w : r.left, top = r.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
    left = Math.min(Math.max(8, left), innerWidth - w - 8);
    el.style.left = left + "px"; el.style.top = top + "px";
    pop = { el, back: anchor };
    (el.querySelector("button") || el).focus();
  }
  function plusMenu(anchor, pane) {
    const items = [["materials", "library", t("materials")], ["coding", "code", t("coding")], ["pages", "note", t("pages")], ["shelf", "book", t("shelf")], ["talk", "review", t("talk")]];
    openPop(anchor, `<div class="cap">${t("openHere")}</div>${items.map(([id, i, l]) => `<button class="mi" data-act="plus-open" data-pane="${pane}" data-id="${id}">${ic(i)}<span>${l}</span><small>${t("sideBySide")} ⌥</small></button>`).join("")}`);
  }
  function locMenu(anchor) {
    const fs = folders();
    openPop(anchor, fs.map((f) => `<button class="mi" data-act="view-in-coding" data-id="${f.id}">${ic("folder")}<span>${esc(f.name)}</span><small>${f.roles.includes("output") ? t("workDir") : t("readOnly")}</small></button>`).join(""), "left");
  }
  function ioPanel(anchor) {
    const fs = folders(), same = fs.find((f) => f.roles.includes("output") && f.roles.includes("input"));
    const rows = fs.map((f) => `<div class="it">${ic("folder")}<span class="nm"><strong>${esc(f.name)} <span class="tag">${t("roleIn")}</span>${f.roles.includes("output") ? ` <span class="tag out">${t("roleOut")}</span>` : ""}</strong><span class="fact">${esc(f.path)}</span></span>${f.roles.includes("output") ? "" : `<button class="btn sm sec" data-act="set-out" data-id="${f.id}">${t("setOut")}</button>`}<button class="btn sm ghost" aria-label="${t("remove")}">${ic("trash", "sm")}</button></div>`).join("");
    openPop(anchor, `<div class="io"><h3>${t("ioTitle")}</h3>
      <div class="grp"><div class="grp-h">${t("ioIn")}<span class="grow"></span><button class="btn sm sec" data-act="add-folder">${ic("plus", "sm")}${t("addFolder")}</button></div>${rows || `<div class="foot">${S.lang === "zh" ? "还没有参考文件夹。" : "No reference folders yet."}</div>`}</div>
      <div class="grp"><div class="grp-h">${t("ioOut")} · ${t("ioOne")}</div><div class="it">${ic("output")}<span class="nm"><strong>${esc(outputName())}</strong><span class="fact">${esc(outputPath())}</span></span><button class="btn sm sec" data-act="change-out">${t("change")}</button></div></div>
      ${same ? `<div class="foot">${t("sameDir")}</div>` : ""}<div class="foot">${t("ioFoot")}</div></div>`);
  }
  function settingsCover() {
    const pane = document.querySelector(".pane.main"); const c = document.createElement("div"); c.className = "cover";
    c.innerHTML = `<div class="vhead"><strong>${t("projectSettings")}</strong><span style="flex:1"></span><button class="btn icon sm ghost" data-act="cover-close" aria-label="close">${ic("x", "sm")}</button></div><div class="doc"><h1>${t("projectSettings")}</h1><p class="fact">${t("settingsSub")}</p><div class="card"><h3>${t("ioTitle")}</h3>${ioLine()}<p class="fact" style="margin:4px 0 0">${t("ioFoot")}</p></div></div>`;
    pane.appendChild(c); c.querySelector("button").focus();
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, undo) { document.querySelector(".toast")?.remove(); const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.innerHTML = esc(msg) + (undo ? `<button data-act="undo">${t("undo")}</button>` : ""); document.body.appendChild(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 4000); }
  let undoFn = null;

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-scheme],[data-lang],[data-theme-set]");
    if (pop && !e.target.closest(".pop") && !(b && pop.back === b)) closePop(false);
    if (!b) return;
    if (b.dataset.scheme) { S.scheme = b.dataset.scheme; S.query = ""; S.selected = null; return render(); }
    if (b.dataset.lang) { S.lang = b.dataset.lang; return render(); }
    if (b.dataset.themeSet) { S.theme = b.dataset.themeSet; return render(); }
    const a = b.dataset.act, v = b.dataset;
    switch (a) {
      case "tab": if (e.target.closest(".x")) return; if (v.pane === "main") S.mainTab = v.id; else S.sideTab = v.id; S.focus = v.pane; break;
      case "close": e.stopPropagation(); if (v.id === "record") S.mainRecord = null; else if (v.id === "materials") { S.materialsSide = S.materialsSide === "main" ? "side" : "side"; if (v.pane === "side") { S.sideOpen = false; } } break;
      case "focus": S.focus = v.v; break;
      case "plus": e.stopPropagation(); return plusMenu(b, v.pane);
      case "plus-open": closePop(false); if (v.id === "materials") { S.materialsSide = v.pane; if (v.pane === "side") { S.sideOpen = true; S.sideTab = "materials"; } else S.mainTab = "materials"; } else if (v.pane === "side") { S.sideOpen = true; S.sideTab = ["shelf", "talk"].includes(v.id) ? v.id : S.sideTab; } else S.mainTab = mainTabs().some((x) => x.id === v.id) ? v.id : S.mainTab; break;
      case "side-toggle": S.sideOpen = !S.sideOpen; if (!S.sideOpen) S.focus = "main"; break;
      case "side-close": S.sideOpen = false; S.focus = "main"; break;
      case "toggle": { const i = S.expanded.indexOf(v.id); if (i >= 0) S.expanded.splice(i, 1); else S.expanded.push(v.id); break; }
      case "pick": S.selected = v.name; S.focus = b.closest(".pane")?.dataset.pane || S.focus; break;
      case "unpick": S.selected = null; break;
      case "b": S.b = v.v; break;
      case "add": { const i = findItem(v.name); if (!S.chips.some((c) => c.name === i.name)) S.chips.push({ name: i.name, source: i.source, kind: i.kind }); const n = S.chips.length - 1; undoFn = () => S.chips.splice(n, 1); render(); return toast(t("added", `${i.name} · ${i.source}`), true); }
      case "unchip": S.chips.splice(+v.i, 1); break;
      case "undo": if (undoFn) { undoFn(); undoFn = null; } document.querySelector(".toast")?.remove(); break;
      case "open-main": S.mainRecord = v.name; S.mainTab = "record"; S.focus = "main"; break;
      case "move-materials": S.materialsSide = S.materialsSide === "main" ? "side" : "main"; S.sideOpen = true; if (S.materialsSide === "side") S.sideTab = "materials"; else S.mainTab = "materials"; render(); return toast(t("moved"));
      case "view-in-coding": closePop(false); { const f = folders().find((x) => x.id === v.id); S.viewing = f && !f.roles.includes("output") ? f.id : null; if (S.scenario === "code") S.mainTab = "coding"; S.focus = "main"; break; }
      case "back-to-work": S.viewing = null; break;
      case "loc-menu": e.stopPropagation(); return locMenu(b);
      case "io": e.stopPropagation(); return ioPanel(b);
      case "set-out": closePop(false); S.output = v.id; render(); return toast(t("outChanged", folders().find((f) => f.id === v.id).path));
      case "change-out": closePop(false); if (S.scenario === "code") { S.output = S.output === "brand" ? "website" : "brand"; render(); return toast(t("outChanged", outputPath())); } return toast(t("outChanged", "~/Documents/网站改版产出"));
      case "add-folder": closePop(false); S.extraFolder = true; render(); return toast(t("folderAdded"));
      case "relocate": S.relocated = true; render(); return toast(t("relocated"));
      case "resume": S.resumed = true; render(); return toast(t("resumed"));
      case "settings": return settingsCover();
      case "cover-close": document.querySelector(".cover")?.remove(); return;
      default: return;
    }
    render();
  });
  document.addEventListener("input", (e) => { if (e.target.dataset.act === "query") { S.query = e.target.value; const pos = e.target.selectionStart; render(); const q = document.querySelector('[data-act="query"]'); q?.focus(); q?.setSelectionRange(pos, pos); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (pop) { closePop(); e.preventDefault(); } else if (document.querySelector(".cover")) { document.querySelector(".cover").remove(); document.querySelector(".mono")?.focus(); } }
    if (e.key === "Enter" && e.target.classList?.contains("mono")) settingsCover();
    if (pop && (e.key === "ArrowDown" || e.key === "ArrowUp")) { const its = [...pop.el.querySelectorAll("button")]; const i = its.indexOf(document.activeElement); its[(i + (e.key === "ArrowDown" ? 1 : -1) + its.length) % its.length]?.focus(); e.preventDefault(); }
  });
  document.getElementById("scenario").addEventListener("change", (e) => { S.scenario = e.target.value; S.fault = "none"; S.selected = null; S.viewing = null; S.chips = []; S.extraFolder = false; S.output = null; S.mainTab = null; S.mainRecord = null; render(); });
  document.getElementById("fault").addEventListener("change", (e) => { S.fault = e.target.value; S.relocated = false; S.resumed = false; if (["missing", "revoked", "scanning"].includes(S.fault)) { if (!S.expanded.includes("brand")) S.expanded.push("brand"); } render(); });
  document.getElementById("reset").addEventListener("click", () => { const keep = { lang: S.lang, theme: S.theme }; S = { ...fresh(), ...keep }; render(); });
  render();
})();
