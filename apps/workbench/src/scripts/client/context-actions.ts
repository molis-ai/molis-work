/**
 * What can be done with what the person has in hand (specs/archive/contextual-interaction §3, §4, §6.3): the context toolbar next to it.
 *
 * A surface raises `molis:surface-focus` whenever its focus changes. The Host ranks the actions the directory offers
 * for it, by rules at once and by the judgment shortly after; the toolbar shows them without moving what the person is
 * pointing at, and never shows a ranking for a context that is no longer current. A click hands the choice back to
 * the page that owns the object (`molis:assistant-context-action-chosen`), which prepares it through the Host and
 * shows a preview before anything is written. A split pane is its own document: it draws its own toolbar from the plan the
 * top document sends it, and sends its choices back. So is a plugin's tab in the side panel (specs/context-program §21.4 W3-C):
 * its document runs the same part alone, and the top document hears it through the side frames' check (S-30).
 */
import { compactScript, CONTEXT_TOOLBAR_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { CONTEXT_BAR_SCRIPT } from "./context-bar.js";
import { CONTEXT_BUS_SCRIPT } from "./context-bus.js";
import { CONTEXT_LANDING_PANE_SCRIPT, CONTEXT_LANDING_SCRIPT } from "./context-landing.js";
import { SIDE_FRAME_FROM_SCRIPT } from "./pane-messages.js";

// The factory is one closure, so the four files are joined into one script, in the order of the original text.
// What a surface's own document runs: the selection reader, the naming of an opened item and, in a split pane or a side
// view, the toolbar it draws for the top document. A side view's document runs this part alone (side-view-document.ts).
const PANE_PART = String.raw`  const L = host.translate;
  const embedded = window.parent !== window && document.body.matches("[data-pane-embedded],[data-side-view]");
  const ownPane = embedded ? new URL(location.href).searchParams.get("workbenchPane") || "pane" : "main";
  const panes = host.paneMessages;
  const post=(path,body,signal,page)=>molisWorkRequest(host.route(path),{body,signal,...(page?{headers:{"x-molis-context-page":page}}:{}),fallback:L("暂时处理不了，请稍后重试")});
  const newRequestId = () => (crypto.randomUUID ? crypto.randomUUID() : "cx-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const quoted = (focus) => focus.targets.map((target) => target.text).join("\n\n").slice(0, 20000);
  // What is in hand, for the Assistant's strip: the passage and the object it is from, never words written for the person.
  const inHand = (focus) => ({ new: true, source: { surface: focus.plugin_id, title: focus.object.title || "" }, object: focus.object,
    materials: [{ title: L("选中的内容") + (focus.object.title ? " · " + focus.object.title : ""), text: quoted(focus) }] });

  const makeToolbar = ${CONTEXT_TOOLBAR_CLIENT_SCRIPT};
  const coarse = () => matchMedia("(pointer: coarse)").matches || innerWidth <= 760;
  // Where the toolbar goes: the owner's own rectangle when it gave one (an editor's caret or range), else the person's DOM selection.
  const rectOf = (read) => () => {
    const screen = read().screen;
    if (screen && screen.rect) return screen.rect;
    const sel = getSelection();
    return sel && sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0).getBoundingClientRect() : null;
  };

  // In the document that owns the surface: hand the choice to the page. Nobody taking it means no page here can run
  // it yet; the Assistant then gets what is in hand, and the person says what to do with it.
  const deliver = async (focus, candidate) => {
    const id = newRequestId();
    const event = new CustomEvent("molis:assistant-context-action-chosen", { cancelable: true, detail: {
      plugin_id: focus.plugin_id, context_id: focus.context_id, key: candidate.key, offer_id: candidate.offer_id,
      apply: candidate.apply, intent: candidate.intent, title: candidate.title, object: focus.object, ...(candidate.scope ? { scope: candidate.scope } : {}),
      prepare: (control) => post("/api/contextual/prepare", { pane_id: ownPane, focus, key: candidate.key, request_id: id }, control?.signal, control?.page_id),
    } });
    window.dispatchEvent(event);
    return (event.detail.handled ? await event.detail.handled : event.defaultPrevented) ? null : inHand(focus);
  };

  // Any surface that declares its object (data-assistant-context) gets a fragment context from a plain DOM selection,
  // so a plugin without an editor needs no code of its own (spec §10 P2 ②). Editors that report their own focus
  // (contenteditable, or data-surface-focus="own") and form fields are left to themselves.
  (() => {
    let timer = 0, seen = null;
    const hash = (text) => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
    const isWord = (text) => { const t = text.trim(); return Boolean(t) && !/\s/.test(t) && (/[㐀-鿿]/.test(t) ? t.length <= 8 : t.length <= 32); };
    const roleOf = (node) => {
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      const block = el && el.closest("h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre, p");
      if (!block) return "paragraph";
      if (/^H[1-6]$/.test(block.tagName)) return "heading";
      if (block.tagName === "LI") return block.querySelector('input[type="checkbox"]') ? "task" : "list";
      if (block.tagName === "TD" || block.tagName === "TH") return "table";
      if (block.tagName === "BLOCKQUOTE") return "quote";
      if (block.tagName === "PRE") return "code";
      return "paragraph";
    };
    const headingPath = (root, node) => {
      const stack = [];
      root.querySelectorAll("h1, h2, h3, h4").forEach((heading) => {
        if (!(heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
        const level = Number(heading.tagName.slice(1));
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        stack.push({ level, text: heading.textContent.trim().slice(0, 120) });
      });
      return stack.map((item) => item.text).filter(Boolean).slice(-6);
    };
    const own = (node) => {
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      // In the Assistant, only a reply's words are in hand (its own context); its input, strip and buttons are not.
      return !el || Boolean(el.closest('[contenteditable=""], [contenteditable="true"], input, textarea, select, [data-surface-focus="own"], .mw-ctx'))
        || el.matches('[data-assistant-island] :not([data-assistant-context], [data-assistant-context] *)');
    };
    const read = () => {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || own(sel.anchorNode) || own(sel.focusNode)) return null;
      const anchor = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
      const root = anchor && anchor.closest("[data-assistant-context]");
      if (!root || !root.contains(sel.focusNode)) return null;
      let context;
      try { context = JSON.parse(root.getAttribute("data-assistant-context") || "{}"); } catch { return null; }
      const object = context && context.object;
      if (!context.plugin_id || !object || typeof object.kind !== "string" || typeof object.id !== "string") return null;
      const parts = sel.toString().split(/\n+/).map((part) => part.trim()).filter(Boolean);
      if (!parts.length) return null;
      const role = roleOf(sel.anchorNode);
      const clip = (text) => text.length > 2000 ? { text: text.slice(0, 2000), truncated: true } : { text };
      const scale = parts.length > 1 ? "blocks" : isWord(parts[0]) ? "word" : "range";
      const targets = parts.slice(0, 8).map((part) => ({ kind: "text_range", role: parts.length > 1 ? "paragraph" : role, ...clip(part) }));
      const heading_path = headingPath(root, sel.getRangeAt(0).startContainer);
      return { root, focus: { context_id: "dom:" + context.plugin_id + ":" + object.id + ":" + hash(parts.join("\n")), plugin_id: context.plugin_id,
        activity: "selecting", granularity:scale, object: { kind: object.kind, id: object.id, ...(object.version !== undefined ? { version: object.version } : {}), ...(object.title ? { title: String(object.title) } : {}) },
        targets, surroundings: { heading_path }, ...(context.unsaved ? { unsaved: true } : {}),
        ...(context.goal && typeof context.goal.id === "string" && context.goal.id ? { goal: { id: context.goal.id, title: String(context.goal.title || "") } } : {}) } };
    };
    const flush = () => {
      const next = read();
      if (next) { seen = next.root; next.root.dispatchEvent(new CustomEvent("molis:surface-focus", { bubbles: true, detail: next.focus })); }
      else if (seen) { const root = seen; seen = null; if (root.isConnected) root.dispatchEvent(new CustomEvent("molis:surface-focus", { bubbles: true, detail: null })); }
    };
    document.addEventListener("selectionchange", () => { clearTimeout(timer); timer = setTimeout(flush, 120); });
  })();

  if (host.surfaceOnly) return;

  // What the plugins declare as their search sources: surface → the one kind it opens and the plugin that owns it. Read once.
  let surfaces = null;
  const known=()=>surfaces||(surfaces=molisWorkRequest(host.route("/api/contextual/surfaces")).then(value=>value.surfaces||{}).catch(()=>{surfaces=null;return {};}));
  // A surface opened an item (the workbench's molis-work:select-item) but did not name it: name it from what the
  // plugins declare as their search sources (surface → kind), so its text can be acted on like any declared object.
  (() => {
    const read = (node) => { try { return JSON.parse(node.getAttribute("data-assistant-context") || "null"); } catch { return null; } };
    const namedItself = (context) => Boolean(context && context.object && context.named_by !== "workbench");
    // Items a surface said it could not read (molis-work:item-unreadable): never named after the tab, so the Assistant
    // does not carry a gone item as what the person is looking at.
    const unreadable = new WeakMap();
    const forget = (surf, itemId) => {
      const own = read(surf);
      if (own && own.object && own.object.id === itemId) { delete own.object; delete own.named_by; surf.setAttribute("data-assistant-context", JSON.stringify(own)); }
    };
    document.addEventListener("molis-work:item-unreadable", (event) => {
      const surf = event.target instanceof Element ? event.target.closest("[data-work-surface]") : null;
      const itemId = event.detail && typeof event.detail.itemId === "string" ? event.detail.itemId : "";
      if (!surf || !itemId) return;
      if (!unreadable.has(surf)) unreadable.set(surf, new Set());
      unreadable.get(surf).add(itemId);
      forget(surf, itemId);
    });
    document.addEventListener("molis-work:select-item", (event) => {
      const surf = event.target;
      if (!(surf instanceof Element) || !surf.hasAttribute("data-work-surface")) return;
      const itemId = event.detail && typeof event.detail.itemId === "string" ? event.detail.itemId : "";
      // After the plugin's own handler, which may name the object itself.
      setTimeout(async () => {
        if (!itemId) {
          const own = read(surf);
          if (own && own.named_by === "workbench") { delete own.object; delete own.named_by; surf.setAttribute("data-assistant-context", JSON.stringify(own)); }
          return;
        }
        if (namedItself(read(surf)) || unreadable.get(surf)?.has(itemId)) return;
        const entry = (await known())[surf.getAttribute("data-work-surface")];
        // Read again: a plugin still loading the item (a reload) names it while the surfaces are read, and its naming stands.
        const own = read(surf);
        if (!entry || !surf.isConnected || namedItself(own) || unreadable.get(surf)?.has(itemId)) return;
        // The open tab's name, so the Assistant shows 「正在看：需求说明」 rather than the item's address.
        const tab = [...document.querySelectorAll(".tab-item[data-item-id]")].find((node) => node.dataset.itemId === itemId);
        const title = tab ? tab.getAttribute("title") || "" : "";
        surf.setAttribute("data-assistant-context", JSON.stringify({ ...(own || {}), plugin_id: (own && own.plugin_id) || entry.plugin_id,
          object: { kind: entry.kind, id: itemId, ...(title ? { title } : {}) }, named_by: "workbench" }));
      }, 250);
    }, true);
  })();

  if (embedded) {
    let shown = null;
    const say = (message) => { if (shown) parent.postMessage({ ...message, context_id: shown.context_id }, location.origin); };
    const toolbar = makeToolbar({
      translate: L, inset: { top: 0, bottom: 0 }, width: () => innerWidth,
      choose: (key) => say({ type: "workbench-context-action-choose", key }),
      assistant: () => say({ type: "workbench-context-assistant" }),
      dismiss: () => say({ type: "workbench-context-dismiss" }),
      // With the keys under the pointer on the bar and in its menu, for the top document to flash the landing (W3-C2).
      hold: (state) => say({ type: "workbench-context-hold", ...state, pointed: toolbar.pointed() }),
      // Nothing held, nothing under the pointer: the top document reads missing fields as that.
      settled: () => say({ type: "workbench-context-hold" }),
    });
    document.addEventListener("molis:surface-focus", (event) => {
      shown = event.detail && typeof event.detail === "object" ? event.detail : null;
      // Where it is on this page is for this page's toolbar; the top document never needs it.
      const { screen, ...plain } = shown || {};
      parent.postMessage({ type: "workbench-surface-focus", focus: shown ? plain : null }, location.origin);
      if (shown) toolbar.place(); else toolbar.hide();
    });
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "." && toolbar.hidden() && shown && shown.activity === "editing") { event.preventDefault(); say({ type: "workbench-context-summon" }); }
    });
    window.addEventListener("message", (event) => {
      if (!panes.fromParent(event)) return;
      const data = event.data;
      if (data.type === "workbench-context-view") {
        if (data.op === "idle") toolbar.hide();
        else if (shown && data.view && data.view.context_id === shown.context_id) {
          toolbar.show({ ...data.view, touch: coarse(), anchor: { rect: rectOf(() => shown || {}), placement: ((shown || {}).screen || {}).placement } });
          if (data.summon) toolbar.focus();
        }
        return;
      }
      if (data.type !== "workbench-context-action-chosen") return;
      if (!shown || !data.candidate || data.context_id !== shown.context_id) return;
      const focus = shown;
      void deliver(focus, data.candidate).then(fallback => { if (fallback) parent.postMessage({ type: "workbench-context-action-unhandled", context_id: focus.context_id, key: data.candidate.key, detail: fallback }, location.origin); });
    });
    window.addEventListener("pagehide", () => parent.postMessage({ type: "workbench-surface-focus", focus: null }, location.origin));
${CONTEXT_LANDING_PANE_SCRIPT}
    return null;
  }`;

export const CONTEXT_ACTIONS_FACTORY_SCRIPT = compactScript(String.raw`(host) => {
${PANE_PART}

  const sideFrame = ${SIDE_FRAME_FROM_SCRIPT};
  const openAssistant = (detail) => document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail }));
  const visible = (node) => Boolean(node && node.isConnected && node.getClientRects().length && !node.closest("[hidden]"));
${CONTEXT_BAR_SCRIPT}

${CONTEXT_BUS_SCRIPT}
${CONTEXT_LANDING_SCRIPT}
  return { current: () => bus.focus, plan: () => bar.plan };
}`);

/** The same part for a document of its own (a plugin's side view): it needs `translate`, `paneMessages` and `route`. */
export const CONTEXT_PANE_FACTORY_SCRIPT = compactScript(String.raw`(host) => {
${PANE_PART}
}`);
