import type { HostCapabilityInvocation, LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { CallContext, CallDescription, CallOutcome, SubjectOfferChoiceView } from "@molis-ai/molis-work-kernel";
import type { ActionAvailability, ActionCallContext, ActionProvider, ActionReference, ActionSceneDefinition, ActionSceneUsage, ActionSceneView, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";

export interface LocalHostRuntimeFactory<Runtime> {
  open(reference: LocalHostProjectReference): Runtime | Promise<Runtime>;
  close(runtime: Runtime, reference: LocalHostProjectReference): void | Promise<void>;
}

export type ActionAvailabilityCheck = (context: ActionCallContext, action: ActionView) => ActionAvailability | Promise<ActionAvailability>;
/** What an action the Host registers runs: its project's runtime, the input, and the call's own fences. */
export type HostCapabilityHandler<Runtime, Input, Output> = (runtime: Runtime, input: Input, invocation: HostCapabilityInvocation) => Output | Promise<Output>;
/** What one discovery reads once and shares across its actions' dependency checks. */
export interface DiscoveryPass {
  actions(): (reference: ActionReference) => ActionView | undefined;
  scene(reference: Pick<ActionSceneDefinition, "scene_id" | "version">): ActionSceneView | undefined;
  bindings(reference: Pick<ActionSceneDefinition, "scene_id" | "version">): Promise<readonly ActionSceneUsage[]>;
  choices(): readonly SubjectOfferChoiceView[];
}
export type ActionAvailabilityPolicy = ActionAvailabilityCheck & {
  /** One directory read may share a snapshot; invocation and effect checks always use the live function. */
  snapshotForDiscovery?(context: ActionCallContext): ActionAvailabilityCheck | Promise<ActionAvailabilityCheck>;
};

export interface LocalHostOptions<Runtime> {
  runtimeFactory: LocalHostRuntimeFactory<Runtime>;
  /** Synchronous lifecycle fence; does not grant project access. */
  assertProjectAvailable?(projectId: string): void;
  instanceId?: string;
  sceneAvailability?(context: ActionCallContext, scene: ActionSceneView): ActionAvailability | Promise<ActionAvailability>;
  /** A plugin scene retains its original producer authority across preparation, judgment and consumption. */
  retainSceneAuthority?(scene: ActionSceneView, project?: LocalHostProjectReference): Promise<() => void>;
  actionAvailability?: ActionAvailabilityPolicy;
  /** Throws to refuse a provider before it is registered: nothing is registered or written for a refused one. */
  admitActionProvider?(provider: ActionProvider, scenes?: readonly ActionSceneDefinition[]): void;
  /** A provider was registered or withdrawn, with the project it was bound to; on registration, also the consumption scenes it registered. Observers must not throw. */
  actionProvidersChanged?(provider: ActionProvider, scenes?: readonly ActionSceneDefinition[]): void;
  /** Every call, once, as it ended (a handler's result or failure, or a refusal before any handler), with its caller and the operation's call id; never its input or result. */
  actionSettled?(caller: CallContext, action: CallDescription, outcome: CallOutcome): void;
}
