/**
 * What can be done with what the person has in hand (specs/archive/contextual-interaction §3, §4, §6.3): the row of actions
 * right above the Assistant input.
 *
 * A surface raises `molis:surface-focus` whenever its focus changes. The Host ranks the actions the directory offers
 * for it, by rules at once and by the judgment shortly after; the row shows them without moving what the person is
 * pointing at, and never shows a ranking for a context that is no longer current. A click hands the choice back to
 * the page that owns the object (`molis:assistant-context-action-chosen`), which prepares it through the Host and
 * shows a preview before anything is written. A split pane is its own document: it forwards its focus here and
 * receives the choice back.
 */
import { CONTEXT_BAR_EVENTS_SCRIPT, CONTEXT_BAR_SCRIPT } from "./context-bar.js";
import { CONTEXT_BUS_SCRIPT } from "./context-bus.js";

// The factory is one closure, so the three files are joined into one script, in the order of the original text.
export const CONTEXT_ACTIONS_FACTORY_SCRIPT = String.raw`(host) => {
  const L = host.translate;
  const embedded = window.parent !== window && document.body.hasAttribute("data-pane-embedded");
  const ownPane = embedded ? new URL(location.href).searchParams.get("workbenchPane") || "pane" : "main";
  const post = (path, body, signal) => fetch(host.route(path), { method: "POST", headers: host.headers(), body: JSON.stringify(body), signal })
    .then(async (response) => {
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(value.error || L("暂时处理不了，请稍后重试")), { code: value.code, status: response.status });
      return value;
    });
  const requestId = () => (crypto.randomUUID ? crypto.randomUUID() : "cx-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const quoted = (focus) => focus.targets.map((target) => target.text).join("\n\n").slice(0, 20000);
  const assistantDetail = (focus, text) => ({ new: true, text, source: { surface: focus.plugin_id, title: focus.object.title || "" },
    materials: [{ title: L("选中的内容") + (focus.object.title ? " · " + focus.object.title : ""), text: quoted(focus) }] });

  // In the document that owns the surface: hand the choice to the page. Nobody taking it means no page here can run
  // it yet; the Assistant then gets the words and the material, and the person sends it if they want.
  const deliver = (focus, candidate) => {
    const id = requestId();
    const event = new CustomEvent("molis:assistant-context-action-chosen", { cancelable: true, detail: {
      plugin_id: focus.plugin_id, context_id: focus.context_id, key: candidate.key, offer_id: candidate.offer_id,
      apply: candidate.apply, intent: candidate.intent, title: candidate.title, object: focus.object, ...(candidate.scope ? { scope: candidate.scope } : {}),
      prepare: () => post("/api/contextual/prepare", { pane_id: ownPane, focus, key: candidate.key, request_id: id }),
    } });
    window.dispatchEvent(event);
    return event.defaultPrevented ? null : assistantDetail(focus, L("请帮我处理这段内容：") + candidate.title);
  };

  // Any surface that declares its object (data-assistant-context) gets a fragment context from a plain DOM selection,
  // so a plugin without an editor needs no code of its own (spec §10 P2 ②). Editors that report their own focus
  // (contenteditable, or data-surface-focus="own") and form fields are left to themselves.
  (() => {
    let timer = 0, reported = null;
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
      return !el || Boolean(el.closest('[contenteditable=""], [contenteditable="true"], input, textarea, select, [data-surface-focus="own"], [data-assistant-island], [data-assistant-context-actions]'));
    };
    const read = () => {
      const selection = getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount || own(selection.anchorNode) || own(selection.focusNode)) return null;
      const anchor = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
      const root = anchor && anchor.closest("[data-assistant-context]");
      if (!root || !root.contains(selection.focusNode)) return null;
      let context;
      try { context = JSON.parse(root.getAttribute("data-assistant-context") || "{}"); } catch { return null; }
      const object = context && context.object;
      if (!context.plugin_id || !object || typeof object.kind !== "string" || typeof object.id !== "string") return null;
      const parts = selection.toString().split(/\n+/).map((part) => part.trim()).filter(Boolean);
      if (!parts.length) return null;
      const role = roleOf(selection.anchorNode);
      const clip = (text) => text.length > 2000 ? { text: text.slice(0, 2000), truncated: true } : { text };
      const granularity = parts.length > 1 ? "blocks" : isWord(parts[0]) ? "word" : "range";
      const targets = parts.slice(0, 8).map((part) => ({ kind: "text_range", role: parts.length > 1 ? "paragraph" : role, ...clip(part) }));
      const heading_path = headingPath(root, selection.getRangeAt(0).startContainer);
      return { root, focus: { context_id: "dom:" + context.plugin_id + ":" + object.id + ":" + hash(parts.join("\n")), plugin_id: context.plugin_id,
        activity: "selecting", granularity, object: { kind: object.kind, id: object.id, ...(object.version !== undefined ? { version: object.version } : {}), ...(object.title ? { title: String(object.title) } : {}) },
        targets, surroundings: { heading_path }, ...(context.unsaved ? { unsaved: true } : {}),
        ...(context.goal && typeof context.goal.id === "string" && context.goal.id ? { goal: { id: context.goal.id, title: String(context.goal.title || "") } } : {}) } };
    };
    const flush = () => {
      const next = read();
      if (next) { reported = next.root; next.root.dispatchEvent(new CustomEvent("molis:surface-focus", { bubbles: true, detail: next.focus })); }
      else if (reported) { const root = reported; reported = null; if (root.isConnected) root.dispatchEvent(new CustomEvent("molis:surface-focus", { bubbles: true, detail: null })); }
    };
    document.addEventListener("selectionchange", () => { clearTimeout(timer); timer = setTimeout(flush, 120); });
  })();

  // A surface opened an item (the workbench's molis-work:select-item) but did not name it: name it from what the
  // plugins declare as their search sources (surface → kind), so its text can be acted on like any declared object.
  (() => {
    let surfaces = null;
    const known = () => surfaces || (surfaces = fetch(host.route("/api/contextual/surfaces"), { headers: host.headers() })
      .then((response) => response.ok ? response.json() : { surfaces: {} }).then((value) => value.surfaces || {}).catch(() => { surfaces = null; return {}; }));
    const read = (node) => { try { return JSON.parse(node.getAttribute("data-assistant-context") || "null"); } catch { return null; } };
    const namedItself = (context) => Boolean(context && context.object && context.named_by !== "workbench");
    document.addEventListener("molis-work:select-item", (event) => {
      const surface = event.target;
      if (!(surface instanceof Element) || !surface.hasAttribute("data-work-surface")) return;
      const itemId = event.detail && typeof event.detail.itemId === "string" ? event.detail.itemId : "";
      // After the plugin's own handler, which may name the object itself.
      setTimeout(async () => {
        if (!itemId) {
          const own = read(surface);
          if (own && own.named_by === "workbench") { delete own.object; delete own.named_by; surface.setAttribute("data-assistant-context", JSON.stringify(own)); }
          return;
        }
        if (namedItself(read(surface))) return;
        const entry = (await known())[surface.getAttribute("data-work-surface")];
        // Read again: a plugin still loading the item (a reload) names it while the surfaces are read, and its naming stands.
        const own = read(surface);
        if (!entry || !surface.isConnected || namedItself(own)) return;
        // The open tab's name, so the Assistant shows 「正在看：需求说明」 rather than the item's address.
        const tab = [...document.querySelectorAll(".tab-item[data-item-id]")].find((node) => node.dataset.itemId === itemId);
        const title = tab ? tab.getAttribute("title") || "" : "";
        surface.setAttribute("data-assistant-context", JSON.stringify({ ...(own || {}), plugin_id: (own && own.plugin_id) || entry.plugin_id,
          object: { kind: entry.kind, id: itemId, ...(title ? { title } : {}) }, named_by: "workbench" }));
      }, 250);
    }, true);
  })();

  if (embedded) {
    let shown = null;
    document.addEventListener("molis:surface-focus", (event) => {
      shown = event.detail && typeof event.detail === "object" ? event.detail : null;
      parent.postMessage({ type: "workbench-surface-focus", focus: shown }, location.origin);
    });
    // A menu in this pane that shows the row's plan (Pages' writing menu) chooses through the row in the top document.
    document.addEventListener("molis:assistant-context-action-choose", (event) => {
      const detail = event.detail || {};
      if (shown && detail.context_id === shown.context_id && typeof detail.key === "string") parent.postMessage({ type: "workbench-context-action-choose", context_id: detail.context_id, key: detail.key }, location.origin);
    });
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent || event.origin !== location.origin || !event.data) return;
      // The row's plan for this pane's context, for the menus here that show the same actions.
      if (event.data.type === "workbench-context-plan" && event.data.plan) {
        document.dispatchEvent(new CustomEvent("molis:assistant-context-actions", { detail: { context_id: event.data.plan.context_id, plan: event.data.plan } }));
        return;
      }
      if (event.data.type !== "workbench-context-action-chosen") return;
      if (!shown || !event.data.candidate || event.data.context_id !== shown.context_id) return;
      const fallback = deliver(shown, event.data.candidate);
      if (fallback) parent.postMessage({ type: "workbench-context-action-unhandled", context_id: shown.context_id, key: event.data.candidate.key, detail: fallback }, location.origin);
    });
    window.addEventListener("pagehide", () => parent.postMessage({ type: "workbench-surface-focus", focus: null }, location.origin));
    return null;
  }

  const root = document.querySelector("[data-assistant-context-actions]");
  if (!root) return null;
  const el = (tag, attrs, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([name, value]) => {
      if (name === "class") node.className = value; else if (name === "text") node.textContent = value; else node.setAttribute(name, value);
    });
    children.forEach((child) => { if (child) node.append(child); });
    return node;
  };
  // The shared screen-reader-only primitive: its -1px margin keeps the region from lengthening the page by a pixel.
  const live = el("div", { class: "mw-sr-only", "data-context-actions-live": "", "aria-live": "polite" });
  document.body.append(live);
  const openAssistant = (detail) => document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail }));
  const visible = (node) => Boolean(node && node.isConnected && node.getClientRects().length && !node.closest("[hidden]"));
${CONTEXT_BAR_SCRIPT}

${CONTEXT_BUS_SCRIPT}

${CONTEXT_BAR_EVENTS_SCRIPT}
  return { current: () => bus.focus, plan: () => bar.plan };
}`;
