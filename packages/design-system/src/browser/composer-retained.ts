import type { ComposerDraftAdapter } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { composerDraftKey } from "../composer-rules.js";
import type { Composer, Item } from "./composer-state.js";

type Kept = Pick<Composer, "items" | "phase" | "failure" | "check" | "requestId"> & { revision: number; submitted?: { text: string; items: readonly Item[]; revision: number }; current?: Composer };
const roots = new WeakMap<HTMLElement, Map<string | ComposerDraftAdapter, Kept>>();
/** Same-document selections belong to their draft. No File or owner reference is copied into persistent storage. */
export function retainComposer(c: Composer) {
  let draftsHere = roots.get(c.root);
  if (!draftsHere) roots.set(c.root, draftsHere = new Map());
  const key = "adapter" in c.options.draft ? c.options.draft.adapter : composerDraftKey({ project: document.body.dataset.projectId || "home",
    install: c.root.closest<HTMLElement>("[data-plugin-owner]")?.dataset.pluginOwner || document.body.dataset.pluginId || "workbench",
    entry: c.options.entry, conversation: c.options.draft.conversation });
  let kept = draftsHere.get(key);
  if (!kept) draftsHere.set(key, kept = { items: [], phase: "", failure: "", check: null, requestId: "", revision: 0 });
  const state = kept;
  state.current = c;
  for (const name of ["items", "phase", "failure", "check", "requestId"] as const) {
    Object.defineProperty(c, name, { get: () => state[name], set: value => { state[name] = value; } });
  }
  return {
    current: () => state.current,
    submitted: () => state.submitted ?? { text: "", items: [], revision: 0 },
    revision: () => state.revision,
    edit: () => { state.revision += 1; },
    remember: (submitted: { text: string; items: readonly Item[]; revision: number }) => { state.submitted = submitted; },
    release() {
      if (state.current === c) state.current = undefined;
      for (const item of state.items) if (item.state === "reading") Object.assign(item, { state: "failed", retry: true, reason: c.fill(c.labels.retryFile, { name: item.title }) });
    },
  };
}
export type ComposerRetained = ReturnType<typeof retainComposer>;
