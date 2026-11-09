import type { ProjectDirectories, ProjectDirectory, ProjectDirectoryPage } from "@molis-ai/molis-work-contracts/modules/projects";

/** `page` is the route's drawing half, one shape with the Host (`ProjectDirectoryPage`). */
export type Answer = ProjectDirectories & { page: ProjectDirectoryPage };
export type Say = Record<"loading" | "failed" | "stale" | "added" | "removed" | "output" | "repaired" | "mapped" | "unmapped" | "remove_named" | "output_named"
  | "change_named" | "unmap_named" | "default_name" | "source_folder" | "source_other_default" | "source_former_default" | "choose_output" | "choose_source" | "stands" | "input_role" | "output_role", string>;
export type Consequence = Record<"output" | "output_pick" | "source" | "source_pick", string>;
/** A change the page posts, by the name `project-workspace-http.ts` maps to its `projects.directories.*` action; the revision is added there. */
export type Change = { change: "add_input" | "remove_input" | "set_output" | "repair" | "map_source" | "unmap_source"; input: Record<string, unknown> };
/** What a chooser picks: a folder of the project, its default output directory, or a path from the system window. */
export type Target = { workspace_id: string } | { default_output: true } | { workspace_path: string };
/** How a change ended: made, refused because the page was behind (it read again), or refused for its own reason. */
export type Outcome = "done" | "stale" | "refused";

export const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/gu, (whole, key: string) => values[key] ?? whole);
export const roleWords = (directory: ProjectDirectory, input: string, output: string) => directory.roles.map(role => role === "input" ? input : output).join(" · ");

/** How the page names folders: the default output directory by that name, another device's folder by what it was, a picked path by its last part. */
export interface Names {
  nameOf(directory: ProjectDirectory): string;
  sourceName(sourceId: string): string;
  folderNamed(answer: Answer, target: Target, fallback: string): string;
}

export function directoryNames(say: Say, current: () => Answer | null): Names {
  return {
    nameOf: directory => directory.workspace_id === current()?.page.default_output_id ? say.default_name : directory.display_name,
    sourceName: sourceId => {
      const kind = current()?.page.source_kinds[sourceId] ?? "folder";
      return kind === "former_default_output" ? say.source_former_default : kind === "other_default_output" ? say.source_other_default : say.source_folder;
    },
    folderNamed: (answer, target, fallback) =>
      "workspace_id" in target ? (answer.directories.find(item => item.workspace_id === target.workspace_id)?.display_name ?? fallback)
        : "default_output" in target ? say.default_name : (target.workspace_path.split(/[\\/]/u).filter(Boolean).pop() ?? target.workspace_path),
  };
}

/** The parts a row is drawn from: the host's templates (`[data-pd=…]`), its words, and the answer being drawn. */
export interface RowParts {
  clone(name: string): HTMLElement;
  say: Say;
  names: Names;
  state: Answer;
}

/** A folder's row, and under it the folders of another device read here when this is the row that lists the folder first. */
export function directoryRows(parts: RowParts, directory: ProjectDirectory, place: "input" | "output"): HTMLElement[] {
  const { clone, say, names, state } = parts;
  const element = clone("row"), page = state.page, isOutput = directory.roles.includes("output"), isInput = directory.roles.includes("input");
  const name = names.nameOf(directory);
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
  const links = place === "input" || !isInput ? state.source_links.filter(item => item.workspace_id === directory.workspace_id) : [];
  return [element, ...links.map(link => linkRow(parts, link.source_workspace_id))];
}

function linkRow({ clone, say, names }: RowParts, sourceId: string): HTMLElement {
  const element = clone("link"), source = names.sourceName(sourceId);
  (element.querySelector("[data-text=stands]") as HTMLElement).textContent = fill(say.stands, { source });
  element.querySelectorAll<HTMLElement>("[data-act]").forEach(button => {
    button.dataset.source = sourceId;
    button.setAttribute("aria-label", fill(button.dataset.act === "map" ? say.change_named : say.unmap_named, { name: source }));
  });
  return element;
}
