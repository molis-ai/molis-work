import type { ActionDefinition, ActionSchema } from "../platform/actions.js";
import type { ArtifactReference } from "./artifacts.js";
import type { AgentSessionOwner, AgentSessionRef } from "../services/agent-host.js";

/** Original body-free selection, saved by the Home recovery owner before SDK Session destruction. */
export interface CodingSessionPurgeSelection {
  readonly session: AgentSessionRef;
  readonly owner: AgentSessionOwner;
  readonly installation_generation: string;
  readonly sessions: readonly { readonly session_id: string; readonly created_at: string; readonly keys: readonly string[] }[];
  readonly waits: readonly { readonly wait_id: string; readonly keys: readonly string[] }[];
}

/** The input of `coding.results.document`: which fixed Coding report or change set to turn into text. */
export interface CodingResultDocumentInput { reference: ArtifactReference }
/** One fixed Coding result as text a consumer can copy: the reader adds its own heading, source and fingerprint. */
export interface CodingResultDocument {
  reference: ArtifactReference;
  title: string;
  saved_at: string;
  /** A report's own Markdown, or a change set's files as Markdown (the original review text before and after each write). */
  markdown: string;
}

const versionReference: ActionSchema = {
  type: "object",
  properties: { artifact_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "integer", minimum: 1 } },
  required: ["artifact_id", "version"], additionalProperties: false,
};

/**
 * `coding.results.document`, defined once: Coding declares and answers it, and a plugin that takes a copy of one of Coding's fixed
 * results (Shelf's 接收项目成果) names its `capability_id` in its Manifest `capabilities.consumes` and invokes it through
 * `services.actions`, never reaching Coding's implementation. Open to the plugin audience only, so it is neither an MCP tool nor a
 * step an agent or a workflow can pick; the caller needs `artifact:read`. Coding refuses a result that is not its own fixed report
 * or change set of this project, or is no longer current, with `coding.shelf_material_invalid`.
 */
export const codingResultDocument: ActionDefinition<CodingResultDocumentInput, CodingResultDocument> = {
  capability_id: "coding.results.document", version: 1, operation: "query",
  action: {
    title: "读取 Coding 固定成果的正文", description: "把本项目一份固定的 Coding 执行报告或固定变更转成可复制的 Markdown 正文；已归档、不属于本项目或不是 Coding 固定成果的拒绝；只读",
    kind: "query", scope: "project", audiences: ["plugin"], permissions: ["artifact:read"], subject_kinds: [],
    input_schema: { type: "object", properties: { reference: versionReference }, required: ["reference"], additionalProperties: false },
    output_schema: { type: "object", properties: { reference: versionReference, title: { type: "string" }, saved_at: { type: "string" }, markdown: { type: "string" } },
      required: ["reference", "title", "saved_at", "markdown"], additionalProperties: false },
  },
};
