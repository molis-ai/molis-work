import type {} from "@molis-ai/molis-work-plugin-sdk";
import { type Answer, type Change, type Consequence, directoryNames, directoryRows, fill, type Outcome, type Say } from "./project-directories-rows.js";
import { type ChooserPurpose, openDirectoryChooser } from "./project-directory-chooser.js";
import type { WriteCheckersHost } from "./write-checkers.js";

declare const molisWorkWriteCheckers: ((host: WriteCheckersHost) => void) | undefined;

/**
 * The project's 「输入与输出」 (the host draws its words: src/project-directories-section.ts). Every change is posted with the revision
 * the page read; one made elsewhere in the meantime is refused (`actions.conflict`), and the page reads again and says so. Nothing a
 * folder is called is put in as markup: the templates' `[data-text]` parts are filled with `textContent`. The rows are drawn by
 * `project-directories-rows.ts`, the folder chooser by `project-directory-chooser.ts`.
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
  const names = directoryNames(say, () => state);
  const tell = (text: string, tone: "done" | "error" | "" = "") => { status.textContent = text; status.dataset.tone = tone; };
  const fail = (error: unknown, where: HTMLElement = status) => { molisWorkRequest.show(where, error, say.failed); where.dataset.tone = "error"; };

  function draw(): void {
    if (!state) return;
    const focused = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    const again = focused?.dataset.act ? `[data-act="${focused.dataset.act}"][data-${focused.dataset.source ? "source" : "workspace"}="${CSS.escape(focused.dataset.source ?? focused.dataset.workspace ?? "")}"]` : "";
    const parts = { clone, say, names, state };
    const list = (place: "input" | "output") => parts.state.directories.filter(item => item.roles.includes(place)).flatMap(directory => directoryRows(parts, directory, place));
    inputs.replaceChildren(...list("input"));
    output.replaceChildren(...list("output"));
    if (again) root.querySelector<HTMLElement>(again)?.focus({ preventScroll: true });
    void checkers.load?.(state.directories.filter(item => item.state === "ok"));
  }

  async function read(): Promise<void> {
    tell(say.loading);
    try { state = await molisWorkRequest<Answer>(route, { fallback: say.failed }); tell(""); draw(); root.dataset.state = "ready"; }
    catch (error) { fail(error); }
  }

  /**
   * One change from the revision the page read; on a conflict the page reads again and asks for the change once more. A refusal is
   * said in `where` (the chooser says it under its choice), a conflict always where the page speaks.
   */
  async function change(body: Change, done: (answer: Answer) => string, where: HTMLElement = status): Promise<Outcome> {
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
      fail(error, where);
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
    } catch (error) { fail(error); return null; }
  }

  function choose(anchor: HTMLElement, purpose: ChooserPurpose): void {
    if (!state) return;
    openDirectoryChooser({
      state, say, consequence, names, clone, pick, change,
      tick: part<HTMLTemplateElement>("template[data-pd=tick]").innerHTML,
      anchorAgain: () => root.querySelector<HTMLElement>(purpose.kind === "output" ? "[data-act=change-output]" : `[data-act=map][data-source="${CSS.escape(purpose.source)}"]`),
    }, anchor, purpose);
  }

  root.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-act]");
    if (!button || !root.contains(button) || button.closest("[data-write-checkers]")) return;
    const workspace = button.dataset.workspace ?? "", source = button.dataset.source ?? "";
    const named = (answer: Answer) => names.folderNamed(answer, { workspace_id: workspace }, "");
    switch (button.dataset.act) {
      case "pick": {
        const path = await pick();
        if (path) { pathField.value = path; form.requestSubmit(); }
        return;
      }
      case "remove": {
        const directory = state?.directories.find(item => item.workspace_id === workspace);
        const name = directory ? names.nameOf(directory) : "";
        await change({ change: "remove_input", input: { workspace_id: workspace } }, () => fill(say.removed, { name }));
        return;
      }
      case "set-output":
        await change({ change: "set_output", input: { workspace_id: workspace } }, answer => fill(say.output, { name: named(answer) }));
        return;
      case "repair": {
        const path = await pick();
        if (path) await change({ change: "repair", input: { workspace_id: workspace, workspace_path: path } }, answer => fill(say.repaired, { name: named(answer) }));
        return;
      }
      case "change-output": choose(button, { kind: "output" }); return;
      case "map": choose(button, { kind: "source", source }); return;
      case "unmap": {
        const target = state?.source_links.find(item => item.source_workspace_id === source)?.workspace_id ?? "";
        const name = state ? names.folderNamed(state, { workspace_id: target }, "") : "";
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
    if (await change({ change: "add_input", input: { workspace_path: path } }, answer => fill(say.added, { name: names.folderNamed(answer, { workspace_path: path }, path) })) === "done") form.reset();
    submit.disabled = false;
  });
  void read();
}
