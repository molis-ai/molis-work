import { CHARACTER_PLUGIN_ID, characterPluginActions } from "@molis-ai/molis-work-contracts/modules/characters";
import type { AssistantCharacterChoice } from "@molis-ai/molis-work-contracts/services/assistant";
import type { PersonActions } from "./assistant-executor.js";

const UNAVAILABLE = "所选 Character 版本不可用，请明确选择其他版本或移除角色后再执行";
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** One capability of Characters, named the way the person's directory names it. */
const reference = ({ capability_id, version }: { capability_id: string; version: number }) => ({ capability_id, version, provider_id: CHARACTER_PLUGIN_ID });

/**
 * The Characters the person may choose for a work in one project (PG-086, C2b): every published version `characters.list` returns, each
 * with whether it can run now, which `characters.runnable` answers with Characters' own reason. The Assistant reads them as the person,
 * through the two public actions, and holds no Character record or Host port; a row that cannot be read is left out, not guessed at.
 */
export async function assistantCharacterChoices(actions: PersonActions): Promise<AssistantCharacterChoice[]> {
  const publications = object(await actions.invoke(reference(characterPluginActions.list), {}))?.publications;
  if (!Array.isArray(publications)) return [];
  const rows = publications.flatMap(entry => {
    const record = object(entry), title = object(record?.payload)?.title;
    if (!record || typeof record.artifact_id !== "string" || !Number.isSafeInteger(record.version) || Number(record.version) < 1 || typeof title !== "string") return [];
    return [{ reference: { artifact_id: record.artifact_id, version: record.version as number }, title }];
  });
  return Promise.all(rows.map(async (row): Promise<AssistantCharacterChoice> => {
    const answer = object(await actions.invoke(reference(characterPluginActions.runnable), { reference: row.reference }));
    if (answer?.available === true) return { ...row, available: true };
    return { ...row, available: false, reason: typeof answer?.reason === "string" && answer.reason ? answer.reason : UNAVAILABLE };
  }));
}
