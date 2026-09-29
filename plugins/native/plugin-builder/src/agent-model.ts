import type { PluginComponentNode, PluginComponentPlan, PluginPresentation } from '@molis-ai/molis-work-design-system';
import type { SandboxEffects, SandboxJson, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { BuildManifest, BuildCheckResult } from '@molis-ai/molis-work-contracts/platform/plugin-builder';

export interface BrowserAcceptance {
  id: string;
  description: string;
  steps: Array<
    | { action: 'page'; pageId: string }
    | { action: 'fill'; componentId: string; field: string; value: string | boolean }
    | { action: 'submit'; componentId: string }
    /** A record is chosen by its stable id or, since ids are made at run time, by text it shows. */
    | { action: 'select'; componentId: string; recordId?: string; text?: string }
    | { action: 'expect'; componentId: string; text: string }
    | { action: 'expectAbsent'; componentId: string; text: string }
    | { action: 'expectValue'; componentId: string; field: string; value: string | boolean }
    /** The texts appear in this order within the component, e.g. the newest record first. */
    | { action: 'expectOrder'; componentId: string; texts: string[] }
    | { action: 'reload' }
  >;
}
export interface AgentDesign {
  /** The capability catalog the design was made against (see the host); absent for designs from before it. */
  catalog?: string;
  id: string;
  title: string;
  description: string;
  rationale: string;
  journey: string[];
  contract: SandboxPluginContract;
  parts: PluginComponentPlan[];
  acceptance: BrowserAcceptance[];
  presentation?: PluginPresentation;
  /** The pre-freeze UI decision and representative content; advisory context, not executable acceptance. */
  experience?: { summary: string; scenarios: Array<{ task: string; content: SandboxJson; expected: string }> };
}
/** Stage one of design: a product-level proposal the person compares; only the chosen one is designed in full. */
export interface AgentProposal {
  id: string;
  title: string;
  description: string;
  rationale: string;
  journey: string[];
  effects: SandboxEffects;
  /** Enough contract and parts to render the proposal on the canvas; never built or validated as a plugin. */
  preview: { contract: SandboxPluginContract; parts: PluginComponentPlan[]; presentation?: PluginPresentation };
  /** A picture of the proposal, when an image service is configured (W7): drawn once, never retried. */
  mockup?: { status: 'drawing' | 'ready' | 'failed'; jobId?: string; imageId?: string; reason?: string };
}
export interface AgentBuildStep {
  id: string; agent: 'design' | 'ui' | 'code' | 'host'; action: string;
  label: string; status: 'queued' | 'active' | 'done' | 'waiting' | 'failed' | 'cancelled';
  target?: string; operationId?: string; detail?: string; at: string;
  selection?: { source: 'rule' | 'jev' | 'user' | 'design'; candidates: string[]; choice: string; model?: string; elapsedMs?: number; confidence?: number | null };
}
export interface AgentBuildSnapshot {
  design: AgentDesign | null; nodes: PluginComponentNode[]; connected: string[]; directory?: string;
  /** The designer's own authoring answer for this design; a revision hands it back so the model edits its own format. */
  designSource?: string;
  checks?: Record<string, BuildCheckResult>;
  browserResult?: { passed: boolean; cases: Array<{ id: string; passed: boolean; detail: string }>; at: string };
  visualResult?: { structural: boolean; status: 'reviewed' | 'unavailable' | 'failed'; issues: string[]; at: string; revision: string; elapsedMs: number };
  /** A paused visual revision resumes without starting code generation. */
  pendingVisual?: string;
}
export interface AgentBuild extends AgentBuildSnapshot {
  id: string; revision: number; brief: string; title: string;
  phase: 'draft' | 'designing' | 'clarifying' | 'choosing' | 'building' | 'paused' | 'failed' | 'ready';
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  candidates: AgentProposal[]; chosen?: string; questions: string[]; clarificationAnswered: boolean;
  active: { token: string; stage: 'design' | 'detail' | 'revise' | 'build' | 'visual'; contractRevision?: string } | null;
  /** The designer's last host-normalized notes (dropped unknown settings), shown so nothing disappears silently. */
  notes?: string[];
  steps: AgentBuildStep[]; checks: Record<string, BuildCheckResult>;
  browserResult?: { passed: boolean; cases: Array<{ id: string; passed: boolean; detail: string }>; at: string };
  runs: Array<{ id: string; role: string; phase: string; configuredModel: string; reportedModels: string[]; promptVersion: string; error?: string }>;
  pendingPart?: { id: string; candidates: string[]; reason: string };
  /** Plugins the design uses that this project has not enabled: the build waits until the person enables them or declines. */
  pendingPlugins?: Array<{ pluginId: string; title: string; capabilities: string[] }>;
  /** Operations a revision changes inside under the same contract (e.g. the model's instructions), with the change the code agent makes. */
  rework?: Record<string, string>;
  history: AgentBuildSnapshot[];
  error: string | null; createdAt: string; updatedAt: string;
}
/**
 * What a generated plugin tells the model, declared in its source (`export const prompts = [...]`) and called by id
 * (`model.generate` with `{ prompt: id, input }`). The Host registers them when the plugin is installed, so the person
 * sees and edits them in “Prompt 与 Character” like every other prompt.
 */
export interface PluginPrompt { id: string; title: string; purpose: string; body: string }
export interface AgentRelease {
  buildId: string; pluginId: string; version: number; design: AgentDesign; nodes: PluginComponentNode[];
  manifest: BuildManifest; directory: string; bundlePath: string; packagePath: string;
  permissions: SandboxEffects; publishedAt: string;
  /** Its declared prompts; absent in releases made before prompts were declared (they still send inline instructions). */
  prompts?: PluginPrompt[];
}
