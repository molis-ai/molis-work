import { icon } from "../../../packages/design-system/src/icons.ts";
import { renderButton, renderInput, renderTextarea, renderSelect, escapeHtml } from "../../../packages/design-system/src/primitives/index.ts";

export type MaterialLayout = "list" | "table" | "cards";
export type MaterialMode = "building" | "try" | "standalone";
export interface MaterialAssembly { uiStep: number; featureStep: number; cardCount?: number; }
export interface MaterialPreviewOptions {
  mode: MaterialMode;
  layout: MaterialLayout;
  stage: number;
  name?: string;
  bulk?: boolean;
  onInspect?: (id: string) => void;
  onAction?: (message: string) => void;
  onLayout?: (layout: MaterialLayout) => void;
}

interface Material {
  id: string;
  title: string;
  source: string;
  url: string;
  tag: string;
  note: string;
  date: string;
  cover?: "architecture" | "book" | "nature" | "lake";
}

const STORAGE_KEY = "molis.plugin-builder.inspiration-library.demo.v3";
const TAGS = ["全部", "设计", "产品", "阅读"] as const;
const COVER_TAGS = {
  architecture: ["室内设计", "生活方式", "空间"],
  book: ["设计理念", "极简", "生活"],
  nature: ["自然", "摄影", "灵感"],
  lake: ["旅行", "自我成长", "生活"],
};
const SEED: Material[] = [
  { id: "space-order", title: "空间里的秩序", source: "空间观察", url: "", tag: "设计", note: "光线、材质与留白，让日常也变得安静而有力量。", date: "2026-09-22", cover: "architecture" },
  { id: "less-better", title: "少，但更好", source: "阅读摘记", url: "", tag: "阅读", note: "真正重要的不是拥有更多，而是只保留必要的部分。", date: "2026-09-21", cover: "book" },
  { id: "nature-rhythm", title: "自然的节奏", source: "自然手记", url: "", tag: "设计", note: "从一片叶子中，看到时间的秩序与生命的韧性。", date: "2026-09-20", cover: "nature" },
  { id: "on-the-road", title: "在路上，看见更大的自己", source: "旅行笔记", url: "", tag: "产品", note: "旅行不只是去远方，更是重新看见日常。", date: "2026-09-19", cover: "lake" },
];

function validMaterial(value: unknown): value is Material {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["id", "title", "source", "url", "tag", "note", "date"].every((key) => typeof row[key] === "string")
    && String(row.id).length > 0 && String(row.title).length > 0
    && String(row.title).length <= 160 && String(row.note).length <= 4000
    && TAGS.slice(1).includes(row.tag as never)
    && (row.cover === undefined || ["architecture", "book", "nature", "lake"].includes(String(row.cover)))
    && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date));
}

function decodeStored(raw: string): Material[] {
  const value = JSON.parse(raw) as { version?: unknown; items?: unknown };
  if (value?.version !== 1 || !Array.isArray(value.items) || value.items.length > 2000 || !value.items.every(validMaterial)) {
    throw new Error("保存的数据格式无法识别");
  }
  if (new Set(value.items.map((item) => item.id)).size !== value.items.length) throw new Error("素材标识重复");
  return value.items;
}

/** A local demonstration artifact. Stage updates retain all existing form/input nodes. */
export function mountMaterialApp(container: HTMLElement, options: MaterialPreviewOptions) {
  let stage = Math.max(0, Math.min(7, options.stage));
  let assembly: MaterialAssembly | null = null;
  let layout = options.layout;
  let mode = options.mode;
  let name = options.name?.trim() || "灵感库";
  let bulk = options.bulk ?? true;
  let items = SEED.map((item) => ({ ...item }));
  let storageIssue = "";
  let search = "";
  let currentTag = "全部";
  let sortOrder = "newest";
  let editingId: string | null = null;
  let activeBeforeDialog: HTMLElement | null = null;
  let destroyed = false;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const selected = new Set<string>();
  const events = new AbortController();
  const revealed = new WeakSet<HTMLElement>();
  const revealTimers = new Set<ReturnType<typeof setTimeout>>();
  const uid = `mp-${Math.random().toString(36).slice(2, 9)}`;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) items = decodeStored(raw);
  } catch {
    storageIssue = "已有本地数据暂时无法读取。当前展示示例，保存已暂停，原数据不会被覆盖。";
  }

  const root = document.createElement("section");
  root.className = "mp-app";
  root.dataset.buildPart = "frame";
  root.setAttribute("aria-label", name);
  const featureFlag = (id: string, text: string) => `<span class="mp-feature-flag" data-mp-feature="${id}" data-state="pending"><span class="mp-feature-dot" aria-hidden="true"></span>${icon("check", "mp-feature-check")}<span data-mp-feature-label>${text}</span></span>`;
  root.innerHTML = `
    <div class="mp-unbuilt"><span>${icon("frame")}</span><p>界面将在这里逐步生长</p><small>等待装配第一个组件</small></div>
    <header class="mp-heading" data-mp-region="header">
      <div class="mp-heading-main" data-build-part="title"><span class="mp-app-mark">${icon("bookmark")}</span><div><h1>${escapeHtml(name)}</h1><p>把好想法留在这里。</p></div></div>
      <div class="mp-heading-actions"><div class="mp-export-wrap" data-build-part="export"><span class="mp-selected-count" data-mp-selected></span>${renderButton({ label: "导出", icon: "upload", variant: "ghost", attrs: { "data-mp-action": "export" } })}${featureFlag("export", "待连接")}</div><div class="mp-add-wrap" data-build-part="add">${renderButton({ label: "收集灵感", icon: "plus", variant: "primary", attrs: { "data-mp-action": "add", "aria-label": "收集灵感" } })}${featureFlag("save", "保存待连接")}</div></div>
    </header>
    <div class="mp-toolbar" data-mp-region="toolbar">
      <div class="mp-search-block" data-build-part="search"><div class="mp-search">${icon("search")}${renderInput({ type: "search", placeholder: "搜索灵感…", attrs: { "aria-label": "搜索灵感", "data-mp-search": "", autocomplete: "off" } })}</div>${featureFlag("filter", "搜索待连接")}</div>
      <div class="mp-filters" data-build-part="filters" role="group" aria-label="按标签筛选">${TAGS.map((tag) => `<button type="button" class="mp-filter${tag === "全部" ? " is-active" : ""}" data-mp-tag="${tag}" aria-pressed="${tag === "全部"}">${tag}<span data-mp-tag-count="${tag}" hidden></span></button>`).join("")}</div>
      <div class="mp-sort"><select aria-label="灵感排序" data-mp-sort><option value="newest">最新优先</option><option value="oldest">最早优先</option></select>${icon("chevron-down")}</div>
      <div class="mp-view-switch" role="group" aria-label="素材布局">
        ${([['list', 'rows', '列表'], ['table', 'columns', '表格'], ['cards', 'grid', '卡片']] as const).map(([value, glyph, label]) => renderButton({ label, icon: glyph, iconOnly: true, variant: "ghost", size: "icon", attrs: { "data-mp-layout": value, title: label, "aria-pressed": layout === value } })).join("")}
      </div>
    </div>
    <div class="mp-collection" data-mp-region="content" data-build-part="content">
      <div class="mp-collection-meta"><div class="mp-data-meta"><span data-mp-count></span>${featureFlag("data", "数据待连接")}</div></div>
      <div class="mp-table-heading" aria-hidden="true"><span></span><span>素材</span><span>标签</span><span>来源</span><span>收录时间</span><span></span></div>
      <div class="mp-items" role="list"><button type="button" class="mp-reserved-slot" data-mp-action="add" hidden>${icon("plus")}<span>继续添加灵感<br>让好想法不再丢失</span></button></div>
      <div class="mp-empty" hidden>${icon("search")}<h2>没有找到这条灵感</h2><p>试试其他关键词，或看看全部素材。</p>${renderButton({ label: "清除筛选", variant: "secondary", attrs: { "data-mp-action": "clear" } })}</div>
    </div>
    <footer class="mp-footer"><span><span data-mp-storage-label>示例灵感 · 图片为生成示意</span></span><span class="mp-connection" data-mp-connection></span></footer>
    <div class="mp-notice" role="status" aria-live="polite" hidden></div>
    <dialog class="mp-dialog" aria-labelledby="${uid}-dialog-title">
      <form class="mp-form" novalidate>
        <div class="mp-dialog-header"><div><h2 id="${uid}-dialog-title">收集灵感</h2><p>留下一条值得回来看的线索。</p></div>${renderButton({ label: "关闭", icon: "x", iconOnly: true, variant: "ghost", size: "icon", attrs: { "data-mp-action": "close" } })}</div>
        <div class="mp-dialog-body">
          <label class="mp-field" for="${uid}-title"><span>标题 <small>必填</small></span>${renderInput({ id: `${uid}-title`, name: "title", placeholder: "这条灵感讲了什么？", required: true, attrs: { maxlength: 160, autocomplete: "off" } })}</label>
          <label class="mp-field" for="${uid}-url"><span>链接 <small>可选</small></span>${renderInput({ id: `${uid}-url`, name: "url", type: "url", placeholder: "https://", attrs: { maxlength: 2000 } })}</label>
          <label class="mp-field" for="${uid}-tag"><span>标签</span>${renderSelect({ id: `${uid}-tag`, name: "tag", optionsHtml: TAGS.slice(1).map((tag) => `<option>${tag}</option>`).join("") })}</label>
          <label class="mp-field" for="${uid}-note"><span>我的笔记 <small>可选</small></span>${renderTextarea({ id: `${uid}-note`, name: "note", rows: 5, placeholder: "为什么值得保存？以后可以用在哪里？", attrs: { maxlength: 4000 } })}</label>
          <p class="mp-form-error" id="${uid}-form-error" role="alert" hidden></p>
          <p class="mp-form-hint">${icon("database")}仅保存在当前浏览器的本地演示数据中。</p>
        </div>
        <div class="mp-dialog-footer"><span data-mp-save-state></span><div>${renderButton({ label: "取消", variant: "ghost", attrs: { "data-mp-action": "close" } })}${renderButton({ label: "保存素材", icon: "check", type: "submit" })}</div></div>
      </form>
    </dialog>`;
  container.append(root);

  const el = <T extends Element = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const heading = el(".mp-heading");
  const toolbar = el(".mp-toolbar");
  const collection = el(".mp-collection");
  const list = el(".mp-items");
  const footer = el(".mp-footer");
  const dialog = el<HTMLDialogElement>(".mp-dialog");
  const form = el<HTMLFormElement>(".mp-form");
  const notice = el(".mp-notice");
  const error = el(".mp-form-error");
  const rows = new Map<string, HTMLElement>();
  const reservedSlot = el<HTMLButtonElement>(".mp-reserved-slot");

  function feedback(message: string) {
    if (destroyed) return;
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 6500);
    options.onAction?.(message);
  }

  function rowHTML(item: Material) {
    const tags = item.cover ? COVER_TAGS[item.cover] : [item.tag];
    const sourceLink = /^https?:\/\//i.test(item.url) ? item.url : "";
    return `${item.cover ? `<button type="button" class="mp-item-cover mp-cover-${item.cover}" data-mp-edit="${escapeHtml(item.id)}" aria-label="查看 ${escapeHtml(item.title)}"></button>` : ""}<span class="mp-row-check"><input class="mw-check" type="checkbox" aria-label="选择 ${escapeHtml(item.title)}" data-build-part="select" data-mp-select="${escapeHtml(item.id)}"></span>
      <div class="mp-item-copy"><button type="button" class="mp-item-title" data-mp-edit="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button><p>${escapeHtml(item.note)}</p><div class="mp-card-tags">${tags.map((tag) => `<span># ${escapeHtml(tag)}</span>`).join("")}</div><div class="mp-item-subline"><span>${escapeHtml(item.source)}</span><span>·</span><time datetime="${item.date}">${escapeHtml(item.date.replaceAll("-", "."))}</time></div></div>
      <span class="mp-item-tag"><span class="mp-tag">${escapeHtml(item.tag)}</span></span>
      <span class="mp-item-source">${escapeHtml(item.source)}</span><time class="mp-item-date" datetime="${item.date}">${escapeHtml(item.date.slice(5).replace("-", "/"))}</time>
      <span class="mp-item-edit">${sourceLink ? `<a class="mp-source-link" href="${escapeHtml(sourceLink)}" target="_blank" rel="noopener noreferrer" aria-label="打开 ${escapeHtml(item.source)}">${icon("external")}</a>` : ""}${renderButton({ label: `编辑 ${item.title}`, icon: "more", iconOnly: true, variant: "ghost", size: "icon", attrs: { "data-mp-edit": item.id } })}</span><span class="mp-target-handles" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
  }

  function reconcileRows() {
    for (const [id, row] of rows) {
      if (!items.some((item) => item.id === id)) { row.remove(); rows.delete(id); selected.delete(id); }
    }
    for (const item of items) {
      let row = rows.get(item.id);
      const fingerprint = JSON.stringify(item);
      if (!row) {
        row = document.createElement("article");
        row.className = "mp-item";
        row.setAttribute("role", "listitem");
        row.dataset.mpId = item.id;
        if (item.id === "on-the-road") row.dataset.buildPart = "card";
        rows.set(item.id, row);
      }
      if (row.dataset.mpFingerprint !== fingerprint) {
        row.innerHTML = rowHTML(item);
        row.dataset.mpFingerprint = fingerprint;
      }
    }
    // Existing rows keep their nodes and order. Only newly created materials are inserted.
    for (let index = items.length - 1; index >= 0; index--) {
      const row = rows.get(items[index].id)!;
      if (row.parentElement !== list) list.insertBefore(row, index + 1 < items.length ? rows.get(items[index + 1].id)! : reservedSlot);
    }
    applyFilter();
  }

  function applyFilter() {
    const query = stage >= 6 ? search.trim().toLocaleLowerCase() : "";
    // The build timeline counts its four demonstration cards; user-created notes stay visible.
    const cardLimit = assembly?.cardCount === undefined ? items.length : assembly.cardCount + Math.max(0, items.length - SEED.length);
    const ordered = sortOrder === "oldest" ? [...items].sort((a, b) => a.date.localeCompare(b.date)) : items;
    const visibleItems: Material[] = [];
    let visible = 0;
    for (const item of ordered) {
      const row = rows.get(item.id)!;
      const matches = items.indexOf(item) < cardLimit && (!query || `${item.title} ${item.note} ${item.source}`.toLocaleLowerCase().includes(query))
        && (stage < 6 || currentTag === "全部" || item.tag === currentTag);
      row.hidden = !matches;
      row.classList.toggle("is-selected", bulk && hasPart("select") && selected.has(item.id));
      const checkbox = row.querySelector<HTMLInputElement>("[data-mp-select]")!;
      checkbox.checked = bulk && hasPart("select") && selected.has(item.id);
      checkbox.disabled = stage < 7 || !bulk || !hasPart("select");
      showRegion(row.querySelector<HTMLElement>(".mp-row-check")!, bulk && hasPart("select"));
      if (matches) { visible++; visibleItems.push(item); }
      if (!row.hidden) revealRegion(row);
    }
    // CSS order changes the arrangement without replacing any material/input node.
    ordered.forEach((item, index) => { rows.get(item.id)!.style.order = String(index); });
    const seedMosaic = !query && (stage < 6 || currentTag === "全部") && sortOrder === "newest" && items.length === SEED.length && items.every((item, index) => item.id === SEED[index].id);
    list.dataset.mosaic = String(seedMosaic);
    visibleItems.forEach((item, index) => { rows.get(item.id)!.dataset.mpPosition = String(index + 1); });
    const showSlot = mode === "building" && assembly?.cardCount !== undefined && hasPart("content") && !query && currentTag === "全部" && layout === "cards";
    reservedSlot.hidden = !showSlot;
    reservedSlot.style.order = String(items.length);
    el("[data-mp-count]").textContent = assembly?.featureStep === 0 ? "示例布局" : visible === items.length ? `${items.length} 条灵感` : `${visible} / ${items.length} 条灵感`;
    el("[data-mp-selected]").textContent = bulk && hasPart("select") && selected.size ? `已选择 ${selected.size} 条` : "";
    el("[data-mp-action='export'] [data-slot='button-label']").textContent = bulk && selected.size ? "导出已选" : "导出";
    el(".mp-empty").hidden = visible > 0 || cardLimit === 0;
    root.querySelectorAll<HTMLElement>("[data-mp-tag-count]").forEach((node) => {
      const tag = node.dataset.mpTagCount;
      node.textContent = String(tag === "全部" ? items.length : items.filter((item) => item.tag === tag).length);
    });
  }

  function revealRegion(node: HTMLElement) {
    if (revealed.has(node)) return;
    revealed.add(node);
    node.classList.add("mp-reveal");
    const timer = setTimeout(() => { node.classList.remove("mp-reveal"); revealTimers.delete(timer); }, 230);
    revealTimers.add(timer);
  }

  function showRegion(node: HTMLElement, visible: boolean) {
    node.hidden = !visible;
    if (visible) revealRegion(node);
  }

  function hasPart(part: "frame" | "title" | "search" | "filters" | "content" | "add" | "select" | "export") {
    const assemblySteps = { frame: 1, title: 2, search: 3, filters: 4, content: 5, add: 6, select: 7, export: 8 };
    const legacySteps = { frame: 1, title: 1, search: 2, filters: 2, content: 3, add: 4, select: 3, export: 3 };
    return assembly ? assembly.uiStep >= assemblySteps[part] : stage >= legacySteps[part];
  }

  function updateFeatureFlag(id: string, connected: boolean, pending: string, ready: string) {
    const flag = el(`[data-mp-feature='${id}']`);
    flag.hidden = !assembly || mode === "standalone";
    flag.dataset.state = connected ? "connected" : "pending";
    flag.querySelector<HTMLElement>("[data-mp-feature-label]")!.textContent = connected ? ready : pending;
  }

  function syncStage() {
    root.dataset.mode = mode;
    root.dataset.layout = layout;
    root.dataset.stage = String(stage);
    root.dataset.bulk = String(bulk && hasPart("select"));
    root.dataset.assembly = String(!!assembly);
    root.dataset.assemblyUi = assembly ? String(assembly.uiStep) : "";
    root.dataset.assemblyFeature = assembly ? String(assembly.featureStep) : "";
    el(".mp-unbuilt").hidden = !!assembly || stage > 0;
    if (hasPart("frame")) revealRegion(root);
    showRegion(heading, hasPart("title"));
    showRegion(toolbar, hasPart("search"));
    showRegion(el(".mp-search-block"), hasPart("search"));
    showRegion(el(".mp-view-switch"), hasPart("search"));
    showRegion(el(".mp-sort"), hasPart("filters"));
    showRegion(el(".mp-filters"), hasPart("filters"));
    showRegion(collection, hasPart("content"));
    showRegion(footer, assembly ? hasPart("content") : stage >= 1);
    showRegion(el(".mp-add-wrap"), hasPart("add"));
    showRegion(el(".mp-export-wrap"), hasPart("export"));
    root.classList.toggle("mp-data-pending", assembly?.featureStep === 0);
    updateFeatureFlag("data", !assembly || assembly.featureStep >= 1, "数据待连接", "数据已接通");
    updateFeatureFlag("save", stage >= 5 && !storageIssue, storageIssue ? "保存不可用" : "保存待连接", "保存已接通");
    updateFeatureFlag("filter", stage >= 6, "搜索待连接", "筛选已接通");
    updateFeatureFlag("export", stage >= 7 && hasPart("export"), "待连接", "已接通");
    el<HTMLInputElement>("[data-mp-search]").placeholder = "搜索灵感…";
    el("[data-mp-save-state]").textContent = stage < 5 ? "功能待连接" : "保存到此浏览器";
    el("[data-mp-storage-label]").textContent = stage >= 5 ? "保存在此浏览器 · 图片为生成示意" : "示例灵感 · 图片为生成示意";
    const connection = el("[data-mp-connection]");
    connection.textContent = storageIssue ? "本地保存不可用" : stage >= 7 ? hasPart("export") ? "所有动作已接通" : "等待界面装配" : stage >= 6 ? "导出待连接" : stage >= 5 ? "筛选待连接" : "功能待连接";
    connection.classList.toggle("is-connected", stage >= 7 && hasPart("export") && !storageIssue);
    root.querySelectorAll<HTMLButtonElement>("[data-mp-layout]").forEach((button) => {
      const active = button.dataset.mpLayout === layout;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    applyFilter();
  }

  function field(name: string) { return form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; }

  function clearErrors() {
    error.hidden = true;
    delete error.dataset.field;
    form.querySelectorAll("[aria-invalid]").forEach((node) => { node.removeAttribute("aria-invalid"); node.removeAttribute("aria-describedby"); });
  }

  function fieldError(name: string, message: string) {
    error.textContent = message;
    error.dataset.field = name;
    error.hidden = false;
    field(name).setAttribute("aria-invalid", "true");
    field(name).setAttribute("aria-describedby", `${uid}-form-error`);
    field(name).focus();
  }

  function showEditor(id: string | null) {
    if (assembly ? !hasPart("add") : stage < 3) { feedback("录入界面还在构建中，功能待连接。"); return; }
    const item = items.find((row) => row.id === id);
    editingId = item?.id ?? null;
    el(`#${uid}-dialog-title`).textContent = item ? "编辑灵感" : "收集灵感";
    field("title").value = item?.title ?? "";
    field("url").value = item?.url ?? "";
    field("tag").value = item?.tag ?? "设计";
    field("tag").dispatchEvent(new Event("change", { bubbles: true }));
    field("note").value = item?.note ?? "";
    clearErrors();
    activeBeforeDialog = document.activeElement as HTMLElement | null;
    dialog.showModal();
    field("title").focus();
  }

  function closeEditor() {
    dialog.close();
    if (activeBeforeDialog?.isConnected) activeBeforeDialog.focus();
    else el<HTMLButtonElement>("[data-mp-action='add']").focus();
  }

  function saveMaterial(event: Event) {
    event.preventDefault();
    clearErrors();
    if (stage < 5 || (assembly && !hasPart("add"))) {
      error.textContent = "功能待连接：保存能力尚未接通。你输入的内容会保留在这里。";
      error.hidden = false;
      feedback("保存功能待连接，尚未写入数据。");
      return;
    }
    const title = field("title").value.trim();
    const url = field("url").value.trim();
    let sourceHost = "";
    if (!title) { fieldError("title", "请填写素材标题，方便以后找到这条灵感。"); return; }
    if (title.length > 160) { fieldError("title", "标题不能超过 160 个字符，请缩短后保存。"); return; }
    if (url && !/^https?:\/\//i.test(url)) {
      fieldError("url", "链接需要以 http:// 或 https:// 开头。"); return;
    }
    if (url) {
      try { sourceHost = new URL(url).hostname.replace(/^www\./, ""); }
      catch { fieldError("url", "请填写完整的网页链接，例如 https://example.com。"); return; }
    }
    if (url.length > 2000) { fieldError("url", "链接不能超过 2000 个字符。"); return; }
    if (field("note").value.trim().length > 4000) { fieldError("note", "笔记不能超过 4000 个字符，请缩短后保存。"); return; }
    if (storageIssue) { error.textContent = storageIssue; error.hidden = false; return; }
    let latest: Material[];
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      latest = current === null ? items : decodeStored(current);
    } catch {
      storageIssue = "已有本地数据无法读取，保存已暂停，原数据不会被覆盖。你的输入仍然保留。";
      error.textContent = storageIssue; error.hidden = false; syncStage(); return;
    }
    const existing = latest.find((item) => item.id === editingId);
    const item: Material = {
      id: existing?.id ?? `material-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title, url, tag: field("tag").value, note: field("note").value.trim(),
      source: url ? sourceHost : (existing?.source ?? "我的笔记"),
      date: existing?.date ?? new Date().toLocaleDateString("sv-SE"),
      ...(existing?.cover ? { cover: existing.cover } : {}),
    };
    const next = existing ? latest.map((row) => row.id === item.id ? item : row) : [item, ...latest];
    try {
      // Merge against the fresh valid collection, preserving other open pages' saved materials.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items: next }));
    } catch {
      error.textContent = "没有保存成功。请检查浏览器是否允许本地存储；你的输入仍然保留。";
      error.hidden = false;
      return;
    }
    items = next;
    reconcileRows();
    closeEditor();
    feedback(existing ? "已在此浏览器保存修改。" : "素材已加入本地演示库。");
  }

  function exportCSV() {
    if (stage < 7 || !hasPart("export")) { feedback("导出功能待连接，尚未生成文件。"); return; }
    const exportItems = bulk && hasPart("select") && selected.size ? items.filter((item) => selected.has(item.id)) : items.filter((item) => !rows.get(item.id)!.hidden);
    if (!exportItems.length) { feedback("当前没有可导出的素材，请先添加素材或清除筛选。"); return; }
    // Neutralize spreadsheet formulas while retaining a standard quoted CSV representation.
    const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
    const text = "\uFEFF" + [["标题", "标签", "来源", "链接", "笔记", "收录时间"], ...exportItems.map((item) => [item.title, item.tag, item.source, item.url, item.note, item.date])].map((row) => row.map(cell).join(",")).join("\r\n");
    const href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = `${name.replace(/[\\/:*?"<>|]/g, "-")}-${new Date().toLocaleDateString("sv-SE")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
    feedback(`已生成 ${exportItems.length} 条素材的 CSV，浏览器将开始下载。`);
  }

  root.addEventListener("click", (event) => {
    const target = event.target as Element;
    const action = target.closest<HTMLElement>("[data-mp-action]")?.dataset.mpAction;
    if (action === "add") showEditor(null);
    else if (action === "close") closeEditor();
    else if (action === "export") exportCSV();
    else if (action === "clear") {
      search = ""; currentTag = "全部";
      el<HTMLInputElement>("[data-mp-search]").value = "";
      syncTagButtons(); applyFilter();
    }
    const edit = target.closest<HTMLElement>("[data-mp-edit]");
    if (edit) showEditor(edit.dataset.mpEdit!);
    const layoutButton = target.closest<HTMLElement>("[data-mp-layout]");
    if (layoutButton) {
      setLayout(layoutButton.dataset.mpLayout as MaterialLayout);
      options.onLayout?.(layout);
    }
    const tag = target.closest<HTMLElement>("[data-mp-tag]");
    if (tag) {
      currentTag = tag.dataset.mpTag!;
      syncTagButtons();
      if (stage < 6) feedback("筛选功能待连接；条件已保留，接通后生效。");
      applyFilter();
    }
    if (mode === "building" && !target.closest("button,a,input,select,textarea,.mp-dialog")) {
      const region = target.closest<HTMLElement>("[data-mp-region]");
      const inspectId = action === "add" || edit ? "form" : action === "export" ? "export" : tag || target.closest(".mp-search") ? "filter" : region?.dataset.mpRegion;
      if (inspectId) options.onInspect?.(inspectId);
    }
  }, { signal: events.signal });

  function syncTagButtons() {
    root.querySelectorAll<HTMLButtonElement>("[data-mp-tag]").forEach((button) => {
      const active = button.dataset.mpTag === currentTag;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  root.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
    if (error.dataset.field === input.name) { error.hidden = true; delete error.dataset.field; }
    if (input.matches("[data-mp-search]")) {
      search = input.value;
      if (stage < 6 && search) feedback("搜索功能待连接；输入已保留，接通后生效。");
      applyFilter();
    }
  }, { signal: events.signal });
  root.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.matches("[data-mp-sort]")) { sortOrder = input.value; applyFilter(); }
    if (input.matches("[data-mp-select]") && stage >= 7 && bulk && hasPart("select")) {
      if (input.checked) selected.add(input.dataset.mpSelect!); else selected.delete(input.dataset.mpSelect!);
      applyFilter();
    }
  }, { signal: events.signal });
  form.addEventListener("submit", saveMaterial, { signal: events.signal });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeEditor();
    }
  }, { signal: events.signal });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || event.newValue === null) return;
    try { items = decodeStored(event.newValue); storageIssue = ""; reconcileRows(); syncStage(); }
    catch { storageIssue = "另一个页面写入的数据无法识别。保存已暂停，原数据不会被覆盖。"; syncStage(); feedback(storageIssue); }
  }, { signal: events.signal });

  function setLayout(next: MaterialLayout) { if (!destroyed) { layout = next; syncStage(); } }
  reconcileRows();
  syncStage();
  if (storageIssue) feedback(storageIssue);

  return {
    setStage(next: number) { if (!destroyed) { assembly = null; stage = Math.max(0, Math.min(7, next)); syncStage(); } },
    setAssembly(next: MaterialAssembly) {
      if (destroyed) return;
      assembly = { uiStep: Math.max(0, Math.min(8, Math.floor(next.uiStep))), featureStep: Math.max(0, Math.min(4, Math.floor(next.featureStep))), ...(next.cardCount === undefined ? {} : { cardCount: Math.max(0, Math.floor(next.cardCount)) }) };
      stage = [4, 4, 5, 6, 7][assembly.featureStep];
      syncStage();
    },
    setLayout,
    setName(next: string) { if (!destroyed) { name = next.trim() || "灵感库"; el(".mp-heading h1").textContent = name; root.setAttribute("aria-label", name); } },
    setBulk(enabled: boolean) { if (!destroyed) { bulk = enabled; syncStage(); } },
    setMode(next: MaterialMode) { if (!destroyed) { mode = next; syncStage(); } },
    destroy() { destroyed = true; clearTimeout(noticeTimer); revealTimers.forEach(clearTimeout); events.abort(); if (dialog.open) dialog.close(); root.remove(); },
  };
}
