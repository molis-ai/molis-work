import type { ContractDescriptor } from "../platform/package.js";

export const modulesCharactersContract = {
  contractId: "io.molis.work.module.characters.v1", kind: "module", schemaVersion: 1,
  maturity: "partial", ssot: "specs/coding-plugin/spec.md",
} as const satisfies ContractDescriptor;

export const CHARACTER_ARTIFACT_TYPE = "character.definition.v1";
export const CHARACTER_PLUGIN_ID = "io.molis.work.characters";
export const CHARACTER_PUBLISHER_SIGNATURE = "official-characters-binding";

export type CharacterState = "active" | "disabled" | "tombstoned";

/** A personal draft. Its revision is NOT an Artifact publication version. */
export interface CharacterDraft {
  character_id: string;
  owner_actor_id: string;
  revision: number;
  state: CharacterState;
  title: string;
  instructions: string;
  /** null inherits the caller's set; [] deliberately removes all Host tools. */
  host_tools: string[] | null;
  created_at: string;
  updated_at: string;
}

/** Immutable Artifact body, without credentials, execution state or approval. */
export interface CharacterContent {
  character_id: string;
  title: string;
  instructions: string;
  host_tools: string[] | null;
  source: { owner_actor_id: string; draft_revision: number };
}

export interface CharacterDraftPatch {
  title: string;
  instructions: string;
  host_tools: string[] | null;
}

export interface CharactersQuery {
  list(): CharacterDraft[];
  get(characterId: string): CharacterDraft | null;
}

export interface CharactersCommand {
  create(): CharacterDraft;
  update(characterId: string, expectedRevision: number, patch: CharacterDraftPatch): CharacterDraft;
  setState(characterId: string, expectedRevision: number, state: CharacterState): CharacterDraft;
}

export function parseCharacterContent(value: unknown): CharacterContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Character 内容无效");
  const x = value as Record<string, unknown>;
  const source = x.source as Record<string, unknown> | undefined;
  if (typeof x.character_id !== "string" || !x.character_id.trim() || x.character_id.length > 200
    || typeof x.title !== "string" || !x.title.trim() || x.title.length > 120
    || typeof x.instructions !== "string" || !x.instructions.trim() || x.instructions.length > 20_000
    || !source || typeof source.owner_actor_id !== "string" || !source.owner_actor_id.trim() || source.owner_actor_id.length > 200
    || !Number.isSafeInteger(source.draft_revision) || Number(source.draft_revision) < 1) throw new Error("Character 正文或来源不完整");
  return { character_id: x.character_id, title: x.title, instructions: x.instructions,
    host_tools: parseCharacterTools(x.host_tools),
    source: { owner_actor_id: source.owner_actor_id, draft_revision: source.draft_revision as number } };
}

export function parseCharacterTools(value: unknown): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > 100 || value.some(tool => typeof tool !== "string"
    || !/^[a-z][a-z0-9-]{0,79}$/.test(tool)) || new Set(value).size !== value.length) throw new Error("Character 工具范围无效或重复");
  return [...value] as string[];
}
