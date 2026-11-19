import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SkillCatalogEntry, SkillSettingsSetRequest } from "@molis-ai/molis-work-contracts/services/skills";

type Write = Pick<ActionCallContext, "actor_id" | "project_id"> & { input: SkillSettingsSetRequest; record(entry: SkillCatalogEntry): void };
const scoped = new AsyncLocalStorage<Write>();

/** A Host operation can record the exact revision before this local write returns to its caller. */
export function withSkillSettingReceipt<T>(write: Write, invoke: () => Promise<T>): Promise<T> {
  return scoped.run(write, invoke);
}

export function skillSettingReceipt(caller: ActionCallContext, input: SkillSettingsSetRequest): Write["record"] | undefined {
  const write = scoped.getStore();
  return write && caller.actor_id === write.actor_id && caller.project_id === write.project_id && isDeepStrictEqual(input, write.input) ? write.record : undefined;
}
