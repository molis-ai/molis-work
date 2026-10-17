/** Dedicated generated-plugin authoring port; implementations remain in Agent Host. */
export interface BuilderAgentActivity {
  type: 'file' | 'check' | 'tool';
  name: string;
  detail: string;
  path?: string;
}

/** A Skill a builder run mounts through Prologue: an exact version, inlined once for the run. */
export interface BuilderSkill { id: string; version: number; name: string; body: string }

export interface BuilderAgentRequest {
  role: 'designer' | 'coder';
  instruction: string;
  promptVersion: string;
  /** The standard this stage works to (the plugin development Skill), mounted through Prologue's Skill registry. */
  skills?: readonly BuilderSkill[];
  task: string;
  contractRevision: string;
  /** Host-owned PNG previews, sent through the same Runtime as text. Never logged as base64. */
  images?: readonly { label: string; bytes: Uint8Array }[];
  operationIds?: readonly string[];
  /** When set, the only files (relative to the build directory) this code run may write: its own operation's, while others are written alongside it. */
  writable?: readonly string[];
  signal?: AbortSignal;
  checks?(operationIds: readonly string[], signal: AbortSignal): Promise<unknown>;
  onActivity?(activity: BuilderAgentActivity): void;
}

export interface BuilderAgentRecord {
  id: string;
  /** Older tool-free model-call records remain readable; new calls use the shared inference port. */
  role: BuilderAgentRequest['role'] | 'model';
  promptVersion: string;
  contractRevision: string;
  instruction: string;
  input: string;
  output: string;
  configuredModel: string;
  /** Empty means the provider did not report its actual model; never substitute the requested model. */
  reportedModels: string[];
  sessionId?: string;
  runId?: string;
  phase: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  startedAt: string;
  finishedAt?: string;
  error?: string;
  activity: BuilderAgentActivity[];
  usage: unknown[];
}

/** Serializable execution facts from the shared inference service; absent counts remain unknown. */
export interface BoundedInferenceReceipt {
  readonly run_ref: { readonly kind: "run"; readonly id: string; readonly revision: number };
  readonly state: "completed" | "failed" | "cancelled" | "tripped" | "circuit-tripped";
  readonly configuredModel: string;
  readonly reportedModels: readonly string[];
  readonly usage: readonly {
    readonly input: InferenceTokenCount; readonly output: InferenceTokenCount;
    readonly cacheRead: InferenceTokenCount; readonly cacheWrite: InferenceTokenCount;
    readonly cost: { readonly source: InferenceUsageSource; readonly amount?: number; readonly currency?: string };
  }[];
}

export type InferenceUsageSource = "reported" | "estimated" | "unknown";

export interface InferenceTokenCount { readonly source: InferenceUsageSource; readonly tokens?: number }
