import { createHash } from "node:crypto";
import type { SetProjectPluginInput, VersionedProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
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

  private readSnapshot(projectId: string): VersionedProjectPluginMembership {
    // Members, hidden marks and the latest member event come from one read; the event is why the revision detects an
    // add-then-remove that left the set as it was.
    const { membership, latest_event_id: lastEvent } = this.records.pluginMembershipWithLatestEvent(projectId);
    const facts = [projectId, [...membership.plugins].sort(), [...membership.hidden].sort(), lastEvent];
    const revision = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
    return { ...membership, revision };
  }
}
