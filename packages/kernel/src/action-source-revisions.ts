import { ActionError, requireSynchronous, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";

/** Registration-owned, pure owner stamps. This observes business owners; it never becomes one. */
export class ActionSourceRevisions {
  private readonly readers = new Map<symbol, NonNullable<ActionProviderRegistration["sourceRevision"]>>();

  register(token: symbol, reader: ActionProviderRegistration["sourceRevision"]): () => void {
    if (reader) this.readers.set(token, reader);
    return () => { this.readers.delete(token); };
  }

  capture(context: ActionCallContext, sources: readonly { definition: HostCapabilityDescriptor; token: symbol | undefined }[]): () => void {
    const scope = Object.freeze({ actor_id: context.actor_id, project_id: context.project_id });
    const captured = sources.flatMap(({ definition, token }) => {
      const reader = token && this.readers.get(token);
      if (!reader) {
        if (definition.action_provider?.project_data_instance_id) throw new ActionError("actions.unavailable", "系统资料来源缺少同步状态读口");
        return [];
      }
      return [{ reader, revision: readRevision(reader, scope) }];
    });
    return () => {
      // All authority/availability callbacks must have completed before the first owner is read.
      for (const saved of captured) if (readRevision(saved.reader, scope) !== saved.revision) {
        throw new ActionError("actions.conflict", "来源在读取期间发生变更，请重新查看");
      }
    };
  }
}

function readRevision(reader: NonNullable<ActionProviderRegistration["sourceRevision"]>, scope: Readonly<Pick<ActionCallContext, "actor_id" | "project_id">>): string | number {
  const revision = requireSynchronous(reader(scope), "来源状态读口必须同步完成");
  if (typeof revision !== "string" && (typeof revision !== "number" || !Number.isFinite(revision))) {
    throw new ActionError("actions.definition_invalid", "来源状态读口必须返回字符串或有限数字");
  }
  return revision;
}
