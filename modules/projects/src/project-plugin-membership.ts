import { createHash } from "node:crypto";
import { PARTITION_PLUGIN_CHANGES_MAX, type SetPartitionPluginsInput, type SetProjectPluginInput, type VersionedPartitionPluginMembership, type VersionedProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectService } from "./project-service.js";
import type { ProjectsRepository } from "./repository.js";

/** Versioned reads and writes are separate from the authorization path's membership projection. */
export class ProjectPluginMembershipService {
  constructor(
    private readonly repository: ProjectsRepository,
    private readonly records: ProjectService,
  ) {}

  get(projectId: string): VersionedProjectPluginMembership {
    return this.repository.transaction(() => this.readSnapshot(projectId.trim()));
  }

  set(projectId: string, actorId: string, input: SetProjectPluginInput): VersionedProjectPluginMembership {
    // Take the SQLite write lock before observing membership, even across catalog connections.
    return this.repository.db.transaction(() => {
      const id = projectId.trim();
      const current = this.readSnapshot(id);
      if (current.revision !== input.expected_revision) {
        throw new ActionError("actions.conflict", "项目插件成员已经变了，请刷新后再改");
      }
      const change = { project_id: id, actor_id: actorId, plugin_id: input.plugin_id };
      if (input.enabled) this.records.addPlugin(change);
      else this.records.removePlugin(change);
      return this.readSnapshot(id);
    }).immediate();
  }

  /**
   * `partitions.plugins.set@1`: every change in one immediate transaction, from one observation, in the order given, each with its companions as
   * one `set` would. The personal space is a partition here like any project. A repeated plugin or an empty list is refused before anything is read.
   */
  setMany(partitionId: string, actorId: string, input: SetPartitionPluginsInput): VersionedPartitionPluginMembership {
    const changes = Array.isArray(input?.changes) ? input.changes : [];
    const normalized = changes.map(change => ({
      plugin_id: typeof change?.plugin_id === "string" ? change.plugin_id.trim() : "",
      enabled: change?.enabled,
    }));
    const ids = normalized.map(change => change.plugin_id);
    if (!changes.length || changes.length > PARTITION_PLUGIN_CHANGES_MAX || new Set(ids).size !== ids.length
      || normalized.some(change => !change.plugin_id || typeof change.enabled !== "boolean")) {
      throw new ActionError("actions.input_invalid", `一次要改 1～${PARTITION_PLUGIN_CHANGES_MAX} 个不重复的插件`);
    }
    return this.repository.db.transaction(() => {
      const id = partitionId.trim();
      const current = this.readSnapshot(id);
      if (current.revision !== input.expected_revision) {
        throw new ActionError("actions.conflict", "这里启用的插件已经变了，请刷新后再改");
      }
      for (const change of normalized) {
        const one = { project_id: id, actor_id: actorId, plugin_id: change.plugin_id };
        if (change.enabled) this.records.addPlugin(one);
        else this.records.removePlugin(one);
      }
      return { partition_id: id, ...this.readSnapshot(id) };
    }).immediate();
  }

  getPartition(partitionId: string): VersionedPartitionPluginMembership {
    const id = partitionId.trim();
    return { partition_id: id, ...this.get(id) };
  }

  private readSnapshot(projectId: string): VersionedProjectPluginMembership {
    // Members and the latest member event come from one read; the event is why the revision detects an
    // add-then-remove that left the set as it was.
    const { membership, latest_event_id: lastEvent } = this.records.pluginMembershipWithLatestEvent(projectId);
    const facts = [projectId, [...membership.plugins].sort(), lastEvent];
    const revision = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
    return { ...membership, revision };
  }
}
