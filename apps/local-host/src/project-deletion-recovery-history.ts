import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { catalogErrors } from "./project-catalog-contract.js";
import type { ProjectDeletionRecoverySource } from "./project-deletion-recovery-inspection.js";

export type ProjectDeletionSourceRequest = Pick<ProjectDeletionRecoverySource,
  "deletion_id" | "project_id" | "actor_id" | "idempotency_key" | "request_fingerprint">;
/** Stored together in the existing restoration parent marker, before any target receipt is accepted. */
export interface ProjectDeletionRecoveryGroup {
  project_id: string;
  sources: readonly ProjectDeletionSourceRequest[];
  targets: readonly { source_deletion_id: string; target_deletion_id: string }[];
  disposal: { primary_target: string | null; dependent_targets: readonly string[] };
}
const invalid = () => catalogErrors.project_storage_invalid("完整项目删除历史或原恢复关联不相容");
const key = (row: ProjectDeletionSourceRequest) => JSON.stringify([row.actor_id, row.idempotency_key]);
const identity = (row: ProjectDeletionSourceRequest): ProjectDeletionSourceRequest => ({ deletion_id: row.deletion_id,
  project_id: row.project_id, actor_id: row.actor_id, idempotency_key: row.idempotency_key, request_fingerprint: row.request_fingerprint });

function originalCompatible(target: ProjectDeletionRecoverySource, source: ProjectDeletionRecoverySource): boolean {
  return isDeepStrictEqual(target.recovery, source.recovery)
    && (target.cleanup_state !== "complete" || source.cleanup_state === "complete")
    && target.owner_steps.length === source.owner_steps.length
    && target.owner_steps.every((step, index) => step.owner_id === source.owner_steps[index]!.owner_id
      && (step.state !== "complete" || source.owner_steps[index]!.state === "complete"));
}

function retainedGroup(group: ProjectDeletionRecoveryGroup, sources: readonly ProjectDeletionRecoverySource[]): ProjectDeletionRecoveryGroup {
  if (!isDeepStrictEqual(group.sources, sources.map(identity)) || group.targets.length !== sources.length) throw invalid();
  const sourceIds = new Set(sources.map(source => source.deletion_id));
  const targetIds = new Set<string>();
  for (const target of group.targets) {
    if (!sourceIds.delete(target.source_deletion_id) || !/^project-deletion-[0-9a-f-]+$/.test(target.target_deletion_id)
      || targetIds.has(target.target_deletion_id)) throw invalid();
    targetIds.add(target.target_deletion_id);
  }
  const { primary_target: primary, dependent_targets: dependencies } = group.disposal;
  if (primary !== null && !targetIds.has(primary)) throw invalid();
  if (new Set(dependencies).size !== dependencies.length || dependencies.some(id => id === primary || !targetIds.has(id))) throw invalid();
  const mapped = group.targets.filter(target => target.target_deletion_id !== target.source_deletion_id);
  if (mapped.some(target => target.target_deletion_id !== primary && !dependencies.includes(target.target_deletion_id))
    || dependencies.some(id => !mapped.some(target => target.target_deletion_id === id)) || (dependencies.length && primary === null)) throw invalid();
  return structuredClone(group);
}

/** Same-Home, same-history complete T0/T1 is the operator's premise. Receipts check its observable monotonic subset. */
export function reconcileProjectDeletionHistory(sources: readonly ProjectDeletionRecoverySource[], targets: readonly ProjectDeletionRecoverySource[],
  saved: readonly ProjectDeletionRecoveryGroup[]): { groups: ProjectDeletionRecoveryGroup[]; fresh: ProjectDeletionRecoveryGroup[] } {
  const sourceByKey = new Map(sources.map(source => [key(source), source]));
  if (sourceByKey.size !== sources.length || new Set(sources.map(source => source.deletion_id)).size !== sources.length) throw invalid();
  const savedByProject = new Map(saved.map(group => [group.project_id, group]));
  if (savedByProject.size !== saved.length) throw invalid();
  const mappings = saved.flatMap(group => group.targets);
  if (new Set(mappings.map(item => item.target_deletion_id)).size !== mappings.length) throw invalid();
  const targetByKey = new Map<string, ProjectDeletionRecoverySource>();
  for (const target of targets) {
    const source = sourceByKey.get(key(target));
    if (!source || source.project_id !== target.project_id || source.request_fingerprint !== target.request_fingerprint || targetByKey.has(key(target))) throw invalid();
    const reference = mappings.find(item => item.source_deletion_id === source.deletion_id);
    if (reference && reference.target_deletion_id !== target.deletion_id) throw invalid();
    if (target.deletion_id === source.deletion_id) {
      if (!originalCompatible(target, source)) throw invalid();
    } else if (!reference) throw invalid();
    targetByKey.set(key(target), target);
  }
  const groups: ProjectDeletionRecoveryGroup[] = [], fresh: ProjectDeletionRecoveryGroup[] = [];
  for (const projectId of [...new Set(sources.map(source => source.project_id))].sort()) {
    const projectSources = sources.filter(source => source.project_id === projectId).sort((a, b) => a.deletion_id.localeCompare(b.deletion_id));
    const previous = savedByProject.get(projectId);
    if (previous) {
      const group = retainedGroup(previous, projectSources);
      if (group.targets.some(ref => ref.target_deletion_id === ref.source_deletion_id && !targets.some(target => target.deletion_id === ref.target_deletion_id))) throw invalid();
      groups.push(group); savedByProject.delete(projectId); continue;
    }
    const pending = targets.filter(target => target.project_id === projectId && target.cleanup_state === "pending");
    if (pending.length > 1) throw invalid();
    const refs = projectSources.map(source => ({ source_deletion_id: source.deletion_id,
      target_deletion_id: targetByKey.get(key(source))?.deletion_id ?? `project-deletion-${randomUUID()}` }));
    const newTargets = refs.filter((_ref, index) => !targetByKey.has(key(projectSources[index]!)));
    const primary = pending[0]?.deletion_id ?? newTargets[0]?.target_deletion_id ?? null;
    const group: ProjectDeletionRecoveryGroup = { project_id: projectId, sources: projectSources.map(identity), targets: refs,
      disposal: { primary_target: primary, dependent_targets: newTargets.map(ref => ref.target_deletion_id).filter(id => id !== primary) } };
    groups.push(group); fresh.push(group);
  }
  if (savedByProject.size) throw invalid();
  return { groups, fresh };
}
