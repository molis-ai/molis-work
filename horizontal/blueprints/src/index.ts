import { ActionError, LOCAL_PERSON_ACTOR_ID, bindActionHandler, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
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

function assertAdopter(caller: ActionExecutionContext) {
  if (caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.audience !== "user" || caller.actor_kind === "runtime" || caller.delegated_by || caller.host_plugin)
    throw new ActionError("actions.forbidden", "场景设置只能由本人采用");
  assertCurrent(caller);
}

/** Competing changes to one setting layer run in order, including scenes that only reuse the first scene's value. */
export function blueprintProvider(host: BlueprintHostPorts): ActionProviderRegistration {
  const store = new AdoptionStore(host.home), service = new AdoptionExecution(store, host.notify);
  const active = new Map<string, Promise<void>>();
  const serialized = async <T>(by: "preview_id" | "adoption_id", id: string, caller: ActionExecutionContext, run: () => Promise<T>): Promise<T> => {
    assertAdopter(caller);
    const { row, steps } = store.load(caller, by, id);
    const keys = new Set([row.preview_id]);
    for (const { plan } of steps) if (plan) {
      const project = plan.layer === "project" || plan.binding.project_scoped ? row.project_id : null;
      keys.add(JSON.stringify([caller.actor_id, project, plan.binding.provider_id, plan.key, plan.layer]));
    }
    const previous = Array.from(keys, key => active.get(key));
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    for (const key of keys) active.set(key, pending);
    try {
      await Promise.all(previous);
      assertCurrent(caller);
      return await run();
    } finally {
      release();
      for (const key of keys) if (active.get(key) === pending) active.delete(key);
    }
  };
  const a = blueprintActions;
  const undo = <Op extends "remove" | "revert">(op: Op, caller: ActionExecutionContext, input: { adoption_id: string; request_id: string }) =>
    serialized("adoption_id", input.adoption_id, caller, () => service.undo(caller, input, op, project => host.access(caller, project)));
  const handlers = [
    bindActionHandler(a.library, (input, caller) => { assertAdopter(caller); return store.library(caller, input); }),
    bindActionHandler(a.draftSave, async (input, caller) => {
      await caller.beforeEffect(); assertCurrent(caller);
      return store.saveDraft(caller, input, caller.locale ?? host.locale());
    }),
    bindActionHandler(a.draftRead, (input, caller) => { assertCurrent(caller); return { draft: store.draft(caller, input.draft_id) }; }),
    bindActionHandler(a.preview, async (input, caller) => {
      assertAdopter(caller);
      if (input.source.kind !== "draft") throw blueprintsErrors.part_unsupported("已签名场景包的采用尚未开放");
      if (input.target.kind === "current_project" && !caller.project_id) throw new ActionError("actions.project_required", "请在项目中查看");
      const draft = store.draft(caller, input.source.draft_id);
      const access = await host.access(caller, input.target.kind === "current_project" ? caller.project_id : null, input.target);
      return previewSettings(store, access, caller, input, draft, host.now().getTime(), 15 * 60_000);
    }),
    bindActionHandler(a.apply, (input, caller) => serialized("preview_id", input.preview_id, caller, () =>
      service.apply(caller, input, host.now().getTime(), project => host.access(caller, project), (id, name) => host.ensureProject(caller, id, name)))),
    bindActionHandler(a.read, (input, caller) => { assertAdopter(caller); return service.read(caller, input.adoption_id, project => host.access(caller, project)); }),
    bindActionHandler(a.revert, (input, caller) => undo("revert", caller, input)),
    bindActionHandler(a.remove, (input, caller) => undo("remove", caller, input)),
  ];
  return { provider: { provider_id: BLUEPRINTS_PROVIDER_ID, kind: "system", title: "场景采用" },
    definitions: [a.library, a.draftSave, a.draftRead, a.preview, a.apply, a.read, a.revert, a.remove], handlers };
}
