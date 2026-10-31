import { ASSISTANT_CONTEXT_STRIP_FACTORY_SCRIPT } from "./assistant-context-strip.js";
import { ASSISTANT_ATTACHMENTS_FACTORY_SCRIPT } from "./assistant-attachments.js";
import { ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT } from "./assistant-work-objects.js";
import { ASSISTANT_SIDE_CONTEXT_FACTORY_SCRIPT, ASSISTANT_SIDE_SURROUNDINGS_FACTORY_SCRIPT, ASSISTANT_SIDE_USAGE_FACTORY_SCRIPT } from "./assistant-side-context.js";

/** What a sentence carries when it is sent: the page in view and its selection, the work's objects, materials and attachments, the side context, the context strip, and the page context sent with it. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_MATERIALS_PART = String.raw`  /* ─── Sending ──────────────────────────────────────────────────────────── */
  /* ─── What the person is looking at, and what goes with this Send ──────── */
  let contextStrip = null;
  const startPop = island.querySelector("[data-assistant-starters]");
  const attach = island.querySelector("[data-assistant-attach]");
  const fileInput = island.querySelector("[data-assistant-file]");
  let lastSurface = null;
  let sel = null;
  let files = [];
  const removed = new Set();
  const visible = (node) => Boolean(node && node.isConnected && node.getClientRects().length && !node.closest("[hidden]"));
  const noteSurface = (target) => {
    if (target?.nodeType !== 1 || island.contains(target)) return;
    const surf = target.closest("[data-assistant-context]");
    if (surf) lastSurface = surf;
  };
  document.addEventListener("focusin", (event) => noteSurface(event.target), true);
  document.addEventListener("pointerdown", (event) => noteSurface(event.target), true);
  document.addEventListener("selectionchange", () => {
    const cur = getSelection();
    const node = cur && cur.anchorNode;
    const nodeEl = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!nodeEl || island.contains(nodeEl)) return;
    const text = cur.isCollapsed ? "" : cur.toString().trim();
    if (!text) { sel = null; paintMats(); return; }
    sel = { text: text.slice(0, 8000), truncated: text.length > 8000, surface: nodeEl.closest("[data-assistant-context]") };
    removed.delete("selection");
    paintMats();
  });
  /** Official surfaces whose tab item is an object with a shared context reader; a plugin that declares its own context wins. */
  const TAB_KINDS = { pages: "pages_document", coding: "coding_session", inbox: "inbox_entry", feed: "feed_item", goals: "goal", artifacts: "artifact" };
  // What plugins declare for their searchable objects (kind and the surface it opens in) extends and corrects the list.
  const declaredKinds = {};
  api("/surface-kinds").then((res) => Object.assign(declaredKinds, res.kinds || {})).catch(() => undefined);
  // The last background a plugin page sent (purpose "background"), used while that plugin is the one on show.
  let background = null;
  const pageCtx = () => {
    const surf = visible(lastSurface) ? lastSurface : [...document.querySelectorAll("[data-assistant-context]")].find((node) => visible(node) && !island.contains(node));
    if (surf) {
      try { return JSON.parse(surf.getAttribute("data-assistant-context") || "null"); } catch { return null; }
    }
    const shown = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]");
    if (background && background.object && shown && shown.dataset.pluginId === background.source.surface) {
      return { plugin_id: background.source.surface, surface_title: background.source.title, object: background.object };
    }
    // No declaration: the open tab still says which object the person is on.
    const tab = document.querySelector(".tab-item[aria-current='page'][data-item-id]");
    if (!tab) return null;
    const kind = declaredKinds[tab.dataset.plugin] || TAB_KINDS[tab.dataset.plugin];
    const title = tab.getAttribute("title") || "";
    return { plugin_id: tab.dataset.plugin, surface_title: title, ...(kind ? { object: { kind, id: tab.dataset.itemId, title } } : {}) };
  };
  /* What the person looks at is not what they work on. A page object goes with a Send only when it already belongs to
     the current work (opened from it, produced by it) or the person adds it with +; then the model sees it and the work
     is linked under it, otherwise neither (spec §21.5). What a page hands over brings its object along. */
  const joined = new Set();
  const { objectKey, belongsToWork, holds, relatedWorks, pickable, forgetRelated } = (${ASSISTANT_WORK_OBJECTS_FACTORY_SCRIPT})({ api, joined, open: () => Boolean(panel && !panel.hidden),
    current: () => (view && view.work.work_id === curId ? view : null), repaint: () => paintMats(), L });
  /** The page's session of the plugin a new work aims at, which it continues instead of starting another. */
  const executorSession = (id) => { const offer = id === "assistant" ? null : executorOffer(id), ctx = pageCtx(); return offer && ctx && ctx.object && ctx.object.kind === offer.session_kind ? ctx.object.id : null; };
  const pageObject = () => {
    const ctx = pageCtx();
    if (!ctx || !ctx.object || removed.has("object")) return null;
    const object = ctx.object;
    return { object, context:ctx, related: belongsToWork(object), included: holds(object) };
  };
  const clip = (text, size) => text.length > size ? text.slice(0, size - 1) + "…" : text;
  /** The materials this Send would carry, each named and removable; page items are marked as coming from the page. */
  const materialsNow = () => {
    const ctx = pageCtx();
    const items = [];
    const page = pageObject();
    // The page's object is named once; the sentence around it is the translation's own, so it keeps its own colon.
    // Not added, it is offered — unless something handed over from it already brings it along.
    const name = page && (page.object.title || page.object.id), label = page && L("正在看：{title}", { title: name });
    if (page && page.included) items.push({ key: "object", label, object: page.object, auto: !joined.has(objectKey(page.object)), note: page.related ? L("这项工作的对象") : "" });
    else if (page && !files.some((file) => file.object && objectKey(file.object) === objectKey(page.object))) items.push({ key: "object", label, optional: true });
    if (page && page.included && ctx.unsaved && ctx.draft_text && !removed.has("draft")) items.push({ key: "draft", label: L("未保存的修改"), auto: true });
    if (page) relatedWorks(page.object).filter((row) => row.work_id !== curId).slice(0, 2)
      .forEach((row) => items.push({ key: "work:" + row.work_id, label: L("这个对象属于工作") + "「" + row.title + "」", optional: true, work: row }));
    if (sel && !removed.has("selection")) items.push({ key: "selection", label: L("选中的内容") + "：" + clip(sel.text.replace(/\s+/g, " "), 28), auto: true });
    files.forEach((file) => items.push({ key: "file:" + (file.chip || file.material_id), label: (file.kind === "image" ? L("图片") + "：" : file.reference ? L("引用") + "：" : "") + file.title, auto: false, put: true, thumb: file.preview }));
    return items.concat(attachments ? attachments.items() : []);
  };
  /** Leaves an item out of this Send: a page object the person added goes back to optional; the rest are removed. */
  function dropMaterial(item) {
    const page = item.key === "object" ? pageObject() : null;
    if (page && joined.has(objectKey(page.object))) joined.delete(objectKey(page.object));
    else if (item.key.startsWith("file:")) { if (!attachments.drop(item.key)) files = files.filter((file) => "file:" + (file.chip || file.material_id) !== item.key); } else removed.add(item.key);
  }
  const stripNode = island.querySelector("[data-assistant-context-strip]");
  attachments = (${ASSISTANT_ATTACHMENTS_FACTORY_SCRIPT})({ L, api, toast: (text) => host.showToast?.(text), files: () => files, take: (file) => files.push(file), paint: () => paintMats() });
  const sideContext = (${ASSISTANT_SIDE_CONTEXT_FACTORY_SCRIPT})({ L, el, kinds: MATERIAL_KIND, tile, glyph, group, sideAct, paintBlock, keepFocus, sidePanelHere, sidePreview, readBack, readImage, openObject, objectState, objectTitle, objectDetail, objectGlyph, surfaceName, addFiles,
    current: () => (view && view.work.work_id === curId ? view : null), pickFile: () => fileInput?.click(), expired: EXPIRED_IMAGE, block: () => blocks.materials,
    pending: () => materialsNow().filter((item) => !item.optional && !item.state).map((item) => ({ kind: item.key === "draft" ? "text" : item.key === "selection" ? "selection" : item.key.startsWith("file:") ? (files.find((file) => "file:" + (file.chip || file.material_id) === item.key) || {}).kind || "file" : "object", title: item.label })) });
  const surroundings = (${ASSISTANT_SIDE_SURROUNDINGS_FACTORY_SCRIPT})({ L, el, card, group, stack, paintBlock, keepFocus, api, environmentBlock: () => blocks.environment, toolsBlock: () => blocks.tools });
  const usagePane = (${ASSISTANT_SIDE_USAGE_FACTORY_SCRIPT})({ L, el, progress, api, toast: (error) => host.showToast?.(error), box: () => usageBox, current: () => (view && view.work.work_id === curId ? view : null), adopt: (next) => { view = next; render(); } });
  contextStrip = stripNode && (${ASSISTANT_CONTEXT_STRIP_FACTORY_SCRIPT})({ strip: stripNode, L, el, items: materialsNow, open: () => Boolean(panel && !panel.hidden), focused: () => document.activeElement === input,
    add: () => { const page = pageObject(); if (page) joined.add(objectKey(page.object)); paintMats(); },
    drop: (item) => { dropMaterial(item); paintMats(); }, retry: (item) => attachments.retry(item.key),
    go: (work) => { void switchTo(work.work_id); input.focus(); } });
  function paintMats() { sideContext.paint(); paintEmpty(); contextStrip?.paint(); syncSend(); }
  island.addEventListener("focusin", () => contextStrip?.paint());
  island.addEventListener("focusout", () => setTimeout(() => contextStrip?.paint(), 0));
  const pageContext = () => {
    const ctx = pageCtx();
    const cur = document.querySelector("[data-plugin-picker-current]");
    const active = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]");
    const surf = (ctx && ctx.plugin_id) || (active && active.dataset.pluginId) || "home";
    const named = cur ? cur.querySelector(".plugin-picker-chip.is-focused") || cur.querySelector(".plugin-picker-chip") || cur : null;
    const title = (ctx && ctx.surface_title) || (named ? named.textContent.trim() : "");
    const res = { source: Object.assign({ surface:surf }, ctx && ctx.plugin_id ? { plugin_id: ctx.plugin_id } : {}, title ? { title } : {}), captured_at: new Date().toISOString() };
    const page = pageObject();
    if (page && page.included) res.object = page.object;
    if (ctx && ctx.unsaved && page && page.included) res.unsaved = true;
    if (sel && !removed.has("selection")) res.selection = { text: sel.text, truncated: sel.truncated };
    return Object.assign(res, contextStrip ? contextStrip.carried() : {});
  };
  const sendMaterials = () => {
    const ctx = pageCtx();
    const list = files.map(({ preview: _preview, chip: _chip, ...file }) => file);
    const page = pageObject();
    if (page && curId && joined.has(objectKey(page.object))) {
      list.push({ material_id: "object", kind: "object", title: page.object.title || page.object.id, explicit: true, object: page.object,
        source: { surface: ctx.plugin_id || "page", ...(ctx.plugin_id ? { plugin_id: ctx.plugin_id } : {}) } });
    }
    if (page && page.included && ctx.unsaved && ctx.draft_text && !removed.has("draft")) {
      list.unshift({ material_id: "draft", kind: "text", title: L("未保存的修改") + "：" + ((ctx.object && ctx.object.title) || ""), text: ctx.draft_text,
        explicit: false, draft: true, source: { surface: ctx.plugin_id, plugin_id: ctx.plugin_id }, object: ctx.object });
    }
    return list;
  };
  const takeMaterials = (sent) => {
    files = files.filter(file => !sent.files.includes(file));
    if (sel === sent.selection) sel = null;
    sent.removed.forEach(key => removed.delete(key)); sent.joined.forEach(key => joined.delete(key)); paintMats();
  };`;
