import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { ProjectDirectories, ProjectDirectory } from "@molis-ai/molis-work-contracts/modules/projects";
import type { WriteCheckersHost } from "./write-checkers.js";

/** What the settings page's route adds to `projects.directories.get@1` for drawing it (`apps/local-host/src/project-workspace-http.ts`). */
interface DirectoriesPage {
  default_output_id: string;
  /** False only when the default output directory is the output and is not made yet. */
  default_output_made: boolean;
  /** What each folder of a source link was, so it is named without its path (spec §3 「另一台设备上的引用」). */
  source_kinds: Record<string, "folder" | "former_default_output" | "other_default_output">;
}
type Answer = ProjectDirectories & { page: DirectoriesPage };
type Say = Record<"loading" | "failed" | "stale" | "added" | "removed" | "output" | "repaired" | "mapped" | "unmapped" | "remove_named" | "output_named"
  | "change_named" | "unmap_named" | "default_name" | "source_folder" | "source_other_default" | "source_former_default" | "choose_output" | "choose_source" | "stands" | "input_role" | "output_role", string>;
type Consequence = Record<"output" | "output_pick" | "source" | "source_pick", string>;
/** A change the page posts, by the name `project-workspace-http.ts` maps to its `projects.directories.*` action; the revision is added here. */
type Change = { change: "add_input" | "remove_input" | "set_output" | "repair" | "map_source" | "unmap_source"; input: Record<string, unknown> };
/** What a chooser picks: a folder of the project, its default output directory, or a path from the system window. */
type Target = { workspace_id: string } | { default_output: true } | { workspace_path: string };

declare const molisWorkWriteCheckers: ((host: WriteCheckersHost) => void) | undefined;

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/gu, (whole, key: string) => values[key] ?? whole);
const roleWords = (directory: ProjectDirectory, input: string, output: string) => directory.roles.map(role => role === "input" ? input : output).join(" · ");

/**
 * The project's 「输入与输出」 (the host draws its words: src/project-directories-section.ts). Every change is posted with the revision
 * the page read; one made elsewhere in the meantime is refused (`actions.conflict`), and the page reads again and says so. Nothing a
 * folder is called is put in as markup: the templates' `[data-text]` parts are filled with `textContent`.
 */
export function bindProjectDirectories(root: HTMLElement): void {
  if (root.dataset.bound === "1") return;
  root.dataset.bound = "1";
  const say = JSON.parse(root.dataset.say as string) as Say;
  const consequence = JSON.parse(root.dataset.consequence as string) as Consequence;
  const prefix = root.dataset.directoriesPrefix as string;
  const part = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector(selector) as T;
  const inputs = part("[data-directories-inputs]"), output = part("[data-directories-output]"), status = part("[data-directories-status]");
  const form = part<HTMLFormElement>("[data-directories-add]");
  const pathField = form.elements.namedItem("path") as HTMLInputElement;
  const clone = (name: string) => (part<HTMLTemplateElement>(`template[data-pd=${name}]`).content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
  const route = prefix + "/api/project-settings/directories";
  const checkers: WriteCheckersHost = { section: root.querySelector<HTMLElement>("[data-write-checkers]"), prefix, load: null };
  if (typeof molisWorkWriteCheckers === "function") molisWorkWriteCheckers(checkers);
  let state: Answer | null = null, busy = false;

  const tell = (text: string, tone: "done" | "error" | "" = "") => { status.textContent = text; status.dataset.tone = tone; };
  const nameOf = (directory: ProjectDirectory) => directory.workspace_id === state?.page.default_output_id ? say.default_name : directory.display_name;
  const sourceName = (sourceId: string) => {
    const kind = state?.page.source_kinds[sourceId] ?? "folder";
    return kind === "former_default_output" ? say.source_former_default : kind === "other_default_output" ? say.source_other_default : say.source_folder;
  };

  /** A folder's row, and under it the folders of another device read here when this is the row that lists the folder first. */
  function rows(directory: ProjectDirectory, place: "input" | "output"): HTMLElement[] {
    const element = clone("row"), page = state!.page, isOutput = directory.roles.includes("output"), isInput = directory.roles.includes("input");
    const name = nameOf(directory);
    const shown: Record<string, boolean> = {
      "input-glyph": place === "input", "output-glyph": place === "output", input: isInput, output: isOutput, missing: directory.state === "missing",
      unmade: place === "output" && directory.workspace_id === page.default_output_id && !page.default_output_made,
      same: place === "input" && isInput && isOutput, repair: directory.state === "missing" && (place === "input" || !isInput),
      "set-output": place === "input" && !isOutput, "change-output": place === "output", remove: place === "input",
    };
    element.querySelectorAll<HTMLElement>("[data-if]").forEach(node => { if (!shown[node.dataset.if as string]) node.remove(); });
    element.dataset.directoryRow = directory.workspace_id;
    (element.querySelector("[data-text=name]") as HTMLElement).textContent = name;
    const path = element.querySelector("[data-text=path]") as HTMLElement;
    path.textContent = path.title = directory.canonical_path;
    const label = (act: string, text: string) => element.querySelector(`[data-act=${act}]`)?.setAttribute("aria-label", fill(text, { name }));
    label("remove", say.remove_named);
    label("set-output", say.output_named);
    element.querySelectorAll<HTMLElement>("[data-act]").forEach(button => { button.dataset.workspace = directory.workspace_id; });
    const links = place === "input" || !isInput ? state!.source_links.filter(item => item.workspace_id === directory.workspace_id) : [];
    return [element, ...links.map(link => linkRow(link.source_workspace_id))];
  }

  function linkRow(sourceId: string): HTMLElement {
    const element = clone("link"), source = sourceName(sourceId);
    (element.querySelector("[data-text=stands]") as HTMLElement).textContent = fill(say.stands, { source });
    element.querySelectorAll<HTMLElement>("[data-act]").forEach(button => {
      button.dataset.source = sourceId;
      button.setAttribute("aria-label", fill(button.dataset.act === "map" ? say.change_named : say.unmap_named, { name: source }));
    });
    return element;
  }

  function draw(): void {
    if (!state) return;
    const focused = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    const again = focused?.dataset.act ? `[data-act="${focused.dataset.act}"][data-${focused.dataset.source ? "source" : "workspace"}="${CSS.escape(focused.dataset.source ?? focused.dataset.workspace ?? "")}"]` : "";
    const list = (place: "input" | "output") => state!.directories.filter(item => item.roles.includes(place)).flatMap(directory => rows(directory, place));
    inputs.replaceChildren(...list("input"));
    output.replaceChildren(...list("output"));
    if (again) root.querySelector<HTMLElement>(again)?.focus({ preventScroll: true });
    void checkers.load?.(state.directories.filter(item => item.state === "ok"));
  }

  async function read(): Promise<void> {
    tell(say.loading);
    try { state = await molisWorkRequest<Answer>(route, { fallback: say.failed }); tell(""); draw(); root.dataset.state = "ready"; }
    catch (error) { molisWorkRequest.show(status, error, say.failed); status.dataset.tone = "error"; }
  }

  /**
   * One change from the revision the page read; on a conflict the page reads again and asks for the change once more. A refusal is
   * said in `where` (the chooser says it under its choice), a conflict always where the page speaks.
   */
  async function change(body: Change, done: (answer: Answer) => string, where: HTMLElement = status): Promise<"done" | "stale" | "refused"> {
    if (busy || !state) return "refused";
    busy = true;
    root.setAttribute("aria-busy", "true");
    try {
      const answer = await molisWorkRequest<Answer>(route, { body: { change: body.change, input: { ...body.input, expected_revision: state.revision } }, fallback: say.failed });
      state = answer;
      draw();
      tell(done(answer), "done");
      return "done";
    } catch (error) {
      if ((error as { code?: string } | null)?.code === "actions.conflict") { await read(); tell(say.stale, "error"); return "stale"; }
      molisWorkRequest.show(where, error, say.failed);
      where.dataset.tone = "error";
      return "refused";
    } finally {
      busy = false;
      root.removeAttribute("aria-busy");
    }
  }

  /** The system's folder window; null when the person closed it (its refusals are shown where the page speaks). */
  async function pick(): Promise<string | null> {
    try {
      const picked = await molisWorkRequest<{ path?: string; cancelled?: boolean }>(prefix + "/api/workspaces/pick", { body: {}, fallback: say.failed });
      return picked.cancelled || !picked.path ? null : picked.path;
    } catch (error) { molisWorkRequest.show(status, error, say.failed); status.dataset.tone = "error"; return null; }
  }

  const folderNamed = (answer: Answer, target: Target, fallback: string) =>
    "workspace_id" in target ? (answer.directories.find(item => item.workspace_id === target.workspace_id)?.display_name ?? fallback)
      : "default_output" in target ? say.default_name : (target.workspace_path.split(/[\\/]/u).filter(Boolean).pop() ?? target.workspace_path);

  /** The one popover that chooses a folder (B1), grown from the button that asked; Esc or a click outside closes it, focus goes back. */
  function choose(anchor: HTMLElement, purpose: { kind: "output" } | { kind: "source"; source: string }): void {
    if (!state) return;
    const pop = clone("chooser"), page = state.page;
    document.body.append(pop);
    const confirm = pop.querySelector("[data-act=chooser-confirm]") as HTMLButtonElement;
    const sayLine = pop.querySelector("[data-chooser-say]") as HTMLElement;
    (pop.querySelector("[data-text=title]") as HTMLElement).textContent = purpose.kind === "output" ? say.choose_output : say.choose_source;
    const current = state.directories.find(item => item.roles.includes("output"));
    (pop.querySelector("[data-text=subject]") as HTMLElement).textContent = purpose.kind === "output" ? (current ? nameOf(current) : "") : sourceName(purpose.source);
    if (purpose.kind === "output") confirm.textContent = confirm.dataset.outputLabel as string;
    const linked = purpose.kind === "source" ? state.source_links.find(item => item.source_workspace_id === purpose.source)?.workspace_id : undefined;
    const folders = pop.querySelector("[data-chooser-folders]") as HTMLElement;
    for (const directory of state.directories) {
      if (purpose.kind === "output" && directory.roles.includes("output")) continue;
      const item = clone("folder-item");
      item.dataset.target = directory.workspace_id;
      (item.querySelector("[data-slot=menu-item-label] > span") as HTMLElement).textContent = nameOf(directory);
      (item.querySelector(".mw-menu__desc") as HTMLElement).textContent = roleWords(directory, say.input_role, say.output_role);
      folders.append(item);
    }
    folders.replaceWith(...folders.childNodes);
    if (state.directories.some(item => item.workspace_id === page.default_output_id)) pop.querySelector("[data-target=default]")?.remove();
    const tick = part<HTMLTemplateElement>("template[data-pd=tick]").innerHTML;
    let chosen: Target | null = null;
    const paint = (key: string | null) => {
      pop.querySelectorAll<HTMLElement>("[role=menuitemcheckbox]").forEach(item => {
        const on = item.dataset.target === key;
        item.setAttribute("aria-checked", String(on));
        const mark = item.querySelector(".mw-menu__check");
        if (mark) mark.innerHTML = on ? tick : "";
      });
      // A folder from the system window is named on the item that picked it, so the person sees which one they chose.
      const picked = pop.querySelector<HTMLElement>("[data-target=pick]");
      const pickedPath = chosen && "workspace_path" in chosen ? chosen.workspace_path : null;
      if (picked) {
        picked.toggleAttribute("data-chosen", Boolean(pickedPath));
        const desc = picked.querySelector(".mw-menu__desc") as HTMLElement;
        desc.dataset.idle ??= desc.textContent ?? "";
        desc.textContent = pickedPath ?? desc.dataset.idle;
        desc.title = pickedPath ?? "";
      }
      confirm.disabled = !chosen;
      sayLine.dataset.tone = "";
      if (!chosen) { sayLine.textContent = sayLine.dataset.idle as string; return; }
      const name = folderNamed(state!, chosen, "");
      sayLine.textContent = "workspace_path" in chosen ? fill(purpose.kind === "output" ? consequence.output_pick : consequence.source_pick, { name })
        : fill(purpose.kind === "output" ? consequence.output : consequence.source, { name });
    };
    if (linked) { chosen = { workspace_id: linked }; paint(linked); } else paint(null);
    pop.addEventListener("click", async event => {
      const item = (event.target as HTMLElement).closest<HTMLElement>("[data-target], [data-act]");
      if (!item) return;
      if (item.dataset.act === "chooser-cancel") { pop.hidePopover(); return; }
      if (item.dataset.act === "chooser-confirm") {
        if (!chosen) return;
        const target = chosen;
        confirm.disabled = true;
        const ok = purpose.kind === "output"
          ? await change({ change: "set_output", input: { ...target } }, answer => fill(say.output, { name: folderNamed(answer, target, "") }), sayLine)
          : await change({ change: "map_source", input: { source_workspace_id: purpose.source, ...target } }, answer => fill(say.mapped, { name: folderNamed(answer, target, "") }), sayLine);
        // Refused: said under the choice, which stays to be changed. Done, or read again after a change elsewhere: the chooser goes.
        if (ok !== "refused") pop.hidePopover(); else confirm.disabled = false;
        return;
      }
      const key = item.dataset.target as string;
      if (key === "pick") {
        const path = await pick();
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
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
      else root.querySelector<HTMLElement>(purpose.kind === "output" ? "[data-act=change-output]" : `[data-act=map][data-source="${CSS.escape(purpose.source)}"]`)?.focus({ preventScroll: true });
    });
    pop.showPopover();
    anchor.setAttribute("aria-expanded", "true");
    place(pop, anchor);
    (pop.querySelector<HTMLElement>("[aria-checked=true]") ?? pop.querySelector<HTMLElement>("[role^=menuitem]"))?.focus({ preventScroll: true });
  }

  root.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-act]");
    if (!button || !root.contains(button) || button.closest("[data-write-checkers]")) return;
    const workspace = button.dataset.workspace ?? "", source = button.dataset.source ?? "";
    const named = () => state?.directories.find(item => item.workspace_id === workspace);
    switch (button.dataset.act) {
      case "pick": {
        const path = await pick();
        if (path) { pathField.value = path; form.requestSubmit(); }
        return;
      }
      case "remove": {
        const name = named() ? nameOf(named()!) : "";
        await change({ change: "remove_input", input: { workspace_id: workspace } }, () => fill(say.removed, { name }));
        return;
      }
      case "set-output":
        await change({ change: "set_output", input: { workspace_id: workspace } }, answer => fill(say.output, { name: folderNamed(answer, { workspace_id: workspace }, "") }));
        return;
      case "repair": {
        const path = await pick();
        if (path) await change({ change: "repair", input: { workspace_id: workspace, workspace_path: path } }, answer => fill(say.repaired, { name: folderNamed(answer, { workspace_id: workspace }, "") }));
        return;
      }
      case "change-output": choose(button, { kind: "output" }); return;
      case "map": choose(button, { kind: "source", source }); return;
      case "unmap": {
        const target = state?.source_links.find(item => item.source_workspace_id === source)?.workspace_id ?? "";
        const name = state ? folderNamed(state, { workspace_id: target }, "") : "";
        await change({ change: "unmap_source", input: { source_workspace_id: source } }, () => fill(say.unmapped, { name }));
        return;
      }
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const path = pathField.value.trim();
    if (!path) return;
    const submit = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    submit.disabled = true;
    // The path stays in the field when the folder is refused, so it can be corrected.
    if (await change({ change: "add_input", input: { workspace_path: path } }, answer => fill(say.added, { name: folderNamed(answer, { workspace_path: path }, path) })) === "done") form.reset();
    submit.disabled = false;
  });
  void read();
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
