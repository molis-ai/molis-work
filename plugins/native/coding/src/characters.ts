import { codingFailure } from "./words.js";
import { codingArtifacts } from "./artifacts.js";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { parseCharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

export interface CodingCharacterChoice {
  imported_skills?: Array<{ id: string; name: string; compatibility: "portable" | "native-only"; reason?: string }>;
  reference: ArtifactReference;
  title: string;
  instructions: string;
  host_tools: string[] | null;
  action_tools?: import("@molis-ai/molis-work-contracts/platform/actions").ExactActionReference[] | null;
  available: boolean;
  reason?: string;
}
export function characterSelection(value: unknown): ArtifactReference | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw codingFailure("coding.server.character-choose");
  const ref = value as Record<string, unknown>;
  if (typeof ref.artifact_id !== "string" || !ref.artifact_id.trim() || ref.artifact_id.length > 200
    || !Number.isSafeInteger(ref.version) || Number(ref.version) < 1) throw codingFailure("coding.server.character-reference");
  return { artifact_id: ref.artifact_id, version: ref.version as number };
}
export function savedCharacter(context: PluginStartContext, sessionId: string): ArtifactReference | null {
  const stored = context.services?.storage?.get(`character:${sessionId}`);
  return typeof stored === "string" ? characterSelection(JSON.parse(stored)) : null;
}
export function characterSkillSelection(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 200 || value.some(id => typeof id !== "string" || !id || id.length > 8192) || new Set(value).size !== value.length) throw codingFailure("coding.server.character-skills");
  return [...value];
}
export function savedCharacterSkills(context: PluginStartContext, sessionId: string): string[] | undefined {
  const stored = context.services?.storage?.get(`character-skills:${sessionId}`);
  return typeof stored === "string" ? characterSkillSelection(JSON.parse(stored)) : undefined;
}
export function characterTitle(context: PluginStartContext, reference: ArtifactReference | null): string | null {
  if (!reference) return null;
  try { return parseCharacterContent(codingArtifacts(context).read(reference)?.payload).title; }
  catch { return "原角色版本暂不可读"; }
}
