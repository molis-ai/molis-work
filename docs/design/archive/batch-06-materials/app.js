import {
  assistantReply, codeFor, defaultRecent, documentFor, fileName, files,
  folderTrees, logLines, logPreviewLines, sources, taskDraft, taskTitle, worktreeName,
} from "./data.js";

const K = window.mwKit;
const E = K.escapeHtml;
const $ = (id) => document.getElementById(id);
const frame = $("frame");
const workbench = $("workbench");
const prototype = $("prototype");
const picker = $("picker");
const settings = $("settings");
const storageKey = "molis.design.batch-06-materials";
const states = [
  ["normal", "正常", "Ready"], ["changed", "文件有更新", "File updated"],
  ["revoked", "参考访问撤回", "Access withdrawn"], ["missing", "参考目录丢失", "Folder missing"],
  ["large", "大文件截断", "Partial preview"], ["empty", "空项目", "Empty project"],
  ["writing", "仅项目内容", "Project content only"], ["frozen", "运行中改输出", "Output changed mid-run"],
  ["worktree", "本轮用临时副本", "Temporary copy"], ["outputMissing", "工作目录丢失", "Working folder missing"],
];

const query = new URLSearchParams(location.search);
function initialState() {
  return {
    scheme: query.get("scheme") === "b" ? "b" : "a",
    lang: query.get("lang") === "en" ? "en" : "zh",
    theme: query.get("theme") === "dark" ? "dark" : "light",
    width: ["1440", "1024", "390"].includes(query.get("width")) ? query.get("width") : "auto",
    scenario: states.some(([value]) => value === query.get("state")) ? query.get("state") : "normal",
    side: true, mobileSide: false, codingFiles: false, browsing: "website", main: "coding",
    readers: {}, expanded: {}, query: {}, recent: [...defaultRecent], focus: {}, scroll: {},
    refs: [], draft: taskDraft, delivered: "", recovered: {}, extras: [], output: "website",
  };
}

const load = () => {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) || "null");
  } catch {
    return null;
  }
};

let S = load() ?? initialState();
let choose = null;
let manage = null;
let menuAnchor = "";
let toast = null;
let feedbackTimer;

const L = (zh, en) => S.lang === "zh" ? zh : en;
const sourceName = (root) => L(sources[root].name, sources[root].english ?? sources[root].name);
const isCode = (id) => files[id].kind !== "text";
const loc = (id, origin = sourceName(files[id].root)) => `${origin} / ${files[id].path}`;
const t = (key) => ({
  materials: L("项目资料", "Project materials"),
  files: L("文件", "Files"),
  add: L("加入任务", "Add to task"),
  pick: L("选择资料", "Choose materials"),
  manage: L("输入与输出", "Inputs and output"),
  close: L("关闭", "Close"),
  back: L("返回", "Back"),
  current: L("当前文件", "Current file"),
  fixed: L("固定快照", "Fixed snapshot"),
  excerpt: L("选区", "Excerpt"),
  reference: L("参考", "Reference"),
  output: L("输出", "Output"),
  undo: L("撤销", "Undo"),
})[key];

const icon = (name, css = "") => K.icon(name, css);
const badge = (label, tone = "neutral") => K.renderBadge({ label, tone });
function button(label, act, options = {}) {
  const { glyph, variant = "secondary", iconOnly, id = act, attrs, className, disabled, size = "sm" } = options;
  return K.renderButton({
    label, icon: glyph, iconOnly, variant, disabled, className, size,
    attrs: { "data-act": act, "data-focus": id, ...(iconOnly ? { "data-craft-tip": label } : {}), ...attrs },
  });
}
function alert(title, body, { tone = "warning", actions = [] } = {}) {
  const notice = K.renderAlert({ title, body, tone, role: "status" });
  if (!actions.length) return notice;
  const controls = actions.map(([label, act, arg]) => button(label, act, {
    id: `alert-${act}-${arg ?? ""}`, attrs: { "data-arg": arg },
  })).join("");
  return `<div class="reading-issue">${notice}<div class="reading-issue__actions">${controls}</div></div>`;
}

function save() {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(S));
  } catch {
    // Reading and choosing still work when the browser declines session storage.
  }
}
function rememberScroll() {
  document.querySelectorAll("[data-scroll]").forEach((node) => {
    if (node.clientHeight > 0) S.scroll[node.dataset.scroll] = node.scrollTop;
  });
}
function restoreScroll() {
  document.querySelectorAll("[data-scroll]").forEach((node) => {
    node.scrollTop = S.scroll[node.dataset.scroll] ?? 0;
  });
}
function focus(id) {
  const node = id && [...document.querySelectorAll(`[data-focus="${CSS.escape(id)}"]`)]
    .find((element) => element.getClientRects().length && !element.closest("[inert]") && !element.disabled);
  node?.focus({ preventScroll: true });
  return Boolean(node);
}
function say(message, undo = "") {
  toast = { message, undo };
  window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => { toast = null; $("task-feedback")?.replaceChildren(); }, 6500);
  $("announce").textContent = message;
}
function narrow() { return frame.getBoundingClientRect().width < 760; }
function emptyProject() { return S.scenario === "empty" && S.extras.length === 0; }
function localVisible() { return !["empty", "writing"].includes(S.scenario) || S.extras.includes("brand"); }
function workingName() { return S.output === "default" ? "website-refresh" : sources[S.output].name; }
function actualName() {
  if (S.scenario === "worktree") return worktreeName;
  if (S.scenario === "frozen") return "website";
  return workingName();
}
function fault(root) {
  if (S.recovered[root]) return "";
  if (root === "brand" && ["missing", "revoked"].includes(S.scenario)) return S.scenario;
  if (root === S.output && S.scenario === "outputMissing") return "missing";
  return "";
}
const accessLabel = (value) => value === "missing" ? L("找不到", "Missing") : L("已撤回", "Withdrawn");
const fileBlocked = (id) => Boolean(fault(files[id].root));

function segmented(label, act, options, current) {
  return K.renderToggleGroup({
    label, items: options.map(([value, zh, en]) => ({
      value, label: L(zh, en), current: value === current, attrs: { "data-act": act, "data-arg": value, "data-focus": `${act}-${value}` },
    })),
  }).replace('data-slot="toggle-group"', 'data-slot="toggle-group" data-seg-thumb');
}

function drawPrototype() {
  const stateLabel = states.find(([value]) => value === S.scenario);
  const stateMenu = K.renderMenu({ items: states.map(([value, zh, en]) => K.renderMenuItem({
    label: L(zh, en), checked: value === S.scenario, attrs: { "data-act": "scenario", "data-arg": value },
  })).join("") });
  prototype.innerHTML = `<div class="prototype__lead">${icon("flask")}<b>${L("06 · 资料定样", "06 · Materials study")}</b><span>${L("模拟数据", "Sample data")}</span></div>
    <div class="prototype__controls">
      ${segmented(L("方案", "Study"), "scheme", [["a","A 就地预览","A In-place"],["b","B 主区阅读","B Main reader"]], S.scheme)}
      <div class="menu-wrap lab-state">
        ${button(L(stateLabel[1], stateLabel[2]), "open-menu", { glyph: "chevron-down", id: "scenario-menu", attrs: { "aria-haspopup": "menu", "aria-expanded": "false", "data-menu": "scenarios" } })}
        ${K.renderPopover({ body: stateMenu, className: "choice-popover", attrs: { id: "scenarios" } })}
      </div>
      ${segmented(L("预览宽度", "Preview width"), "width", [["auto","自适应","Auto"],["1440","1440","1440"],["1024","1024","1024"],["390","390","390"]], S.width)}
      ${segmented(L("界面语言", "Interface language"), "lang", [["zh","中","中"],["en","EN","EN"]], S.lang)}
      ${segmented(L("外观", "Theme"), "theme", [["light","浅","Light"],["dark","深","Dark"]], S.theme)}
      <div class="prototype__tools">${button(L("重开", "Reopen"), "reopen", { glyph: "refresh", variant: "ghost" })}
        ${button(L("重置", "Reset"), "reset", { variant: "ghost" })}</div>
    </div>`;
}

function rowGlyph(id) {
  if (files[id].root === "pages") return "note";
  if (files[id].root === "shelf") return "bookmark";
  if (files[id].root === "artifact") return "archive";
  return isCode(id) ? "code" : "file";
}
function fileRow(id, scope, { fact = "", depth = 0, rowId = id } = {}) {
  const blocked = fileBlocked(id);
  const active = S.focus[scope] === rowId;
  const origin = scope === "coding" && files[id].root === "website" ? actualName() : undefined;
  const details = blocked ? accessLabel(fault(files[id].root)) : fact;
  return `<button type="button" class="mw-dir-row file-row${active ? " is-selected" : ""}" style="--depth:${depth}"
    data-act="read" data-arg="${id}" data-place="${scope}" data-list-row data-focus="row-${scope}-${rowId}"
    data-craft-tip="${E(loc(id, origin))}"${active ? ' aria-current="true"' : ""}>
    ${files[id].root === "imported" ? K.renderFileKind(fileName(id)) : icon(rowGlyph(id), "file-glyph")}
    <span class="row-name">${E(fileName(id))}</span>
    ${details ? `<span class="row-fact${blocked ? " blocked-fact" : ""}">${E(details)}</span>` : ""}
  </button>`;
}
function branchRow({ key, name, scope, depth, open, tail = "", tip = name }) {
  return `<button type="button" class="mw-dir-row branch-row" style="--depth:${depth}" data-act="branch" data-arg="${E(key)}" data-place="${scope}"
    data-list-row data-focus="branch-${scope}-${E(key)}" data-craft-tip="${E(tip)}" aria-expanded="${open}">
    ${icon(open ? "chevron-down" : "chevron-right", "tree-caret")}${icon(open ? "folder-open" : "folder", "file-glyph")}
    <span class="row-name">${E(name)}</span>${tail}
  </button>`;
}
function branchOpen(scope, key, initial) {
  return S.expanded[`${scope}/${key}`] ?? initial;
}
function matches(id, search) { return loc(id).toLocaleLowerCase().includes(search); }
function containsFile(nodes, search) {
  return nodes.some((node) => typeof node === "string" ? matches(node, search) : containsFile(node.children, search));
}
function treeRows(nodes, scope, prefix, depth, search) {
  return nodes.map((node) => {
    if (typeof node === "string") {
      return matches(node, search) ? fileRow(node, scope, { depth }) : "";
    }
    const key = `${prefix}/${node.name}`;
    const open = Boolean(search) || branchOpen(scope, key, scope === "coding" && node.name !== "styles");
    if (search && !containsFile(node.children, search)) return "";
    return `${branchRow({ key, name: node.name, scope, depth, open, tip: key })}
      ${open ? treeRows(node.children, scope, key, depth + 1, search) : ""}`;
  }).join("");
}
function group(label, glyph, body) {
  return body ? `<section class="source-group"><h3>${icon(glyph)}${E(label)}</h3>${body}</section>` : "";
}
function folder(root, scope, search) {
  if (search && !containsFile(folderTrees[root], search)) return "";
  const blocked = fault(root);
  const open = Boolean(search) || branchOpen(scope, root, root === "brand");
  const role = root !== S.output ? t("reference")
    : sources[root].roles.includes("reference") ? L("参考／输出", "Ref / Output") : t("output");
  const tail = blocked ? badge(accessLabel(blocked), blocked === "missing" ? "warning" : "danger")
    : badge(role, root === S.output ? "info" : "neutral");
  return `${branchRow({ key: root, name: sourceName(root), scope, depth: 0, open, tail, tip: sources[root].path })}
    ${open ? blocked ? `<div class="source-recovery">
      <span>${blocked === "missing" ? L("找不到此文件夹。", "This folder couldn't be found.") : L("此文件夹的读取权限已撤回。", "Read access to this folder was withdrawn.")}</span>
      ${button(blocked === "missing" ? L("重新找到位置", "Locate folder") : L("查看访问", "Review access"),
        "manage", { variant: "link", id: `recover-${scope}-${root}`, attrs: { "data-arg": root } })}
    </div>` : folderTrees[root].length ? treeRows(folderTrees[root], scope, root, 1, search)
      : `<p class="source-recovery">${L("还没有文件。", "No files yet.")}</p>` : ""}`;
}
function emptyState(glyph, title, description, actions = "") {
  return `<div class="mw-empty empty"><span class="mw-empty__mark">${icon(glyph)}</span><strong>${E(title)}</strong>
    <p>${E(description)}</p>${actions ? `<div class="mw-empty__actions">${actions}</div>` : ""}</div>`;
}
function addFolderButton(id) {
  return button(L("添加文件夹", "Add folder"), "manage", { id, glyph: "folder", attrs: { "data-arg": "add" } });
}
function importButton(id) {
  return button(L("导入文件", "Import file"), "import", { id, glyph: "upload" });
}
function allowedInProject(id) {
  if (!["empty", "writing"].includes(S.scenario)) return true;
  const root = files[id].root;
  return S.extras.includes(root) || S.scenario === "writing" && !folderTrees[root];
}
function sourceContents(scope) {
  if (emptyProject()) return emptyState("folder-open", L("还没有项目资料", "No project materials yet"),
    L("添加一个参考文件夹，或导入一份文件。", "Add a reference folder or import a file."),
    addFolderButton(`add-folder-${scope}`) + importButton(`import-${scope}`));
  const search = (S.query[scope] ?? "").trim().toLocaleLowerCase();
  const rows = (ids) => ids.filter((id) => allowedInProject(id) && matches(id, search)).map((id) => fileRow(id, scope, { fact: files[id].root === "imported" ? "" : sourceName(files[id].root) })).join("");
  const recent = S.recent.filter((id) => allowedInProject(id) && matches(id, search)).slice(0, 5);
  const recentRows = recent.map((id) => fileRow(id, scope, { rowId: `recent-${id}`, fact: sourceName(files[id].root) })).join("");
  const roots = localVisible() ? (["empty", "writing"].includes(S.scenario) ? ["brand"] : ["website", "brand"]) : [];
  if (S.output === "next") roots.push("next");
  const visible = group(L("最近用过", "Recent"), "history", recentRows)
    + group(L("本机文件夹", "Local folders"), "folder-tree", roots.map((root) => folder(root, scope, search)).join(""))
    + group(L("导入的文件", "Imported files"), "upload", rows(["visits", "spec"]))
    + group(L("项目里的内容", "Project content"), "library", rows(["brief", "note", "receipt"]));
  return visible || emptyState("search", L("没有找到资料", "No matches"), L("试试文件名或来源。", "Try a file name or source."),
    button(L("清空搜索", "Clear search"), "clear-search", { attrs: { "data-place": scope } }));
}
function sourceList(scope) {
  return `<div class="source-list" data-source="${scope}">
    <div class="source-tools">
      <label class="source-search">${icon("search")}<input type="search" class="mw-input" autocomplete="off" spellcheck="false"
        placeholder="${E(L("搜索资料", "Search materials"))}" aria-label="${E(L("搜索资料", "Search materials"))}"
        value="${E(S.query[scope] ?? "")}" data-query="${scope}" data-focus="search-${scope}"></label>
      ${button(t("manage"), "manage", { glyph: "tune", iconOnly: true, id: `manage-${scope}` })}
    </div>
    <div class="source-scroll scroll" data-scroll="source-${scope}" data-list="${scope}">${sourceContents(scope)}</div>
  </div>`;
}

function textParts(id, revision) {
  return documentFor(id, revision).sections.flatMap(([heading, paragraphs]) => paragraphs.map((text, index) => ({
    text, heading, first: index === 0,
  })));
}
function codeLine(parts) {
  return parts.map((part) => typeof part === "string" ? E(part) : `<span class="syntax-${part[0]}">${E(part[1])}</span>`).join("");
}
function plainCode(parts) {
  return parts.map((part) => typeof part === "string" ? part : part[1]).join("");
}
function partLabel(id, from, to = from) {
  const number = from === to ? from : `${from}–${to}`;
  if (isCode(id)) return L(`第 ${number} 行`, `Line${from === to ? "" : "s"} ${number}`);
  return L(`第 ${number} 段`, `Paragraph${from === to ? "" : "s"} ${number}`);
}
function readerBody(r) {
  if (r.historical && r.quote) {
    return `<div class="reading-page quote-page"><blockquote>${E(r.quote.text)}</blockquote></div>`;
  }
  if (isCode(r.id)) {
    const lines = codeFor(r.id, r.count, r.origin);
    return `<div class="reading-page code-page"><div class="code-block" role="region" aria-label="${E(L("代码内容", "Code content"))}">${lines.map((parts, index) => {
      const line = index + 1;
      const marked = r.quote && line >= r.quote.from && line <= r.quote.to;
      return `<div class="code-line${marked ? " is-quoted" : ""}" data-part="${line}"><span class="line-no" aria-hidden="true">${line}</span><code>${codeLine(parts) || " "}</code></div>`;
    }).join("")}</div></div>`;
  }
  const doc = documentFor(r.id, r.revision);
  const parts = textParts(r.id, r.revision);
  return `<article class="reading-page"><h3>${E(doc.title)}</h3>${parts.map(({ heading, first, text }, index) => {
    const n = index + 1;
    const marked = r.quote && n >= r.quote.from && n <= r.quote.to;
    return `${first ? `<h4>${E(heading)}</h4>` : ""}<p data-part="${n}"${marked ? ' class="is-quoted"' : ""}>${E(text)}</p>`;
  }).join("")}</article>`;
}
function readingProblem(r) {
  if (r.historical || !fileBlocked(r.id)) return "";
  const root = files[r.id].root;
  const name = sourceName(root);
  if (fault(root) === "revoked") return alert(L("读取权限已撤回", "Read access withdrawn"),
    L(`无法再打开 ${name} 里的当前文件。先前加入任务的引用仍显示出处。`,
      `Current files in ${name} can no longer be opened. Earlier task references still show their sources.`), {
      tone: "danger", actions: [[L("查看访问", "Review access"), "manage", root]],
    });
  return alert(L("找不到文件夹", "Folder not found"),
    L(`${name} 已不在原位置。重新关联后可以接着读。`, `${name} is no longer at its old location. Locate it to continue reading.`), {
      actions: [[L("重新找到位置", "Locate folder"), "manage", root]],
    });
}
function outdated(r) {
  return r.id === "guide" && S.scenario === "changed" && r.revision === 1 && !r.historical;
}
function excerptMenu(r, place) {
  const entries = isCode(r.id) ? codeFor(r.id, r.count, r.origin) : textParts(r.id, r.revision);
  const ranges = r.id === "build" ? [[1, 8], [Math.max(9, entries.length - 7), entries.length]]
    : isCode(r.id) ? [[1, 4], [5, Math.min(12, entries.length)], [9, Math.min(11, entries.length)]]
    : entries.map((_, index) => [index + 1, index + 1]);
  const items = ranges.map(([from, to]) => K.renderMenuItem({
    label: partLabel(r.id, from, to) + (isCode(r.id) ? "" : ` · ${entries[from - 1].heading}`),
    iconName: isCode(r.id) ? "code" : "text",
    attrs: { "data-act": "range", "data-place": place, "data-arg": `${from}:${to}` },
  })).join("");
  return K.renderPopover({ className: "choice-popover excerpt-menu", body: K.renderMenu({ items }), attrs: { id: `ranges-${place}` } });
}
function readerFooter(r, place, blocked) {
  const attrs = { "data-place": place };
  const stale = outdated(r) && !r.snapshot && !r.quote;
  const partial = r.id === "build" && r.count < logLines && !r.historical;
  const label = r.quote ? `${t("excerpt")} · ${partLabel(r.id, r.quote.from, r.quote.to)}`
    : r.snapshot || r.historical || files[r.id].fixed ? t("fixed") : t("current");
  const undoDraft = r.snapshot || r.quote;
  const readOnly = Boolean(blocked || r.historical);
  return `<footer class="reader-foot">
    ${readOnly ? "" : `<div class="reader-tools">${button(
      r.quote ? L("更换选区", "Change excerpt") : L("引用选区", "Quote selection"), "quote", {
        glyph: "text", id: `quote-${place}`,
        attrs: { ...attrs, "aria-haspopup": "menu", "aria-expanded": "false", "data-menu": `ranges-${place}` },
      })}
      ${files[r.id].fixed ? "" : button(L("固定快照", "Pin snapshot"), "snapshot", {
        glyph: "bookmark", id: `snapshot-${place}`, disabled: partial || r.snapshot || outdated(r), attrs,
      })}
      ${undoDraft ? button(L("取消选取", "Clear choice"), "clear-quote", {
        glyph: "x", iconOnly: true, variant: "ghost", id: `clear-${place}`, attrs,
      }) : ""}${excerptMenu(r, place)}</div>`}
    <div class="reader-confirm">
      <span class="version-fact">${blocked ? "" : icon(undoDraft || r.historical || files[r.id].fixed ? "bookmark" : "file")}
        ${blocked ? "" : E(label)}</span>
      ${readOnly ? (place === "main" ? button(L("回到任务", "Return to task"), "task", { glyph: "back", attrs }) : "")
        : button(t("add"), "attach", {
          variant: "primary", glyph: "plus", disabled: stale || partial && !r.quote, id: `attach-${place}`, attrs,
        })}
    </div>
  </footer>`;
}
function reader(place) {
  const r = S.readers[place];
  const id = r.id;
  const blocked = readingProblem(r);
  const partial = id === "build" && r.count < logLines;
  const updateNotice = !blocked && outdated(r) ? alert(L("文件有新版本", "A newer version is available"),
    L("你正在看 10:12 读取的内容。刷新后可引用最新版本。", "You’re viewing the copy read at 10:12. Refresh to cite the new version."),
    { actions: [[L("刷新内容", "Refresh file"), "refresh-file", place]] }) : "";
  const cutoff = !blocked && partial && !r.historical ? alert(
    L(`预览到第 ${r.count.toLocaleString(S.lang)} 行`, `Preview through line ${r.count.toLocaleString(S.lang)}`),
    L(`共 ${logLines.toLocaleString(S.lang)} 行。可以引用已读的选区，读取剩余内容后可固定整份文件。`,
      `${logLines.toLocaleString(S.lang)} lines total. Quote the loaded portion or finish reading before pinning the whole file.`),
    { tone: "info", actions: [[L("读取余下内容", "Read remaining lines"), "read-rest", place]] },
  ) : "";
  const back = r.historical ? L("回到任务", "Return to task") : place === "picker" || r.from === "side" || r.from === "main" ? t("materials") : t("files");
  const time = r.revision === 2 ? "10:38" : "10:12";
  const extra = files[id].size ? ` · ${files[id].size}` : "";
  const version = r.historical || files[id].fixed ? t("fixed") : t("current");
  const facts = r.historical && r.quote ? `${t("excerpt")} · ${partLabel(id, r.quote.from, r.quote.to)} · ${time}`
    : `${version} · ${time}${extra}`;
  return `<section class="reader" data-reader="${place}" aria-labelledby="read-title-${place}">
    <header class="reader-head">
      <div class="reader-nav">
        ${button(back, "back-reader", { glyph: "chevron-left", variant: "ghost", id: `back-${place}`, attrs: { "data-place": place } })}
        ${place === "side" ? `<div class="reader-nav__actions">
          ${button(L("在主区打开", "Open in main area"), "promote", { glyph: "maximize", iconOnly: true })}
          ${button(t("close"), "close-side", { glyph: "x", iconOnly: true, variant: "ghost", id: "close-side" })}</div>` : ""}
        ${place === "main" && !r.historical && r.from !== "main" ? button(L("回到任务", "Return to task"), "task", { glyph: "back", id: "reader-task" }) : ""}
      </div>
      <div class="reader-heading">
        <div class="file-path">${icon("folder-open")}<span>${E(loc(id, r.origin))}</span></div>
        <h2 id="read-title-${place}" tabindex="-1" data-focus="title-${place}">${E(fileName(id))}</h2>
        <div class="reader-meta">${E(facts)}${files[id].pages ? ` · ${L("2 页", "2 pages")}` : ""}</div>
      </div>
    </header>
    <div class="reader-scroll scroll" data-scroll="read-${place}-${id}" tabindex="0" aria-label="${E(L("文件正文", "File contents"))}">
      ${blocked ? `<div class="reading-notice">${blocked}</div>` : `${updateNotice || cutoff ? `<div class="reading-notice">${updateNotice}${cutoff}</div>` : ""}${readerBody(r)}`}
    </div>
    ${readerFooter(r, place, blocked)}
  </section>`;
}

function materialHeader(scope) {
  return `<header class="surface-head"><h1>${t("materials")}</h1>
    ${scope === "side" ? button(t("close"), "close-side", { glyph: "x", iconOnly: true, variant: "ghost", id: "close-side" }) : ""}
  </header>`;
}
function materialStage(scope) {
  const active = S.readers[scope];
  if (scope === "side") return S.scheme === "a" && active ? reader(scope) : materialHeader(scope) + sourceList(scope);
  const split = S.scheme === "a";
  return `<div class="material-stage${split ? " is-split" : ""}${active ? " has-reader" : ""}">
    <div class="material-list">${materialHeader(scope)}${sourceList(scope)}</div>
    <div class="material-detail">${active ? reader(scope) : ""}</div>
  </div>`;
}

function codingDirectory() {
  const root = S.browsing;
  const isReference = root !== "website";
  const blocked = fault(root);
  const displayed = isReference ? sourceName(root) : actualName();
  const role = isReference ? L("只读参考", "Read only") : L("工作目录", "Working folder");
  const options = ["website", "brand"].filter((candidate) => candidate === "website" || localVisible()).map((candidate) => K.renderMenuItem({
    label: candidate === "website" ? actualName() : sourceName(candidate),
    checked: candidate === root, attrs: { "data-act": "coding-folder", "data-arg": candidate },
  })).join("");
  const fact = isReference
    ? L(`临时查看。Coding 仍在 ${actualName()}。`, `Just viewing. Coding stays in ${actualName()}.`)
    : S.scenario === "frozen" ? L("本轮仍在 website，下一轮用 website-v2。", "This run stays in website. Next run uses website-v2.")
      : S.scenario === "worktree" ? L("本轮在临时副本里做，审查后交回 website。", "This run uses a temporary copy and returns to website after review.")
        : L("本轮在这里做，也是项目输出。", "This run works here, the project output.");
  const locationNote = blocked ? L("找不到原位置。", "The original location is unavailable.") : fact;
  const noFiles = !localVisible() && !isReference;
  return `<aside class="coding-directory${S.codingFiles ? " is-open" : ""}" aria-label="${E(t("files"))}">
    <header class="coding-directory__head">
      <div class="coding-directory__label"><span>${L("Coding 在哪里做", "Where Coding works")}</span>
        ${button(t("close"), "close-coding-files", { glyph: "x", iconOnly: true, variant: "ghost", className: "only-narrow", id: "close-coding-files" })}</div>
      <div class="location-picker">${button(displayed, "open-menu", {
        glyph: "folder-tree", id: "coding-folder-menu", attrs: { "data-menu": "coding-folders", "aria-haspopup": "menu", "aria-expanded": "false" },
      })}${badge(blocked ? accessLabel(blocked) : role, blocked ? "warning" : isReference ? "neutral" : "info")}
        ${K.renderPopover({ body: K.renderMenu({ items: options }), className: "choice-popover", attrs: { id: "coding-folders" } })}
      </div>
      <p>${E(locationNote)}</p>
      ${isReference ? button(L("回到工作目录", "Back to working folder"), "back-working", { glyph: "back", variant: "link" }) : ""}
    </header>
    <div class="coding-tree scroll" data-scroll="source-coding" data-list="coding">
      ${blocked ? alert(L("目录不可用", "Folder unavailable"), isReference ? L("之前的引用仍在任务里。", "Earlier references remain in the task.")
        : L("恢复位置后才能开始下一轮。", "Restore the location to start another run."), {
          actions: [[blocked === "missing" ? L("重新找到位置", "Locate folder") : L("查看访问", "Review access"), "manage", root]],
        }) : noFiles ? emptyState("folder-open", L("工作目录还没有文件", "The working folder is empty"),
          L("生成的文件会放在这里。", "Generated files will appear here."))
        : treeRows(folderTrees[root], "coding", root, 0, "")}
    </div>
  </aside>`;
}

function referenceName(ref) {
  return ref.quote ? `${t("excerpt")} · ${partLabel(ref.id, ref.quote.from, ref.quote.to)}` : ref.mode === "fixed" ? t("fixed") : t("current");
}
function referenceRow(ref) {
  const unavailable = ref.mode === "current" && fileBlocked(ref.id);
  return `<li class="task-reference" data-ref="${ref.key}">
    <button type="button" class="mw-dir-row ref-open" data-act="read-ref" data-arg="${ref.key}" data-focus="ref-${ref.key}"
      data-craft-tip="${E(loc(ref.id, ref.origin))}">
      ${icon(ref.mode === "current" ? rowGlyph(ref.id) : "bookmark", "file-glyph")}
      <span class="row-name">${E(fileName(ref.id))}</span><span class="row-fact">${E(ref.origin ?? sourceName(files[ref.id].root))}</span>
      <span class="ref-mode">${unavailable ? badge(L("来源不可用", "Source unavailable"), "warning") : E(referenceName(ref))}</span>
    </button>
    ${button(L("移除引用", "Remove reference"), "remove-ref", {
      glyph: "x", iconOnly: true, id: `remove-${ref.key}`, variant: "ghost", attrs: { "data-arg": ref.key },
    })}
  </li>`;
}
function taskComposer() {
  const blocked = fault(S.output);
  return `<div class="task-compose">
    <div id="task-feedback" class="task-feedback">${toast ? `<div class="mw-toast"><span>${E(toast.message)}</span>
      ${toast.undo ? button(t("undo"), "undo-ref", { className: "mw-toast__action", variant: "ghost", attrs: { "data-arg": toast.undo } }) : ""}</div>` : ""}</div>
    <div class="composer">
      ${S.refs.length ? `<ul class="task-refs" aria-label="${E(L("本轮引用", "Task references"))}">${S.refs.map(referenceRow).join("")}</ul>` : ""}
      <textarea rows="2" class="mw-input composer-input" data-draft data-focus="draft"
        placeholder="${E(L("给 Coding 留一句话…", "Write to Coding…"))}" aria-label="${E(L("任务输入", "Task message"))}">${E(S.draft)}</textarea>
      <div class="composer-actions">${button(t("pick"), "picker", { glyph: "paperclip" })}
        <span class="composer-spacer"></span>
        ${blocked ? `<span class="send-note">${L("请先恢复工作目录", "Restore the working folder first")}</span>` : ""}
        ${button(L("发送", "Send"), "send", { glyph: "send", variant: "primary", iconOnly: true, disabled: Boolean(blocked) })}
      </div>
    </div>
  </div>`;
}
function codingTask() {
  const empty = S.scenario === "empty";
  const writing = S.scenario === "writing";
  const label = empty ? L("新任务", "New task") : writing ? L("撰写开放通知", "Write an opening notice") : taskTitle;
  return `<main id="main-panel" class="coding-stage" role="tabpanel" aria-labelledby="tab-coding"${S.codingFiles ? ' data-files-open="true"' : ""}>
    ${writing ? "" : codingDirectory()}
    <section class="task" aria-labelledby="task-title">
      <header class="task-head"><div><h1 id="task-title" tabindex="-1" data-focus="task-title">${E(label)}</h1>
        ${writing ? "" : `<div class="task-git">${icon("git-branch")}<span>main</span></div>`}</div>
      </header>
      ${writing ? "" : `<div class="working-hint only-narrow">
        <span>${icon("terminal")}${E(L(`本轮在 ${actualName()}`, `This run in ${actualName()}`))}</span>
        ${button(t("files"), "toggle-coding-files", { glyph: "folder-tree", attrs: { "aria-expanded": String(S.codingFiles) } })}</div>`}
      <div class="conversation scroll" data-scroll="conversation">
        ${empty ? emptyState("message", L("开始这次任务", "Start this task"), L("写下一句想做的事。资料可以随时加。", "Write what you want to do. You can add materials any time."))
          : `<div class="conversation-inner">
            <div class="message-user"><p>${writing ? "用官网的资料写一段开放通知，给第一次来的访客。" : "想让第一次来渡口的人在首页就找到预约入口。先看一下现有的首屏。"} </p></div>
            <div class="message-assistant"><span class="assistant-identity">${icon(writing ? "note" : "terminal")}${writing ? L("写作助理", "Writing assistant") : "Coding"}</span>
              <p>${writing ? "我会把开放时间、预约方式和入口位置写清楚。你可以把改版需求或访谈纪要加进来。" : assistantReply}</p>
              ${writing ? "" : `<div class="message-files">${button("Hero.tsx", "read", { glyph: "code", variant: "secondary", id: "message-file", attrs: { "data-arg": "hero", "data-place": "coding" } })}</div>`}</div>
            ${S.delivered ? `<div class="message-user"><p>${E(S.delivered)}</p></div>` : ""}
          </div>`}
      </div>
      ${taskComposer()}
    </section>
  </main>`;
}

function sidePane() {
  if (!S.side && !S.mobileSide) return "";
  const hidden = !S.mobileSide ? " desktop-side" : "";
  return `<aside class="sheet side-pane${hidden}" aria-label="${E(t("materials"))}">${materialStage("side")}</aside>`;
}
function dock() {
  return `<footer class="dock">
    <div class="dock__left">
      ${button(L("当前任务", "Current task"), "task", { glyph: "terminal", iconOnly: true, id: "dock-task", attrs: { "aria-pressed": String(S.main === "coding") } })}
    </div>
    <div class="dock__middle">
      ${S.main === "coding" ? "" : button(t("pick"), "picker", { glyph: "paperclip", id: "dock-picker", className: "dock-picker" })}
    </div>
    <div class="dock__right">
      ${button(t("materials"), "toggle-side", { glyph: "sidebar", id: "toggle-side", className: "dock-materials",
        attrs: { "aria-label": t("materials"), "data-craft-tip": t("materials"), "aria-pressed": String(narrow() ? S.mobileSide : S.side) } })}
      ${button(L("项目设置", "Project settings"), "manage", { glyph: "tune", iconOnly: true, id: "project-settings" })}
      <span class="mw-avatar project-monogram" aria-hidden="true">渡</span>
    </div>
  </footer>`;
}
function mainTabs() {
  const mode = S.main;
  const reader = S.readers.main;
  const tabs = [
    { id: "coding", label: S.scenario === "writing" ? L("写作", "Writing") : "Coding", selected: mode === "coding" },
    { id: "materials", label: t("materials"), selected: mode === "materials" },
  ];
  if (reader?.standalone) tabs.push({ id: "reader", label: fileName(reader.id), selected: mode === "reader" });
  return K.renderTabs({ label: L("主区", "Work area"), className: "work-tabs", tabs: tabs.map(({ id, label, selected }) => ({
    id, label, selected, attrs: { id: `tab-${id}`, "aria-controls": "main-panel", "data-act": "tab", "data-arg": id,
      "data-focus": `tab-${id}`, tabindex: selected ? 0 : -1, "data-craft-tip": label },
  })) });
}
function drawWorkspace() {
  const side = sidePane();
  workbench.innerHTML = `<div class="window-bar">
      <div class="window-project"><span class="project-sign">渡</span><span>渡口</span></div>
      ${mainTabs()}
    </div>
    <div class="desk${side && S.side ? " has-side" : ""}${S.mobileSide ? " has-mobile-side" : ""}">
      <div class="sheet main-pane">
        ${S.main === "coding" ? codingTask() : `<main id="main-panel" role="tabpanel" aria-labelledby="tab-${S.main}">
          ${S.main === "reader" ? reader("main") : materialStage("main")}
        </main>`}
      </div>
      ${S.mobileSide ? '<div class="side-scrim" data-act="close-side" aria-hidden="true"></div>' : ""}
      ${side}
    </div>
    ${dock()}`;
}

function drawPicker() {
  if (!choose) {
    if (picker.open) picker.close();
    return;
  }
  const active = S.readers.picker;
  picker.setAttribute("aria-labelledby", "picker-title");
  picker.innerHTML = `<div class="dialog-layout">
    <header class="dialog-head"><h2 id="picker-title">${t("pick")}</h2>
      ${button(t("close"), "close-picker", { glyph: "x", iconOnly: true, variant: "ghost", id: "close-picker" })}</header>
    <div class="material-stage picker-stage${S.scheme === "a" ? " is-split" : ""}${active ? " has-reader" : ""}">
      <div class="material-list">${sourceList("picker")}</div>
      <div class="material-detail">${active ? reader("picker") : ""}</div>
    </div>
  </div>`;
  if (!picker.open) picker.showModal();
}
function settingsRow(root, role) {
  const issue = fault(root);
  return `<div class="directory-setting">
    ${icon(role === "output" ? "output" : "folder")}
    <div class="setting-path"><strong>${E(sourceName(root))}</strong><span>${E(sources[root].path)}</span></div>
    ${issue ? badge(accessLabel(issue), "warning") : ""}
    ${issue ? button(issue === "missing" ? L("重新关联", "Locate folder") : L("恢复读取", "Restore access"),
      "recover", { attrs: { "data-arg": root }, id: `fix-${role}-${root}` }) : ""}
  </div>`;
}
function drawSettings() {
  if (!manage) {
    if (settings.open) settings.close();
    return;
  }
  const references = localVisible() ? ["brand", ...(["empty", "writing"].includes(S.scenario) ? [] : ["website"])] : [];
  settings.setAttribute("aria-labelledby", "settings-title");
  settings.innerHTML = `<div class="dialog-layout">
    <header class="dialog-head"><h2 id="settings-title">${t("manage")}</h2>
      ${button(t("close"), "close-settings", { glyph: "x", iconOnly: true, variant: "ghost", id: "close-settings" })}</header>
    <div class="settings-body scroll">
      <section><h3>${L("项目输出", "Project output")}</h3>
        ${S.output === "default" || ["empty", "writing"].includes(S.scenario)
          ? `<div class="directory-setting">${icon("output")}<div class="setting-path"><strong>${L("默认输出", "Default output")}</strong><span>~/Molis Work/outputs/website-refresh</span></div></div>`
          : settingsRow(S.output, "output")}
        ${S.scenario === "frozen" ? alert(L("输出目录已变更", "Output folder changed"),
          L("本轮仍在 website，下一轮从 website-v2 开始。", "This run stays in website. The next starts in website-v2."), { tone: "info" }) : ""}
      </section>
      <section><h3>${L("参考文件夹", "Reference folders")}</h3>
        ${references.length ? references.map((root) => settingsRow(root, "reference")).join("")
          : `<p class="settings-empty">${L("还没有参考文件夹。", "No reference folders yet.")}</p>`}
        ${["empty", "writing"].includes(S.scenario) && !S.extras.includes("brand")
          ? button(L("添加 brand-assets", "Add brand-assets"), "add-brand", { glyph: "plus", variant: "primary" }) : ""}
      </section>
    </div>
    <footer class="settings-foot">${button(L("返回", "Done"), "close-settings", { id: "done-settings" })}</footer>
  </div>`;
  if (!settings.open) settings.showModal();
}

function applyPreferences() {
  document.documentElement.lang = S.lang === "zh" ? "zh-Hans" : "en";
  document.documentElement.dataset.theme = S.theme;
  document.documentElement.dataset.resolvedTheme = S.theme;
  document.title = `${t("materials")} · 06`;
  frame.dataset.width = S.width;
}
function applyNarrowFocus() {
  const main = workbench.querySelector(".main-pane");
  const side = workbench.querySelector(".side-pane");
  const task = workbench.querySelector(".task");
  if (main) main.inert = narrow() && S.mobileSide;
  if (side) side.inert = narrow() && !S.mobileSide;
  if (task) task.inert = narrow() && S.codingFiles && !S.mobileSide;
  workbench.querySelector('[data-focus="toggle-side"]')?.setAttribute("aria-pressed", String(narrow() ? S.mobileSide : S.side));
}
function render({ target, controls = false } = {}) {
  const previous = target ?? document.activeElement?.dataset.focus;
  if (controls) {
    applyPreferences();
    drawPrototype();
  }
  drawWorkspace();
  drawPicker();
  drawSettings();
  applyNarrowFocus();
  restoreScroll();
  focus(previous);
  save();
}

function readObject(id, scope, anchor, { origin, revision } = {}) {
  const place = scope === "picker" ? "picker"
    : scope === "main" || S.scheme === "b" ? "main" : "side";
  if (scope === "coding") S.codingFiles = false;
  S.focus[scope] = anchor?.startsWith(`row-${scope}-`) ? anchor.slice(`row-${scope}-`.length) : id;
  const previous = S.readers[place];
  const standalone = place === "main" && (scope !== "main" || S.scheme === "b");
  const next = previous?.id === id && previous.origin === origin && !previous.historical ? previous : {
    id, count: id === "build" ? logPreviewLines : 0, revision: revision ?? (id === "guide" && S.scenario === "changed" ? 2 : 1), quote: null, snapshot: false,
  };
  S.readers[place] = {
    ...next, origin, from: scope, anchor, standalone, returnTo: S.main === "reader" ? previous?.returnTo ?? "coding" : S.main,
    sideHad: narrow() ? S.mobileSide : S.side,
  };
  if (place === "main") {
    S.main = standalone ? "reader" : "materials";
    S.mobileSide = false;
  }
  if (place === "side") {
    S.side = true;
    if (narrow()) S.mobileSide = true;
  }
  if (!origin) S.recent = [id, ...S.recent.filter((old) => old !== id)].slice(0, 5);
  return `title-${place}`;
}
function backReader(place) {
  const previous = S.readers[place];
  if (!previous) return;
  delete S.readers[place];
  if (place === "picker") return previous.anchor || "search-picker";
  if (place === "side") {
    if (previous.from === "coding" && !previous.sideHad) {
      if (narrow()) S.mobileSide = false;
      else S.side = false;
    }
    if (previous.from === "coding" && narrow() && previous.anchor?.startsWith("row-coding-")) {
      S.mobileSide = false;
      S.codingFiles = true;
    }
    return previous.anchor || "search-side";
  }
  if (previous.historical) {
    S.main = "coding";
    return previous.anchor || "draft";
  }
  S.main = previous.returnTo === "reader" ? "coding" : previous.returnTo;
  if (previous.from === "side" && narrow()) S.mobileSide = true;
  if (previous.from === "coding" && narrow() && previous.anchor?.startsWith("row-coding-")) S.codingFiles = true;
  if (previous.anchor === "promote" && (S.scheme !== "a" || !(S.side || S.mobileSide))) return "toggle-side";
  return previous.anchor || (previous.from === "main" ? "search-main" : "tab-coding");
}

const nativeSelections = new Map();
function captureSelection() {
  const selected = window.getSelection();
  if (!selected || selected.isCollapsed || !selected.rangeCount) return;
  const asElement = (node) => node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const range = selected.getRangeAt(0);
  const start = asElement(range.startContainer)?.closest("[data-part]");
  const end = asElement(range.endContainer)?.closest("[data-part]");
  const readerNode = start?.closest("[data-reader]");
  if (!start || !end || !readerNode || end.closest("[data-reader]") !== readerNode) return;
  const place = readerNode.dataset.reader;
  const r = S.readers[place];
  const text = selected.toString().trim();
  if (!r || !text || r.historical || fileBlocked(r.id)) return;
  nativeSelections.set(place, { id: r.id, revision: r.revision, text, from: Number(start.dataset.part), to: Number(end.dataset.part) });
}
function quoteRange(place, from, to) {
  const r = S.readers[place];
  const entries = isCode(r.id) ? codeFor(r.id, r.count, r.origin).map(plainCode) : textParts(r.id, r.revision).map((part) => part.text);
  return { from, to, text: entries.slice(from - 1, to).join(isCode(r.id) ? "\n" : "\n\n") };
}
function chooseQuote(place, quote) {
  const r = S.readers[place];
  r.quote = { text: quote.text, from: quote.from, to: quote.to };
  r.snapshot = false;
  nativeSelections.delete(place);
  const section = document.querySelector(`[data-reader="${place}"]`);
  const part = section?.querySelector(`[data-part="${quote.from}"]`);
  const scroll = section?.querySelector("[data-scroll]");
  if (part && scroll) {
    const top = part.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
    if (top < scroll.scrollTop || top > scroll.scrollTop + scroll.clientHeight - 32) {
      S.scroll[scroll.dataset.scroll] = Math.max(0, top - 24);
    }
  }
  say(L("已选取这段内容", "Excerpt selected"));
  return `attach-${place}`;
}
function addReference(place) {
  const r = S.readers[place];
  if (!r || fileBlocked(r.id) || r.historical) return;
  if (!r.quote && (outdated(r) || r.id === "build" && r.count < logLines)) return;
  const mode = r.quote || r.snapshot || files[r.id].fixed ? "fixed" : "current";
  const match = S.refs.find((ref) => ref.id === r.id && ref.origin === r.origin && ref.mode === mode && ref.revision === r.revision
    && ref.quote?.text === r.quote?.text && ref.quote?.from === r.quote?.from);
  const ref = match ?? {
    id: r.id, origin: r.origin, mode, revision: r.revision, count: r.count, quote: r.quote, key: String(Date.now()),
  };
  if (!match) S.refs.push(ref);
  say(match ? L("这份引用已在任务里", "This reference is already in the task") : L("已加入当前任务", "Added to the current task"), match ? "" : ref.key);
  if (place === "picker") choose = null;
  if (narrow()) {
    S.mobileSide = false;
    S.codingFiles = false;
  }
  S.main = "coding";
  return `ref-${ref.key}`;
}
function removeReference(key) {
  S.refs = S.refs.filter((ref) => ref.key !== key);
  say(L("已移除引用", "Reference removed"));
  return "draft";
}
function openReference(key, anchor) {
  const ref = S.refs.find((candidate) => candidate.key === key);
  if (ref.mode === "current") return readObject(ref.id, "coding", anchor, { origin: ref.origin });
  S.readers.main = {
    id: ref.id, origin: ref.origin, revision: ref.revision, count: ref.count, historical: true, quote: ref.quote, snapshot: !ref.quote,
    from: "coding", anchor, standalone: true, returnTo: "coding",
  };
  S.main = "reader";
  S.mobileSide = false;
  return "title-main";
}

function openMenu(trigger) {
  const layer = $(trigger.dataset.menu);
  if (!layer) return;
  if (layer.matches(":popover-open")) {
    layer.hidePopover();
    return;
  }
  const anchor = trigger.getBoundingClientRect();
  layer.showPopover();
  const { width, height } = layer.getBoundingClientRect();
  layer.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))}px`;
  layer.style.top = `${anchor.bottom + height + 12 > window.innerHeight
    ? Math.max(8, anchor.top - height - 8) : anchor.bottom + 8}px`;
  trigger.setAttribute("aria-expanded", "true");
  layer.addEventListener("toggle", (event) => {
    if (event.newState === "closed") trigger.setAttribute("aria-expanded", "false");
  });
  menuAnchor = trigger.dataset.focus;
  const items = [...layer.querySelectorAll("[role^='menuitem']")];
  const current = items.find((item) => item.getAttribute("aria-checked") === "true") ?? items[0];
  items.forEach((item) => { item.tabIndex = item === current ? 0 : -1; });
  current?.focus({ preventScroll: true });
}

function activateScenario(value) {
  S.scenario = value;
  S.recovered = {};
  toast = null;
  window.clearTimeout(feedbackTimer);
  if (["empty", "writing"].includes(value)) {
    S.readers = {};
    S.browsing = "website";
    S.main = "coding";
    S.side = true;
    S.mobileSide = narrow();
    S.codingFiles = false;
    S.draft = value === "writing" ? "用项目里的访谈纪要和改版需求写一段开放通知。" : "";
    S.delivered = "";
    S.refs = [];
    S.extras = [];
    S.output = "default";
  } else {
    S.output = value === "frozen" ? "next" : "website";
    if (["changed", "missing", "revoked", "large"].includes(value)) {
      const id = value === "large" ? "build" : "guide";
      return readObject(id, "side", `row-side-recent-${id}`, { revision: 1 });
    }
    if (["frozen", "worktree", "outputMissing"].includes(value)) {
      S.main = "coding";
      S.browsing = "website";
      S.mobileSide = false;
      S.codingFiles = narrow();
    }
  }
  return narrow() && S.mobileSide ? "search-side" : "task-title";
}

const acts = {
  scheme: ({ arg }) => {
    if (arg === S.scheme) return;
    S.scheme = arg;
    const current = S.readers.side;
    if (arg === "b" && current && (S.side || S.mobileSide)) {
      S.readers.main = { ...current, standalone: true, returnTo: S.main === "reader" ? "coding" : S.main };
      delete S.readers.side;
      S.main = "reader";
      S.mobileSide = false;
      return "title-main";
    }
    return `scheme-${arg}`;
  },
  lang: ({ arg }) => { S.lang = arg; return `lang-${arg}`; },
  theme: ({ arg }) => { S.theme = arg; return `theme-${arg}`; },
  width: ({ arg }) => {
    S.width = arg;
    if (arg !== "390") S.mobileSide = false;
    return `width-${arg}`;
  },
  scenario: ({ arg }) => activateScenario(arg),
  reopen: () => { save(); location.reload(); return false; },
  reset: () => {
    S = initialState();
    choose = null;
    manage = null;
    toast = null;
    nativeSelections.clear();
    return `scheme-${S.scheme}`;
  },
  tab: ({ arg }) => { S.main = arg; S.mobileSide = false; S.codingFiles = false; return `tab-${arg}`; },
  task: () => { S.main = "coding"; S.mobileSide = false; S.codingFiles = false; return "task-title"; },
  "toggle-side": () => {
    if (narrow()) {
      S.mobileSide = !S.mobileSide;
      S.codingFiles = false;
      if (!S.mobileSide) return "toggle-side";
    } else {
      S.side = !S.side;
      if (!S.side) return "toggle-side";
    }
    return S.scheme === "a" && S.readers.side ? "title-side" : "search-side";
  },
  "close-side": () => {
    if (!narrow()) S.side = false;
    S.mobileSide = false;
    return "toggle-side";
  },
  "toggle-coding-files": () => { S.codingFiles = !S.codingFiles; return S.codingFiles ? "coding-folder-menu" : "toggle-coding-files"; },
  "close-coding-files": () => { S.codingFiles = false; return "toggle-coding-files"; },
  "coding-folder": ({ arg }) => { S.browsing = arg; S.scroll["source-coding"] = 0; return "coding-folder-menu"; },
  "back-working": () => { S.browsing = "website"; S.scroll["source-coding"] = 0; return "coding-folder-menu"; },
  branch: ({ arg, place }, node) => {
    S.expanded[`${place}/${arg}`] = node.getAttribute("aria-expanded") !== "true";
    return node.dataset.focus;
  },
  "clear-search": ({ place }) => { S.query[place] = ""; return `search-${place}`; },
  read: ({ arg, place }, node) => {
    nativeSelections.clear();
    const fromWorktree = place === "coding" && files[arg].root === "website" && S.scenario === "worktree";
    return readObject(arg, place, node.dataset.focus, { origin: fromWorktree ? worktreeName : undefined });
  },
  "back-reader": ({ place }) => backReader(place),
  promote: (_, node) => {
    const r = S.readers.side;
    S.readers.main = { ...r, standalone: true, from: "side", anchor: node.dataset.focus, returnTo: S.main };
    S.scroll[`read-main-${r.id}`] = S.scroll[`read-side-${r.id}`];
    S.main = "reader";
    S.mobileSide = false;
    return "title-main";
  },
  picker: (_, node) => {
    choose = { anchor: node.dataset.focus };
    delete S.readers.picker;
    return "search-picker";
  },
  "close-picker": () => {
    const anchor = choose.anchor;
    choose = null;
    delete S.readers.picker;
    return anchor;
  },
  manage: ({ arg }, node) => {
    const anchor = node.dataset.focus;
    const reader = node.closest("[data-reader]")?.dataset.reader;
    const list = node.closest("[data-list]")?.dataset.list;
    const afterRecovery = reader ? `title-${reader}`
      : list === "coding" ? "coding-folder-menu"
      : list ? `branch-${list}-${arg}` : anchor;
    manage = { anchor, afterRecovery };
    return arg === "add" ? "add-brand" : "close-settings";
  },
  "close-settings": () => { const anchor = manage.anchor; manage = null; return anchor; },
  recover: ({ arg }) => {
    S.recovered[arg] = true;
    const { afterRecovery } = manage;
    manage = null;
    say(L("已恢复读取", "Read access restored"));
    return afterRecovery;
  },
  "add-brand": () => {
    S.extras = [...new Set([...S.extras, "brand"])];
    manage = null;
    return picker.open ? "row-picker-guide" : "row-side-guide";
  },
  import: () => {
    S.extras = [...new Set([...S.extras, "imported"])];
    return picker.open ? "row-picker-visits" : "row-side-visits";
  },
  "refresh-file": ({ arg }) => {
    const r = S.readers[arg];
    r.revision = 2;
    r.quote = null;
    r.snapshot = false;
    S.scroll[`read-${arg}-${r.id}`] = 0;
    nativeSelections.delete(arg);
    say(L("已刷新文件内容", "File refreshed"));
    return `title-${arg}`;
  },
  "read-rest": ({ arg }) => { S.readers[arg].count = logLines; return `snapshot-${arg}`; },
  quote: ({ place }, node) => {
    const selected = nativeSelections.get(place);
    const r = S.readers[place];
    if (selected?.id === r.id && selected.revision === r.revision) return chooseQuote(place, selected);
    openMenu(node);
    return false;
  },
  range: ({ arg, place }) => {
    const [from, to] = arg.split(":").map(Number);
    return chooseQuote(place, quoteRange(place, from, to));
  },
  snapshot: ({ place }) => {
    const r = S.readers[place];
    r.snapshot = true;
    r.quote = null;
    nativeSelections.delete(place);
    return `attach-${place}`;
  },
  "clear-quote": ({ place }) => {
    const r = S.readers[place];
    r.quote = null;
    r.snapshot = false;
    nativeSelections.delete(place);
    return `quote-${place}`;
  },
  attach: ({ place }) => addReference(place),
  "read-ref": ({ arg }, node) => openReference(arg, node.dataset.focus),
  "remove-ref": ({ arg }) => removeReference(arg),
  "undo-ref": ({ arg }) => removeReference(arg),
  send: () => {
    if (fault(S.output) || !S.draft.trim()) return;
    S.delivered = S.draft;
    S.draft = "";
    return "draft";
  },
};

document.addEventListener("click", (event) => {
  const node = event.target.closest("[data-act]");
  if (!node || node.disabled) return;
  const { act, arg } = node.dataset;
  if (act === "open-menu") {
    openMenu(node);
    return;
  }
  rememberScroll();
  const result = acts[act]?.(node.dataset, node);
  if (result !== false) render({ target: result, controls: ["scheme", "lang", "theme", "width", "scenario", "reset"].includes(act) });
});

document.addEventListener("input", (event) => {
  const node = event.target;
  if (node.matches("[data-draft]")) {
    S.draft = node.value;
    save();
  }
  if (node.matches("[data-query]")) {
    const scope = node.dataset.query;
    S.query[scope] = node.value;
    const area = document.querySelector(`[data-list="${scope}"]`);
    area.innerHTML = sourceContents(scope);
    area.scrollTop = 0;
    save();
  }
});
document.addEventListener("selectionchange", captureSelection);
document.addEventListener("pointerup", (event) => {
  const readerNode = event.target.closest(".reader-scroll")?.closest("[data-reader]");
  if (readerNode && window.getSelection()?.isCollapsed) nativeSelections.delete(readerNode.dataset.reader);
  else captureSelection();
});

picker.addEventListener("cancel", (event) => {
  event.preventDefault();
  rememberScroll();
  render({ target: acts["close-picker"]() });
});
settings.addEventListener("cancel", (event) => {
  event.preventDefault();
  rememberScroll();
  render({ target: acts["close-settings"]() });
});
document.addEventListener("keydown", (event) => {
  const node = event.target;
  const layer = node.closest("[popover]");
  if (event.key === "Escape") {
    if (layer?.matches(":popover-open")) {
      event.preventDefault();
      layer.hidePopover();
      focus(menuAnchor);
      return;
    }
    if (settings.open || picker.open) return;
    if (narrow() && S.codingFiles) {
      event.preventDefault();
      render({ target: acts["close-coding-files"]() });
    } else if (narrow() && S.mobileSide) {
      event.preventDefault();
      const target = S.readers.side ? backReader("side") : acts["close-side"]();
      render({ target });
    }
    return;
  }
  const list = node.closest("[data-list]");
  if (!list || !node.matches("[data-list-row]")) return;
  const direction = ["ArrowUp", "ArrowDown"];
  const candidates = [...list.querySelectorAll("[data-list-row]")];
  if (!candidates.includes(node)) return;
  if (!direction.includes(event.key) && !["Home", "End"].includes(event.key)) return;
  const index = candidates.indexOf(node);
  const next = event.key === "Home" ? 0 : event.key === "End" ? candidates.length - 1
    : (index + (event.key === direction[0] ? -1 : 1) + candidates.length) % candidates.length;
  event.preventDefault();
  candidates[next].focus({ preventScroll: true });
  candidates[next].scrollIntoView({ block: "nearest", inline: "nearest" });
});
window.addEventListener("resize", applyNarrowFocus);
window.addEventListener("pagehide", () => { rememberScroll(); save(); });

$("icons").innerHTML = window.mwKitSprite;
const client = document.createElement("script");
client.textContent = window.mwKitClient;
document.body.appendChild(client);
render({ controls: true });
if (!load()?.booted) {
  S.booted = true;
  let target;
  if (query.get("view") === "materials") S.main = "materials";
  if (query.get("view") === "reader") target = readObject("guide", "side", "row-side-recent-guide");
  if (query.get("view") === "picker") {
    choose = { anchor: "picker" };
    target = readObject("guide", "picker", "row-picker-recent-guide");
  }
  if (S.scenario !== "normal") target = activateScenario(S.scenario);
  render({ target: choose || S.scenario !== "normal" ? target : undefined });
}
