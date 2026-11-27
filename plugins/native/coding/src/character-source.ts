import { characterRoleActions, type CharacterRoleCatalog, type CharacterRoleUnavailable } from "@molis-ai/molis-work-contracts/modules/characters";
import type { ActionExecutionContext, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { CodingCharacterChoice, CodingRoleRef } from "./characters.js";
import { codingLocalFailure } from "./words.js";

const UNAVAILABLE_CHARACTER_REASON: Readonly<Record<CharacterRoleUnavailable, readonly [key: string, fallback: string]>> = {
  disabled: ["coding.server.character-disabled", "所选角色已停用，请另选"],
  original_disabled: ["coding.server.character-original-disabled", "所选角色的原件已停用，请另选"],
  unsaved: ["coding.server.character-unsaved", "所选角色还没保存成版本，请先保存或另选"],
};

function unavailableCharacterError(reason: string | undefined): Error {
  const pair = reason && Object.hasOwn(UNAVAILABLE_CHARACTER_REASON, reason)
    ? UNAVAILABLE_CHARACTER_REASON[reason as CharacterRoleUnavailable]
    : undefined;
  const [key, fallback] = pair ?? ["coding.server.character-unavailable", "所选角色已停用或还没保存成版本，请另选"];
  return Object.assign(codingLocalFailure(key, fallback), reason ? { details: { reason } } : {});
}

type Control = Pick<ActionExecutionContext, "signal" | "beforeEffect" | "assert_authority_current">;

/** The roles a session in this project may run as, from the catalog: the project's members, or the person's originals in personal work. */
const tools = (entry: Pick<CodingCharacterChoice, "host_tools" | "action_tools" | "imported_skills">) => ({ host_tools: entry.host_tools,
  ...(entry.action_tools === undefined ? {} : { action_tools: entry.action_tools }), ...(entry.imported_skills ? { imported_skills: entry.imported_skills } : {}) });
const reason = (availability: CharacterRoleCatalog["originals"][number]["availability"]) => availability.available ? {} : { reason: availability.reason };
const members = (catalog: CharacterRoleCatalog): CodingCharacterChoice[] => catalog.members.map(entry => ({ ref: { kind: "project" as const, member_id: entry.role.current.member_id },
  title: entry.title, ...tools(entry), available: entry.availability.available, ...reason(entry.availability) }));
const originals = (catalog: CharacterRoleCatalog): CodingCharacterChoice[] => catalog.originals.map(entry => ({ ref: entry.ref, title: entry.title, ...tools(entry),
  available: entry.availability.available, ...reason(entry.availability) }));

/** What the picker offers: this project's members in a project, the person's originals in personal work. */
function choicesOf(catalog: CharacterRoleCatalog): CodingCharacterChoice[] {
  return catalog.in_project ? members(catalog) : originals(catalog);
}

/**
 * A role named by its stable choice, looked up by its kind: a member among this project's members, an original among the person's.
 * In a project the picker offers members only, but the person's own default still resolves to an original there (project → personal).
 */
function lookup(catalog: CharacterRoleCatalog, ref: CodingRoleRef): CodingCharacterChoice | undefined {
  return (ref.kind === "personal" ? originals(catalog) : members(catalog)).find(choice => same(choice.ref, ref));
}

const same = (a: CodingRoleRef, b: CodingRoleRef) => a.kind === "personal" ? b.kind === "personal" && a.character_id === b.character_id : b.kind === "project" && a.member_id === b.member_id;

/**
 * The person's roles as Coding runs a round with them (role-service-design §5): read through Characters' public actions, one
 * `characters.roles.list` for the picker and the checks before a round, one `characters.roles.resolve` for a session's first round
 * with no choice of its own. Both are declared in Coding's Manifest `capabilities.consumes` and called through the platform; Coding
 * opens no role record of its own and holds no Host port, and never names a version: the Host pins it.
 */
export function codingCharacters(context: PluginStartContext) {
  const actions = () => {
    if (!context.services?.actions) throw Object.assign(codingLocalFailure("coding.server.no-actions", "宿主未提供系统动作调用入口"), { code: "actions.unredeemed" });
    return context.services.actions;
  };
  const catalog = (control?: Control) => actions().invoke(characterRoleActions.list, {}, control);
  return {
    /** The roles the person may choose here, the defaults and the role a new session gets, in one read. */
    async catalog(control?: Control): Promise<{ choices: CodingCharacterChoice[]; catalog: CharacterRoleCatalog }> {
      const read = await catalog(control);
      return { choices: choicesOf(read), catalog: read };
    },
    /**
     * The exact action tools a round with this role would be started with, checked before a session is created: a role that cannot be
     * chosen now is refused here with Characters' reason. The Host resolves the role again at start and pins the version.
     */
    async actionTools(ref: CodingRoleRef, control?: Control): Promise<ExactActionReference[] | null | undefined> {
      const found = lookup(await catalog(control), ref);
      if (!found) throw codingLocalFailure("coding.server.character-not-in-project", "这个角色不在本项目里，请另选");
      if (!found.available) throw unavailableCharacterError(found.reason);
      return found.action_tools;
    },
    /** The role the person chose, checked now and kept with its title; one that cannot be chosen is refused. */
    async chosen(ref: CodingRoleRef, control?: Control): Promise<{ ref: CodingRoleRef; title: string }> {
      const found = lookup(await catalog(control), ref);
      if (!found) throw codingLocalFailure("coding.server.character-not-in-project", "这个角色不在本项目里，请另选");
      if (!found.available) throw unavailableCharacterError(found.reason);
      return { ref: found.ref, title: found.title };
    },
    /** The role a session with no choice of its own gets now (project default, else the person's), with its title; null for the Assistant itself. */
    async effective(control?: Control): Promise<{ ref: CodingRoleRef; title: string } | null> {
      const resolved = await actions().invoke(characterRoleActions.resolve, {}, control);
      return resolved.selection.kind === "assistant" || !resolved.title ? null : { ref: resolved.selection, title: resolved.title };
    },
  };
}

export type CodingCharacters = ReturnType<typeof codingCharacters>;
