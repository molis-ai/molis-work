import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { characterPluginActions } from "@molis-ai/molis-work-contracts/modules/characters";
import { parseExactActionReferences, type ActionExecutionContext, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { CodingCharacterChoice } from "./characters.js";

type Control = Pick<ActionExecutionContext, "signal" | "beforeEffect" | "assert_authority_current">;

const UNAVAILABLE = "所选 Character 版本不可用，请明确选择其他版本或移除角色后再执行";
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

type ImportedSkill = NonNullable<CodingCharacterChoice["imported_skills"]>[number];

/** One published version as `characters.list` returns it: what the picker shows and what a round would be started with. */
interface Published { choice: Omit<CodingCharacterChoice, "available" | "reason">; current: boolean }

/**
 * Read the publications out of `characters.list`. The answer is the browser's preview of each publication, so an imported Skill's files
 * are only digests here and the content is not parsed again; Coding reads the few fields it shows. A record that cannot be read is
 * left out rather than guessed at.
 */
function publishedOf(answer: unknown): Published[] {
  const publications = object(answer)?.publications;
  if (!Array.isArray(publications)) return [];
  return publications.flatMap<Published>(entry => {
    const record = object(entry), payload = object(record?.payload);
    if (!record || !payload || typeof record.artifact_id !== "string" || !Number.isSafeInteger(record.version) || Number(record.version) < 1
      || typeof payload.title !== "string" || typeof payload.instructions !== "string") return [];
    let action_tools: ExactActionReference[] | null | undefined;
    try { action_tools = payload.action_tools === undefined ? undefined : payload.action_tools === null ? null : parseExactActionReferences(payload.action_tools); }
    catch { return []; }
    const host_tools = Array.isArray(payload.host_tools) ? payload.host_tools.filter((tool): tool is string => typeof tool === "string") : null;
    const snapshotSkills = object(payload.import_snapshot)?.skills;
    const skills = Array.isArray(snapshotSkills) ? snapshotSkills.flatMap<ImportedSkill>(skill => {
      const row = object(skill);
      if (!row || typeof row.id !== "string" || typeof row.name !== "string") return [];
      const compatibility = row.compatibility;
      if (compatibility !== "portable" && compatibility !== "native-only") return [];
      return [{ id: row.id, name: row.name, compatibility, ...(typeof row.reason === "string" ? { reason: row.reason } : {}) }];
    }) : undefined;
    return [{ current: record.lifecycle_state === "active" && record.availability === "available",
      choice: { reference: { artifact_id: record.artifact_id, version: record.version as number }, title: payload.title, instructions: payload.instructions, host_tools,
        ...(action_tools === undefined ? {} : { action_tools }), ...(skills ? { imported_skills: skills } : {}) } }];
  });
}

/**
 * The person's Characters as Coding runs a round with them (PG-086): read through Characters' public actions, `characters.list` for what
 * is published and `characters.runnable` for whether a version can run now (only that: how a version would be launched on this
 * computer stays the person's `characters.execution`). Both are declared in Coding's Manifest `capabilities.consumes` and called
 * through the platform, so the platform checks the grant (`actions.forbidden` without the declaration, `plugin.grant_denied` once the
 * person has withdrawn it); Coding opens no Character record of its own and holds no Host port.
 */
export function codingCharacters(context: PluginStartContext) {
  const actions = () => {
    if (!context.services?.actions) throw Object.assign(new Error("宿主未提供系统动作调用入口"), { code: "actions.unredeemed" });
    return context.services.actions;
  };
  /**
   * Whether this version can run now: Characters answers no, with its own reason, for one that is not a current publication of this
   * project or whose Character is off or deleted. A failed call (not granted, the plugin stopped, cancelled) is not a reason about the
   * Character: it ends the read.
   */
  const refusal = async (reference: ArtifactReference, control?: Control): Promise<string | undefined> => {
    const answer = await actions().invoke(characterPluginActions.runnable, { reference }, control);
    if (answer.available) return undefined;
    return answer.reason || UNAVAILABLE;
  };
  return {
    /** Every published version of the person's Characters in this project, each with whether it can run now and, if not, why. */
    async list(control?: Control): Promise<CodingCharacterChoice[]> {
      const published = publishedOf(await actions().invoke(characterPluginActions.list, {}, control));
      const choices: CodingCharacterChoice[] = [];
      for (const { choice, current } of published) {
        const reason = current ? await refusal(choice.reference, control) : UNAVAILABLE;
        choices.push(reason === undefined ? { ...choice, available: true } : { ...choice, available: false, reason });
      }
      return choices;
    },
    /**
     * The exact action tools a round with this Character would be started with, checked before a session is created: a version that
     * cannot run now is refused here with the reason Characters gives. The Agent runtime resolves the Character again at start.
     */
    async actionTools(reference: ArtifactReference, control?: Control): Promise<ExactActionReference[] | null | undefined> {
      const reason = await refusal(reference, control);
      if (reason !== undefined) throw new Error(reason);
      const found = publishedOf(await actions().invoke(characterPluginActions.list, {}, control))
        .find(({ choice }) => choice.reference.artifact_id === reference.artifact_id && choice.reference.version === reference.version);
      if (!found) throw new Error(UNAVAILABLE);
      return found.choice.action_tools;
    },
  };
}

export type CodingCharacters = ReturnType<typeof codingCharacters>;
