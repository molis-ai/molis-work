/**
 * The context strip just above the Assistant's input (specs/context-program §21.2 point 1): what the next Send carries,
 * one removable chip each — what the person has in hand (a selection, an object a page handed over), the page's object
 * once added, its unsaved edits, the files and references the person added. The object on show that is not added is a
 * dashed chip that says so, with + to add it: added, the model sees it and the work is linked under it; not added,
 * neither (§21.5). A work that already holds that object is one click away. It replaces the 「材料」 button and list.
 *
 * Shown while the panel is open, the input or the strip has focus, or the person put something in; a page's object or
 * selection alone does not raise it over the page.
 */
export const ASSISTANT_CONTEXT_STRIP_FACTORY_SCRIPT = String.raw`(input) => {
  const { strip, L, el } = input;
  let signature = "";
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
    const node = el("span", "assistant-strip-chip" + (item.optional ? " is-optional" : ""));
    node.title = item.note || (item.optional ? L("没加入：助理看不到它，这项工作也不会记在它下面") : item.auto ? L("来自当前页面") : L("你添加的"));
    if (item.thumb) { const thumb = el("img", "assistant-strip-thumb"); thumb.src = item.thumb; thumb.alt = ""; node.append(thumb); }
    node.append(el("span", "assistant-strip-label", item.label));
    if (item.optional) node.append(el("span", "assistant-strip-note", L("没加入")), act("+", L("加入") + "：" + item.label, () => input.add(item)));
    else node.append(act("×", L("不带上") + "：" + item.label, () => input.drop(item)));
    return node;
  };
  const paint = () => {
    const items = input.items();
    const shown = items.length > 0 && (input.open() || strip.contains(document.activeElement) || input.focused() || items.some((item) => item.put));
    strip.hidden = !shown;
    if (!shown) return;
    const next = JSON.stringify(items.map((item) => [item.key, item.label, item.optional, item.note, Boolean(item.thumb)]));
    if (next === signature) return;
    signature = next;
    // Rebuilt, focus stays on the same chip's button (or the first one when that chip went away).
    const had = strip.contains(document.activeElement) ? document.activeElement.closest("[data-strip-key]")?.dataset.stripKey : null;
    strip.replaceChildren(...items.map((item) => { const node = chip(item); node.dataset.stripKey = item.key; return node; }));
    if (had) { const same = strip.querySelector('[data-strip-key="' + CSS.escape(had) + '"]'); ((same && (same.matches("button") ? same : same.querySelector("button"))) || strip.querySelector("button"))?.focus(); }
  };
  strip.setAttribute("aria-label", L("这次发送带上的"));
  return { paint };
}`;
