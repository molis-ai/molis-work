import type { ActionCallOrigin } from "../platform/actions.js";

/** Host-owned, in-memory: authority checks, and the call number the Host gave the round (never from a Plugin payload). */
export interface AgentStartExecution extends ActionCallOrigin {
  beforeStart?(): void | Promise<void>;
  /** Original invocation's synchronous fence; only the start/accept phase uses it, never background dispatch. */
  assertBeforeStart?(): void;
  /** Live owner authority, valid beyond the start invocation's lifetime. */
  beforeDispatch?(): void | Promise<void>;
}

