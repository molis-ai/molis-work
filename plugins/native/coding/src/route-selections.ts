import { text } from "./run-inputs.js";
import { parseExactActionReferences } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentSkillRef, AgentMcpToolRef, AgentMcpSourceRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingFailure } from "./words.js";

/** What Coding's routes read from a request and from the session's saved choices, checked before it reaches the Host. */
export function bodyOf(request: PluginRouteRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return {};
  return request.body as Record<string, unknown>;
}
export function savedActions(context: PluginStartContext, id: string) {
  const value = context.services?.storage?.get(`actions:${id}`);
  return typeof value === "string" ? parseExactActionReferences(JSON.parse(value)) : [];
}
export function methodSelection(value: unknown): AgentSkillRef[] {
  if (!Array.isArray(value) || value.length > 20) throw codingFailure("coding.server.method-shape");
  const refs = value.map(item => {
    if (!item || typeof item !== "object") throw codingFailure("coding.server.method-ref");
    const {skill_id, version} = item as Record<string, unknown>;
    if (typeof skill_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(skill_id)
      || typeof version !== "number" || !Number.isInteger(version) || version < 1) throw codingFailure("coding.server.method-version");
    return {skill_id, version};
  });
  if (new Set(refs.map(ref=>ref.skill_id)).size !== refs.length) throw codingFailure("coding.server.method-repeat");
  return refs;
}
export function mcpSelection(value: unknown): AgentMcpToolRef[] {
  if (!Array.isArray(value) || value.length > 100) throw codingFailure("coding.server.mcp-shape");
  const refs = value.map(item => {
    if (!item || typeof item !== "object") throw codingFailure("coding.server.mcp-tool-ref");
    const entry = item as Record<string, unknown>;
    if (entry.configuration_version !== undefined && (!Number.isInteger(entry.configuration_version) || Number(entry.configuration_version) < 1)) throw codingFailure("coding.server.mcp-config-version");
    return { ...(entry.configuration_version === undefined ? {} : {configuration_version: entry.configuration_version as number}), server: text(entry.server, "coding.field.mcp-server"), tool: text(entry.tool, "coding.field.mcp-tool"), version: text(entry.version, "coding.field.mcp-version") };
  });
  if (new Set(refs.map(ref=>JSON.stringify([ref.server,ref.tool]))).size !== refs.length) throw codingFailure("coding.server.mcp-tool-repeat");
  return refs;
}
export function mcpSources(value: unknown): AgentMcpSourceRef[] {
  if(!Array.isArray(value) || value.length>100) throw codingFailure("coding.server.mcp-source-shape");
  const refs=value.map(item=>{
    if(!item || typeof item!=="object" || !Number.isInteger(item.configuration_version) || item.configuration_version<1) throw codingFailure("coding.server.mcp-source-version");
    return {server:text(item.server,"coding.field.mcp-source"),configuration_version:item.configuration_version as number};
  });
  if(new Set(refs.map(ref=>ref.server)).size!==refs.length) throw codingFailure("coding.server.mcp-source-repeat");
  return refs;
}
/** A capability this host does not offer reads as nothing chosen; any other failure is still a failure. */
export const unlessMissing = <T>(call: Promise<T>, fallback: T): Promise<T> =>
  call.catch((error: unknown) => { if ((error as { code?: unknown })?.code === "actions.dependency_missing") return fallback; throw error; });
