import { pluginErrors, type PluginDatabaseDeclaration, type PluginDatabaseVersionSwitch, type PluginDefinition, type PluginDeployment, type PluginExecutor, type PluginInstanceRecord, type PluginManifest, type PluginRuntimeRepository, type PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { resolveActionProviderId } from "./install-identity.js";
import { pluginManifestDigest } from "./identity.js";
import { cloneRecord, safeErrorMessage } from "./runtime-rules.js";
import { outsidePluginAction } from "./action-scope.js";
import { holdsInstalledEdition } from "./install-rules.js";

const sameDatabase = (old: PluginDatabaseDeclaration, next: PluginDatabaseDeclaration) =>
  old.store_name === next.store_name && old.version === next.version && old.schema === next.schema;

/** Check only installed editions here. Shipped libraries already go through Home maintenance before activation. */
export function installedDatabaseChange(current: PluginInstanceRecord, target: PluginManifest, previous: PluginManifest | undefined,
  rollback: boolean, migratable: boolean): PluginManifest | undefined {
  if (current.publisher_trust !== "pinned" || current.execution !== "sandbox") return undefined;
  if (!target.databases && !previous?.databases) return undefined;
  if (!previous || pluginManifestDigest(previous) !== current.manifest_digest) {
    throw pluginErrors.upgrade_validation_failed("缺少当前安装的已验证清单，不能核对插件库");
  }
  let changes = false;
  for (const scope of ["project", "home", "partition"] as const) {
    const old = previous.databases?.[scope], next = target.databases?.[scope];
    if (!old || next && sameDatabase(old, next)) continue;
    if (rollback || !migratable || !next || old.store_name !== next.store_name || old.version >= next.version) {
      throw pluginErrors.upgrade_validation_failed("改变已安装库的结构须保留库名、提高库版本，并申报可迁移来源和连续升级段");
    }
    const sources = new Set(next.upgrades?.map(step => step.from));
    if (next.version - old.version > sources.size) throw pluginErrors.upgrade_validation_failed("已安装库的升级段不连续");
    for (let version = old.version; version < next.version; version++) {
      if (!sources.has(version)) throw pluginErrors.upgrade_validation_failed("已安装库的升级段不连续");
    }
    if (changes) throw pluginErrors.upgrade_validation_failed("该安装只持有一个作用域的插件库");
    changes = true;
  }
  return changes ? previous : undefined;
}


/** The worker's row shares SQLite's commit with the migrated schema, so the row is definitive even if IPC failed. */
export async function commitInstalledVersion(executor: PluginExecutor, repository: PluginRuntimeRepository, definition: PluginDefinition,
  change: Omit<PluginDatabaseVersionSwitch, "assertCurrent"> & { assertCurrent?: () => void }, committed: (row: PluginInstanceRecord) => void): Promise<void> {
  let stored: PluginInstanceRecord | undefined;
  let failed: { error: unknown } | undefined;
  try {
    // The SQL transaction compares the entire old row. The Host only checks live authorization here,
    // because the Worker may hold an exclusive SQLite lock while it waits for permission to publish.
    await executor.commitDatabaseUpgrade!(definition, { ...change, assertCurrent: () => change.assertCurrent?.() });
  } catch (error) { failed = { error }; }
  const record = repository.get(change.next.install_id);
  if (record?.installation_generation === change.next.installation_generation && record.manifest_digest === change.next.manifest_digest
    && record.state !== "uninstalled") {
    stored = record;
    committed(stored);
  }
  if (stored) return;
  if (failed) throw failed.error;
  throw pluginErrors.upgrade_validation_failed("数据库升级没有保存目标版本");
}

export function holdsFailedDatabaseUpgrade(record: PluginInstanceRecord): boolean {
  if (record.publisher_trust !== "pinned" || record.execution !== "sandbox" || record.state !== "crashed") return false;
  const code = record.last_error_code;
  return code !== null && (code.startsWith("plugin.project_database.") || code.startsWith("plugin.home_database.") ||
    code.startsWith("storage.") || code.startsWith("plugin.upgrade_"));
}


export async function validateUpgradeFor(executor: PluginExecutor, definition: PluginDefinition, from: PluginInstanceRecord, deployment: PluginDeployment,
  targetGrants: readonly string[], assertCurrent?: () => void): Promise<void> {
  if (!definition.validateUpgrade) return;
  const grants = Object.freeze([...targetGrants]);
  const context: PluginUpgradeContext = Object.freeze({
    install_id: from.install_id, installation_generation: from.installation_generation,
    provider_id: resolveActionProviderId(from), plugin_id: from.plugin_id, version: definition.manifest.version, deployment, grants, assertCurrent,
    requireGrant(permission: string) {
      if (!grants.includes(permission)) throw pluginErrors.grant_denied(`Plugin 没有 ${permission} grant`);
    },
  });
  try {
    if (executor.validateUpgrade) await outsidePluginAction(() => executor.validateUpgrade!(definition, context, from));
    else await definition.validateUpgrade({ from: cloneRecord(from), context });
  } catch (error) {
    assertCurrent?.();
    throw pluginErrors.upgrade_validation_failed(`旧私有数据校验失败：${safeErrorMessage(error)}`);
  }
}

export function recordUpgradeActivationFailure(repository: PluginRuntimeRepository, edition: PluginInstanceRecord, at: string): void {
  const current = repository.get(edition.install_id);
  if (current && current.state !== "running" && holdsInstalledEdition(current, edition)) {
    repository.save({ ...current, state: edition.state === "disabled" ? "disabled" : "crashed",
      last_error_code: pluginErrors.upgrade_activation_failed("").code, updated_at: at });
  }
}
