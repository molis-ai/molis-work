import { CHARACTER_PLUGIN_ID, characterRoleActions, type CharacterRoleCatalog, type CharacterRoleResolution, type CharacterTaskSelection } from "@molis-ai/molis-work-contracts/modules/characters";
import type { AssistantCharacter, AssistantCharacterRef } from "@molis-ai/molis-work-contracts/services/assistant";
import type { PersonActions } from "./assistant-executor.js";

/** One capability of Characters, named the way the person's directory names it. */
const reference = ({ capability_id, version }: { capability_id: string; version: number }) => ({ capability_id, version, provider_id: CHARACTER_PLUGIN_ID });

/**
 * The person's roles where a work is (role-service-design §3, §5), read as the person through Characters' public action in one call:
 * their originals, this project's members, the two defaults and the role a new task gets. The Assistant holds no role record or Host
 * port; it keeps only the stable choice and its title on a work.
 */
export async function assistantRoleCatalog(actions: PersonActions): Promise<CharacterRoleCatalog> {
  return await actions.invoke(reference(characterRoleActions.list), {}) as CharacterRoleCatalog;
}

/** The role a new work gets now (`roles.resolve`): the task's own choice, else the defaults; never a version. */
export async function assistantResolveRole(actions: PersonActions, selection?: CharacterTaskSelection): Promise<CharacterRoleResolution> {
  return await actions.invoke(reference(characterRoleActions.resolve), selection ? { selection } : {}) as CharacterRoleResolution;
}

/** A stable key for a choice, the way a work, a delegation and the page name it: `personal:<id>` or `project:<id>`. */
export const roleKey = (ref: AssistantCharacterRef | null | undefined): string | null => !ref ? null : ref.kind === "personal" ? `personal:${ref.character_id}` : `project:${ref.member_id}`;

/** A choice the page or a round sent, if it is one: an original or a member, by its id alone. */
export function parseRoleRef(value: unknown): AssistantCharacterRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>, keys = Object.keys(item);
  if (keys.length !== 2) return null;
  if (item.kind === "personal" && typeof item.character_id === "string" && item.character_id.trim() && item.character_id.length <= 200) return { kind: "personal", character_id: item.character_id };
  if (item.kind === "project" && typeof item.member_id === "string" && item.member_id.trim() && item.member_id.length <= 200) return { kind: "project", member_id: item.member_id };
  return null;
}

/** One role of the catalog the person may choose here, as a work keeps it; its availability says whether it can be chosen now. */
export function catalogChoice(catalog: CharacterRoleCatalog, ref: AssistantCharacterRef): { character: AssistantCharacter; available: boolean; reason?: string } | null {
  if (ref.kind === "personal") {
    const entry = catalog.originals.find(item => item.ref.character_id === ref.character_id);
    return entry ? { character: { ref: entry.ref, title: entry.title, character_id: entry.ref.character_id }, available: entry.availability.available,
      ...(entry.availability.available ? {} : { reason: entry.availability.reason }) } : null;
  }
  const entry = catalog.members.find(item => item.role.current.member_id === ref.member_id);
  return entry ? { character: { ref: { kind: "project", member_id: ref.member_id }, title: entry.title, character_id: entry.role.current.original.character_id },
    available: entry.availability.available, ...(entry.availability.available ? {} : { reason: entry.availability.reason }) } : null;
}

/** The roles a round may hand a part to: those the person can choose here now (members in a project, originals in personal work). */
export function choosableRoles(catalog: CharacterRoleCatalog): AssistantCharacter[] {
  return catalog.in_project
    ? catalog.members.filter(item => item.availability.available).map(item => ({ ref: { kind: "project", member_id: item.role.current.member_id }, title: item.title, character_id: item.role.current.original.character_id }))
    : catalog.originals.filter(item => item.availability.available).map(item => ({ ref: item.ref, title: item.title, character_id: item.ref.character_id }));
}
