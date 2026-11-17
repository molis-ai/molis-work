import { lstatSync, readlinkSync, unlinkSync } from "node:fs";
import path from "node:path";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import type { VersionedFile } from "@molis-ai/molis-work-storage";
import { hostLog } from "../host-log.js";
import { isOwnedIntegrationOwner, isSupportedRuntimeId } from "./runtime-integration-contract.js";
import type { IntegrationReceipt } from "./runtime-integration-contract.js";

const RECEIPT_KEYS = ["schema_version", "owner", "runtime_id", "config_path", "config_entry_fingerprint", "connected_at"] as const;
const CURRENT = /* @version format.runtime.integration.receipt */ 2;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** The current receipt and nothing else: Molis Work's own owner, a Runtime it supports, and exactly the fields it writes. */
function parseReceipt(value: unknown): IntegrationReceipt {
  if (!isRecord(value) || Object.keys(value).length !== RECEIPT_KEYS.length || !RECEIPT_KEYS.every(key => key in value)
    || !text(value.owner) || !isOwnedIntegrationOwner(value.owner) || !text(value.runtime_id) || !isSupportedRuntimeId(value.runtime_id)
    || !text(value.config_path) || !text(value.config_entry_fingerprint) || !text(value.connected_at)
    || value.schema_version !== CURRENT) throw new Error("runtime integration receipt invalid");
  return { schema_version: CURRENT, owner: value.owner, runtime_id: value.runtime_id, config_path: value.config_path,
    config_entry_fingerprint: value.config_entry_fingerprint, connected_at: value.connected_at };
}

/** A `<…>/skills/goal-advance` path: the only shape the version 1 receipt ever wrote, for the link and for what it pointed at. */
const skillShaped = (value: string) => path.isAbsolute(value) && path.basename(value) === "goal-advance" && path.basename(path.dirname(value)) === "skills";

/**
 * Version 1 → 2 (batch 44, `docs/system/CONTRACT-CHANGES.md` 「第 44 批存量搬迁」 C): the `goal-advance` Skill is gone, so the link the
 * receipt recorded in the Runtime's skill folder goes with it, but only while it is still the link Molis Work made, a symbolic link to
 * the very target the receipt names. Anything else there (a folder, another target, a link the person changed) is left as it is and
 * named in the Host's log. Run again after a restored snapshot, it finds the link already gone and does nothing more.
 */
function dropSkillLink(value: unknown): unknown {
  if (!isRecord(value) || !isOwnedIntegrationOwner(value.owner) || !text(value.skill_path) || !text(value.skill_target)
    || !skillShaped(value.skill_path) || !skillShaped(value.skill_target)) throw new Error("runtime integration receipt v1 invalid");
  const { skill_path: link, skill_target: target, ...rest } = value;
  const found = lstatSync(link, { throwIfNoEntry: false });
  if (found?.isSymbolicLink() && path.resolve(path.dirname(link), readlinkSync(link)) === path.resolve(target)) unlinkSync(link);
  else if (found) hostLog.warn("host", "runtime_skill_link_kept", undefined, { path: link, reason: "goal-advance is no longer installed; this entry was changed after Molis Work wrote it, so it is left for you to remove" });
  return rest;
}

/** `runtime-integrations/<runtime>.json` (upgrade-chain-design §2.6), upgraded by the Host's upgrade round under the Home's lock. */
export const RUNTIME_INTEGRATION_RECEIPT_FILE: VersionedFile<IntegrationReceipt> = {
  version: CURRENT,
  field: "schema_version",
  upgrades: [{ from: 1, transform: dropSkillLink }],
  parse: parseReceipt,
};
