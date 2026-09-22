import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { AgentFrozenCharacter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { parseCharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

export interface CodingCharacterChoice {
  reference: ArtifactReference;
  title: string;
  instructions: string;
  host_tools: string[] | null;
  available: boolean;
  reason?: string;
}
export interface CodingCharacterPorts {
  list(): CodingCharacterChoice[];
  /** Early validation before creating an SDK session; AgentHost independently resolves again at start. */
  resolve(reference: ArtifactReference): AgentFrozenCharacter;
}
export function characterSelection(value: unknown): ArtifactReference | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请选择 Character 的固定版本，或明确选择不使用角色");
  const ref = value as Record<string, unknown>;
  if (typeof ref.artifact_id !== "string" || !ref.artifact_id.trim() || ref.artifact_id.length > 200
    || !Number.isSafeInteger(ref.version) || Number(ref.version) < 1) throw new Error("Character 版本引用无效，请重新选择");
  return { artifact_id: ref.artifact_id, version: ref.version as number };
}
export function savedCharacter(context: PluginStartContext, sessionId: string): ArtifactReference | null {
  const stored = context.services?.storage?.get(`character:${sessionId}`);
  return typeof stored === "string" ? characterSelection(JSON.parse(stored)) : null;
}
export function characterTitle(context: PluginStartContext, reference: ArtifactReference | null): string | null {
  if (!reference) return null;
  try { return parseCharacterContent(context.services!.artifacts.read(reference)?.payload).title; }
  catch { return "原角色版本暂不可读"; }
}
