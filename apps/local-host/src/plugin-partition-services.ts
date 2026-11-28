import { AsyncLocalStorage } from "node:async_hooks";
import { resolveConfiguredHome } from "./product-home.js";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDueClient, PluginDueEntry, PluginManifest, PluginPersonSettingsClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginInvocation, inPluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { openDueRegistry, type DueEntryOwner } from "@molis-ai/molis-work-service-scheduler";
import { openPersonSettings, type PersonSettingsCaller } from "@molis-ai/molis-work-service-person-settings";
import type { PartitionPluginScope } from "./partition-plugin-assembly.js";
import { runningPartitionPlatformServices } from "./partition-platform-services.js";

/**
 * The two services a plugin reaches through the unified partitions (specs/unified-partition-plugins §4.1, §4.2 第 4 条, batch 108): the person
 * settings its Manifest declares, and a per-partition instance's own due entries. Both stamp the owner from the Host's trusted context (the
 * installation, the plugin, the partition the assembly started it for); the plugin names only its keys.
 */

type Instance = Pick<PluginStartContext, "install_id" | "installation_generation">;

/**
 * Who is asking, as the person settings store checks it (S-person-settings-private): inside one of this instance's own calls, that call's
 * caller; outside every call (`start`, a timer, a due delivery), this plugin's own background. Inside another instance's call, nobody.
 */
function settingsCaller(instance: Instance): PersonSettingsCaller {
  const scope = currentPluginInvocation();
  if (scope === undefined) return { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "plugin", actor_kind: "runtime", plugin_install_id: instance.install_id };
  if (!inPluginInstance(scope, instance)) throw new ActionError("actions.forbidden", "本人的设置只给本人和这个插件自己的后台工作");
  return scope.caller;
}

const settingsListeners = new Map<string, Set<() => void | Promise<void>>>();
const pendingSettings = new Set<string>();
const settingsKey = (home: string, installId: string) => JSON.stringify([resolveConfiguredHome(home), installId]);

/** Read after the owner's transaction has returned, including the sync receiver's surrounding transaction. */
export function personSettingsChanged(home: string, installId: string): void {
  const key = settingsKey(home, installId);
  if (!settingsListeners.has(key) || pendingSettings.has(key)) return;
  pendingSettings.add(key);
  queueMicrotask(() => {
    pendingSettings.delete(key);
    for (const listener of settingsListeners.get(key) ?? []) {
      try { void Promise.resolve(listener()).catch(() => {}); } catch { /* A subscriber cannot prevent another instance from refreshing. */ }
    }
  });
}

/** `services.personSettings`: given when the Manifest declares `person_settings` and the platform has a Home; each call opens the Home store once. */
export function pluginPersonSettingsFor(home: string | undefined, manifest: PluginManifest, instance: Instance, assertActive: () => void, lifetime: AbortSignal): PluginPersonSettingsClient | undefined {
  const declarations = manifest.person_settings;
  if (!declarations || home === undefined) return undefined;
  const owner = { install_id: instance.install_id, plugin_id: manifest.plugin_id };
  const use = <T>(run: (store: ReturnType<typeof openPersonSettings>, caller: PersonSettingsCaller) => T): T => {
    assertActive();
    const caller = settingsCaller(instance);
    const store = openPersonSettings(home);
    try { return run(store, caller); } finally { store.close(); }
  };
  return Object.freeze<PluginPersonSettingsClient>({
    get: key => use((store, caller) => store.get(caller, owner.install_id, declarations, key)),
    list: () => use((store, caller) => store.list(caller, owner.install_id)),
    onChange(listener) {
      assertActive();
      if (currentPluginInvocation()) throw new ActionError("actions.forbidden", "本人设置的订阅由插件启动时登记");
      const key = settingsKey(home, owner.install_id), listeners = settingsListeners.get(key) ?? new Set<() => void | Promise<void>>();
      // A remote apply can roll back after writing its business row. Compare committed records once its transaction ends.
      const stamp = () => use((store, caller) => JSON.stringify(store.list(caller, owner.install_id)));
      let previous = stamp();
      const notify = AsyncLocalStorage.bind(() => {
        const current = stamp();
        if (current === previous) return;
        previous = current;
        return listener();
      });
      const stop = () => {
        lifetime.removeEventListener("abort", stop);
        listeners.delete(notify);
        if (!listeners.size && settingsListeners.get(key) === listeners) settingsListeners.delete(key);
      };
      listeners.add(notify);
      settingsListeners.set(key, listeners);
      lifetime.addEventListener("abort", stop, { once: true });
      return stop;
    },
    snapshot: () => use((store, caller) => {
      const read = (source: typeof store) => source.list(caller, owner.install_id);
      const records = read(store);
      const version = (rows: typeof records) => JSON.stringify(rows.map(row => [row.key, row.revision, row.updated_at, row.value]));
      const stamp = version(records);
      return { records, current: () => use(source => version(read(source)) === stamp) };
    }),
    setMany: changes => use((store, caller) => {
      const records = store.setMany(caller, owner, declarations, changes);
      if (records.length) personSettingsChanged(home, owner.install_id);
      return records;
    }),
    set: (key, value, options = {}) => use((store, caller) => {
      const record = store.set(caller, owner, declarations, key, value, options);
      personSettingsChanged(home, owner.install_id);
      return record;
    }),
    remove: key => use((store, caller) => {
      const removed = store.remove(caller, owner.install_id, declarations, key);
      if (removed) personSettingsChanged(home, owner.install_id);
      return removed;
    }),
  });
}

/**
 * `services.due`: only a per-partition instance has it, for the entries it registers itself (its overview table's reminder times are the
 * platform's, never registered here). Through the Host's running services when there are some, so the timer is armed at once; else straight
 * to the registry, armed when the Host next starts.
 */
export function pluginDueFor(home: string | undefined, scope: PartitionPluginScope | undefined, manifest: PluginManifest, instance: Instance, assertActive: () => void): PluginDueClient | undefined {
  if (!scope || home === undefined || !manifest.databases?.partition) return undefined;
  if (scope.plugin_id !== manifest.plugin_id || scope.install_id !== instance.install_id) throw new ActionError("actions.forbidden", "到期登记只给这个分区里的这个插件");
  const owner: DueEntryOwner = { install_id: scope.install_id, plugin_id: scope.plugin_id, partition_id: scope.partition_id };
  const withRegistry = <T>(run: (registry: ReturnType<typeof openDueRegistry>) => T): T => {
    const registry = openDueRegistry(home);
    try { return run(registry); } finally { registry.close(); }
  };
  const entry = (record: { readonly entry_key: string; readonly due_at: string }): PluginDueEntry => ({ entry_key: record.entry_key, due_at: record.due_at });
  return Object.freeze<PluginDueClient>({
    register(input) {
      assertActive();
      const services = runningPartitionPlatformServices(home);
      return entry(services ? services.registerDue(owner, input) : withRegistry(registry => registry.register(owner, input)));
    },
    cancel(entryKey) {
      assertActive();
      const services = runningPartitionPlatformServices(home);
      return services ? services.cancelDue(owner, entryKey) : withRegistry(registry => registry.cancel(owner, entryKey));
    },
    list() {
      assertActive();
      return withRegistry(registry => registry.entries(owner.partition_id)
        .filter(record => record.install_id === owner.install_id && record.source === "plugin").map(entry));
    },
  });
}
