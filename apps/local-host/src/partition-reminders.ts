import { realpathSync } from "node:fs";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDueReminder } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * A reminder a per-partition plugin's due entry raised (batch 108): its overview table's reminder time, or an entry it registered, fell due,
 * the platform woke only that plugin in that partition, and this is what the person is told. The Assistant takes it and tells it once, under
 * the person's notice rules, as it told the reminders it once asked the plugins for.
 */
export interface PartitionReminder extends Pick<PluginDueReminder, "interrupted"> {
  readonly partition_id: string;
  readonly plugin_id: string;
  readonly install_id: string;
  readonly entry_key: string;
  readonly due_at: string;
  /** Reached well after its time: the Host was off or asleep. */
  readonly late: boolean;
  /** The plugin's name, which the notice says it came from. */
  readonly source_title: string;
  readonly title: string;
  readonly open: { readonly surface: string; readonly id: string } | null;
}

/** A reminder told later than this after its time is said to be missed. */
export const REMINDER_LATE_MS = 10 * 60 * 1000;

type Listener = (reminder: PartitionReminder) => void | Promise<void>;
const listeners = new Map<string, Set<Listener>>();
const canonical = (home: string) => { try { return realpathSync(home); } catch { return home; } };

/** The Assistant of this Home takes the reminders from now on; answers how to stop. */
export function onPartitionReminder(home: string, listener: Listener): () => void {
  const key = canonical(home), set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0 && listeners.get(key) === set) listeners.delete(key);
  };
}

/**
 * Hands a reminder to whoever takes them here. Refused while nobody does (the Assistant is not attached yet): the due entry stays and is
 * tried again, so a reminder that fell due while the Host was starting is not lost.
 */
export async function tellPartitionReminder(home: string, reminder: PartitionReminder): Promise<void> {
  const set = listeners.get(canonical(home));
  if (!set?.size) throw new ActionError("actions.plugin_unavailable", "现在还没有接收提醒的地方");
  await Promise.all(Array.from(set, listener => listener(reminder)));
}
