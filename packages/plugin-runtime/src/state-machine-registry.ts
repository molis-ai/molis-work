import { bindActionHandler, requireSynchronous, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  STATE_MACHINES_PROVIDER_ID, stateMachineActions,
  type PluginInstanceRecord, type PluginManifest, type StateMachineDeclaration, type StateMachineListResult, type StateMachineRegistryEntry,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { inspectStateMachineDeclarations } from "@molis-ai/molis-work-plugin-sdk/state-machine";
import { PLUGIN_LIFECYCLE_MACHINE } from "./lifecycle-machine.js";
import { readPluginReleaseManifest } from "./release-artifacts.js";
import { readPluginRuntimeRecords, type PluginRuntimeDatabase } from "./repository.js";

/** One installation library in the caller's scope, opened for reading. */
export interface StateMachineRegistryStore {
  readonly scope: "home" | "project";
  readonly db: PluginRuntimeDatabase;
}

export interface StateMachineRegistryPorts {
  /** The Manifests of the plugins that ship with this host. */
  builtin(): readonly PluginManifest[];
  /** The installation libraries the caller's scope reaches: the Home's, and the project's when one is named. Nothing is started. */
  open(projectId: string | undefined): Promise<{ readonly stores: readonly StateMachineRegistryStore[]; close(): void }>;
  /** Only installations the host still recognizes, before reading their artifacts. */
  includes?(record: PluginInstanceRecord): boolean;
  /** The host's verified copy of an installation's Manifest where no release was archived yet (installed, never started). */
  manifest?(store: StateMachineRegistryStore, record: PluginInstanceRecord): PluginManifest | undefined;
}

export interface StateMachineRegistrySources {
  readonly builtin: readonly PluginManifest[];
  readonly installations: ReadonlyArray<{ readonly scope: "home" | "project"; readonly record: PluginInstanceRecord; readonly manifest: PluginManifest | undefined }>;
}

const PLATFORM_ENTRIES: readonly StateMachineRegistryEntry[] = Object.freeze([Object.freeze({
  owner: "platform", owner_id: "platform.plugin-runtime", version: null, scope: "platform", source: "platform",
  install_id: null, installation_state: null, machines: Object.freeze([PLUGIN_LIFECYCLE_MACHINE.describe()]),
} satisfies StateMachineRegistryEntry)]);

/** What a Manifest declares, copied field by field after the declaration check: a stored Manifest is data, and only these five fields leave. */
function declaredMachines(manifest: PluginManifest): { machines: readonly StateMachineDeclaration[]; unknown?: "declaration_invalid" } {
  try { inspectStateMachineDeclarations(manifest.state_machines, manifest.plugin_id); }
  catch { return { machines: [], unknown: "declaration_invalid" }; }
  return { machines: (manifest.state_machines ?? []).map(machine => ({
    machine_id: machine.machine_id, version: machine.version, states: { ...machine.states }, initial: machine.initial, terminal: [...machine.terminal],
  })) };
}

/**
 * The registry: a projection of definitions and stored Manifests, never a table of its own. An installation whose Manifest cannot be
 * read is listed as unknown with the reason; an uninstalled one leaves no entry. A built-in plugin is read from the definition this
 * host ships, with the state of its installation in the caller's scope when it has one.
 */
export function projectStateMachines(sources: StateMachineRegistrySources): StateMachineRegistryEntry[] {
  const builtin = new Map(sources.builtin.map(manifest => [manifest.plugin_id, manifest]));
  const live = sources.installations.filter(({ record }) => record.state !== "uninstalled");
  const entries: StateMachineRegistryEntry[] = [...PLATFORM_ENTRIES];
  for (const manifest of sources.builtin) {
    const scope = manifest.runtime?.scope === "home" ? "home" : "project";
    const installed = live.find(({ record, scope: at }) => record.plugin_id === manifest.plugin_id && record.publisher_trust === "host" && at === scope)?.record;
    entries.push({ owner: "plugin", owner_id: manifest.plugin_id, version: manifest.version, scope, source: "builtin",
      install_id: installed?.install_id ?? null, installation_state: installed?.state ?? null, ...declaredMachines(manifest) });
  }
  for (const { scope, record, manifest } of live) {
    if (record.publisher_trust === "host" && builtin.has(record.plugin_id)) continue;
    const base = { owner: "plugin", owner_id: record.plugin_id, version: record.version, scope, source: "installed",
      install_id: record.install_id, installation_state: record.state } as const;
    entries.push(manifest && manifest.plugin_id === record.plugin_id && manifest.version === record.version
      ? { ...base, ...declaredMachines(manifest) } : { ...base, machines: [], unknown: "manifest_unavailable" });
  }
  return entries;
}

function storedManifest(store: StateMachineRegistryStore, record: PluginInstanceRecord, ports: StateMachineRegistryPorts): PluginManifest | undefined {
  try { return readPluginReleaseManifest(store.db, record) ?? ports.manifest?.(store, record); }
  catch { return undefined; }
}

async function readEntries(ports: StateMachineRegistryPorts, projectId: string | undefined, assertCurrent: () => void): Promise<StateMachineRegistryEntry[]> {
  const opened = await ports.open(projectId);
  try {
    assertCurrent();
    return projectStateMachines({
      builtin: ports.builtin(),
      installations: opened.stores.flatMap(store => readPluginRuntimeRecords(store.db)
        .filter(record => record.state !== "uninstalled" && (ports.includes?.(record) ?? true))
        .map(record => ({ scope: store.scope, record, manifest: record.publisher_trust === "host" ? undefined : storedManifest(store, record, ports) }))),
    });
  } finally {
    opened.close();
  }
}

/**
 * `system.state-machines`: the read-only registry. It stays registered on a host without a Home and answers an empty list with the reason.
 * A query reads stored Manifests only: it starts no plugin, runs no plugin code and grants nothing.
 */
export function stateMachineActionProvider(ports?: StateMachineRegistryPorts): ActionProviderRegistration {
  const read = async (caller: ActionCallContext) => {
    const assertCurrent = () => {
      caller.signal?.throwIfAborted();
      requireSynchronous(caller.assert_authority_current?.());
    };
    assertCurrent();
    // The project is the caller's own, never one named in the input (MCP and Agents get it from their connection).
    const entries = ports ? await readEntries(ports, caller.project_id ?? undefined, assertCurrent) : [];
    assertCurrent();
    return entries;
  };
  return {
    provider: { provider_id: STATE_MACHINES_PROVIDER_ID, title: "状态机登记", kind: "system" },
    definitions: [stateMachineActions.list, stateMachineActions.get],
    handlers: [
      bindActionHandler(stateMachineActions.list, async (input, caller): Promise<StateMachineListResult> => {
        const all = await read(caller);
        const entries = input.plugin_id ? all.filter(entry => entry.owner === "plugin" && entry.owner_id === input.plugin_id) : all;
        if (!ports) return { entries, empty_reason: "no_home" };
        return entries.some(entry => entry.owner === "plugin") ? { entries } : { entries, empty_reason: "no_plugins_in_scope" };
      }),
      bindActionHandler(stateMachineActions.get, async (input, caller) => {
        const all = await read(caller);
        const found = all.find(entry => (!input.install_id || entry.install_id === input.install_id)
          && entry.machines.some(machine => machine.machine_id === input.machine_id));
        return { entry: found ? { ...found, machines: found.machines.filter(machine => machine.machine_id === input.machine_id) } : null };
      }),
    ],
  };
}
