import { renderTaskFloat } from "../work-line-parts.js";
import { installTaskFloatContentHost, type TaskFloatContent } from "./task-float-content.js";
import { installTaskFloatLayout } from "./work-line-layout.js";

/** One shell container for project task cards and both Assistant/Coding child conversations. No task facts live here. */
export function installTaskFloatShell(options: { dialog: string; shown?(): void; hidden?(content: boolean): void; back?(): void }) {
  type Content = { owner: object; root: HTMLElement; ready: Promise<TaskFloatContent>; value?: TaskFloatContent; disposed: boolean };
  const contents = new Map<object, Content>(); let active: Content | undefined;
  let root: HTMLElement | null = null, cards: HTMLElement | null = null, visible = false, dead = false;
  let opening: { owner: object; controller: AbortController; close?: () => void } | undefined;
  let stopLayout: (() => void) | undefined;
  const cancel = (notify = true, keepOwner?: object) => {
    const old = opening; opening = undefined; old?.controller.abort(); if (notify) old?.close?.();
    if (old && old.owner !== keepOwner) { const entry = contents.get(old.owner); if (entry && !entry.value) { entry.disposed = true; entry.root.remove(); contents.delete(old.owner); } }
  };
  const show = () => {
    if (dead) throw new DOMException("View closed", "AbortError");
    if (visible) return;
    if (!root) {
      document.body.insertAdjacentHTML("beforeend", renderTaskFloat(options.dialog, "")); root = document.body.lastElementChild as HTMLElement; root.tabIndex = -1;
      cards = document.createElement("div"); cards.style.cssText = "height:100%;min-height:0"; root.append(cards);
    }
    visible = true; root.dataset.workTaskFloat = options.dialog; root.hidden = false;
    stopLayout ??= installTaskFloatLayout(root); options.shown?.();
  };
  const hide = () => {
    const hadContent = active !== undefined || opening !== undefined;
    cancel(); if (!visible) return;
    visible = false; active?.value?.suspend?.(); if (active) active.root.hidden = true; active = undefined;
    if (cards) { cards.hidden = false; cards.replaceChildren(); }
    if (root) { root.hidden = true; delete root.dataset.workTaskFloat; delete root.dataset.content; }
    options.hidden?.(hadContent);
  };
  const back = () => {
    cancel(); if (root) delete root.dataset.content;
    active?.value?.suspend?.(); if (active) active.root.hidden = true; active = undefined;
    if (cards) cards.hidden = false;
    options.back?.();
  };
  const unlisten = installTaskFloatContentHost({
    async open(owner, mount, options) {
      cancel(false, owner);
      const ticket = { owner, controller: new AbortController(), close: options?.onClose }; opening = ticket;
      const current = () => { if (dead || opening !== ticket || ticket.controller.signal.aborted) throw new DOMException("Task view closed", "AbortError"); };
      show(); root!.focus({ preventScroll: true });
      let entry: Content | undefined;
      try {
        const prepared = await options?.prepare?.(ticket.controller.signal); current();
        if (prepared?.discard) { const old = contents.get(owner); if (old) { old.disposed = true; old.value?.destroy(); old.root.remove(); contents.delete(owner); if (active === old) active = undefined; } }
        active?.value?.suspend?.(); if (active) active.root.hidden = true;
        entry = contents.get(owner);
        if (!entry) {
          const holder = document.createElement("div"); holder.style.cssText = "height:100%;width:100%;min-height:0;min-width:0"; holder.hidden = true; root!.append(holder);
          entry = { owner, root: holder, ready: Promise.resolve(undefined as never), disposed: false }; contents.set(owner, entry);
          const saved = entry;
          entry.ready = Promise.resolve().then(() => mount(holder, { back: () => { if (active === saved) back(); }, close: () => { if (active === saved) hide(); } })).then(value => {
            if (saved.disposed) { value.destroy(); throw new DOMException("Task view closed", "AbortError"); }
            saved.value = value; if (active !== saved || !visible) value.suspend?.(); return value;
          });
        }
        active = entry; entry.root.hidden = true;
        const value = await entry.ready; current();
        await options?.beforeShow?.(ticket.controller.signal); current();
        cards!.hidden = true; entry.root.hidden = false; root!.dataset.content = "conversation";
        value.resume?.(); return value;
      } catch (error) {
        if (opening === ticket) { back(); if (entry && contents.get(owner) === entry && !entry.value) { entry.disposed = true; contents.delete(owner); entry.root.remove(); } }
        throw error;
      }
    },
    close(owner) { if (opening?.owner === owner || active?.owner === owner) hide(); },
    forget(owner) {
      if (opening?.owner === owner || active?.owner === owner) hide();
      const entry = contents.get(owner); if (!entry) return;
      entry.disposed = true; entry.value?.destroy(); entry.root.remove(); contents.delete(owner);
    },
  });
  const dispose = () => {
    if (dead) return; hide(); dead = true; unlisten();
    for (const entry of contents.values()) { entry.disposed = true; entry.value?.destroy(); }
    contents.clear(); stopLayout?.(); root?.remove(); root = cards = null;
    window.removeEventListener("pagehide", dispose);
  };
  window.addEventListener("pagehide", dispose, { once: true });
  return { show, hide, back, dispose, get root() { return root; }, get cards() { return cards; }, get shown() { return visible; }, get content() { return active !== undefined; } };
}
