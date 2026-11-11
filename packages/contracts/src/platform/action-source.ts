import type { ExactActionReference } from "./actions.js";

/** Where a delegated call came from, one hop (BL-803); part of `ActionCallContext`. */
export interface ActionDelegationSource {
  /**
   * The one action the delegating plugin's handler was running when it made this call: the exact reference the dispatcher resolved for
   * that handler, with `direct_person_entry` when the Runtime saw it entered as the person's own call. Set only by the Host's action
   * directory (S-43), from the Runtime's scope of that running handler, never from what a caller carried in. The target reads it to tell
   * where a delegated call came from (Goals takes a Feed promotion as the person's only from Feed's real promote entered by the person).
   * It grants nothing and narrows nothing. Never business input.
   */
  readonly delegated_action?: Readonly<ExactActionReference & { readonly direct_person_entry?: true }>;
}

/** Whether a plugin handler's call entered it as the person's own (BL-803); part of `ActionExecutionContext`. */
export interface ActionPersonEntry {
  /**
   * Set by the Plugin Runtime on the context a plugin handler is given: audience `user`, not delegated, not a scene's run, and no plugin
   * action, job or scene of any plugin running around it. The person's request a plugin's route forwards to its own action counts; a
   * plugin's action calling its own other action does not. Absent when not proven. Never business input, and copying it onto another
   * caller proves nothing: only the Runtime's scope is read.
   */
  readonly direct_person_entry?: true;
}
