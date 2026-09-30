import { ActionError, bindFileEntriesHandler, bindSearchEntriesHandler, defineFileEntriesAction, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { CogniaStore } from "./store.js";
import type { Material } from "./types.js";

/** Cognia's part in the system search: the person's imported knowledge (not attachments), in their own Home. */
export const cogniaSearchActions = {
  entries: defineSearchEntriesAction("cognia.search.entries", [{ kind: "cognia_material", title: "资料", surface: "cognia" }], "Cognia 资料", ["cognia:read"], "home"),
  subject: defineSubjectContextAction("cognia.subject.read", "cognia_material", "Cognia 资料", ["cognia:read"], "home"),
  /** The side panel's file tab (specs/side-panel): the person's knowledge by folder; previews read `subject`. */
  files: defineFileEntriesAction("cognia.files.entries", [{ kind: "cognia_material", title: "资料", surface: "cognia" }], "Cognia 资料", ["cognia:read"], "home"),
};
const revisionOf = (material: Material) => `${material.revision}:${material.hash}`;
const titleOf = (material: Material) => material.title || material.path.split("/").at(-1) || material.id;

export function createCogniaSearchHandlers(withStore: <T>(run: (store: CogniaStore) => T) => T): ActionHandlerBinding[] {
  return [
    bindSearchEntriesHandler(cogniaSearchActions.entries, () => withStore(store => store.materials().filter(material => material.role !== "attachment").map(material => ({
      subject: { kind: "cognia_material", id: material.id }, revision: revisionOf(material), title: titleOf(material),
      summary: searchText([...material.tags, ...material.aliases, material.path].join(" "), 600), updated_at: material.updated_at, content: "context" as const,
      open: { surface: "cognia", id: material.id } })))),
    bindFileEntriesHandler(cogniaSearchActions.files, () => withStore(store => store.materials().filter(material => material.role !== "attachment").map(material => ({
      subject: { kind: "cognia_material", id: material.id }, revision: revisionOf(material), title: titleOf(material),
      folder: material.path.split("/").slice(0, -1).filter(Boolean).slice(0, 32), media_type: "text/markdown", size: null, updated_at: material.updated_at,
      open: { surface: "cognia", id: material.id } })))),
    { ...cogniaSearchActions.subject, handle: (_caller, input) => withStore(store => {
      let material: Material;
      try { material = store.read((input as { subject_id: string }).subject_id); }
      catch (error) {
        if ((error as { code?: string })?.code === "cognia.not_found") throw new ActionError("cognia.not_found", "资料已删除");
        throw error;
      }
      return subjectContext({ subject: { kind: "cognia_material", id: material.id }, revision: revisionOf(material), title: titleOf(material),
        content: material.role === "attachment" ? "" : material.body, goal_ids: [], session_id: null, open: { surface: "cognia", id: material.id } });
    }) },
  ];
}
