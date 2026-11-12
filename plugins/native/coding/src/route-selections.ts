import { text } from "./run-inputs.js";
import { parseExactActionReferences } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentMcpToolRef, AgentMcpSourceRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { skillRefKey } from "@molis-ai/molis-work-plugin-sdk/skill-ref";
import { SKILL_BODY_READ_MAX_REFS } from "@molis-ai/molis-work-contracts/services/skills";
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
const token = (value: unknown, max = 256): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
/** One exact Skill reference as the shared catalog gives it (`skills.catalog.list@1`); the Host checks that it is current when the round starts. */
function skillRef(item: unknown): SkillRef {
  const { source, skill_id, version, install_id, installation_generation } = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const { kind, plugin_id, plugin_version, publisher_signature } = (source && typeof source === "object" ? source : {}) as Record<string, unknown>;
  if (kind !== "plugin" || !token(plugin_id) || !token(plugin_version) || !token(publisher_signature, 4096) || !token(skill_id)
    || typeof version !== "number" || !Number.isInteger(version) || version < 1 || !token(install_id) || !token(installation_generation)) throw codingFailure("coding.server.skill-ref");
  return { source: { kind, plugin_id, plugin_version, publisher_signature }, skill_id, version, install_id, installation_generation };
}
/** The whole reference, so two versions or two installations of one Skill are two choices. */
/** The Skills a round or a session names: at most `SKILL_BODY_READ_MAX_REFS`, none twice. */
export function skillSelection(value: unknown): SkillRef[] {
  if (!Array.isArray(value)) throw codingFailure("coding.server.skill-shape");
  if (value.length > SKILL_BODY_READ_MAX_REFS) throw codingFailure("coding.server.skill-count", { max: SKILL_BODY_READ_MAX_REFS });
  const refs = value.map(skillRef);
  if (new Set(refs.map(skillRefKey)).size !== refs.length) throw codingFailure("coding.server.skill-repeat");
  return refs;
}
/** The session's own choice of Skills (`skills:<session>`), none when it has made none. */
export function savedSkills(context: PluginStartContext, id: string): SkillRef[] {
  const value = context.services?.storage?.get(`skills:${id}`);
  return typeof value === "string" ? skillSelection(JSON.parse(value)) : [];
}
/**
 * A round's Skills (specs/capability-pack/contract-design.md §2.3): what the delegating round hands over, then the session's own choice,
 * each whole reference once. Neither replaces the other; more than the limit is refused where the round starts (`skillSelection`).
 */
export function mergedSkills(delegated: readonly SkillRef[], saved: readonly SkillRef[]): SkillRef[] {
  const seen = new Set<string>(), merged: SkillRef[] = [];
  for (const ref of [...delegated, ...saved]) {
    if (seen.has(skillRefKey(ref))) continue;
    seen.add(skillRefKey(ref));
    merged.push(ref);
  }
  return merged;
}
export function mcpSelection(value: unknown): AgentMcpToolRef[] {
  if (!Array.isArray(value) || value.length > 100) throw codingFailure("coding.server.mcp-shape");
  const refs = value.map(item => {
    if (!item || typeof item !== "object") throw codingFailure("coding.server.mcp-tool-ref");
    const entry = item as Record<string, unknown>;
    if (!Number.isInteger(entry.configuration_version) || Number(entry.configuration_version) < 1) throw codingFailure("coding.server.mcp-config-version");
    return { configuration_version: entry.configuration_version as number, server: text(entry.server, "coding.field.mcp-server"), tool: text(entry.tool, "coding.field.mcp-tool"), version: text(entry.version, "coding.field.mcp-version") };
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
