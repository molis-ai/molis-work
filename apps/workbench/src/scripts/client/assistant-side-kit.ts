import { ASSISTANT_PROCESS_FACTORY_SCRIPT, ASSISTANT_RETRY_FACTORY_SCRIPT } from "./assistant-process.js";

/** The bar's small common parts: icons, cards, sections, progress, step and retry rows, and the segmented choice. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_SIDE_KIT_PART = String.raw`  // Short on the card; the versions behind it are in its title.
  const objectState = (object) => object.state === "changed" ? globalThis.t.text("workbench.assistant-side-kit.changed-since") : object.state === "missing" ? globalThis.t.text("workbench.assistant-side-kit.no-longer-exists") : object.state === "unavailable" ? globalThis.t.text("workbench.assistant-side-kit.cannot-be-read-now")
    : object.state === "moved" ? (object.moved_to ? globalThis.t.text("workbench.assistant-side-kit.moved") + "「" + object.moved_to.title + "」" : globalThis.t.text("workbench.assistant-side-kit.another-project")) : "";
  const objectDetail = (object) => object.state === "changed" ? globalThis.t.text("workbench.assistant-side-kit.work-recorded-version") + " " + object.recorded_revision + " · " + globalThis.t.text("workbench.assistant-side-kit.now-version") + " " + object.current_revision
    : object.current_revision ? globalThis.t.text("workbench.assistant-side-kit.version") + " " + object.current_revision : "";
  /* The side pane speaks in the page's own glyphs, rendered once into a template, so every kind of thing has a face. */
  const glyphs = island.querySelector("[data-assistant-glyphs]");
  const glyph = (name) => {
    const holder = el("span", "assistant-glyph-icon"); holder.setAttribute("aria-hidden", "true");
    const found = glyphs && glyphs.content && glyphs.content.querySelector('[data-glyph="' + name + '"]');
    if (found && found.firstElementChild) holder.append(found.firstElementChild.cloneNode(true));
    return holder;
  };
  const spinner = (state = "running") => { const mark = el("span", "assistant-state-ring"); mark.dataset.mwState = state; mark.setAttribute("aria-hidden", "true"); return mark; };
  const proc = (${ASSISTANT_PROCESS_FACTORY_SCRIPT})({ readText, el, keyed, setText, placer, glyph, spinner }), activityLine = proc.activityLine, retries = (${ASSISTANT_RETRY_FACTORY_SCRIPT})({ readText, root: island, setText });
  /** What an object is, read from its kind or the surface it opens in. */
  const KIND_GLYPH = [[/todo/, "check"], [/image|photo/, "image"], [/coding|code/, "code"], [/goal/, "target"], [/lingguang|idea/, "idea"],
    [/feed|inbox|mail/, "inbox"], [/workflow|schedule/, "workflow"], [/dataset|database/, "database"], [/artifact|package/, "package"], [/page|doc|note|form|ppt/, "note"]];
  const kindGlyph = (text) => { const key = String(text || "").toLowerCase(); const hit = KIND_GLYPH.find(([pattern]) => pattern.test(key)); return hit ? hit[1] : "file"; };
  const objectGlyph = (object) => kindGlyph((object.subject ? object.subject.kind : "") + " " + (object.open ? object.open.surface : ""));
  /** The plugin's own name for where an object lives: the catalog's name for it (the host asks the tab workspace, which holds
   *  the catalog and the plugins installed at run time), never what one list in the page happens to show. */
  const surfaceName = (surf) => surf ? ((host.pluginTitle && host.pluginTitle(surf)) || surf) : "";
  /** A glyph on a small tinted square; its tone says waiting on you, done, a suggestion, or not there. */
  const tile = (name, tone) => { const box = el("span", "assistant-glyph" + (tone ? " is-" + tone : "")); box.append(typeof name === "string" ? glyph(name) : name); return box; };
  /** An action. Primary and secondary ones look like buttons; a quiet one (stop, take back, cancel) shows on hover or focus. */
  const sideAct = (label, name, run, quiet, variant, icon) => {
    const btnEl = el("button", "assistant-side-action" + (quiet ? " is-quiet" : "") + (variant ? " is-" + variant : "")); btnEl.type = "button";
    if (icon) btnEl.append(glyph(icon));
    btnEl.append(document.createTextNode(label));
    btnEl.setAttribute("aria-label", label + "：" + name);
    btnEl.addEventListener("click", async (event) => {
      event.stopPropagation();
      btnEl.disabled = true; btnEl.setAttribute("aria-busy", "true");
      try { await run(); } catch (error) { host.showToast?.(error); } finally { if (btnEl.isConnected) { btnEl.disabled = false; btnEl.removeAttribute("aria-busy"); } }
    });
    return btnEl;
  };
  /** A card: its glyph, a title and one line under it, then what can be done to it. The title opens it, and the whole card is its target. */
  const card = ({ icon, tone, title, sub, subTone, open, openLabel, actions, done, ask, detail }) => {
    const node = el("div", "assistant-item" + (ask ? " assistant-item--ask" : "") + (done ? " is-done" : "") + (open ? " is-openable" : ""));
    node.append(tile(icon, tone));
    const text = el("div", "assistant-item-text");
    if (open) {
      const name = el("button", "assistant-item-title", title); name.type = "button";
      name.setAttribute("aria-label", (openLabel || globalThis.t.text("common.control.open")) + "：" + title);
      name.addEventListener("click", () => { void open(); });
      text.append(name);
    } else text.append(el("span", "assistant-item-title", title));
    if (sub) text.append(el("span", "assistant-item-sub" + (subTone ? " is-" + subTone : ""), sub));
    node.append(text);
    if (actions && actions.length) { const row = el("div", "assistant-item-actions"); actions.forEach((action) => row.append(action)); node.append(row); }
    if (detail) node.title = detail;
    return node;
  };
  const openObject = (object) => object.open ? async () => showObject(object) : null;
  // A thing that is gone may come back named only by its id: the person never saw that id, so it reads as “this item”.
  const objectTitle = (object) => object.title && object.title !== object.subject.id ? object.title : globalThis.t.text("workbench.assistant-side-kit.item");
  const objectCard = (object, tone, openLabel) => {
    const state = objectState(object);
    return card({ icon: objectGlyph(object), tone: object.state === "missing" || object.state === "unavailable" ? "blocked" : object.state !== "current" ? "attention" : tone,
      title: objectTitle(object), sub: [surfaceName(object.open && object.open.surface), state].filter(Boolean).join(" · "), subTone: state ? "attention" : "",
      open: openObject(object), openLabel, detail: objectDetail(object) });
  };
  /** Rebuilding a block under the person's focus would drop it: the same control gets it back. */
  const keepFocus = (node, build) => {
    const active = node.contains(document.activeElement) ? document.activeElement : null;
    const key = active ? (active.getAttribute("aria-label") || active.textContent) : null;
    build();
    if (key) [...node.querySelectorAll("button, select, input, summary")].find((one) => (one.getAttribute("aria-label") || one.textContent) === key)?.focus();
  };
  /** A block: a heading with its glyph and the summary that still says what matters folded (folding is remembered per viewer), then its content; with no content it is not shown. */
  const BLOCKS_KEY = "molis.assistant.blocks";
  const folded = (() => { try { const saved = JSON.parse(store.get(BLOCKS_KEY) || "{}"); return saved && typeof saved === "object" ? saved : {}; } catch { return {}; } })();
  const paintBlock = (node, title, icon, content, badge, attention, fixed) => {
    node.hidden = !content;
    if (!content) { node.replaceChildren(); return; }
    const key = node.dataset.assistantBlock;
    const head = el(fixed ? "p" : "summary", "assistant-block-head" + (fixed ? " is-fixed" : ""));
    if (!fixed) { head.setAttribute("aria-expanded", String(!folded[key])); head.setAttribute("aria-controls", "assistant-block-" + key); head.append(el("span", "assistant-block-chevron")); }
    head.append(glyph(icon), el("span", "assistant-block-title", title));
    if (badge) head.append(el("span", "assistant-block-badge" + (attention ? " is-attention" : ""), badge));
    const body = el("div", "assistant-block-body" + (fixed ? "" : " mw-collapsible__body")); body.id = "assistant-block-" + key; body.append(content);
    if (fixed) { node.replaceChildren(head, body); return; }
    const fold = el("details", "mw-collapsible"); fold.open = !folded[key]; fold.append(head, body);
    fold.addEventListener("toggle", () => {
      if (!fold.isConnected) return;
      if (fold.open) delete folded[key]; else folded[key] = true;
      store.set(BLOCKS_KEY, Object.keys(folded).length ? JSON.stringify(folded) : null);
      head.setAttribute("aria-expanded", String(fold.open));
    });
    node.replaceChildren(fold);
  };
  const group = (label, ...children) => { const box = el("div", "assistant-group"); if (label) box.append(el("p", "assistant-block-sub", label)); box.append(...children); return box; };
  const stack = (cards, key) => { const box = el("div", "assistant-stack"); cards.forEach((one) => box.append(one)); if (key) window.molisShowMore?.(box, { key, label: globalThis.t.text("workbench.assistant-side-kit.show-n-more"), keep: ":has(> .is-blocked)" }); return box; };
  const progress = (done, total, label) => {
    const meter = el("span", "assistant-progress"); const fill = el("span"); fill.style.width = Math.round(total ? done / total * 100 : 0) + "%"; meter.append(fill);
    meter.setAttribute("role", "img"); meter.setAttribute("aria-label", label + " " + done + "/" + total);
    return meter;
  };
  /** The step list the latest round keeps as it goes (the runtime's update-todo): what it means to do, not proof of what happened. */
  const latestSteps = (work) => { const round = work && view && view.work.work_id === work.work_id ? [...view.rounds].reverse().find((one) => one.steps && one.steps.length) : null; return round ? round.steps : []; };
  /** A small row of choices, the current one pressed; used for who carries a new work, a plugin's mode and where it lives. */
  const segmented = (label, options, chosen, pick) => {
    const group = el("div", "assistant-segmented"); group.setAttribute("role", "group"); group.setAttribute("aria-label", label);
    options.forEach((option) => {
      const btnEl = el("button", "assistant-segment", option.label); btnEl.type = "button";
      btnEl.setAttribute("aria-pressed", String(option.id === chosen));
      if (option.hint) btnEl.title = option.hint;
      if (option.disabled) { btnEl.disabled = true; btnEl.title = option.hint || ""; }
      btnEl.addEventListener("click", () => pick(option.id));
      group.append(btnEl);
    });
    return group;
  };`;
