import type { ComposerDraftAdapter } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { composerDraftKey } from "../composer-rules.js";
import type { Composer, Item } from "./composer-state.js";

type Kept = Pick<Composer, "delivery" | "items" | "phase" | "failure" | "check" | "requestId"> & { revision: number; submitted?: { text: string; items: readonly Item[]; revision: number }; current?: Composer };
const roots = new WeakMap<HTMLElement, Map<string | ComposerDraftAdapter | symbol, Kept>>();
/**
 * Same-document selections belong to their draft. No File or owner reference is copied into persistent storage. A mount that keeps
 * no draft keeps nothing past itself either: its own key is new each time.
 */
export function retainComposer(c: Composer) {
  let draftsHere = roots.get(c.root);
  if (!draftsHere) roots.set(c.root, draftsHere = new Map());
  const { draft } = c.options;
  const key = !draft ? Symbol(c.id) : "adapter" in draft ? draft.adapter : composerDraftKey({ project: document.body.dataset.projectId || "home",
    install: c.root.closest<HTMLElement>("[data-plugin-owner]")?.dataset.pluginOwner || document.body.dataset.pluginId || "workbench",
    entry: c.options.entry, conversation: draft.conversation });
  let kept = draftsHere.get(key);
  if (!kept) draftsHere.set(key, kept = { delivery: "next-boundary", items: [], phase: "", failure: "", check: null, requestId: "", revision: 0 });
  const state = kept;
  state.current = c;
  const retain = <Key extends keyof Kept>(name: Key) => Object.defineProperty(c, name, { get: () => state[name], set: (value: Kept[Key]) => { state[name] = value; } });
  for (const name of ["delivery", "items", "phase", "failure", "check", "requestId"] as const) retain(name);
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
