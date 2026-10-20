/**
 * The context strip just above the Assistant's input (specs/context-program §21.2 point 1): what the next Send carries,
 * one removable chip each — what the person has in hand (a selection, an object a page handed over), the page's object
 * once added, its unsaved edits, the files and references the person added. The object on show that is not added is a
 * dashed chip that says so, with + to add it: added, the model sees it and the work is linked under it; not added,
 * neither (§21.5). A work that already holds that object is one click away. It replaces the 「材料」 button and list.
 *
 * Shown while the panel is open, the input or the strip has focus, or the person put something in; a page's object or
 * selection alone does not raise it over the page. More chips than fit scroll sideways: the side with more fades out (the
 * design system's overflow fade), a chip reached by keyboard scrolls into view, and a vertical wheel scrolls the row (§21.5).
 */
export const ASSISTANT_CONTEXT_STRIP_FACTORY_SCRIPT = String.raw`(input) => {
  const { strip, L, el } = input;
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
      go.title = item.label; go.setAttribute("aria-label", L("切换到这项工作") + "：" + item.work.title);
      go.addEventListener("click", () => input.go(item.work));
      return go;
    }
    const node = el("span", "assistant-strip-chip" + (item.optional ? " is-optional" : "") + (item.landing ? " is-landing" : ""));
    node.title = item.note || (item.optional ? L("没加入：助理看不到它，这项工作也不会记在它下面") : item.auto ? L("来自当前页面") : L("你添加的"));
    if (item.thumb) { const thumb = el("img", "assistant-strip-thumb"); thumb.src = item.thumb; thumb.alt = ""; node.append(thumb); }
    const label = el("span", "assistant-strip-label", item.label);
    // The arrow and the short name are for the eye; a screen reader hears the whole sentence (「放进去的位置：…」).
    if (item.landing) { const arrow = el("span", "", "→"); arrow.setAttribute("aria-hidden", "true"); label.setAttribute("aria-hidden", "true"); node.append(arrow, el("span", "mw-sr-only", item.note)); }
    node.append(label);
    if (item.optional) node.append(el("span", "assistant-strip-note", L("没加入")), act("+", L("加入") + "：" + item.label, () => input.add(item)));
    else node.append(act("×", L("不带上") + "：" + item.label, () => { if (item.landing) { left = landing.object.id; paint(); } else input.drop(item); }));
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
  const WHERE = { cursor: "光标处", selection: "选中处", end: "文末" };
  const kept = (items) => landing && WHERE[landing.position] && left !== landing.object.id
    && items.some((item) => item.key === "object" && !item.optional && item.object && item.object.id === landing.object.id) ? landing : null;
  const landingItem = (items) => {
    const at = kept(items);
    if (!at) return null;
    const heading = ((at.surroundings || {}).heading_path || []).slice(-1)[0] || "", where = L(WHERE[at.position]), name = at.object.title || at.object.id;
    const near = (at.position === "selection" ? ((at.targets || [])[0] || {}).text || "" : ((at.surroundings || {}).before || "").split("\n").pop().slice(-12)).replace(/\s+/g, " ").trim();
    return { key: "landing", landing: true, label: name + " · " + (heading ? "「" + (heading.length > 10 ? heading.slice(0, 10) + "…" : heading) + "」" : "") + where,
      note: L("放进去的位置：{place}", { place: [name, heading && "「" + heading + "」", where].filter(Boolean).join("，") })
        + (near ? (at.position === "selection" ? L("（替换「{text}」）", { text: near.slice(0, 20) }) : L("（「…{text}」之后）", { text: near })) : "") };
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
    const next = JSON.stringify(items.map((item) => [item.key, item.label, item.optional, item.note, Boolean(item.thumb)]));
    if (next === signature) return;
    signature = next;
    // Rebuilt, focus stays on the same chip's button (or the first one when that chip went away).
    const had = strip.contains(document.activeElement) ? document.activeElement.closest("[data-strip-key]")?.dataset.stripKey : null;
    row.replaceChildren(...items.map((item) => { const node = chip(item); node.dataset.stripKey = item.key; return node; }));
    if (had) { const same = row.querySelector('[data-strip-key="' + CSS.escape(had) + '"]'); ((same && (same.matches("button") ? same : same.querySelector("button"))) || row.querySelector("button"))?.focus(); }
  };
  strip.setAttribute("aria-label", L("这次发送带上的"));
  return { paint, carried };
}`;
