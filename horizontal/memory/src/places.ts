import { createHash } from "node:crypto";
import type { MemoryApplies, MemoryChangeRecord, MemoryLedgerPort, MemoryMetaRecord, MemoryRecallRequest, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryError } from "./errors.js";
import type { MemoryCaller } from "./service.js";

/**
 * Where a memory lives and who may see it: the Prologue owner of a scope, visibility, expiry and applicability. Plain
 * rules over a caller and a memory's facts; nothing here reads or writes a store.
 */

/** The Prologue owner of a scope for this caller, and the project whose switches govern it. */
export function placeOf(caller: MemoryCaller, scope: MemoryScope): { scope: MemoryScope; owner: string; project: string | null } {
  if (scope === "personal") return { scope, owner: caller.actor_id, project: null };
  if (scope === "character") {
    if (!caller.character) throw new MemoryError("memory.scope", "这一轮不是由某个角色承担的，没有角色记忆");
    if (!caller.project_id) throw new MemoryError("memory.scope", "角色记忆属于某个项目里的角色；这里没有项目");
    return { scope, owner: characterOwner(caller.project_id, caller.character.id), project: caller.project_id };
  }
  if (scope !== "project") throw new MemoryError("memory.invalid", "记忆范围只能是个人、项目或角色");
  if (!caller.project_id) throw new MemoryError("memory.scope", "这是个人工作，没有项目；只能用个人记忆");
  return { scope, owner: caller.project_id, project: caller.project_id };
}

export function personOnly(caller: MemoryCaller, message: string): void {
  if (!caller.person) throw new MemoryError("memory.forbidden", message);
}

/** A plugin's own memories are read only by that plugin; everyone else's are shared. */
export function visibleTo(caller: MemoryCaller, meta: MemoryMetaRecord): boolean {
  return !meta.plugin_id || caller.person === true || (caller.consumer === "plugin" && caller.plugin_id === meta.plugin_id);
}

export function isExpired(meta: MemoryMetaRecord, now: Date): boolean {
  return !!meta.expires_at && Date.parse(meta.expires_at) <= now.getTime();
}

/**
 * A Character's memories are kept per project (Prologue scope `character`, owner = this project and this Character):
 * what it learned in one project's work never reaches the same Character's work in another project (spec §5 isolation).
 * The owner is a short stable key, as Prologue storage ids are bounded; the ledger keeps which Character it stands for.
 */
export function characterOwner(projectId: string, characterId: string): string {
  return `pc-${createHash("sha256").update(`${projectId}\n${characterId}`).digest("hex").slice(0, 40)}`;
}

/** Whether a memory applies in a situation: every limit it has must be met (spec §4.1 适用). */
export function applies(limit: MemoryApplies, situation: MemoryRecallRequest["situation"], now: Date): boolean {
  if (limit.from && Date.parse(limit.from) > now.getTime()) return false;
  if (limit.until && Date.parse(limit.until) < now.getTime()) return false;
  if (limit.plugin_ids?.length && !(situation?.plugin_id && limit.plugin_ids.includes(situation.plugin_id))) return false;
  if (limit.object_kinds?.length && !(situation?.object_kind && limit.object_kinds.includes(situation.object_kind))) return false;
  if (limit.goal_ids?.length && !(situation?.goal_id && limit.goal_ids.includes(situation.goal_id))) return false;
  return true;
}

/**
 * The person has made this memory their own (said it again, accepted a suggestion for it, replaced or edited it): the
 * automatic writes behind it stop offering to be taken back, because taking them back would delete or overwrite the
 * person's own words. An automatic change that only switched it off or merged another into it stays as it was.
 */
export function disownAutomatic(ledger: MemoryLedgerPort, memoryId: string): void {
  for (const record of ledger.changesOf(memoryId)) {
    if (record.state === "active" && record.undoable && (record.undo?.action === "remove" || record.undo?.action === "restore"))
      ledger.saveChange({ ...record, undoable: false, undo: null } satisfies MemoryChangeRecord);
  }
}
