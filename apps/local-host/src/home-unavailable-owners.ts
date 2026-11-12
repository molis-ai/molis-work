import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { relative } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { readUpgradeLedger, readUpgradeNotice, removeUpgradeNotice, type UpgradeNotice } from "./home-upgrade-ledger.js";
import { homeUpgradeDescriptors, type UpgradeBlock } from "./home-upgrade-stores.js";

/** Why a part of the product cannot be used after an upgrade (U3 design §2.4). Each has its own sentence and its own ways out. */
export type UnavailableReason = "upgrade_failed" | "store_too_new" | "upgrade_no_space" | "snapshot_invalid";

/** What the page says about a store an open refused: the part that stops, why, and the number to quote. */
export interface UnavailableOwner {
  readonly block: UpgradeBlock;
  /** The project the store belongs to, for a `project` or `plugin` block whose path is a project's; null otherwise. */
  readonly project_id: string | null;
  readonly reason: UnavailableReason;
  readonly diagnostic_id: string;
}

const REASON_OF_CODE: Readonly<Record<string, UnavailableReason>> = {
  "storage.upgrade_failed": "upgrade_failed",
  "storage.upgrade_pending": "upgrade_failed",
  "storage.schema_version_mismatch": "upgrade_failed",
  "storage.schema_structure_mismatch": "upgrade_failed",
  "storage.store_too_new": "store_too_new",
  "storage.upgrade_no_space": "upgrade_no_space",
};

/** The refusal an open raised for a store of this Home, by its code and the path it names (relative to the Home, never absolute). */
export function upgradeRefusal(error: unknown): { readonly code: string; readonly path: string } | undefined {
  if (!(error instanceof ActionError) || !(error.code in REASON_OF_CODE)) return undefined;
  const path = (error.details as { path?: unknown } | undefined)?.path;
  return typeof path === "string" && path.length > 0 ? { code: error.code, path } : undefined;
}

/**
 * The number a person can quote and the log can be searched by (§2.3): the same for one store in one round, another in the next. It is a
 * digest, so it carries neither the path nor anything in the store.
 */
export function diagnosticId(runId: string, relativePath: string): string {
  return `D-${createHash("sha256").update(`${runId}\n${relativePath}`).digest("hex").slice(0, 8).toUpperCase()}`;
}

/** A pattern's `*` stands for one directory name, as in the descriptors; nothing else in it is special. */
function matches(pattern: string, path: string): boolean {
  const source = pattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("[^/]+");
  return new RegExp(`^${source}$`, "u").test(path);
}

const projectOf = (path: string): string | null => /^projects\/([^/]+)\//u.exec(path)?.[1] ?? null;

/**
 * Only asked when an open has refused a store (§2.2), so a Home that works pays nothing for it. It reads the upgrade record once, a small file,
 * and matches the path against the descriptors by string: no directory is listed and no store is opened. A path no descriptor names is no
 * store of this Home's, and gets no explanation: the caller lets its error through as it is (RAC-403).
 */
export function describeUnavailable(home: string, refusal: { readonly code: string; readonly path: string }): UnavailableOwner | undefined {
  const block = homeUpgradeDescriptors().find(descriptor => matches(descriptor.pattern, refusal.path))?.block;
  if (!block) return undefined;
  let runId = "none", reason = REASON_OF_CODE[refusal.code] ?? "upgrade_failed";
  try {
    const ledger = readUpgradeLedger(realpathSync(home)), unit = ledger?.units.find(entry => entry.relative_path === refusal.path);
    if (ledger && unit) {
      runId = ledger.run_id;
      if (unit.error?.reason === "snapshot_invalid") reason = "snapshot_invalid";
    }
  } catch { /* A record that cannot be read gives no round to name; the refusal itself still says what is wrong. */ }
  return { block, project_id: block.kind === "project" || block.kind === "plugin" ? projectOf(refusal.path) : null, reason, diagnostic_id: diagnosticId(runId, refusal.path) };
}

const PLUGIN_TABLE_REASON: Readonly<Record<string, UnavailableReason>> = {
  "plugin.project_database.upgrade_failed": "upgrade_failed",
  "plugin.project_database.version_mismatch": "upgrade_failed",
};

/**
 * Why a plugin stopped over its own tables, when an upgrade is the reason (§2.4): the plugin's stage then draws the card instead of a restart.
 * `library` is the file the tables are in (a project's library), or null for a Home plugin's. The upgrade record says which round and whether
 * the tables came from a newer version; a refusal of any other kind gets nothing, and the stage says what it always said.
 */
export function describePluginTablesRefusal(home: string, pluginId: string, library: string | null,
  refusal: { readonly code: string; readonly details?: Readonly<Record<string, unknown>> }): UnavailableOwner | undefined {
  let reason = PLUGIN_TABLE_REASON[refusal.code] ?? REASON_OF_CODE[refusal.code];
  if (!reason) return undefined;
  const { recorded_version: recorded, declared_version: declared } = refusal.details ?? {};
  if (typeof recorded === "number" && typeof declared === "number" && recorded > declared) reason = "store_too_new";
  let runId = "none", path = `${library ?? "home"}#${pluginId}`;
  try {
    const root = realpathSync(home), prefix = library ? `${relative(root, realpathSync(library))}#` : null, ledger = readUpgradeLedger(root);
    const unit = ledger?.units.find(entry => entry.owner === pluginId && (prefix ? entry.relative_path.startsWith(prefix) : !entry.relative_path.startsWith("projects/")));
    if (ledger && unit) {
      runId = ledger.run_id; path = unit.relative_path;
      if (unit.state === "too_new") reason = "store_too_new";
      else if (unit.error?.reason === "snapshot_invalid") reason = "snapshot_invalid";
    }
  } catch { /* A record that cannot be read gives no round to name; the refusal itself still says what is wrong. */ }
  return { block: { kind: "plugin", plugin_id: pluginId }, project_id: library ? projectOf(path) : null, reason, diagnostic_id: diagnosticId(runId, path) };
}

/** The notice the home page shows once an interrupted upgrade is finished (§3), if there is one for the round the record is at. */
export function upgradeNoticeFor(home: string): UpgradeNotice | undefined {
  try { return readUpgradeNotice(realpathSync(home)); }
  catch { return undefined; }
}

/** The person closed it: gone for that round, and only that one. */
export function dismissUpgradeNotice(home: string, runId: string): boolean {
  return removeUpgradeNotice(realpathSync(home), runId);
}
