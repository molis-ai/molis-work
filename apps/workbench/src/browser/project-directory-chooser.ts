import { type Answer, type Change, type Consequence, fill, type Names, type Outcome, roleWords, type Say, type Target } from "./project-directories-rows.js";

/** What the chooser uses of the section that opened it. */
export interface ChooserHost {
  state: Answer;
  say: Say;
  consequence: Consequence;
  names: Names;
  clone(name: string): HTMLElement;
  /** The check mark a chosen item shows (the host's `template[data-pd=tick]`). */
  tick: string;
  pick(): Promise<string | null>;
  change(body: Change, done: (answer: Answer) => string, where: HTMLElement): Promise<Outcome>;
  /** The button to focus when the one that asked was drawn again while the chooser was open. */
  anchorAgain(): HTMLElement | null;
}
export type ChooserPurpose = { kind: "output" } | { kind: "source"; source: string };

/** The one popover that chooses a folder (B1), grown from the button that asked; Esc or a click outside closes it, focus goes back. */
export function openDirectoryChooser(host: ChooserHost, anchor: HTMLElement, purpose: ChooserPurpose): void {
  const { state, say, names, consequence } = host;
  const output = purpose.kind === "output";
  const pop = host.clone("chooser");
  document.body.append(pop);
  const confirm = pop.querySelector("[data-act=chooser-confirm]") as HTMLButtonElement;
  const sayLine = pop.querySelector("[data-chooser-say]") as HTMLElement;
  (pop.querySelector("[data-text=title]") as HTMLElement).textContent = output ? say.choose_output : say.choose_source;
  const current = state.directories.find(item => item.roles.includes("output"));
  (pop.querySelector("[data-text=subject]") as HTMLElement).textContent = purpose.kind === "output" ? (current ? names.nameOf(current) : "") : names.sourceName(purpose.source);
  if (output) confirm.textContent = confirm.dataset.outputLabel as string;
  listFolders(host, pop, purpose);
  const linked = purpose.kind === "source" ? state.source_links.find(item => item.source_workspace_id === purpose.source)?.workspace_id : undefined;
  let chosen: Target | null = linked ? { workspace_id: linked } : null;
  const paint = (key: string | null) => {
    markChosen(host, pop, key, chosen);
    confirm.disabled = !chosen;
    sayLine.dataset.tone = "";
    if (!chosen) { sayLine.textContent = sayLine.dataset.idle as string; return; }
    const name = names.folderNamed(state, chosen, "");
    const picked = "workspace_path" in chosen;
    sayLine.textContent = fill(output ? (picked ? consequence.output_pick : consequence.output) : picked ? consequence.source_pick : consequence.source, { name });
  };
  paint(linked ?? null);
  pop.addEventListener("click", async event => {
    const item = (event.target as HTMLElement).closest<HTMLElement>("[data-target], [data-act]");
    if (!item) return;
    if (item.dataset.act === "chooser-cancel") { pop.hidePopover(); return; }
    if (item.dataset.act === "chooser-confirm") {
      if (!chosen) return;
      const target = chosen;
      confirm.disabled = true;
      const ok = purpose.kind === "output"
        ? await host.change({ change: "set_output", input: { ...target } }, answer => fill(say.output, { name: names.folderNamed(answer, target, "") }), sayLine)
        : await host.change({ change: "map_source", input: { source_workspace_id: purpose.source, ...target } }, answer => fill(say.mapped, { name: names.folderNamed(answer, target, "") }), sayLine);
      // Refused: said under the choice, which stays to be changed. Done, or read again after a change elsewhere: the chooser goes.
      if (ok !== "refused") pop.hidePopover(); else confirm.disabled = false;
      return;
    }
    const key = item.dataset.target as string;
    if (key === "pick") {
      const path = await host.pick();
      if (!path) return;
      chosen = { workspace_path: path };
      paint("pick");
      return;
    }
    chosen = key === "default" ? { default_output: true } : { workspace_id: key };
    paint(key);
  });
  pop.addEventListener("toggle", event => {
    if ((event as ToggleEvent).newState !== "closed") return;
    pop.remove();
    anchor.setAttribute("aria-expanded", "false");
    (anchor.isConnected ? anchor : host.anchorAgain())?.focus({ preventScroll: true });
  });
  pop.showPopover();
  anchor.setAttribute("aria-expanded", "true");
  place(pop, anchor);
  (pop.querySelector<HTMLElement>("[aria-checked=true]") ?? pop.querySelector<HTMLElement>("[role^=menuitem]"))?.focus({ preventScroll: true });
}

/** The project's folders that can be chosen (not the output when choosing a new one); the default output item only when it is not one of them. */
function listFolders({ state, say, names, clone }: ChooserHost, pop: HTMLElement, purpose: ChooserPurpose): void {
  const folders = pop.querySelector("[data-chooser-folders]") as HTMLElement;
  for (const directory of state.directories) {
    if (purpose.kind === "output" && directory.roles.includes("output")) continue;
    const item = clone("folder-item");
    item.dataset.target = directory.workspace_id;
    (item.querySelector("[data-slot=menu-item-label] > span") as HTMLElement).textContent = names.nameOf(directory);
    (item.querySelector(".mw-menu__desc") as HTMLElement).textContent = roleWords(directory, say.input_role, say.output_role);
    folders.append(item);
  }
  folders.replaceWith(...folders.childNodes);
  if (state.directories.some(item => item.workspace_id === state.page.default_output_id)) pop.querySelector("[data-target=default]")?.remove();
}

/** The tick on the chosen item; a folder from the system window is named on the item that picked it, so the person sees which one. */
function markChosen({ tick }: ChooserHost, pop: HTMLElement, key: string | null, chosen: Target | null): void {
  pop.querySelectorAll<HTMLElement>("[role=menuitemcheckbox]").forEach(item => {
    const on = item.dataset.target === key;
    item.setAttribute("aria-checked", String(on));
    const mark = item.querySelector(".mw-menu__check");
    if (mark) mark.innerHTML = on ? tick : "";
  });
  const picked = pop.querySelector<HTMLElement>("[data-target=pick]");
  if (!picked) return;
  const pickedPath = chosen && "workspace_path" in chosen ? chosen.workspace_path : null;
  picked.toggleAttribute("data-chosen", Boolean(pickedPath));
  const desc = picked.querySelector(".mw-menu__desc") as HTMLElement;
  desc.dataset.idle ??= desc.textContent ?? "";
  desc.textContent = pickedPath ?? desc.dataset.idle;
  desc.title = pickedPath ?? "";
}

/** Below its button, or above it when there is more room there; never past the window's edges. */
function place(pop: HTMLElement, anchor: HTMLElement): void {
  const box = anchor.getBoundingClientRect(), width = pop.offsetWidth, height = pop.offsetHeight, gap = 6, edge = 8;
  const below = innerHeight - box.bottom - gap - edge, above = box.top - gap - edge;
  const up = height > below && above > below;
  pop.style.maxHeight = `${Math.max(160, up ? above : below)}px`;
  pop.style.left = `${Math.min(Math.max(edge, box.right - width), innerWidth - width - edge)}px`;
  pop.style.top = `${up ? Math.max(edge, box.top - gap - Math.min(height, above)) : box.bottom + gap}px`;
  pop.style.transformOrigin = `${up ? "bottom" : "top"} right`;
}
