import { realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import type { MolisWorkRuntimeContextHost, MolisWorkRuntimeConnection } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { RuntimeProjectSuggestionClue } from "@molis-ai/molis-work-contracts/modules/private-work-context";

export const MCP_CONTEXT_PATH = "/api/internal/runtime-context";
export type ContextCacheUpdate = { kind: "none" } | { kind: "clear"; clearRefresh: boolean }
  | { kind: "accept"; connection: MolisWorkRuntimeConnection | null };
export type RuntimeHostMetadata = Omit<MolisWorkRuntimeContextHost, "homeDirectory">;
const invalid = () => new ActionError("actions.input_invalid", "Runtime 上下文传输参数无效");
const optionalText = (value: unknown): value is string | null | undefined => value === undefined || value === null || text(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 4096 && Boolean(value.trim());

export function closedRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw invalid();
  return value as Record<string, unknown>;
}

/** Only host/protocol metadata crosses this envelope; tool arguments stay in their own object. */
export function runtimeHostMetadata(host: MolisWorkRuntimeContextHost): RuntimeHostMetadata {
  const { homeDirectory: _home, ...metadata } = host;
  return structuredClone(metadata);
}

export function readContextMetadata(value: unknown, homeDirectory: string): MolisWorkRuntimeContextHost {
  const host = closedRecord(value, ["runtimeContext", "webBaseUrl", "molisWorkSessionId", "nativeRuntimeSessionId", "hostWorkContextId", "focusId", "projectSuggestionClues", "panelId"]);
  const context = closedRecord(host.runtimeContext, ["runtime_id", "stable_work_context_id", "host_declares_stable", "workspace"]);
  if (!text(context.runtime_id) || !(context.stable_work_context_id === null || text(context.stable_work_context_id))
    || typeof context.host_declares_stable !== "boolean") throw invalid();
  let workspace: MolisWorkRuntimeContextHost["runtimeContext"]["workspace"];
  if (context.workspace !== undefined && context.workspace !== null) {
    const supplied = closedRecord(context.workspace, ["canonical_path", "realpath_verified"]);
    if (!text(supplied.canonical_path) || !isAbsolute(supplied.canonical_path) || typeof supplied.realpath_verified !== "boolean") throw invalid();
    if (supplied.realpath_verified) {
      try { if (realpathSync(supplied.canonical_path) !== supplied.canonical_path) throw invalid(); }
      catch { throw invalid(); }
    }
    workspace = { canonical_path: supplied.canonical_path, realpath_verified: supplied.realpath_verified };
  }
  for (const key of ["webBaseUrl", "molisWorkSessionId", "nativeRuntimeSessionId", "hostWorkContextId", "focusId", "panelId"]) if (!optionalText(host[key])) throw invalid();
  let clues: RuntimeProjectSuggestionClue[] | undefined;
  if (host.projectSuggestionClues !== undefined) {
    if (!Array.isArray(host.projectSuggestionClues) || host.projectSuggestionClues.length > 64) throw invalid();
    clues = host.projectSuggestionClues.map(readClue);
  }
  return { homeDirectory, runtimeContext: { runtime_id: context.runtime_id, stable_work_context_id: context.stable_work_context_id,
    host_declares_stable: context.host_declares_stable, ...(workspace ? { workspace } : {}) },
    ...(host.webBaseUrl ? { webBaseUrl: host.webBaseUrl as string } : {}),
    molisWorkSessionId: host.molisWorkSessionId as string | null | undefined,
    nativeRuntimeSessionId: host.nativeRuntimeSessionId as string | null | undefined,
    hostWorkContextId: host.hostWorkContextId as string | null | undefined,
    focusId: host.focusId as string | null | undefined, panelId: host.panelId as string | null | undefined,
    ...(clues ? { projectSuggestionClues: clues } : {}),
  };
}

function readClue(value: unknown): RuntimeProjectSuggestionClue {
  const clue = closedRecord(value, ["kind", "value"]);
  if (!text(clue.value)) throw invalid();
  switch (clue.kind) {
    case "workspace": case "path": case "directory": case "repository": case "session_title": case "runtime": case "recent_project": case "project_name":
      return { kind: clue.kind, value: clue.value };
    default: throw invalid();
  }
}

export function readProtocolContext(value: unknown): McpToolCallContext {
  const context = closedRecord(value, ["runtimeSessionId", "runtimeSessionIdSource"]);
  if (!(context.runtimeSessionId === null || text(context.runtimeSessionId))) throw invalid();
  switch (context.runtimeSessionIdSource) {
    case null: case "threadId": case "sessionId": case "molis-work/sessionId":
      return { runtimeSessionId: context.runtimeSessionId, runtimeSessionIdSource: context.runtimeSessionIdSource };
    default: throw invalid();
  }
}

/** The getter cannot expose mutable authority that bypasses the transport's subject-change cancellation. */
export function frozenRuntimeHost(value: MolisWorkRuntimeContextHost): MolisWorkRuntimeContextHost {
  const host = structuredClone(value);
  if (host.runtimeContext.workspace) Object.freeze(host.runtimeContext.workspace);
  Object.freeze(host.runtimeContext);
  host.projectSuggestionClues?.forEach(Object.freeze);
  if (host.projectSuggestionClues) Object.freeze(host.projectSuggestionClues);
  return Object.freeze(host);
}
