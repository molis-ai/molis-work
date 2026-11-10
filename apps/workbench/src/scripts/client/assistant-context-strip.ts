/**
 * The context strip just above the Assistant's input (specs/context-program §21.2 point 1): what the next Send carries,
 * one removable chip each — what the person has in hand (a selection, an object a page handed over), the page's object
 * once added, its unsaved edits, the references, methods and capabilities the person added. The object on show that is not added is a
 * dashed chip that says so, with + to add it: added, the model sees it and the work is linked under it; not added,
 * neither (§21.5). A work that already holds that object is one click away. It replaces the 「材料」 button and list.
 *
 * Shown while the panel is open, the input or the strip has focus, or the person put something in; a page's object or
 * selection alone does not raise it over the page. More chips than fit scroll sideways: the side with more fades out (the
 * design system's overflow fade), a chip reached by keyboard scrolls into view, and a vertical wheel scrolls the row (§21.5).
 *
 * A chip keeps its element while its item stays (specs/visual-ui-experience §composer-mentions, VUX-16, VUX-18): a new chip
 * makes its neighbours move aside and a removed one lets them close up (`window.molisReflow`), and the focused chip keeps focus.
 * A chip whose words change takes them in its own element, so it does not arrive again; focus stays on the same chip's button of
 * the same kind, or the first one when that chip went away. Files from this machine are the composer's own strip, in its box.
 */
export const ASSISTANT_CONTEXT_STRIP_FACTORY_SCRIPT = String.raw`(input) => {
  const { strip, readText, el } = input;
  let signature = "";
  const row = el("div", "assistant-strip-row");
  row.dataset.overflowFade = "";
  strip.append(row);
  row.addEventListener("focusin", (event) => event.target.scrollIntoView({ block: "nearest", inline: "nearest" }));
  row.addEventListener("wheel", (event) => {
    if (row.scrollWidth <= row.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    row.scrollLeft += event.deltaY; event.preventDefault();
  }, { passive: false });
  const act = (text, label, run) => {
    const button = el("button", "assistant-strip-act", text); button.type = "button";
    button.setAttribute("aria-label", label);
    button.addEventListener("click", run);
    return button;
  };
  const chip = (item) => {
    if (item.work) {
      const go = el("button", "assistant-strip-chip is-work", "→ " + item.work.title); go.type = "button";
      go.title = item.label; go.setAttribute("aria-label", readText("workbench.assistant-context-strip.switch-work") + "：" + item.work.title);
      go.addEventListener("click", () => input.go(item.work));
      return go;
    }
    const node = el("span", "assistant-strip-chip" + (item.optional ? " is-optional" : "") + (item.landing ? " is-landing" : ""));
    node.title = item.note || (item.optional ? readText("workbench.assistant-context-strip.not-added-assistant-can-t-see-work-won") : item.auto ? readText("workbench.assistant-context-strip.page") : readText("workbench.assistant-context-strip.added"));
    const label = el("span", "assistant-strip-label", item.label);
    // The arrow and the short name are for the eye; a screen reader hears the whole sentence (「放进去的位置：…」).
    if (item.landing) { const arrow = el("span", "", "→"); arrow.setAttribute("aria-hidden", "true"); label.setAttribute("aria-hidden", "true"); node.append(arrow, el("span", "mw-sr-only", item.note)); }
    node.append(label);
    if (item.optional) node.append(el("span", "assistant-strip-note", readText("workbench.assistant-context-strip.not-added")), act("+", readText("workbench.assistant-context-strip.add") + "：" + item.label, () => input.add(item)));
    else node.append(act("×", readText("workbench.assistant-context-strip.leave-out") + "：" + item.label, () => { if (item.landing) { left = landing.object.id; paint(); } else input.drop(item); }));
    return node;
  };
  // Where a thing would be put on the left, as its owner reported it (molis:surface-landing): one chip after the rest, there
  // while the object it is in goes with the Send (§21.5 L-1); × leaves it out until the landing moves to another object. Named
  // by the heading above the place, the place and the text beside it (L-3), never by counting paragraphs.
  // Only the page that reported it takes it back: a split pane and the page beside it each report their own.
  let landing = null, from = null, left = "";
  document.addEventListener("molis:surface-landing", (event) => {
    if (event.detail && event.detail.object) { landing = event.detail; from = event.target; } else if (from === event.target) landing = null;
    paint();
  });
  const WHERE = { cursor: "workbench.assistant-context-strip.cursor", selection: "workbench.assistant-context-strip.selection", end: "workbench.assistant-context-strip.end" };
  const kept = (items) => landing && WHERE[landing.position] && left !== landing.object.id
    && items.some((item) => item.key === "object" && !item.optional && item.object && item.object.id === landing.object.id) ? landing : null;
  const landingItem = (items) => {
    const at = kept(items);
    if (!at) return null;
    const heading = ((at.surroundings || {}).heading_path || []).slice(-1)[0] || "", where = readText(WHERE[at.position]), name = at.object.title || at.object.id;
    const near = (at.position === "selection" ? ((at.targets || [])[0] || {}).text || "" : ((at.surroundings || {}).before || "").split("\n").pop().slice(-12)).replace(/\s+/g, " ").trim();
    return { key: "landing", landing: true, label: name + " · " + (heading ? "「" + (heading.length > 10 ? heading.slice(0, 10) + "…" : heading) + "」" : "") + where,
      note: readText("workbench.assistant-context-strip.where-would-go-place", { place: [name, heading && "「" + heading + "」", where].filter(Boolean).join("，") })
        + (near ? (at.position === "selection" ? readText("workbench.assistant-context-strip.replacing-text", { text: near.slice(0, 20) }) : readText("workbench.assistant-context-strip.after-text", { text: near })) : "") };
  };
  /** What the Send carries of the landing (contracts AssistantLanding; the Host bounds it): only while its chip is on the strip. */
  const carried = () => {
    const at = kept(input.items()), part = at && (at.targets || [])[0];
    return at ? { landing: { plugin_id: at.plugin_id, object: at.object, position: at.position, ...at.surroundings, ...(at.position === "selection" && part ? { selected: part.text } : {}) } } : {};
  };
  const paint = () => {
    const items = input.items(), there = landingItem(items);
    if (there) items.push(there);
    const shown = items.length > 0 && (input.open() || strip.contains(document.activeElement) || input.focused() || items.some((item) => item.put));
    strip.hidden = !shown;
    if (!shown) return;
    const look = (item) => JSON.stringify([item.label, item.optional, item.note]);
    const next = JSON.stringify(items.map((item) => [item.key, look(item)]));
    if (next === signature) return;
    signature = next;
    const focused = strip.contains(document.activeElement) ? document.activeElement : null, had = focused?.closest("[data-strip-key]")?.dataset.stripKey;
    const old = new Map([...row.children].map((node) => [node.dataset.stripKey, node]));
    const nodes = items.map((item) => {
      const kept = old.get(item.key), seen = look(item);
      if (kept && kept.dataset.stripLook === seen) return kept;
      const node = chip(item); node.dataset.stripKey = item.key; node.dataset.stripLook = seen;
      if (!kept || kept.tagName !== node.tagName) return node;
      for (const { name } of [...kept.attributes]) kept.removeAttribute(name);
      for (const { name, value } of [...node.attributes]) kept.setAttribute(name, value);
      kept.replaceChildren(...node.childNodes);
      return kept;
    });
    const place = () => { nodes.forEach((node, index) => { if (row.children[index] !== node) row.insertBefore(node, row.children[index] || null); }); while (row.children.length > nodes.length) row.lastElementChild.remove(); };
    if (window.molisReflow) window.molisReflow(row, place); else place();
    if (had && !strip.contains(document.activeElement)) {
      const same = row.querySelector('[data-strip-key="' + CSS.escape(had) + '"]'), label = focused.getAttribute("aria-label")?.split("：")[0];
      const buttons = same ? (same.matches("button") ? [same] : [...same.querySelectorAll("button")]) : [];
      (buttons.find((button) => button.getAttribute("aria-label")?.split("：")[0] === label) || buttons[0] || row.querySelector("button"))?.focus();
    }
  };
  strip.setAttribute("aria-label", readText("workbench.assistant-context-strip.going-send"));
  return { paint, carried };
}`;
