import type { AsyncLocalStorage } from "node:async_hooks";
import { SYSTEM_TOOL_NAMES, type ExactRef, type ModelEvent, type Runtime, type Skill } from "@prologue/sdk";
import type { createNodeHost } from "@prologue/sdk/node";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ActionView, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PrologueAdapterPorts, PrologueStartInput } from "./prologue.js";
import { agentErrors } from "../errors.js";
import type { HostMcpConnection, SaveMcpConnection } from "./prologue-mcp.js";
import type { PrologueSurfacePorts } from "./prologue-surfaces.js";
import type { AgentReviewQueue } from "../reviews.js";
import type { RoundFacts } from "./announce-guard.js";
import type { StopGuard } from "./prologue-stop-guard.js";

/**
 * What the parts of the Node composition share (W4-06 split `initializePrologueNodeAdapter` into them): the adapter's
 * options, what the rounds keep beside the SDK in memory, and the few helpers every part uses.
 */

export interface PrologueNodeAdapterOptions extends PrologueAdapterPorts {
  /** Synchronous Catalog pending receipt fact; deletion itself uses its original held lane. */
  projectDeletionPending?(projectId: string, sessionId?: string): boolean;
  /** App taxonomy and live memory authority; absent means memory is unavailable. */
  memory?: import("./prologue-memory-authority.js").PrologueMemoryOptions;
  /** Parsers the App supplies for documents people bring (PDF…); the runtime ships none. */
  documentParsers?: readonly import("@molis-ai/molis-work-contracts/services/agent-host").AgentDocumentParser[];
  /** Host-owned surface; absence keeps all writes unavailable. */
  reviewQueue?: AgentReviewQueue;
  questionTypes?: readonly import("@molis-ai/molis-work-contracts/services/agent-interaction").AgentQuestionType[]; // typed types every interface showing questions renders; absent or empty: the plain question
  /** The kinds a reference question may ask for, each with its owner's name (T2); offered only with the "reference" type. */
  referenceKinds?: ReadonlyArray<{ kind: string; title: string }>;
  /** Each round's own kinds, from its project's installed plugins (BL-152); absent or empty: the Runtime's `referenceKinds`. */
  referenceKindsFor?: import("./prologue-reference-kinds.js").ReferenceKindsFor;
  /** Reads each object a person picked for a reference question again from its owner before the answer goes on, for its label (S-26); absent: refused. */
  readReferences?: import("./prologue-questions.js").ReferenceReader;
  /**
   * The side panel's browser pages (specs/archive/side-panel): attached to a business round in their project, looked at and
   * driven only through Prologue's interface control. Absent: no round gets the surface tools.
   */
  surfaces?: PrologueSurfacePorts;
  /** What the Host answers when a step's wait on a file is looked at (prologue-checkers.ts). Absent: such a wait is refused. */
  checks?: import("./prologue-checkers.js").PrologueCheckPorts;
  /** App identity Prologue records against this Runtime's work. */
  app: { readonly appId: string; readonly appVersion: string };
  /** Where the Node host keeps its own storage. A Host fact, never surfaced to Plugins. */
  storageRoot: string;
  /** A genuine live parent for this exact storage root; only the Host composition can pass it. */
  storageOwner?: import("@molis-ai/molis-work-storage").StorageOwner;
  /**
   * Turns a Molis Work credential reference into the actual key.
   *
   * The two systems keep separate credential stores, so a reference minted by
   * Molis Work means nothing to Prologue. The key crosses here, once per
   * reference, and is handed straight to Prologue's own store in exchange for a
   * reference it can resolve. Without this, a Run reaches the provider with a
   * reference that resolves to nothing.
   */
  resolveCredential?: (credentialRef: string) => string | null | Promise<string | null>;
  resolveMcpConnection?: (connectionId: string, endpoint: string) => HostMcpConnection | Promise<HostMcpConnection>;
  saveMcpConnection?: SaveMcpConnection;
  subscribeMcpConnections?: (listener: (connectionId: string) => void) => () => void;
}

export type NodeHost = ReturnType<typeof createNodeHost>;
export type DispatchGuards = AsyncLocalStorage<() => void | Promise<void>>;
export type CommandEvent = Extract<ModelEvent, { type: "command-receipt" }>;
/** The kinds of ending a round's stop check holds once each. */
export type HeldKind = "memory" | "written" | "button" | "ids" | "saved" | "announce";

// This resource combines base/role/Character/project instructions, selected
// methods and recovery context. The SDK default is for one instruction file;
// it must not silently cut a valid 20,000-character published Character.
export const MAX_COMPOSED_INSTRUCTION_CHARS = 64_000;

/** What the rounds of this runtime keep beside the SDK, in memory, by session or by run. */
export interface RoundState {
  readonly registeredMethods: Map<string, Skill>;
  readonly sessions: Map<string, ExactRef<"session">>;
  readonly actionToolSessions: Set<string>;
  /** The gateway a business session's latest round runs with, for describing a held change to the person. */
  readonly gatewayRuns: Map<string, NonNullable<PrologueStartInput["action_gateway"]> & { declare?(view: ActionView): void }>;
  /** Per session, the capability ids the round now running has seen offered (its replies do not show them to the person). */
  readonly gatewayKnown: Map<string, Set<string>>;
  /** Per session, the exact identities the round now running has seen offered (so one gone later reads as taken away). */
  readonly gatewayOffered: Map<string, Set<string>>;
  readonly gatewayHooks: Set<string>;
  /** Why each held ending was held, in order (the runtime's event does not say). */
  readonly heldLabels: Map<string, Array<{ target: string; summary: string }>>;
  /** Per business session, what the round now running really kept and forgot, and whether it could: switched off, or given without the tool that keeps (or forgets), as a work handed down by another work is. */
  readonly memoryRounds: Map<string, { keep: number; forget: number; off: boolean; without: { keep: boolean; forget: boolean } }>;
  /** Capability calls this round finished without error: a reply may not say something was saved when no change was. */
  readonly changeRounds: Map<string, { client: AgentActionClient; invoked: ExactActionReference[] }>;
  /** Per session, the stop check's view of the round now running (prologue-stop-guard.ts); the sessions whose check is registered. */
  readonly stopGuards: Map<string, StopGuard>;
  readonly stopHooks: Set<string>;
  /** Per run, what the round called and how each call ended, from its events (ending-review.ts). */
  readonly roundFacts: Map<string, RoundFacts>;
  readonly actionControllers: Map<string, AbortController>;
  readonly runRoots: Map<string, ExactRef<"authorized-root">>;
  readonly activeRuns: Map<string, { live(): boolean; steer(text: string): Promise<void> }>;
  /** Raw SDK observers retained until their session's local view is released. */
  readonly runObservers: Map<string, Set<() => void>>;
  /** Which session each run belongs to, and the run ref, so "allow in this app this round" binds to that run. */
  readonly runSessions: Map<string, string>;
  readonly runRefs: Map<string, ExactRef<"run">>;
  readonly reviewEffects: Map<string, ExactRef<"effect">>;
  readonly deadlines: Map<string, number>;
  readonly commandEvents: Map<string, CommandEvent[]>;
  readonly subagentBridgeErrors: Map<string, Record<string, string>>;
  /** Each session's main round running now, for messages that should reach it at once. */
  readonly liveSessions: Map<string, string>;
  /** Main rounds registered as project work: which item, in which project and directory. */
  readonly runWork: Map<string, { project: string; id: string; session: ExactRef<"session">; directory: string }>;
  /** Each running round's own pre-dispatch check, asked again before every child it dispatches. */
  readonly dispatchChecks: Map<string, () => Promise<void>>;
}

export function createRoundState(): RoundState {
  return {
    registeredMethods: new Map(), sessions: new Map(), actionToolSessions: new Set(), gatewayRuns: new Map(), gatewayKnown: new Map(), gatewayOffered: new Map(),
    gatewayHooks: new Set(), heldLabels: new Map(), memoryRounds: new Map(), changeRounds: new Map(),
    stopGuards: new Map(), stopHooks: new Set(), roundFacts: new Map(), actionControllers: new Map(), runRoots: new Map(), activeRuns: new Map(), runObservers: new Map(), runSessions: new Map(),
    runRefs: new Map(), reviewEffects: new Map(), deadlines: new Map(), commandEvents: new Map(), subagentBridgeErrors: new Map(),
    liveSessions: new Map(), runWork: new Map(), dispatchChecks: new Map(),
  };
}

/** Keep the original unsubscribe without creating another observer or execution lifecycle. */
export function retainRunObserver(state: Pick<RoundState, "runObservers">, runId: string, unsubscribe: () => void): void {
  const observers = state.runObservers.get(runId) ?? new Set<() => void>();
  observers.add(unsubscribe);
  state.runObservers.set(runId, observers);
}

export const sameRef = (a: { kind?: unknown; id?: unknown; revision?: unknown } | undefined, b: { kind: string; id: string; revision: number }) =>
  a?.kind === b.kind && a.id === b.id && a.revision === b.revision;

/** A text resource the person brought, read whole (bounded at 1 MiB). */
export async function readResourceText(runtime: Runtime, ref: ExactRef<"resource">): Promise<string> {
  const handle = runtime.resources.inspect(ref);
  if (!handle || handle.byteLength > 1024 * 1024) throw new Error("要输入的文字不可读取");
  const bytes = new Uint8Array(handle.byteLength);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const chunk = await runtime.resources.readChunk(ref, offset, Math.min(64 * 1024, bytes.byteLength - offset));
    if (!chunk.bytes.byteLength) break;
    bytes.set(chunk.bytes, offset); offset += chunk.bytes.byteLength;
  }
  return new TextDecoder().decode(bytes.subarray(0, offset));
}

/** An execution resource (a review, a receipt), read whole and exactly, as JSON; anything short or out of order is refused. */
export async function readResource(runtime: Runtime, ref: ExactRef<"resource">) {
  const handle = runtime.resources.inspect(ref);
  if (!handle || handle.byteLength > 8 * 1024 * 1024) throw new Error("完整执行资源不可读取，不能使用截断内容");
  const bytes = new Uint8Array(handle.byteLength);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const chunk = await runtime.resources.readChunk(ref, offset, Math.min(64 * 1024, bytes.byteLength - offset));
    if (chunk.offset !== offset || !chunk.bytes.byteLength || offset + chunk.bytes.byteLength > bytes.byteLength) throw new Error("执行资源不完整");
    bytes.set(chunk.bytes, offset); offset += chunk.bytes.byteLength;
    if (chunk.done && offset !== bytes.byteLength) throw new Error("执行资源提前结束");
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Translate the Host vocabulary at the SDK boundary; unknown tools fail before a Run. */
export function prologueToolName(name: string): string {
  const translated = name === "read-file" ? "read" : name === "edit-file" ? "edit" : name;
  if (!(SYSTEM_TOOL_NAMES as readonly string[]).includes(translated)) {
    throw new Error(`agent.capability_unavailable: Prologue 不认识工具 ${name}`);
  }
  return translated;
}

/** Publish the actual instructions before handing their exact reference to Character. */
export async function stageInstructions(
  sdk: Pick<Runtime, "resources">,
  instructions: string,
): Promise<ExactRef<"resource"> | undefined> {
  if (instructions.length > MAX_COMPOSED_INSTRUCTION_CHARS) {
    throw agentErrors.capability_unavailable("本轮角色、项目说明、方法与恢复上下文合计超过 64000 字符，未启动执行。请缩短指令或减少本轮选择的方法后重试；不会截断指令。");
  }
  if (instructions.trim() === "") return undefined;
  return stageTextResource(sdk, instructions, "role-instructions");
}

export async function stageTextResource(sdk: Pick<Runtime, "resources">, text: string, label: string): Promise<ExactRef<"resource">> {
  const bytes = new TextEncoder().encode(text);
  const stage = sdk.resources.stage({
    mediaKind: "text",
    byteLength: bytes.byteLength,
    label,
  });
  try {
    stage.write(bytes);
    return (await stage.publishDurable()).ref;
  } catch (error) {
    stage.discard();
    throw error;
  }
}
