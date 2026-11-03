import { CONTEXT_TOOL_LIMITS } from "@molis-ai/molis-work-contracts/services/contextual";
import { compactScript } from "./compact-script.js";
import { sanitizeContextTools } from "./context-tools.js";
import { FLOATING_CLIENT_SOURCE } from "./floating-source.js";

/**
 * The context toolbar (context-toolbar §2, §4): one bar that sits next to what the person has in hand, in the document that owns
 * it. Tools on the left, fixed (the plugin declares them as data), then at most three recommended actions, 更多, and ✦助理. It does not
 * decide what is in hand or what to recommend: it draws the view it is given, tells its host what was chosen, and never takes
 * the focus from the editor. A page program, so it can be put in any document (the workbench, a split pane, the board).
 *
 * `host`: `parent` (where it is drawn; default the body), `translate`, `width()` (the room it has, default the window), `inset`
 * ({ top, bottom } of fixed chrome it must not sit under), and the choices it reports: `choose(key)`, `assistant()` (hand what is in hand to the Assistant),
 * `dismiss(reason)`, `hold({ interacting, pinned })` (the pointer or focus entered or left it or its menu, or moved between their parts, with the keys under them on the bar; `pointed()` adds the menu's), `settled()` (the pointer and
 * focus are off it again, after a newer view may have been held back). An anchor's `rect` may be a function, read at every placement.
 * `show(view)`: `{ context_id, anchor: { rect, placement? }, touch?, actions: [{ key, label, badge?, emphasis?, hint? }],
 * more: [{ title, items: [{ key, label, note?, disabled? }] }], assistant?: boolean, basis?: { text, title?, state? } }`.
 *
 * Three page events, from the plugin that owns the content (they are registered in the DOM events list, owner `context-toolbar`):
 * `molis:context-tools` (its tools, as data), `molis:context-panel-open` (a small form it draws under the bar), and the one the bar
 * sends back on the plugin's element, `molis:context-tool-invoke`.
 */

/**
 * Tokens only. Buttons take the shared control height (32px; 28px in compact density; 44px on a phone or a coarse pointer) and are
 * never squeezed under their text: the client measures the bar against its room and folds instead (`data-tight` is its last step).
 */
export const CONTEXT_TOOLBAR_STYLES = `
.mw-ctx, .mw-ctx-menu, .mw-ctx-panel { position: fixed; max-width: calc(100vw - 16px); background: var(--popover, var(--paper)); }
.mw-ctx { z-index: 50; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 8px; box-shadow: var(--shadow-raised); }
.mw-ctx[hidden] { display: none; }
.mw-ctx[data-away] { visibility: hidden; pointer-events: none; }
@media (prefers-reduced-motion: no-preference) { .mw-ctx:not([data-away]) { animation: craft-fade-in var(--dur-hover) var(--ease-quint); } }
.mw-ctx .mw-btn { flex: none; min-height: var(--control-h, 32px); height: var(--control-h, 32px); padding: 0 8px; gap: 4px; font-size: 12px; white-space: nowrap; border-radius: 6px; }
.mw-ctx .mw-btn svg { width: 14px; height: 14px; }
.mw-ctx .mw-btn[aria-pressed=true] { background: var(--nav-active); }
.mw-ctx__tools { flex: none; display: flex; gap: 2px; padding-right: 4px; margin-right: 2px; border-right: 1px solid var(--line); }
.mw-ctx__tools .mw-btn { min-width: var(--control-h, 32px); padding: 0 6px; }
.mw-ctx__glyph[data-glyph=B] { font-weight: 600; } .mw-ctx__glyph[data-glyph=I] { font-style: italic; }
.mw-ctx__glyph[data-glyph=U] { text-decoration: underline; text-underline-offset: 2px; } .mw-ctx__glyph[data-glyph=S] { text-decoration: line-through; }
.mw-ctx__badge, .mw-ctx-menu__item small { color: var(--muted); font-size: 11px; }
.mw-ctx .mw-btn[data-emphasis=true] { color: var(--accent-strong); }
.mw-ctx[data-tight] [data-key] { flex-shrink: 1; min-width: 44px; }
.mw-ctx[data-tight] [data-key] > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.mw-ctx-menu, .mw-ctx-panel { overflow: auto; border-radius: var(--r-card, 12px); box-shadow: var(--shadow); }
.mw-ctx-menu { z-index: 52; min-width: 200px; max-height: 45dvh; padding: 6px; }
.mw-ctx-menu__item { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; width: 100%; min-height: 34px; padding: 6px 10px; border: 0; border-radius: var(--r-control, 8px); background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.mw-ctx-menu__item:hover:not(:disabled), .mw-ctx-menu__item:focus-visible { background: var(--nav-hover); outline: none; }
.mw-ctx-menu__item:disabled { flex-direction: column; align-items: flex-start; gap: 2px; color: var(--faint); cursor: default; }
.mw-ctx-menu__label { margin: 6px 10px 2px; font-size: 11px; font-weight: 500; color: var(--faint); }
.mw-ctx-menu__gap { height: 1px; margin: 6px 4px; background: var(--line); }
.mw-ctx-menu__basis { margin: 4px 10px 2px; font-size: 11px; color: var(--muted); }
.mw-ctx-panel { z-index: 55; width: min(400px, calc(100vw - 24px)); max-height: calc(100dvh - 168px); padding: 12px 16px; }
@media (max-width: 760px), (pointer: coarse) {
  .mw-ctx .mw-btn { min-height: 44px; height: 44px; min-width: 44px; }
  .mw-ctx-menu__item { min-height: 44px; font-size: 15px; }
}
`;

const LIMITS = JSON.stringify(CONTEXT_TOOL_LIMITS);

export const CONTEXT_TOOLBAR_CLIENT_SCRIPT = compactScript(String.raw`(host) => {
const L = host.translate || ((t) => t), doc = document, on = (n, t, f, o) => n.addEventListener(t, f, o);
${FLOATING_CLIENT_SOURCE}
${sanitizeContextTools.toString().replace(/^[ \t]+/gm, "")}
const h = (tag, props, ...kids) => {
const n = doc.createElement(tag);
for (const k in props) k === "text" ? n.textContent = props[k] : n.setAttribute(k, props[k]);
n.append(...kids.filter(Boolean));
return n;
};
const icon = (name) => {
if (!doc.getElementById("icon-" + name)) return null;
const ns = "http://www.w3.org/2000/svg", s = doc.createElementNS(ns, "svg"), u = doc.createElementNS(ns, "use");
s.setAttribute("aria-hidden", "true"); u.setAttribute("href", "#icon-" + name); s.append(u);
return s;
};
const btn = (label, run, props) => { const n = h("button", { type: "button", class: "mw-btn mw-btn--ghost", ...props }); if (label) n.append(h("span", { text: label })); on(n, "click", run); return n; };
const root = h("div", { class: "mw-ctx", role: "toolbar", "aria-label": L("当前内容的动作"), hidden: "" });
(host.parent || doc.body).append(root);
let view, tools, left, held, menu, opener, panel, back;
const busy = () => root.matches(":hover") || root.contains(doc.activeElement) || menu || (panel && !panel.stay);
const room = () => (host.width ? host.width() : innerWidth) - 16;
const put = (node, rect, mode, x) => {
const at = placeStacked(rect, { width: node.offsetWidth, height: node.offsetHeight }, { width: innerWidth, height: innerHeight }, mode);
pinAt(node, x === undefined ? at.left : Math.min(x, Math.max(8, innerWidth - node.offsetWidth - 8)), at.top);
};
const closeMenu = () => { if (menu) menu.remove(); if (opener) opener.setAttribute("aria-expanded", "false"); menu = opener = null; };
const closePanel = () => { const p = panel; panel = null; if (p) { p.remove(); if (p.onClose) p.onClose(); } };
const leave = () => { if (panel && panel.keep) panel.stay = true; else closePanel(); };
const hide = () => { root.hidden = true; view = held = null; closeMenu(); leave(); };
const place = () => {
if (!view || root.hidden) return;
const a = view.anchor, rect = a && (typeof a.rect === "function" ? a.rect() : a.rect), inset = host.inset || {};
root.toggleAttribute("data-away", !rect || rect.bottom < (inset.top || 0) || rect.top > innerHeight - (inset.bottom || 0));
if (!rect) return;
put(root, rect, view.touch || view.anchor.placement === "below" ? "below" : "above", left);
if (left === undefined) left = root.getBoundingClientRect().left;
if (menu) put(menu, opener.getBoundingClientRect(), "below");
if (panel && !panel.stay) { const box = root.getBoundingClientRect(); put(panel, { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, "below"); }
};
const invoke = (group, id) => { if (tools && tools.source && view) tools.source.dispatchEvent(new CustomEvent("molis:context-tool-invoke", { bubbles: true, detail: { context_id: view.context_id, group, id } })); };
const tool = (group, item, labelled) => {
const n = btn(labelled && item.label, () => { closeMenu(); invoke(group.id, item.id); }, { "aria-label": item.label, title: item.label + (item.shortcut ? " " + item.shortcut : ""), "data-group": group.id, "data-id": item.id, "aria-pressed": String(!!item.pressed) });
n.disabled = !!item.disabled;
n.prepend(...[item.glyph ? h("span", { class: "mw-ctx__glyph", "data-glyph": item.glyph, text: item.glyph }) : item.icon && icon(item.icon)].filter(Boolean));
return n;
};
const open = (from, items) => {
if (opener === from) { closeMenu(); return; }
closeMenu(); opener = from;
menu = h("div", { class: "mw-ctx-menu", role: "menu", "aria-label": from.textContent }, ...items);
on(menu, "mousedown", (e) => e.preventDefault());
on(menu, "keydown", (e) => keys(e, menu));
for (const t of ["pointerover", "pointerleave", "focusin"]) on(menu, t, hold);
(host.parent || doc.body).append(menu); from.setAttribute("aria-expanded", "true"); place();
const first = menu.querySelector("button:not(:disabled)"); if (first) first.focus();
};
const entry = (label, note, off, run, key) => {
const n = h("button", { type: "button", role: "menuitem", class: "mw-ctx-menu__item" }, h("span", { text: label }), note && h("small", { text: note }));
n.disabled = !!off; on(n, "click", () => { closeMenu(); run(); });
if (key) n.dataset.key = key;
return n;
};
const more = (extra) => {
const title = (text) => h("p", { class: "mw-ctx-menu__label", text }), act = (a) => entry(a.label, a.note, a.disabled, () => host.choose(a.key), a.key), out = [];
if (extra.length) out.push(title(L("推荐")), ...extra.map(act));
for (const g of view.more || []) out.push(title(g.title), ...g.items.map(act));
if (view.assistant) out.push(h("div", { class: "mw-ctx-menu__gap", role: "separator" }), title(L("助理")), entry(L("带到助理"), "", 0, () => host.assistant()));
if (view.basis) out.push(h("p", { class: "mw-ctx-menu__basis", title: view.basis.title || "", text: view.basis.text, ...(view.basis.state ? { "data-mw-state": view.basis.state } : {}) }));
return out;
};
const menuButton = (label, items, props) => { const n = btn(label + " ▾", () => open(n, items()), { "aria-haspopup": "menu", "aria-expanded": "false", ...props }); return n; };
// cut: the steps given up to fit the room (§6; QA-014). Each below base moves one more recommended action into 更多, one always
// staying; base takes ✦ away (更多 has the assistant too); one past it lets the action left shorten its label and badge.
// mark: the key the focus was on, carried through the redraws that replaced it.
const draw = (fold, cut = 0, mark) => {
const focused = doc.activeElement, keep = opener ? (opener.hasAttribute("data-fold") ? "[data-fold]" : "[data-more]") : "";
if (root.contains(focused)) mark = focused.getAttribute("data-id") || focused.getAttribute("data-key");
const base = room() <= 480 ? 2 : 3, slots = Math.max(1, base - cut), mine = tools && tools.context_id === view.context_id ? tools.groups : [], kids = [], actions = view.actions || [];
if (mine.length) {
const wrap = h("div", { class: "mw-ctx__tools", role: "group", "aria-label": L("工具") }), folded = [];
for (const g of mine) { if (fold && g.collapse === "overflow") folded.push(...g.items.map((i) => { const n = tool(g, i, true); n.setAttribute("role", "menuitem"); return n; })); else wrap.append(...g.items.map((i) => tool(g, i))); }
if (folded.length) wrap.append(menuButton(L("格式"), () => folded, { "data-fold": "" }));
kids.push(wrap);
}
for (const a of actions.slice(0, slots)) { const n = btn(a.label, () => host.choose(a.key), { "data-key": a.key, "data-emphasis": String(!!a.emphasis), title: a.hint || "" }); if (a.badge) n.append(h("small", { class: "mw-ctx__badge", text: a.badge })); kids.push(n); }
const extra = actions.slice(slots);
if (extra.length || (view.more || []).length || view.assistant) kids.push(menuButton(L("更多"), () => more(extra), { "data-more": "" }));
if (view.assistant && cut < base) kids.push(btn(slots < 3 ? "✦" : "✦ " + L("助理"), () => host.assistant(), { "data-assistant": "", "aria-label": L("助理"), title: L("交给助理") }));
root.replaceChildren(...kids); root.hidden = false; root.toggleAttribute("data-tight", cut > base);
if (keep) { opener = root.querySelector(keep); if (opener) opener.setAttribute("aria-expanded", "true"); else closeMenu(); }
// Too wide for its room: fold the format tools first, then give up one more step.
if (root.scrollWidth > room() && cut <= base) return draw(true, fold || !mine.some((g) => g.collapse === "overflow") ? cut + 1 : cut, mark);
if (mark) (root.querySelector('[data-id="' + mark + '"],[data-key="' + mark + '"]') || root.querySelector("[data-more]"))?.focus();
place();
};
const show = (next) => {
const same = view && next.context_id === view.context_id;
if (same && busy()) { held = next; return; }
if (!same) { left = held = undefined; closeMenu(); leave(); }
view = next; draw(false);
};
const release = () => { if (busy()) return; if (held) { view = held; held = null; draw(false); } if (host.settled) host.settled(); };
const hold = () => { if (host.hold) host.hold({ interacting: !!busy(), pinned: pinned() }); };
// The keys under the pointer or focus: on the bar (pinned, which keep their slot), and with the menu's too (pointed).
const under = (scope) => [...scope.querySelectorAll("[data-key]")].filter((n) => n.matches(":hover") || n === doc.activeElement).map((n) => n.getAttribute("data-key"));
const inside = (x) => root.contains(x) || menu && menu.contains(x);
const pinned = () => under(root), pointed = () => pinned().concat(menu ? under(menu) : []);
const keys = (e, scope) => {
const list = [...scope.querySelectorAll("button:not(:disabled)")], at = list.indexOf(doc.activeElement);
if (e.key === "Escape") {
e.preventDefault(); e.stopPropagation();
if (scope === menu) { const o = opener; closeMenu(); if (o) o.focus(); return; }
if (host.dismiss) host.dismiss("escape");
const to = back; hide(); if (to && to.isConnected) to.focus();
} else if (at >= 0 && /^(Arrow(Right|Left|Down|Up)|Home|End)$/.test(e.key)) {
e.preventDefault();
list[e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (at + (/Left|Up/.test(e.key) ? -1 : 1) + list.length) % list.length].focus();
}
};
on(root, "mousedown", (e) => e.preventDefault());
on(root, "keydown", (e) => keys(e, root));
on(root, "pointerleave", () => { hold(); release(); });
on(root, "pointerover", hold);
on(root, "focusin", (e) => { hold(); const from = e.relatedTarget; if (from instanceof HTMLElement && from.isConnected && !inside(from)) back = from; });
on(root, "focusout", (e) => { if (!inside(e.relatedTarget)) setTimeout(() => { hold(); release(); }); });
on(doc, "pointerdown", (e) => {
if (menu && !root.contains(e.target) && !menu.contains(e.target)) closeMenu();
if (panel && !panel.keep && !root.contains(e.target) && !panel.contains(e.target)) closePanel();
});
const enter = () => { const first = !root.hidden && root.querySelector("button:not(:disabled)"); if (first) { back = doc.activeElement instanceof HTMLElement ? doc.activeElement : null; first.focus(); } return !!first; };
on(doc, "keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "." && enter()) e.preventDefault(); });
on(doc, "scroll", (e) => { if (!(menu || panel || root).contains(e.target)) place(); }, true);
addEventListener("resize", () => { left = undefined; if (view) draw(false); });
// The plugin's side: its tools, as data, for the context it names; a form it wants under the bar; the click goes back on the element that published the tools.
doc.addEventListener("molis:context-tools", (e) => {
const clean = sanitizeContextTools(e.detail, ${LIMITS});
if (!clean) return;
tools = { ...clean, source: e.target instanceof Element ? e.target : null };
if (view && view.context_id === clean.context_id && !root.hidden) draw(false);
});
doc.addEventListener("molis:context-panel-open", (e) => {
const d = e.detail;
if (!d) return;
if (d.node === null) { if (panel) { closePanel(); e.preventDefault(); } return; }
if (!(d.node instanceof Node)) return;
const onClose = typeof d.onClose === "function" ? d.onClose : null, label = String(d.label || "").slice(0, 40);
if (panel && panel.contains(d.node)) { panel.setAttribute("aria-label", label); panel.onClose = onClose; panel.keep = !!d.keep; e.preventDefault(); place(); return; }
if (!view || d.context_id !== view.context_id) return;
e.preventDefault(); closeMenu(); closePanel();
panel = h("section", { class: "mw-ctx-panel", role: "dialog", "aria-label": label }, d.node);
panel.onClose = onClose; panel.keep = !!d.keep;
on(panel, "keydown", (k) => { if (k.key === "Escape") { k.preventDefault(); k.stopPropagation(); closePanel(); } });
(host.parent || doc.body).append(panel); place();
});
return { show, hide, release, place, closePanel, pinned, pointed, focus: enter, hidden: () => root.hidden, busy: () => !!busy() };
}`);
