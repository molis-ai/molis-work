import { codingFailure } from "./words.js";
import type { CharacterImportedSkillEntry, PersonalCharacterRef, ProjectCharacterMemberRef } from "@molis-ai/molis-work-contracts/modules/characters";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

/** A role as a session keeps it: one of the person's originals or a member of this project, never a version (the Host pins that). */
export type CodingRoleRef = PersonalCharacterRef | ProjectCharacterMemberRef;

/** A role the person may choose for a session, as the picker shows it, and whether it can be chosen now. */
export interface CodingCharacterChoice {
  ref: CodingRoleRef;
  title: string;
  host_tools: string[] | null;
  action_tools?: import("@molis-ai/molis-work-contracts/platform/actions").ExactActionReference[] | null;
  imported_skills?: CharacterImportedSkillEntry[];
  available: boolean;
  reason?: string;
}

/** A choice the page sent: an original or a member by its id, or null for none. */
export function characterSelection(value: unknown): CodingRoleRef | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw codingFailure("coding.server.character-choose");
  const ref = value as Record<string, unknown>, id = ref.kind === "personal" ? ref.character_id : ref.kind === "project" ? ref.member_id : undefined;
  if (Object.keys(ref).length !== 2 || typeof id !== "string" || !id.trim() || id.length > 200) throw codingFailure("coding.server.character-reference");
  return ref.kind === "personal" ? { kind: "personal", character_id: id } : { kind: "project", member_id: id };
}

/** What a session keeps: the stable choice and the title it had when chosen, so the page names it without asking again. */
export interface SavedCharacter { ref: CodingRoleRef; title: string }

/**
 * The session's chosen role: undefined before any choice, null for none (the Assistant's own role). A saved value that is not a current
 * choice (written before roles had their own versions) is `unreadable`: the person chooses again; it is never swapped for another.
 */
export function savedCharacter(context: PluginStartContext, sessionId: string): SavedCharacter | "unreadable" | null | undefined {
  const stored = context.services?.storage?.get(`character:${sessionId}`);
  if (typeof stored !== "string") return undefined;
  try {
    const value = JSON.parse(stored) as Record<string, unknown>;
    if (value === null) return null;
    const ref = characterSelection(value.ref);
    return ref && typeof value.title === "string" ? { ref, title: value.title } : "unreadable";
  } catch { return "unreadable"; }
}

export function saveCharacter(context: PluginStartContext, sessionId: string, value: SavedCharacter | null): void {
  context.services!.storage!.set(`character:${sessionId}`, JSON.stringify(value));
}

export function characterSkillSelection(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 200 || value.some(id => typeof id !== "string" || !id || id.length > 8192) || new Set(value).size !== value.length) throw codingFailure("coding.server.character-skills");
  return [...value];
}
export function savedCharacterSkills(context: PluginStartContext, sessionId: string): string[] | undefined {
  const stored = context.services?.storage?.get(`character-skills:${sessionId}`);
  return typeof stored === "string" ? characterSkillSelection(JSON.parse(stored)) : undefined;
}
