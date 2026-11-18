import { ActionError, bindActionHandler, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { BLUEPRINTS_PROVIDER_ID, blueprintActions, blueprintsErrors, type BlueprintAdoptionTarget } from "@molis-ai/molis-work-contracts/services/blueprints";
import { AdoptionExecution, assertCurrent, type AdoptionProgress } from "./adopt.js";
import { previewSettings, type SettingsAccess } from "./preview.js";
import { AdoptionStore } from "./store.js";

export { BLUEPRINTS_HOME_STORE } from "./schema.js";
export { AdoptionStore, type DiscoveredSetting, type SettingBinding } from "./store.js";
export type { SettingsAccess } from "./preview.js";
export type { AdoptionProgress } from "./adopt.js";

export interface BlueprintHostPorts {
  readonly home: string;
  readonly locale: () => string;
  readonly now: () => Date;
  readonly access: (caller: ActionExecutionContext, projectId: string | null, preview?: BlueprintAdoptionTarget) => Promise<SettingsAccess>;
  readonly ensureProject: (caller: ActionExecutionContext, id: string, displayName: string) => Promise<void>;
  readonly notify: (actor: string, progress: AdoptionProgress) => void;
}

/** Each adoption has a single active writer in its Home. Other adoptions and reads continue independently. */
export function blueprintProvider(host: BlueprintHostPorts): ActionProviderRegistration {
  const store = new AdoptionStore(host.home), service = new AdoptionExecution(store, host.notify);
  const active = new Map<string, Promise<void>>();
  const serialized = async <T>(id: string, caller: ActionExecutionContext, run: () => Promise<T>): Promise<T> => {
    const previous = active.get(id);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    active.set(id, pending);
    try {
      if (previous) await previous;
      assertCurrent(caller);
      return await run();
    } finally {
      release();
      if (active.get(id) === pending) active.delete(id);
    }
  };
  const a = blueprintActions;
  const undo = <Op extends "remove" | "revert">(op: Op, caller: ActionExecutionContext, input: { adoption_id: string; request_id: string }) => {
    const { row } = store.load(caller, "adoption_id", input.adoption_id);
    return serialized(row.preview_id, caller, () => service.undo(caller, input, op, project => host.access(caller, project)));
  };
  const handlers = [
    bindActionHandler(a.library, (input, caller) => { assertCurrent(caller); return store.library(caller, input); }),
    bindActionHandler(a.draftSave, async (input, caller) => {
      await caller.beforeEffect(); assertCurrent(caller);
      return store.saveDraft(caller, input, caller.locale ?? host.locale());
    }),
    bindActionHandler(a.draftRead, (input, caller) => { assertCurrent(caller); return { draft: store.draft(caller, input.draft_id) }; }),
    bindActionHandler(a.preview, async (input, caller) => {
      if (input.source.kind !== "draft") throw blueprintsErrors.part_unsupported("已签名场景包的采用尚未开放");
      if (input.target.kind === "current_project" && !caller.project_id) throw new ActionError("actions.project_required", "请在项目中查看");
      const draft = store.draft(caller, input.source.draft_id);
      const access = await host.access(caller, input.target.kind === "current_project" ? caller.project_id : null, input.target);
      return previewSettings(store, access, caller, input, draft, host.now().getTime(), 15 * 60_000);
    }),
    bindActionHandler(a.apply, (input, caller) => serialized(input.preview_id, caller, () =>
      service.apply(caller, input, host.now().getTime(), project => host.access(caller, project), (id, name) => host.ensureProject(caller, id, name)))),
    bindActionHandler(a.read, (input, caller) => service.read(caller, input.adoption_id, project => host.access(caller, project))),
    bindActionHandler(a.revert, (input, caller) => undo("revert", caller, input)),
    bindActionHandler(a.remove, (input, caller) => undo("remove", caller, input)),
  ];
  return { provider: { provider_id: BLUEPRINTS_PROVIDER_ID, kind: "system", title: "场景采用" },
    definitions: [a.library, a.draftSave, a.draftRead, a.preview, a.apply, a.read, a.revert, a.remove], handlers };
}
