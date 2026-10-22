import { ActionError, bindArtifactPreview, requireSynchronous, type ActionAvailability, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { CHARACTER_ARTIFACT_TYPE } from "@molis-ai/molis-work-contracts/modules/characters";
import type { CharactersActionHandlers } from "./action-handlers.js";
import { charactersActions } from "./actions.js";
import { characterArtifactMarkdown } from "./artifact-preview.js";

/**
 * The checks a write makes in the caller's own turn: `current` (still running, still authorized, synchronously) right before the
 * write itself, and `beforeWrite`, which first waits for the dispatcher's own checks (`beforeEffect`) and then makes it.
 */
export interface CharacterCallGuard { beforeWrite(): Promise<void>; current(): void }

export function characterCallGuard(caller: ActionExecutionContext): CharacterCallGuard {
  const current = () => {
    caller.signal?.throwIfAborted();
    requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成");
  };
  return { current, beforeWrite: async () => { caller.signal?.throwIfAborted(); await caller.beforeEffect(); current(); } };
}

/** Drafts and publications are the person's own: another caller is refused, never served as that person. */
const ownerAvailability = (actorId: string) => (caller: ActionCallContext): ActionAvailability => caller.actor_id === actorId ? { available: true }
  : { available: false, code: "actions.owner_mismatch", reason: "此入口使用本地用户的个人状态与成果；当前调用者尚未接通独立归属，不能借用该用户身份" };

/**
 * Every Characters action bound for its owner, for the Host's provider: a command makes its write checks before the handler runs
 * and hands them on (a handler that waits again checks again), and a launch keeps them up to the start of the native Agent.
 * `handlersFor` builds the handlers for one call, so what they write through (the 成果库) checks that call's caller too.
 */
export function bindCharactersActions(actorId: string, handlersFor: (caller: ActionExecutionContext, guard: CharacterCallGuard) => CharactersActionHandlers): ActionHandlerBinding[] {
  const availability = ownerAvailability(actorId);
  const own = <I, O>(definition: ActionDefinition<I, O>, handle: (handlers: CharactersActionHandlers, input: I, guard: CharacterCallGuard) => unknown): ActionHandlerBinding =>
    ({ ...definition, availability, async handle(caller, input) {
      const owner = availability(caller);
      if (!owner.available) throw new ActionError(owner.code, owner.reason);
      const guard = characterCallGuard(caller);
      if (definition.operation !== "query") await guard.beforeWrite();
      return handle(handlersFor(caller, guard), input as I, guard);
    } });
  const a = charactersActions;
  return [bindArtifactPreview(a.artifactPreview, CHARACTER_ARTIFACT_TYPE, characterArtifactMarkdown),
    own(a.searchEntries, (h, input) => h.searchEntries(input)),
    own(a.subject, (h, input) => h.subject(input)),
    own(a.list, h => h.list()),
    own(a.actions, h => h.actions()),
    own(a.create, h => h.create()),
    own(a.update, (h, input) => h.update(input)),
    own(a.state, (h, input, guard) => h.state(input, guard.beforeWrite)),
    own(a.publish, (h, input, guard) => h.publish(input, guard.beforeWrite)),
    own(a.runs, (h, input) => h.runs(input)),
    own(a.discover, (h, input) => h.discover(input)),
    own(a.importFile, (h, input) => h.importFile(input)),
    own(a.import, (h, input) => h.import(input)),
    own(a.draftFile, (h, input) => h.draftFile(input)),
    own(a.publicationFile, (h, input) => h.publicationFile(input)),
    own(a.execution, (h, input) => h.execution(input)),
    own(a.runnable, (h, input) => h.runnable(input)),
    own(a.usages, (h, input) => h.usages(input)),
    own(a.launch, (h, input, guard) => h.launch(input, { beforeStart: guard.beforeWrite, assert_current: guard.current })),
  ];
}
