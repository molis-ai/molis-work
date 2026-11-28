import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginSyncBinding, PluginSyncCollection } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginManifestDigest, type RuntimeSyncCollection } from "@molis-ai/molis-work-plugin-runtime";
import { partitionPluginScope } from "./partition-plugin-assembly.js";
import type { PartitionPluginHost } from "./partition-plugin-host.js";
import { openPartitionPluginDatabase } from "./plugin-home-database-client.js";
import { pluginDueFor } from "./plugin-partition-services.js";
import { partitionOwnerFilesFor } from "./plugin-sandbox-owner-files.js";

/** The same collection handler as a live partition, opened only around one authorized operation. Discovery opens no business library. */
export function passivePartitionSync(
  home: string,
  spaceId: string,
  projectId: string,
  owner: NonNullable<ReturnType<PartitionPluginHost["syncOwner"]>>,
  collection: PluginSyncCollection,
  authorize: () => void,
  isMember: () => boolean,
): RuntimeSyncCollection | null {
  const { definition, installId } = owner,
    { manifest } = definition;
  const installed = owner.record();
  if (!installed || !manifest.databases?.partition) return null;
  const digest = pluginManifestDigest(manifest);
  const allowed = (permission: string) => {
    authorize();
    const current = owner.record();
    if (
      !isMember() ||
      !current ||
      !["installed", "running", "stopped"].includes(current.state) ||
      current.installation_generation !== installed.installation_generation ||
      current.version !== manifest.version ||
      current.manifest_digest !== digest ||
      current.publisher_id !== manifest.publisher.publisher_id ||
      current.publisher_signature !== manifest.publisher.signature ||
      !current.grants.includes(permission)
    )
      throw new ActionError("actions.forbidden", "分区同步安装或授权已改变");
  };
  const check = () => allowed("storage:private");
  const available = () => {
    try {
      check();
      return true;
    } catch {
      return false;
    }
  };
  if (!available()) return null;
  const scope = partitionPluginScope(home, projectId, manifest.plugin_id, installId);
  const instance = { install_id: installId, installation_generation: installed.installation_generation, requireGrant: allowed };
  function use<T>(run: (binding: PluginSyncBinding) => T): T {
    check();
    const library = openPartitionPluginDatabase(scope, home, manifest, allowed, instance);
    let pending = false;
    try {
      const ownerFiles = partitionOwnerFilesFor(
        { partitionScope: scope, home: { directory: home }, project_id: projectId },
        definition,
        instance,
        check,
      );
      const binding = owner
        .bindings({
          project_id: projectId,
          sync: { spaceId, assertActive: check },
          services: {
            sync: library.sync,
            ownerFiles: ownerFiles?.client,
            database: { get: library.client.get.bind(library.client) },
            due: pluginDueFor(home, scope, manifest, instance, check),
          },
        })
        .find((row) => row.collection_id === collection.id);
      if (!binding) throw new ActionError("actions.plugin_unavailable", "分区插件没有提供这个同步集合");
      const result = run(binding);
      if (result instanceof Promise) {
        pending = true;
        return result
          .then((value) => {
            check();
            return value;
          })
          .finally(() => library.close()) as T;
      }
      check();
      return result;
    } finally {
      if (!pending) library.close();
    }
  }
  return {
    plugin_id: manifest.plugin_id,
    publisher_id: manifest.publisher.publisher_id,
    publisher_signature: manifest.publisher.signature,
    collection,
    dependencies: manifest.sync!.collections.filter((row) => collection.requires.includes(row.id)),
    available,
    replica: {
      authorizeKey: (key, value) =>
        use(({ replica }) => {
          if (!replica.authorizeKey) throw new ActionError("actions.forbidden", "同步集合没有标识授权");
          replica.authorizeKey(key, value);
        }),
      next: (options) => use(({ replica }) => replica.next(options)),
      acknowledge: (key, id, revision) => use(({ replica }) => replica.acknowledge(key, id, revision)),
      receive: (event, options) => use(({ replica }) => replica.receive(event, options)),
      cursor: () => use(({ replica }) => replica.cursor()),
      counts: () => use(({ replica }) => replica.counts()),
      conflicts: () => use(({ replica }) => replica.conflicts()),
      resolve: (key, choice, revision, state) => use(({ replica }) => replica.resolve(key, choice, revision, state)),
      locate: (key) => use((binding) => binding.locate?.(key) ?? null),
      hasProjectChanges: (id) => use(({ replica }) => {
        if (!replica.hasProjectChanges) throw new ActionError("actions.plugin_unavailable", "同步集合未提供项目变更判断");
        return replica.hasProjectChanges(id);
      }),
      retryWaiting: () => use(({ replica }) => replica.retryWaiting?.()),
      inspectConflict: (key) => use(({ replica }) => replica.inspectConflict?.(key) ?? null),
      recoveries: () => use(({ replica }) => replica.recoveries?.() ?? []),
      inspectRecovery: (id) => use(({ replica }) => replica.inspectRecovery?.(id) ?? null),
      restoreRecovery: (id, choice, revision) => use(({ replica }) => {
        if (!replica.restoreRecovery) throw new ActionError("actions.plugin_unavailable", "同步集合未提供记录恢复");
        return replica.restoreRecovery(id, choice, revision);
      }),
    },
    content: {
      prepare: (key, value) =>
        use(async (binding) => {
          await binding.content?.prepare?.(key, value);
        }),
      encode: (key, value) => use((binding) => binding.content?.encode(key, value) ?? { value, blobs: [] }),
      decode: (key, value, read) =>
        use(async (binding) =>
          binding.content
            ? binding.content.decode(key, value, async (ref) => {
                check();
                const bytes = await read(ref);
                check();
                return bytes;
              })
            : value,
        ),
    },
  };
}
