// Group B · 指定文件夹: references whose folder is on another device (or the project's earlier default output folder), shown
// grouped by the folder they came from, pointed at a folder on this Mac, and what reads, differs or is missing afterwards.
// It grows on the materials panel batch 03 chose (by source, 「最近用过」 on top); the three options differ in where the
// person points a folder: B1 right where the references are, B2 in one new source group of the panel, B3 in one dialog for all.
// Every folder, file, conversation, Goal and result is sample data; nothing reads a folder or a Home.
(() => {
  const { esc, L, T, ic, btn, status, ring, toast, sim, added, K, M } = P;

  const OPTIONS = [
    ["b1", ["B1 就地指定", "B1 Right there"], true],
    ["b2", ["B2 资料里一处", "B2 One place in materials"]],
    ["b3", ["B3 一次接回", "B3 All at once"]],
  ];
  const STATES = [
    ["unmapped", ["① 未指定：资料面板与对话", "① Not chosen: materials and conversation"]],
    ["goal", ["① 未指定：Goal 的输入", "① Not chosen: a Goal's inputs"]],
    ["picker", ["① 未指定：选资料加入任务", "① Not chosen: picking materials"]],
    ["mapping", ["② 从哪里指定、选哪个文件夹", "② Where to choose, which folder"]],
    ["mapped", ["③ 指定之后：一次接回整个文件夹", "③ After choosing: the whole folder comes back"]],
    ["missing", ["③ 指定的文件夹里没有这个文件", "③ The chosen folder lacks the file"]],
    ["manage", ["④ 之后怎么看、换、取消", "④ Seeing, changing, undoing it later"]],
    ["changed", ["⑤ 和引用时不是同一份、内容没有核对", "⑤ Not the same / not checked"]],
    ["wrong", ["⑤ 指错了文件夹", "⑤ Pointed at the wrong folder"]],
    ["refused", ["⑥ Agent 读不到之后", "⑥ After the Agent could not read"]],
  ];
  const DATA = [["plain", ["常规", "Typical"]], ["full", ["最挤", "Crowded"]], ["empty", ["最空：只有一份", "Sparse: just one"]]];

  // ---------- Sample data ----------
  const LONG = "docs/2026 年第三季度用户访谈整理与首页改版建议（终版，含附录和原始录音转写）.md";
  // The folders this project has on this Mac. The project's output is website, so its default output folder is not one of them.
  const local = () => [
    { id: "website", name: "website", path: "~/code/website", roles: ["input", "output"], tree: ["README.md", "package.json", "src/pages/index.tsx", "src/app.tsx"] },
    { id: "brand", name: "brand-assets", path: "~/Documents/brand-assets", roles: ["input"], tree: ["品牌指南 2026.pdf", "配色与字体.md"] },
    ...(B.picked ? [{ id: "docs", name: "website-docs", path: "~/Documents/website-docs", roles: ["input"], tree: ["README.md", "docs/接入指南.md", "docs/接口说明.md"] }] : []),
    ...(B.defaultBack ? [{ id: "default", name: L("默认输出目录", "Default output folder"), path: L("Molis Work 为这个项目建的文件夹", "The folder Molis Work made for this project"), roles: ["input"], tree: ["草稿/首屏文案三版.md"] }] : []),
  ];
  // Where the references came from: one entry per folder of the other device (source_workspace_id), the files known here
  // (from 「最近用过」's 20 and the places shown), and which of them carry no content fingerprint (an old Goal input).
  const sources = () => {
    const u1 = { id: "u1", kind: "other", refs: ["README.md", "docs/接入指南.md", "docs/接口说明.md"], noPrint: ["docs/接口说明.md"] };
    const u2 = { id: "u2", kind: "other", refs: ["README.md", "package.json", "src/app.tsx"] };
    const u3 = { id: "u3", kind: "other-default", refs: ["首页改版报告.md"] };
    const u4 = { id: "u4", kind: "own-default", refs: ["草稿/首屏文案三版.md"] };
    if (B.data === "empty") return [u3];
    if (B.data === "full") {
      const many = Array.from({ length: 19 }, (_, i) => `docs/接口/第 ${String(i + 1).padStart(2, "0")} 节.md`);
      return [{ ...u1, refs: [...u1.refs, LONG, ...many] }, u2,
        { id: "u5", kind: "other", refs: ["README.md", "slides/路演 2026.key", "slides/路演 2026 备用.key"] },
        { id: "u6", kind: "other", refs: ["访谈/用户访谈 01.docx", "访谈/用户访谈 02.docx", "访谈/访谈提纲.md"] }, u3, u4];
    }
    return [u1, u2, u3, u4];
  };
  const source = (id) => sources().find((s) => s.id === id);
  // What a reference reads as once its folder is pointed somewhere (the platform's fresh read, simulated).
  const RESULTS = {
    u1: { docs: { "README.md": "ok", "docs/接入指南.md": "ok", "docs/接口说明.md": "ok" }, website: { "README.md": "changed" } },
    u2: { website: { "README.md": "ok", "package.json": "changed", "src/app.tsx": "ok" } },
    u3: { website: { "首页改版报告.md": "changed" } },
    u4: { default: { "草稿/首屏文案三版.md": "ok" } },
    u5: { website: { "README.md": "ok" } },
  };
  // Content is compared for the first five references only (and within one second); the rest say "not checked" until opened,
  // and opening compares. A Goal input bound without a fingerprint can never be compared (place "goal").
  const COMPARED_FIRST = 5;
  const readAs = (src, path, place) => {
    const target = B.map[src.id];
    if (!target) return "unmapped";
    const r = RESULTS[src.id]?.[target]?.[path] ?? (src.id === "u1" && target === "docs" ? "ok" : "missing");
    if (r === "missing") return "missing";
    if (place === "goal" && src.noPrint?.includes(path)) return "noprint";
    if (src.refs.indexOf(path) >= COMPARED_FIRST && !B.opened[`${src.id}:${path}`]) return "unverified";
    return r;
  };
  const folderOf = (id) => local().find((f) => f.id === id) ?? { id, name: id };
  const groupTitle = (src) => src.kind === "other" ? L("另一台设备上的文件夹", "A folder on another device")
    : src.kind === "other-default" ? L("另一台设备的默认输出目录", "Another device's default output folder")
    : L("这个项目原来的默认输出目录", "This project's earlier default output folder");
  const iconOf = (name) => /\.(tsx?|jsx?|json)$/.test(name) ? "code" : /\.pdf$/.test(name) ? "book" : /\.(png|jpe?g|svg)$/.test(name) ? "image" : "file";
  const base = (path) => path.split("/").pop();

  // What 「最近用过」 holds: the 20 newest (only the first five are shown), newest first.
  const recent = () => {
    if (B.data === "empty") return [{ src: "u3", path: "首页改版报告.md" }, { local: "brand", path: "品牌指南 2026.pdf" }, { local: "website", path: "src/pages/index.tsx" }];
    const list = [{ src: "u1", path: "README.md" }, { local: "brand", path: "品牌指南 2026.pdf" }, { src: "u2", path: "README.md" }, { src: "u3", path: "首页改版报告.md" },
      { local: "website", path: "src/pages/index.tsx" }, { src: "u1", path: "docs/接入指南.md" }, { src: "u2", path: "src/app.tsx" }, { src: "u4", path: "草稿/首屏文案三版.md" },
      { local: "brand", path: "配色与字体.md" }, { src: "u2", path: "package.json" }, { src: "u1", path: "docs/接口说明.md" }];
    if (B.data === "full") list.splice(1, 0, { src: "u5", path: "README.md" }, { src: "u6", path: "访谈/用户访谈 01.docx" }, { src: "u1", path: LONG });
    return list;
  };

  // ---------- Transient state ----------
  const fresh = () => ({ data: "plain", option: "b1", map: {}, picked: false, defaultBack: false, opened: {}, preview: null, mainTab: "talk", pane: "main",
    pop: null, dialog: null, dialogPick: {}, dialogDone: false, resumed: false, chips: [], landed: [], scrollTo: null });
  let B = fresh();
  const preset = (state, data, option) => {
    B = { ...fresh(), data, option, preset: true };
    const first = data === "empty" ? "u3" : "u1";
    const firstTarget = data === "empty" ? "default" : "docs";
    if (state === "goal") B.mainTab = "goal";
    if (state === "picker") B.pop = { kind: "picker", anchor: "picker" };
    if (state === "mapping") {
      B.pane = "side";
      if (option === "b3") openDialog(first);
      else B.pop = { kind: "map", src: first, anchor: option === "b2" ? `block-${first}` : `group-panel-${first}`, choice: null };
    }
    if (state === "mapped") {
      if (option === "b3") { openDialog(first); B.dialogPick = data === "empty" ? { u3: "default" } : { u1: "docs", u2: "website" }; applyDialog(); }
      else { pointAt(first, firstTarget, false); B.landed = refsIn(first); B.toastAfter = { src: first }; }
      B.pane = "side";
    }
    if (state === "missing") { pointAt("u3", "default", false); B.preview = { src: "u3", path: "首页改版报告.md" }; B.pane = "side"; }
    if (state === "manage") { if (data !== "empty") { pointAt("u1", "docs", false); pointAt("u2", "website", false); } else pointAt("u3", "default", false); B.pop = { kind: "io", anchor: "io" }; B.pane = "side"; }
    if (state === "changed") {
      if (data === "empty") { pointAt("u3", "website", false); B.preview = { src: "u3", path: "首页改版报告.md" }; }
      else { pointAt("u1", "docs", false); pointAt("u2", "website", false); B.preview = { src: "u2", path: "package.json" }; }
      B.mainTab = "goal"; B.pane = "side";
    }
    if (state === "wrong") { pointAt(first, "website", false); B.preview = { src: first, path: source(first).refs[0] }; B.pane = "side"; B.toastAfter = { src: first }; }
    if (state === "refused") { B.mainTab = "talk"; B.scrollTo = "receipt"; }
  };
  function openDialog(focus) {
    B.dialog = { focus, ids: sources().filter((s) => !B.map[s.id]).map((s) => s.id) };
    B.dialogPick = {}; B.dialogDone = false;
  }
  function applyDialog() {
    for (const [s, t] of Object.entries(B.dialogPick)) pointAt(s, t, false);
    B.dialogDone = true;
  }
  const refsIn = (id) => (source(id)?.refs ?? []).map((p) => `${id}:${p}`);

  // Point a folder of the other device at a folder here; "picked" is the system folder picker (simulated), "default" adds the
  // project's default output folder back as a reference (when it is not one of the project's folders any more).
  function pointAt(src, target, announce = true) {
    if (target === "docs") B.picked = true;
    if (target === "default") B.defaultBack = true;
    const before = B.map[src];
    B.map[src] = target;
    B.undo = { src, before };
    if (!announce) return;
    B.landed = refsIn(src);
    say(src);
  }
  function say(src) {
    const s = source(src), tally = count(s), where = folderOf(B.map[src]).name;
    if (s.kind === "own-default") {
      toast(L(`默认输出目录加回这个项目了，作为参考：${s.refs.length} 份引用都能读了`, `The default output folder is back in the project as a reference: all ${s.refs.length} references can be read`), { act: "b-undo-map", label: L("撤销", "Undo") }, "success");
      return;
    }
    // The toast says how the whole folder came back, so a wrong folder shows at once (few found, or not the same copy).
    toast(tally.missing
      ? L(`已接到 ${where}：${s.refs.length} 份里找到 ${tally.found} 份，${tally.missing} 份 ${where} 里没有`, `Now read from ${where}: ${tally.found} of ${s.refs.length} found, ${tally.missing} not in ${where}`)
      : tally.changed
        ? L(`已接到 ${where}：${s.refs.length} 份都找到了，${tally.changed} 份和引用时不是同一份`, `Now read from ${where}: all ${s.refs.length} found, ${tally.changed} not the same as when referenced`)
        : L(`已接到 ${where}：这个文件夹的 ${s.refs.length} 份引用都能读了`, `Now read from ${where}: all ${s.refs.length} references of this folder can be read`),
    { act: "b-undo-map", label: L("撤销", "Undo") }, tally.missing || tally.changed ? "" : "success");
  }
  const count = (s) => {
    const states = s.refs.map((p) => readAs(s, p));
    const missing = states.filter((x) => x === "missing").length;
    return { found: s.refs.length - missing, missing, changed: states.filter((x) => x === "changed").length };
  };
  function unmap(src, announce = true) {
    const target = B.map[src];
    delete B.map[src];
    if (announce) {
      const s = source(src);
      toast(L(`已取消对应：这 ${s.refs.length} 份引用回到「未指定文件夹」，${folderOf(target).name} 还是这个项目的文件夹`, `Unlinked: these ${s.refs.length} references are back to "folder not chosen"; ${folderOf(target).name} stays in the project`),
        { act: "b-undo-unmap", label: L("撤销", "Undo") });
      B.undo = { src, before: target };
    }
  }

  // ---------- Parts ----------
  // Each state in words, with a glyph or ring of its tone: never colour alone. The four words are the platform's (spec §2).
  const STATES_SAY = () => ({
    unmapped: [L("未指定文件夹", "Folder not chosen"), "attention", "status-needs-you"],
    missing: [L("找不到位置", "Can't find it"), "blocked", "circle-alert"],
    changed: [L("和引用时不是同一份", "Not the same as when referenced"), "attention", "git-compare"],
    unverified: [L("内容没有核对", "Content not checked"), "quiet", "eye-off"],
    noprint: [L("内容没有核对", "Content not checked"), "quiet", "eye-off"],
  });
  const stateWord = (key) => {
    const say = STATES_SAY()[key];
    if (!say) return "";
    return key === "unmapped" ? status(say[0], say[1], { state: "answer" }) : status(say[0], say[1], { icon: say[2] });
  };
  const STATE_WORDS = new Proxy({}, { get: (_, key) => () => stateWord(key) });
  const anchorKey = (item) => item.src ? `${item.src}:${item.path}` : `${item.local}:${item.path}`;
  // A readable reference as a materials row: the name, where it is read from (cut first), its state.
  const refRow = (item, place = "panel") => {
    const loc = item.local ? folderOf(item.local) : null, src = item.src ? source(item.src) : null;
    const state = src ? readAs(src, item.path, place) : "ok", say = STATES_SAY()[state];
    const from = loc ? loc.name : folderOf(B.map[item.src]).name;
    const selected = Boolean(B.preview && B.preview.path === item.path && (B.preview.src ?? B.preview.local) === (item.src ?? item.local));
    return M.renderDirectoryRow({ title: base(item.path), caption: from, icon: iconOf(item.path), density: "meta", fileName: true, selected,
      status: say?.[0], statusTone: say?.[1], statusIcon: say?.[2],
      attrs: { "data-act": "b-open", "data-src": item.src ?? "", "data-local": item.local ?? "", "data-path": item.path, "data-place": place, ...(B.landed.includes(anchorKey(item)) ? { "data-craft-new": "" } : {}) } });
  };
  // The references of one folder of the other device, in one container: its name (what we can say about it), the state,
  // the action of the option, and the references; siblings known from elsewhere are named so two README.md never look alike.
  const groupBox = (src, shown, place) => {
    const others = src.refs.filter((p) => !shown.includes(p));
    const caption = others.length
      ? L(`同一个文件夹里还用过 ${others.slice(0, 2).map(base).join("、")}${others.length > 2 ? ` 等 ${others.length} 份` : ""}`, `Also used from this folder: ${others.slice(0, 2).map(base).join(", ")}${others.length > 2 ? ` and ${others.length - 2} more` : ""}`)
      : src.kind === "own-default" ? L("换了输出目录以后，它不在这个项目里了；文件还在原处", "It left the project when the output folder changed; its files are still there")
      : src.kind === "other-default" ? L("另一台设备上的文件不会同步过来", "Files on the other device do not sync here")
      : L("这个文件夹的名字和位置没有同步过来", "This folder's name and place did not sync");
    const rows = shown.slice(0, 3).map((p) => K.renderFileRow({ name: p }));
    const note = shown.length > 3 ? L(`还有 ${shown.length - 3} 份`, `${shown.length - 3} more`) : undefined;
    return `<section class="b-group" data-anchor="group-${place}-${src.id}" data-src="${src.id}">
      ${K.renderFileGroup({ glyph: src.kind === "other" ? "folder" : "output", title: groupTitle(src), caption, status: STATE_WORDS.unmapped(), rows, note })}
      <div class="b-group__acts">${groupAction(src, place)}</div></section>`;
  };
  const groupAction = (src, place) => {
    const own = src.kind === "own-default";
    if (B.option === "b2" && place !== "panel") return btn({ label: L("在项目资料里指定", "Choose in materials"), icon: "library", act: "b-goto-block", data: { src: src.id } });
    if (B.option === "b3") return btn({ label: own ? L("加回这个项目", "Add it back") : L("指定文件夹", "Choose folder"), icon: own ? "plus" : "folder", act: "b-dialog", data: { src: src.id } });
    return btn({ label: own ? L("加回这个项目", "Add it back") : L("指定文件夹", "Choose folder"), icon: own ? "plus" : "folder", act: own ? "b-own" : "b-map", data: { src: src.id, anchor: `group-${place}-${src.id}` }, attrs: { "aria-haspopup": "dialog" } });
  };
  // Split a list of references into the ones that read (rows) and the ones still waiting for a folder (one box per folder).
  const splitRefs = (items) => {
    const rows = [], groups = new Map();
    for (const item of items) {
      const src = item.src ? source(item.src) : null;
      if (src && !B.map[src.id]) { if (!groups.has(src.id)) groups.set(src.id, []); groups.get(src.id).push(item.path); }
      else rows.push(item);
    }
    return { rows, groups: [...groups].map(([id, shown]) => ({ src: source(id), shown })) };
  };

  // ---------- The materials panel (03 option A: by source, 「最近用过」 on top) ----------
  function panel() {
    if (B.preview) return preview();
    const all = recent().filter((r) => !r.src || source(r.src));
    let recentHtml;
    if (B.option === "b2") {
      // B2: 「最近用过」 lists what can be opened; the folders still waiting have their own source group below.
      const rows = all.filter((r) => !r.src || B.map[r.src]).slice(0, 5);
      recentHtml = rows.map((r) => refRow(r)).join("");
    } else {
      const top = all.slice(0, 5), { rows, groups } = splitRefs(top);
      recentHtml = rows.map((r) => refRow(r)).join("") + groups.map((g) => groupBox(g.src, g.shown, "panel")).join("");
    }
    const folders = local().map((f) => folderBlock(f)).join("");
    const waiting = sources().filter((s) => !B.map[s.id]);
    const otherSection = B.option === "b2" && waiting.length
      ? `${M.renderDirectoryHeading(L("另一台设备的文件夹", "Folders from another device"))}<p class="b-sec-note">${esc(L("这些文件夹的位置没有同步过来。指定这台电脑上对应的文件夹，里面的引用就按原来的路径去读。", "Where these folders are did not sync. Choose the matching folder on this Mac and their references are read by the same paths there."))}</p>${waiting.map(blockB2).join("")}`
      : "";
    const b3Line = B.option === "b3" && waiting.length
      ? `<button type="button" class="b-waiting" data-act="b-dialog" data-src="${waiting[0].id}">${ring("answer")}<span>${esc(L(`${waiting.length} 个文件夹来自另一台设备，还没指定`, `${waiting.length} folder${waiting.length === 1 ? "" : "s"} from another device not chosen yet`))}</span>${ic("chevron-right")}</button>` : "";
    return `<header class="b-phead"><h2>${esc(L("项目资料", "Project materials"))}</h2><span class="b-grow"></span>${btn({ label: L("添加文件夹", "Add folder"), icon: "plus", act: "b-noop" })}</header>
      ${ioLine()}
      <label class="mw-input-group b-search" data-slot="input-group">${ic("search")}<input class="mw-input" data-slot="input" placeholder="${esc(L("在全部资料里找", "Search all materials"))}" aria-label="${esc(L("在全部资料里找", "Search all materials"))}"></label>
      <div class="b-scroll mw-dir__body">
        ${b3Line}
        ${M.renderDirectoryHeading(L("最近用过", "Recent"))}${recentHtml}
        ${M.renderDirectoryHeading(L("本机文件夹", "Folders on this Mac"))}${folders}
        ${otherSection}
        ${M.renderDirectoryHeading(L("导入的文件", "Imported files"))}
        ${M.renderDirectoryRow({ title: "竞品调研.pdf", caption: L("昨天导入", "Imported yesterday"), icon: "book", density: "meta", fileName: true, attrs: { "data-act": "b-noop" } })}
        ${M.renderDirectoryHeading(L("项目里的内容", "Project content"))}
        ${M.renderDirectoryRow({ title: L("上线清单", "Launch checklist"), caption: "Pages", icon: "note", density: "meta", attrs: { "data-act": "b-noop" } })}
      </div>`;
  }
  const ioLine = () => {
    const ins = local().filter((f) => f.roles.includes("input")).length;
    return `<div class="b-io">${ic("folder-tree")}<span>${esc(L(`参考 ${ins} 个文件夹`, `${ins} reference folder${ins === 1 ? "" : "s"}`))}</span><span aria-hidden="true">·</span><span>${esc(L("输出到", "Output to"))}</span>${K.renderBadge({ label: "website", tone: "info" })}<span class="b-grow"></span>${btn({ label: L("输入与输出", "Inputs and output"), icon: "settings", act: "b-io", attrs: { "data-anchor": "io", "aria-haspopup": "dialog" } })}</div>`;
  };
  // A folder of this Mac, collapsed to its head; when a folder of the other device points here, the head says so (④).
  function folderBlock(f) {
    const roles = f.roles.map((r) => K.renderBadge({ label: r === "output" ? L("输出", "Output") : L("参考", "Reference"), tone: r === "output" ? "info" : "neutral" })).join("");
    const head = `<div class="b-folder-head" data-anchor="folder-${f.id}">${M.renderDirectoryRow({ title: f.name, icon: "folder", density: "compact", attrs: { "data-act": "b-noop", "aria-expanded": "false" } })}<span class="b-roles">${roles}</span></div>`;
    return head + linksOf(f).map((s) => {
      const t = count(s);
      return `<div class="b-linked" data-anchor="linked-${s.id}">${ic("link")}<span class="b-linked__text"><span>${esc(L(`对应${groupTitle(s)}`, `Stands in for ${standsFor(s)}`))}</span><small>${esc(tallyLine(s, t))}</small></span>${btn({ label: L("改对应", "Change"), icon: "more", only: true, variant: "ghost", act: "b-origin-menu", data: { src: s.id, anchor: `linked-${s.id}` }, attrs: { "aria-haspopup": "menu" } })}</div>`;
    }).join("");
  }
  // The folders of the other device that read from this folder. The project's own earlier default output folder is not one:
  // choosing it adds that folder back, and its references are simply its own again.
  const linksOf = (f) => sources().filter((s) => B.map[s.id] === f.id && s.kind !== "own-default");
  const standsFor = (s) => groupTitle(s).replace(/^A /, "a ").replace(/^Another/, "another");
  const tallyLine = (s, t) => {
    const names = s.refs.slice(0, 2).map(base).join(L("、", ", "));
    if (t.missing) return L(`${names} 等 ${s.refs.length} 份 · ${t.missing} 份这里没有`, `${names} · ${t.missing} of ${s.refs.length} not here`);
    if (t.changed) return L(`${names} 等 ${s.refs.length} 份 · ${t.changed} 份和引用时不是同一份`, `${names} · ${t.changed} of ${s.refs.length} not the same`);
    return L(`${names}${s.refs.length > 2 ? ` 等 ${s.refs.length} 份` : ""} · 都在这里读`, `${names}${s.refs.length > 2 ? ` and ${s.refs.length - 2} more` : ""} · all read here`);
  };
  // B2: one folder of the other device as a source block of the panel.
  function blockB2(src) {
    const rows = src.refs.slice(0, 4).map((p) => M.renderDirectoryRow({ title: p, icon: iconOf(p), density: "compact", fileName: true, className: "mw-dir-row--nested b-off", attrs: { "data-act": "b-open", "data-src": src.id, "data-path": p } })).join("");
    const more = src.refs.length > 4 ? `<p class="b-more b-more--nested">${esc(L(`还有 ${src.refs.length - 4} 份`, `${src.refs.length - 4} more`))}</p>` : "";
    const own = src.kind === "own-default";
    return `<section class="b-block${B.flash === src.id ? " is-flash" : ""}" data-anchor="block-${src.id}" data-src="${src.id}"${B.flash === src.id ? " data-craft-new" : ""}>
      <div class="b-block__head">${ic(src.kind === "other" ? "folder" : "output")}<span class="b-block__name"><strong>${esc(groupTitle(src))}</strong></span>${STATE_WORDS.unmapped()}</div>
      ${rows}${more}
      <div class="b-group__acts">${btn({ label: own ? L("加回这个项目", "Add it back") : L("指定文件夹", "Choose folder"), icon: own ? "plus" : "folder", act: own ? "b-own" : "b-map", data: { src: src.id, anchor: `block-${src.id}` }, attrs: { "aria-haspopup": "dialog" } })}</div></section>`;
  }

  // ---------- Preview of one reference (the side pane), with where it is read from and its state ----------
  function preview() {
    const p = B.preview, src = p.src ? source(p.src) : null, loc = p.local ? folderOf(p.local) : null;
    const state = src ? readAs(src, p.path, p.place) : "ok";
    const back = btn({ label: L("返回项目资料", "Back to materials"), icon: "chevron-left", only: true, variant: "ghost", act: "b-back" });
    if (state === "unmapped") {
      return `<div class="b-vhead">${back}<span class="b-vhead__t"><strong>${esc(base(p.path))}</strong><small>${esc(p.path)}</small></span></div>
        <div class="b-vbody">${K.renderAlert({ title: L("这份资料的文件夹还没指定", "This material's folder is not chosen yet"), tone: "warning", state: "answer", role: null,
          body: L("它来自另一台设备上的文件夹，那个文件夹在这台电脑上的位置还不知道，所以现在读不了。指定以后，这个文件夹里的引用一起接回来。", "It comes from a folder on another device whose place on this Mac is not known yet, so it can't be read now. Once you choose one, every reference from that folder comes back together.") })}
        ${groupBox(src, src.refs.filter((x) => x === p.path), "preview")}</div>`;
    }
    const from = loc ? loc.name : folderOf(B.map[src.id]).name;
    const linked = src && src.kind !== "own-default" ? `<span class="b-origin">${ic("link")}${esc(L(`对应${groupTitle(src)}`, `stands in for ${standsFor(src)}`))}${btn({ label: L("改对应", "Change"), icon: "chevron-down", only: true, variant: "ghost", act: "b-origin-menu", data: { src: src.id, anchor: "origin" }, attrs: { "data-anchor": "origin", "aria-haspopup": "menu" } })}</span>` : "";
    const facts = `<span>${esc(L(`来自 ${from}`, `From ${from}`))}</span>${linked}`;
    let note = "";
    if (state === "changed") note = K.renderAlert({ title: L("和引用时不是同一份", "Not the same as when it was referenced"), tone: "warning", state: "verify", role: null,
      body: L(`引用时读到的内容和 ${from} 里现在这一份不一样：可能是后来改过，也可能对应到了别的文件夹。下面是现在这一份。`, `What was read when it was referenced differs from the copy in ${from} now: it may have changed since, or the folder may be the wrong one. Below is the copy there now.`),
      actions: [{ label: L("换一个文件夹", "Choose another folder"), variant: "secondary", attrs: { "data-act": "b-map", "data-src": src.id, "data-anchor": "origin" } }] });
    if (state === "missing") note = K.renderAlert({ title: L(`${from} 里没有这个文件`, `${from} has no such file`), tone: "warning", state: "blocked", role: null,
      body: src.kind === "other-default" ? L(`另一台设备上的文件不会同步过来。把 ${p.path} 拷到 ${from} 的同一位置，或者换一个文件夹。`, `Files on the other device do not sync here. Copy ${p.path} to the same place in ${from}, or choose another folder.`)
        : L(`按引用里的路径 ${p.path}，${from} 里找不到。可能对应错了文件夹，或者这份文件没拷过来。`, `Nothing at ${p.path} in ${from}. The folder may be the wrong one, or this file was not copied over.`),
      actions: [{ label: L("换一个文件夹", "Choose another folder"), variant: "secondary", attrs: { "data-act": "b-map", "data-src": src.id, "data-anchor": "origin" } }] });
    if (state === "noprint") note = `<p class="b-quiet">${ic("eye-off")}${esc(L("这份输入引用时没有记下内容，所以没法核对它是不是引用时那一份。", "Nothing was recorded about this input's content when it was referenced, so it can't be checked against it."))}</p>`;
    if (state === "ok" && src && B.opened[`${src.id}:${p.path}`]) note = `<p class="b-quiet b-quiet--done">${ic("check")}${esc(L("打开时核对过，和引用时是同一份。", "Checked on opening: the same as when it was referenced."))}</p>`;
    const body = state === "missing" ? "" : `<pre class="b-code">${esc(SAMPLE[base(p.path)] ?? "…")}</pre>`;
    return `<div class="b-vhead">${back}${ic(iconOf(p.path))}<span class="b-vhead__t"><strong>${esc(base(p.path))}</strong><small class="b-facts">${facts}</small></span></div>
      ${state === "missing" ? "" : `<div class="b-vacts">${btn({ label: L("加入任务", "Add to task"), icon: "plus", variant: "primary", act: "b-chip", data: { path: p.path } })}</div>`}
      <div class="b-vbody">${note}${body}${body ? sim(L("文件内容是示例", "File contents are samples")) : ""}</div>`;
  }
  const SAMPLE = {
    "README.md": "# website\n\n公司官网。`pnpm dev` 启动，`pnpm test` 跑测试。\n\n## 上线前\n- 跑一遍 e2e\n- 对一下接口说明",
    "package.json": "{\n  \"name\": \"website\",\n  \"version\": \"2.4.0\",\n  \"scripts\": { \"dev\": \"vite\", \"test\": \"vitest\" }\n}",
    "接入指南.md": "# 接入指南\n\n1. 申请测试账号\n2. 在 .env 里写上回调地址\n3. 跑 pnpm verify",
    "接口说明.md": "# 接口说明\n\nGET /api/pricing  返回三档价格\nPOST /api/lead     留资",
    "app.tsx": "export function App() {\n  return <Home />;\n}",
    "首屏文案三版.md": "1. 把工作接着做下去\n2. 资料在你手里，AI 在你身边\n3. 一个地方，接上所有正在做的事",
    "品牌指南 2026.pdf": "第 3 页 · 主色与留白\n\n首屏只放一句主张和一个主操作。",
    "index.tsx": "export default function Home() {\n  return <main><Hero /></main>;\n}",
  };

  // ---------- The main pane: a conversation that came from the other device, and a Goal's inputs ----------
  const refsBlock = (items, place) => {
    const { rows, groups } = splitRefs(items);
    const readable = rows.length ? `<ul class="mw-file-list b-filelist">${rows.map((r) => {
      const src = r.src ? source(r.src) : null, state = src ? readAs(src, r.path, place) : "ok", from = r.local ? folderOf(r.local).name : folderOf(B.map[r.src]).name;
      return `<li class="mw-file-row b-fr" data-slot="file-row"${B.landed.includes(anchorKey(r)) ? " data-craft-new" : ""}><button type="button" class="mw-file-row__label b-fr__open" data-act="b-open" data-src="${r.src ?? ""}" data-local="${r.local ?? ""}" data-path="${esc(r.path)}" data-place="${place}">${K.renderFileKind(r.path)}<span class="mw-file-row__name">${esc(r.path)}</span></button><span class="mw-file-row__size">${esc(from)}</span>${STATE_WORDS[state]?.() ?? ""}</li>`;
    }).join("")}</ul>` : "";
    return `${readable}${groups.map((g) => groupBox(g.src, g.shown, place)).join("")}`;
  };
  function talk() {
    const used = B.data === "empty" ? [{ src: "u3", path: "首页改版报告.md" }] : [{ local: "brand", path: "品牌指南 2026.pdf" }, { src: "u1", path: "README.md" }, { src: "u1", path: "docs/接入指南.md" }, { src: "u2", path: "README.md" }];
    const needed = B.data === "empty" ? [{ src: "u3", path: "首页改版报告.md" }] : [{ src: "u1", path: "README.md" }, { src: "u1", path: "docs/接口说明.md" }, { src: "u2", path: "src/app.tsx" }];
    const waiting = [...new Set(needed.filter((n) => !B.map[n.src]).map((n) => n.src))];
    const readable = needed.filter((n) => B.map[n.src] && readAs(source(n.src), n.path) !== "missing");
    let receipt;
    if (B.resumed) receipt = `<div class="b-step">${ring("running")}<span>${esc(L(`正在读 ${readable.map((n) => base(n.path)).join("、")}，接着补清单`, `Reading ${readable.map((n) => base(n.path)).join(", ")} to finish the checklist`))}</span>${sim(L("Agent 的进展是模拟的", "The Agent's progress is simulated"))}</div>`;
    else if (waiting.length) receipt = `<div class="b-receipt" data-anchor="receipt">${K.renderAlert({ title: L(`${needed.length} 份资料读不到`, `${needed.length} material${needed.length === 1 ? "" : "s"} could not be read`), tone: "warning", state: "answer", role: null,
        body: L("它们来自另一台设备上的文件夹，这台电脑上还没指定对应的文件夹。指定以后，可以让它接着做。", "They come from folders on another device that have no matching folder on this Mac yet. Once you choose one, it can carry on.") })}${refsBlock(needed, "talk")}</div>`;
    else receipt = `<div class="b-receipt" data-anchor="receipt">${K.renderAlert({ title: L("文件夹指定好了", "The folders are chosen"), tone: "success", state: "done", role: null,
        body: readable.length === needed.length ? L("刚才读不到的资料现在能读了。", "What it could not read can be read now.") : L(`能读到 ${readable.length} 份；${needed.length - readable.length} 份在指定的文件夹里没有，它会跳过。`, `${readable.length} can be read; ${needed.length - readable.length} are not in the chosen folder and will be skipped.`),
        actions: [{ label: L("让它接着做", "Let it carry on"), variant: "primary", icon: "play", attrs: { "data-act": "b-resume" } }] })}${refsBlock(needed, "talk")}</div>`;
    return `<div class="b-thread">
      <p class="b-when">${esc(L("上周三 · 在另一台设备上", "Last Wednesday · on another device"))}</p>
      <div class="b-turn b-turn--you"><p>${esc(L("按 README 和接入指南，整理首页改版的上线清单。", "Using the README and the integration guide, put together the launch checklist for the redesign."))}</p></div>
      <div class="b-turn"><div class="b-who">${ic("sparkles")}${esc(L("助理", "Assistant"))}</div><p>${esc(L("上线清单写好了，放在 Pages 的《上线清单》里。用到的资料：", "The launch checklist is in Pages (Launch checklist). Materials used:"))}</p>${refsBlock(used, "talk")}</div>
      <p class="b-when">${esc(L("今天 · 这台电脑", "Today · this Mac"))}</p>
      <div class="b-turn b-turn--you"><p>${esc(L("接着把上线清单补完，再对一下接口说明。", "Finish the checklist and check it against the API notes."))}</p></div>
      <div class="b-turn"><div class="b-who">${ic("sparkles")}${esc(L("助理", "Assistant"))}</div><p>${esc(L("能读到的我看过了，清单补了品牌和首屏两节。接口那一节还没补。", "I read what I could and added the brand and hero sections. The API section is not done yet."))}</p>${receipt}</div>
      ${sim(L("对话是示例，Agent 不会真的运行", "The conversation is a sample; no Agent runs"))}
    </div>`;
  }
  function goal() {
    const inputs = B.data === "empty" ? [{ src: "u3", path: "首页改版报告.md" }] : [{ local: "brand", path: "品牌指南 2026.pdf" }, { src: "u1", path: "README.md" }, { src: "u1", path: "docs/接口说明.md" }, { src: "u2", path: "src/app.tsx" }, { src: "u3", path: "首页改版报告.md" }];
    return `<div class="b-goal">
      <header class="b-goal__head">${ring("doing")}<h2>${esc(L("首页改版上线", "Launch the redesigned home page"))}</h2>${status(L("进行中", "In progress"), "progress")}</header>
      ${M.renderDirectoryHeading(L("输入", "Inputs"))}
      <div class="b-inputs">${refsBlock(inputs, "goal")}</div>
      ${sim(L("Goal 是示例", "The Goal is a sample"))}
    </div>`;
  }

  // ---------- Popovers: choosing a folder, 输入与输出, the origin's menu, the picker ----------
  const targets = (src) => {
    const folders = [
      { id: "website", name: "website", desc: L("参考 · 输出", "Reference · output") },
      { id: "brand", name: "brand-assets", desc: L("参考", "Reference") },
      ...(B.picked ? [{ id: "docs", name: "website-docs", desc: L("参考", "Reference") }] : []),
    ];
    const def = { id: "default", name: L("这个项目的默认输出目录", "This project's default output folder"), desc: B.defaultBack ? L("参考", "Reference") : L("会加回这个项目，作为参考；文件夹还没建也可以", "Comes back into the project as a reference; it may not exist yet") };
    return { folders, def };
  };
  function mapPop(srcId) {
    const src = source(srcId), { folders, def } = targets(src), chosen = B.pop.choice;
    const item = (t) => P.M.renderMenuItem({ label: t.name, description: t.desc, checked: chosen === t.id, attrs: { "data-act": "b-choose", "data-target": t.id } });
    const shown = src.refs.slice(0, 3).map(base).join(L("、", ", ")) + (src.refs.length > 3 ? L(` 等 ${src.refs.length} 份`, ` and ${src.refs.length - 3} more`) : "");
    const where = chosen ? (chosen === "pick" ? "website-docs" : folders.find((f) => f.id === chosen)?.name ?? def.name) : "";
    return `<div class="b-pop__head"><strong>${esc(L("这个文件夹以后从哪里读", "Where to read this folder from"))}</strong><small>${esc(groupTitle(src))} · ${esc(shown)}</small></div>
      ${M.renderMenu({ items: M.renderMenuGroup({ label: L("这个项目的文件夹", "This project's folders"), items: folders.map(item).join("") + item(def) })
        + M.renderMenuGroup({ items: M.renderMenuItem({ label: L("选择另一个文件夹…", "Choose another folder…"), description: L("会加进这个项目，作为参考", "It joins the project as a reference"), iconName: "folder-open", attrs: { "data-act": "b-pick" } }) }) })}
      <p class="b-pop__say">${esc(chosen ? L(`这个文件夹的 ${src.refs.length} 份引用都改到 ${where} 里，按原来的路径去读，比如 ${base(src.refs[0])}。${where} 里的文件不会被改动。`, `All ${src.refs.length} references of this folder will be read from ${where} by their paths, e.g. ${base(src.refs[0])}. Nothing in ${where} is changed.`) : L("选一个这台电脑上对应的文件夹。引用会按原来的路径去那里读，文件夹里的文件不会被改动。", "Pick the matching folder on this Mac. References are read there by their paths; nothing in it is changed."))}</p>
      <div class="b-pop__foot">${btn({ label: L("取消", "Cancel"), act: "b-pop-close", size: "md" })}${btn({ label: L("接到这里", "Read from here"), variant: "primary", act: "b-confirm", data: { src: srcId }, disabled: !chosen, size: "md" })}</div>`;
  }
  function ownPop(srcId) {
    return `<div class="b-pop__head"><strong>${esc(L("把默认输出目录加回这个项目？", "Add the default output folder back?"))}</strong><small>${esc(L("它会作为参考回到这个项目，原来的文件还在里面；输出目录还是 website。", "It comes back as a reference with its files; the output folder stays website."))}</small></div>
      <div class="b-pop__foot">${btn({ label: L("取消", "Cancel"), act: "b-pop-close", size: "md" })}${btn({ label: L("加回来", "Add it back"), variant: "primary", act: "b-own-confirm", data: { src: srcId }, size: "md" })}</div>`;
  }
  function originMenu(srcId) {
    return M.renderMenu({ items: M.renderMenuGroup({ items:
      M.renderMenuItem({ label: L("换一个文件夹", "Choose another folder"), iconName: "folder", attrs: { "data-act": "b-map", "data-src": srcId, "data-anchor": B.pop.anchor } })
      + M.renderMenuItem({ label: L("取消对应", "Unlink"), description: L("引用回到「未指定文件夹」，文件夹还留在这个项目里", "References go back to \"folder not chosen\"; the folder stays in the project"), iconName: "x", attrs: { "data-act": "b-unmap", "data-src": srcId } }) }) });
  }
  function ioPop() {
    const rows = local().map((f) => {
      const roles = f.roles.map((r) => K.renderBadge({ label: r === "output" ? L("输出", "Output") : L("参考", "Reference"), tone: r === "output" ? "info" : "neutral" })).join("");
      const links = linksOf(f).map((s) => `<div class="b-io__link">${ic("link")}<span><span>${esc(L(`对应${groupTitle(s)}`, `Stands in for ${standsFor(s)}`))}</span><small>${esc(tallyLine(s, count(s)))}</small></span>${btn({ label: L("换一个", "Change"), act: "b-map", data: { src: s.id, anchor: "io" } })}${btn({ label: L("取消对应", "Unlink"), variant: "ghost", act: "b-unmap", data: { src: s.id } })}</div>`).join("");
      return `<div class="b-io__row"><div class="b-io__it">${ic("folder")}<span class="b-io__nm"><strong>${esc(f.name)} ${roles}</strong><small>${esc(f.path)}</small></span></div>${links}</div>`;
    }).join("");
    const waiting = sources().filter((s) => !B.map[s.id]);
    const b3 = B.option === "b3" && waiting.length ? `<div class="b-io__grp"><div class="b-io__grp-h">${esc(L("另一台设备的文件夹", "Folders from another device"))}</div><div class="b-io__row"><div class="b-io__it">${ring("answer")}<span class="b-io__nm"><strong>${esc(L(`${waiting.length} 个还没指定`, `${waiting.length} not chosen yet`))}</strong></span>${btn({ label: L("指定…", "Choose…"), act: "b-dialog", data: { src: waiting[0].id } })}</div></div></div>` : "";
    return `<div class="b-io__pop"><strong class="b-io__title">${esc(L("输入与输出", "Inputs and output"))}</strong>
      <div class="b-io__grp"><div class="b-io__grp-h">${esc(L("参考哪些文件夹", "Folders to refer to"))}</div>${rows}</div>
      <div class="b-io__grp"><div class="b-io__grp-h">${esc(L("产出写到哪里 · 只有一个，所有任务和插件共用", "Where output goes · just one, shared by every task and plugin"))}</div><div class="b-io__row"><div class="b-io__it">${ic("output")}<span class="b-io__nm"><strong>website</strong><small>~/code/website</small></span>${btn({ label: L("更改", "Change"), act: "b-noop" })}</div></div></div>
      ${b3}<p class="b-io__foot">${esc(L("改了只对之后的任务生效；移除文件夹不会删除磁盘上的文件。另一台设备的文件夹对应到哪里只记在这台电脑上。", "Changes apply to later tasks; removing a folder deletes nothing on disk. Which folder stands in for one from another device is kept on this Mac only."))}</p></div>`;
  }
  function pickerPop() {
    const all = recent().filter((r) => !r.src || source(r.src)).slice(0, 5), { rows, groups } = splitRefs(all);
    const list = rows.map((r) => refRow(r)).join("");
    return `<div class="b-pop__head"><strong>${esc(L("加入资料", "Add materials"))}</strong></div>
      <label class="mw-input-group b-search b-search--pop" data-slot="input-group">${ic("search")}<input class="mw-input" data-slot="input" placeholder="${esc(L("在全部资料里找", "Search all materials"))}" aria-label="${esc(L("在全部资料里找", "Search all materials"))}"></label>
      ${M.renderDirectoryHeading(L("最近用过", "Recent"))}<div class="b-picklist">${list}${B.option === "b2" ? (groups.length ? `<button type="button" class="b-waiting" data-act="b-goto-block" data-src="${groups[0].src.id}">${ring("answer")}<span>${esc(L(`另有 ${groups.reduce((n, g) => n + g.shown.length, 0)} 份的文件夹还没指定`, `${groups.reduce((n, g) => n + g.shown.length, 0)} more wait for a folder`))}</span>${ic("chevron-right")}</button>` : "") : groups.map((g) => groupBox(g.src, g.shown, "picker")).join("")}</div>`;
  }

  // ---------- B3: one dialog for every folder still waiting ----------
  function dialogParts() {
    const cards = B.dialog.ids.map(source).filter(Boolean).map((s) => {
      const files = s.refs.slice(0, 3).map(base).join(L("、", ", ")) + (s.refs.length > 3 ? L(` 等 ${s.refs.length} 份`, ` and ${s.refs.length - 3} more`) : "");
      if (B.dialogDone) {
        const target = B.map[s.id];
        if (!target) return `<div class="b-dcard">${ring("idle")}<span class="b-dcard__t"><strong>${esc(groupTitle(s))}</strong><small>${esc(files)}</small><small class="b-dcard__res">${esc(L("这次没有指定，引用还是「未指定文件夹」", "Not chosen this time; its references still say \"folder not chosen\""))}</small></span></div>`;
        const t = count(s), where = folderOf(target).name;
        const line = t.missing ? L(`找到 ${t.found} 份，${t.missing} 份 ${where} 里没有`, `${t.found} found, ${t.missing} not in ${where}`)
          : t.changed ? L(`都找到了，${t.changed} 份和引用时不是同一份`, `All found; ${t.changed} not the same as when referenced`) : L(`${s.refs.length} 份都找到了`, `All ${s.refs.length} found`);
        return `<div class="b-dcard">${ring(t.missing || t.changed ? "partial" : "done")}<span class="b-dcard__t"><strong>${esc(groupTitle(s))} → ${esc(where)}</strong><small>${esc(files)}</small><small class="b-dcard__res">${esc(line)}</small></span></div>`;
      }
      const pick = B.dialogPick[s.id];
      const label = !pick ? L("选一个文件夹", "Choose a folder") : pick === "default" ? L("默认输出目录", "Default output folder") : folderOf(pick).name;
      return `<div class="b-dcard${B.dialog.focus === s.id ? " is-focus" : ""}"><span class="b-dcard__ic">${ic(s.kind === "other" ? "folder" : "output")}</span><span class="b-dcard__t"><strong>${esc(groupTitle(s))}</strong><small>${esc(files)}</small></span>
        <button type="button" class="mw-select b-dsel${pick ? " is-set" : ""}" data-slot="select" data-act="b-dsel" data-src="${s.id}" data-anchor="dsel-${s.id}" aria-haspopup="menu" aria-label="${esc(L(`${groupTitle(s)}对应到`, `${groupTitle(s)} reads from`))}"${s.id === B.dialog.ids[0] ? " autofocus" : ""}><span>${esc(label)}</span></button></div>`;
    }).join("");
    const n = Object.keys(B.dialogPick).length;
    const footer = B.dialogDone ? btn({ label: L("完成", "Done"), variant: "primary", act: "b-dialog-close", size: "md", attrs: { autofocus: true } })
      : btn({ label: L("以后再说", "Later"), act: "b-dialog-close", size: "md" })
        + btn({ label: n ? L(`接回 ${n} 个文件夹`, `Read ${n} folder${n === 1 ? "" : "s"} from here`) : L("接回", "Read from here"), variant: "primary", act: "b-dialog-apply", disabled: !n, size: "md" });
    const title = B.dialogDone ? L("接回好了", "Done") : L("把另一台设备的文件夹接到这台电脑上", "Find another device's folders on this Mac");
    const desc = B.dialogDone ? L("每个文件夹的引用都按原来的路径，在指定的文件夹里读。没找到的，可以拷过来，或者换一个文件夹。", "Each folder's references are read by their paths in the folder you chose. For what was not found, copy it over or choose another folder.")
      : L("这些文件夹的位置没有同步过来。给每个文件夹选一个这台电脑上对应的文件夹，引用就按原来的路径到那里读；文件夹里的文件不会被改动。", "Where these folders are did not sync. Choose the matching folder on this Mac for each; references are read there by their paths, and nothing in it is changed.");
    return { title, desc, body: cards, footer };
  }
  function dselMenu(srcId) {
    const { folders, def } = targets(source(srcId));
    const cur = B.dialogPick[srcId];
    return M.renderMenu({ items: M.renderMenuGroup({ label: L("这个项目的文件夹", "This project's folders"), items: [...folders, def].map((t) => M.renderMenuItem({ label: t.name, description: t.desc, checked: cur === t.id, attrs: { "data-act": "b-dpick", "data-src": srcId, "data-target": t.id } })).join("") })
      + M.renderMenuGroup({ items: M.renderMenuItem({ label: L("选择另一个文件夹…", "Choose another folder…"), description: L("会加进这个项目，作为参考", "It joins the project as a reference"), iconName: "folder-open", attrs: { "data-act": "b-dpick", "data-src": srcId, "data-target": "docs" } }) }) });
  }

  // ---------- Frame ----------
  function render() {
    const mainBody = B.mainTab === "goal" ? goal() : talk();
    const seg = (id, label, cur) => `<button type="button" class="mw-toggle${cur ? " is-current" : ""}" aria-pressed="${cur}" data-act="b-tab" data-tab="${id}">${esc(label)}</button>`;
    const pane = (id, label) => `<button type="button" class="mw-toggle${B.pane === id ? " is-current" : ""}" aria-pressed="${B.pane === id}" data-act="b-pane" data-pane="${id}">${esc(label)}</button>`;
    const chips = B.chips.map((c, i) => `<span class="b-chip">${K.renderFileKind(c)}<span>${esc(base(c))}</span><button type="button" data-act="b-unchip" data-i="${i}" aria-label="${esc(L(`移除 ${base(c)}`, `Remove ${base(c)}`))}">${ic("x")}</button></span>`).join("");
    return `<div class="b-frame" data-pane="${B.pane}">
      <div class="b-switch mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${esc(L("窗格", "Pane"))}">${pane("main", L("主区", "Main"))}${pane("side", L("项目资料", "Materials"))}</div>
      <div class="b-desk">
        <section class="b-sheet b-main" aria-label="${esc(L("主区", "Main"))}"><header class="b-mhead"><span class="mw-toggle-group" data-slot="toggle-group" role="group">${seg("talk", L("对话", "Conversation"), B.mainTab === "talk")}${seg("goal", "Goal", B.mainTab === "goal")}</span></header><div class="b-mbody">${mainBody}</div></section>
        <section class="b-sheet b-side" aria-label="${esc(L("项目资料", "Project materials"))}">${panel()}</section>
      </div>
      <div class="b-bar"><div class="b-composer"><button type="button" class="b-plus" data-act="b-picker" data-anchor="picker" aria-haspopup="dialog" aria-label="${esc(L("加入资料", "Add materials"))}">${ic("paperclip")}</button><span class="b-chips">${chips}</span><span class="b-ph">${B.chips.length ? "" : esc(L("让助理做点什么", "Ask the Assistant"))}</span><button type="button" class="b-send" aria-label="${esc(L("发送", "Send"))}" disabled>${ic("send")}</button></div></div>
    </div>`;
  }
  // The open popover, placed by its anchor after the frame is drawn (it grows from its control). It stays the same element while
  // it stays open, so choosing inside it does not replay its entrance.
  function popHtml() {
    const k = B.pop.kind;
    if (k === "map") return mapPop(B.pop.src);
    if (k === "own") return ownPop(B.pop.src);
    if (k === "origin") return originMenu(B.pop.src);
    if (k === "io") return ioPop();
    if (k === "picker") return pickerPop();
    if (k === "dsel") return dselMenu(B.pop.src);
    return "";
  }
  const POP_LABEL = () => ({ map: L("指定文件夹", "Choose folder"), own: L("加回默认输出目录", "Add the default output folder back"), io: L("输入与输出", "Inputs and output"), picker: L("加入资料", "Add materials") });
  let popEl = null;
  function place() {
    const quiet = B.preset;
    // The popover.
    if (popEl && !popEl.isConnected) popEl = null;
    const want = B.pop ? `${B.pop.kind}:${B.pop.src ?? ""}:${B.pop.anchor}` : "";
    if (popEl && popEl.dataset.key !== want) { popEl.remove(); popEl = null; }
    if (B.pop) {
      const fresh = !popEl;
      if (fresh) {
        popEl = document.createElement("div");
        popEl.className = `mw-popover b-pop b-pop--${B.pop.kind}`;
        popEl.dataset.slot = "popover"; popEl.dataset.key = want;
        if (B.pop.kind === "origin" || B.pop.kind === "dsel") popEl.setAttribute("role", "presentation");
        else { popEl.setAttribute("role", "dialog"); popEl.setAttribute("aria-label", POP_LABEL()[B.pop.kind] ?? ""); }
        document.body.append(popEl);
      }
      popEl.innerHTML = popHtml();
      const anchor = document.querySelector(`[data-anchor="${B.pop.anchor}"]`);
      const r = (anchor ?? document.querySelector(".b-side") ?? document.body).getBoundingClientRect(), w = popEl.offsetWidth;
      // It opens below its control, or above when there is more room there (always above the bar's paperclip); it never covers its control.
      const below = innerHeight - r.bottom - 14, above = r.top - 6 - 76;
      const up = B.pop.anchor === "picker" || (popEl.scrollHeight > below && above > below);
      popEl.style.maxHeight = `${Math.max(160, up ? above : below)}px`;
      const h = popEl.offsetHeight;
      const left = B.pop.anchor === "picker" ? Math.max(8, Math.min(r.left, innerWidth - w - 8)) : Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
      const top = up ? Math.max(76, r.top - h - 6) : r.bottom + 6;
      popEl.style.left = `${left}px`; popEl.style.top = `${top}px`;
      popEl.style.transformOrigin = `${up ? "bottom" : "top"} ${left + w / 2 < r.left + r.width / 2 ? "left" : "right"}`;
      const focus = B.pop.focusTarget ? popEl.querySelector(`[data-target="${B.pop.focusTarget}"]`) : B.pop.focusAct ? popEl.querySelector(`[data-act="${B.pop.focusAct}"]`) : fresh ? popEl.querySelector(".mw-menu__item, .mw-input, button:not([disabled])") : null;
      if (focus && !quiet) focus.focus({ preventScroll: true });
      B.pop.focusTarget = B.pop.focusAct = null;
    }
    // B3's dialog: opened without the top layer so the prototype's strip stays usable (the product opens it modal).
    let dlg = document.querySelector("body > dialog.b-dialog");
    if (B.dialog) {
      const parts = dialogParts();
      const holder = document.createElement("div");
      holder.innerHTML = M.renderDialog({ labelledBy: "b-dialog-title", title: parts.title, description: parts.desc, body: parts.body, footer: parts.footer, className: "b-dialog", closeLabel: L("关闭", "Close") });
      const next = holder.firstElementChild;
      next.querySelector("[data-dialog-close]")?.setAttribute("data-act", "b-dialog-close");
      if (!dlg) {
        document.body.append(next); dlg = next; dlg.show();
        if (!document.querySelector(".proto-scrim")) { const s = document.createElement("div"); s.className = "proto-scrim"; s.dataset.act = "b-dialog-close"; document.body.append(s); }
        if (!quiet) dlg.querySelector(".b-dsel, .mw-btn--primary")?.focus({ preventScroll: true });
      } else dlg.replaceChildren(...next.childNodes);
      if (B.dialogDone && B.dialogJustDone) { dlg.querySelector(".mw-btn--primary")?.focus({ preventScroll: true }); B.dialogJustDone = false; }
      if (B.refocus?.startsWith("dsel-")) { dlg.querySelector(`[data-anchor="${B.refocus}"]`)?.focus({ preventScroll: true }); B.refocus = null; }
    } else {
      dlg?.remove();
      document.querySelector('.proto-scrim[data-act="b-dialog-close"]')?.remove();
    }
    if (B.refocus) { document.querySelector(`[data-anchor="${B.refocus}"]`)?.closest("button, [data-anchor]")?.focus?.({ preventScroll: true }); B.refocus = null; }
    if (B.toastAfter) { say(B.toastAfter.src); B.toastAfter = null; }
    if (B.scrollTo) { document.querySelector(`[data-anchor="${B.scrollTo}"]`)?.scrollIntoView({ block: "center" }); B.scrollTo = null; }
    // A landing wash is a one-time moment: once drawn, it is not drawn again.
    setTimeout(() => { B.landed = []; B.flash = null; }, 900);
    B.preset = false;
  }
  function teardown() {
    popEl?.remove(); popEl = null;
    document.querySelector("body > dialog.b-dialog")?.remove();
  }

  function act(name, el) {
    const d = el.dataset, inPicker = Boolean(el.closest(".b-pop--picker"));
    switch (name) {
      case "b-tab": B.mainTab = d.tab; B.pop = null; return true;
      case "b-pane": B.pane = d.pane; B.pop = null; return true;
      case "b-open":
        if (d.src && !B.map[d.src] && B.option === "b2") { B.preview = null; B.pop = null; B.pane = "side"; B.flash = d.src; B.scrollTo = `block-${d.src}`; return true; }
        B.preview = { src: d.src || null, local: d.local || null, path: d.path, place: d.place };
        if (d.src && B.map[d.src]) B.opened[`${d.src}:${d.path}`] = true;
        B.pane = "side"; B.pop = null; return true;
      case "b-back": B.preview = null; return true;
      case "b-map": B.pop = { kind: "map", src: d.src, anchor: inPicker ? "picker" : d.anchor || `group-panel-${d.src}`, choice: B.map[d.src] ?? null }; return true;
      case "b-own": B.pop = { kind: "own", src: d.src, anchor: inPicker ? "picker" : d.anchor || `group-panel-${d.src}` }; return true;
      case "b-choose": B.pop.choice = d.target; B.pop.focusTarget = d.target; return true;
      case "b-pick": B.picked = true; B.pop.choice = "docs"; B.pop.focusAct = "b-confirm";
        toast(L("（模拟）在系统的选择文件夹窗口里选了 ~/Documents/website-docs", "(Simulated) ~/Documents/website-docs picked in the system folder window")); return true;
      case "b-confirm": { const t = B.pop.choice; const anchor = B.pop.anchor; B.pop = null; pointAt(d.src, t); B.refocus = anchor.startsWith("group-") ? null : anchor; return true; }
      case "b-own-confirm": B.pop = null; pointAt(d.src, "default"); return true;
      case "b-pop-close": B.refocus = B.pop?.anchor; B.pop = null; return true;
      case "b-origin-menu": B.pop = { kind: "origin", src: d.src, anchor: d.anchor }; return true;
      case "b-unmap": B.pop = null; unmap(d.src); return true;
      case "b-undo-map":
        if (B.undo) { if (B.undo.before) B.map[B.undo.src] = B.undo.before; else delete B.map[B.undo.src]; B.undo = null; B.landed = []; }
        document.querySelectorAll(".proto-toast").forEach((n) => n.remove()); return true;
      case "b-undo-unmap": if (B.undo) { B.map[B.undo.src] = B.undo.before; B.undo = null; } document.querySelectorAll(".proto-toast").forEach((n) => n.remove()); return true;
      case "b-io": B.pop = { kind: "io", anchor: "io" }; return true;
      case "b-picker": B.pop = B.pop?.kind === "picker" ? null : { kind: "picker", anchor: "picker" }; return true;
      case "b-goto-block": B.pop = null; B.preview = null; B.pane = "side"; B.flash = d.src; B.scrollTo = `block-${d.src}`; return true;
      case "b-dialog": B.pop = null; openDialog(d.src); return true;
      case "b-dsel": B.pop = B.pop?.kind === "dsel" && B.pop.src === d.src ? null : { kind: "dsel", src: d.src, anchor: `dsel-${d.src}` }; return true;
      case "b-dpick": if (d.target === "docs") B.picked = true; B.dialogPick[d.src] = d.target; B.pop = null; B.refocus = `dsel-${d.src}`; return true;
      case "b-dialog-apply": applyDialog(); B.dialogJustDone = true; return true;
      case "b-dialog-close": B.dialog = null; B.dialogDone = false; B.pop = null; return true;
      case "b-resume": B.resumed = true; return true;
      case "b-chip": if (!B.chips.includes(d.path)) B.chips.push(d.path); toast(L(`已加入任务：${base(d.path)}`, `Added to the task: ${base(d.path)}`), { act: "b-unchip-last", label: L("撤销", "Undo") }); return true;
      case "b-unchip": B.chips.splice(Number(d.i), 1); return true;
      case "b-unchip-last": B.chips.pop(); document.querySelectorAll(".proto-toast").forEach((n) => n.remove()); return true;
      default: return false;
    }
  }
  // Escape closes the innermost thing and puts focus back on what opened it; arrows move inside a menu.
  function key(event) {
    if (event.key === "Escape") {
      if (B.pop) { B.refocus = B.pop.anchor; B.pop = null; return true; }
      if (B.dialog) { B.dialog = null; return true; }
      if (B.preview) { B.preview = null; return true; }
    }
    if (B.pop && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      const items = [...document.querySelectorAll(".b-pop .mw-menu__item")];
      if (!items.length) return false;
      const i = items.indexOf(document.activeElement);
      items[(i + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      event.preventDefault();
    }
    return false;
  }
  // Clicking outside an open popover closes it, without acting on what was under the click.
  function outside(target) {
    if (B.pop && !target.closest(".b-pop") && !target.closest(`[data-anchor="${B.pop.anchor}"]`)) { B.pop = null; return true; }
    return false;
  }
  const NOTES = {
    unmapped: ["资料面板和对话里的引用都是示例；「最近用过」从记下的 20 份里取前 5 份。另一台设备上的文件夹名字不同步，这里只知道相对路径。", "The panel's and the conversation's references are samples; Recent shows the first 5 of the 20 kept. The other device's folder names don't sync; only relative paths are known here."],
    goal: ["Goal 和它的输入是示例。docs/接口说明.md 是没有记下内容的旧输入。", "The Goal and its inputs are samples. docs/接口说明.md is an old input bound without its content recorded."],
    picker: ["选资料的弹层只画了「最近用过」；搜索不工作。", "The picker draws Recent only; search does nothing."],
    mapping: ["「选择另一个文件夹…」在产品里打开系统的选择窗口，这里直接当作选了 ~/Documents/website-docs。", "\"Choose another folder…\" opens the system's folder window in the product; here it picks ~/Documents/website-docs."],
    mapped: ["接回后每份引用读成什么（找到、不一样、没核对、没有）是模拟的。", "What each reference reads as afterwards (found, not the same, not checked, missing) is simulated."],
    missing: ["另一台设备的默认输出目录对应到这个项目的默认输出目录，文件没有跟着过来。", "Another device's default output folder points at this project's; its files did not come along."],
    manage: ["「输入与输出」是 03 定下的同一块管理，这里多了每个文件夹对应着谁。", "Inputs and output is the panel 03 chose; each folder now shows what it stands in for."],
    changed: ["website 里的 package.json 和引用时不一样；Goal 里 docs/接口说明.md 引用时没记下内容。最挤的数据里同一文件夹第 6 份起也是「内容没有核对」，打开时才核对。", "package.json in website differs; the Goal's docs/接口说明.md was bound without its content recorded. In the crowded data the sixth reference of a folder on is \"not checked\" too, until opened."],
    wrong: ["另一台设备上的文档文件夹被指到了 website：README.md 不一样，另外两份找不到。", "The other device's docs folder was pointed at website: README.md differs and two files are missing."],
    refused: ["Agent 读不到是模拟的；「让它接着做」只画出它接着读的样子。插件读不到时只拿到拒绝，「最近用过」也不给插件这些项，所以人看到的就是这里和资料面板。", "The refusal is simulated; \"Let it carry on\" only draws it reading on. A plugin gets only a refusal and Recent leaves these out for plugins, so what the person sees is here and in the panel."],
  };
  window.Groups = window.Groups || {};
  window.Groups.b = {
    title: ["B 指定文件夹", "B Choose folder"], options: OPTIONS, states: STATES, data: DATA, bodyClass: "b-page",
    preset, render, place, act, key, outside, teardown, note: (state) => NOTES[state],
  };
})();
