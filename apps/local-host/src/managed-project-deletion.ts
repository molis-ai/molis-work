import type { CatalogCommit } from "./catalog-commit.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { RuntimeProjectBindingValidation } from "@molis-ai/molis-work-module-private-work-context";
import { catalogErrors } from "./project-catalog-contract.js";
import { randomUUID } from "node:crypto";
import type { StoredProjectDeletion } from "@molis-ai/molis-work-module-projects";
import type { DeleteProjectInput as DeleteMolisWorkProjectInput, ProjectDeletionResult as MolisWorkProjectDeletionResult, ProjectDeletionRecord as MolisWorkProjectDeletionRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import { managedProjectDirectory, holdProjectDeletionDirectory } from "./project-file-paths.js";
import type { ProjectDeletedPort } from "./project-deleted-hooks.js";
import { decodeProjectDeletionRecovery, type ProjectDeletionRecovery, type ProjectDeletionMemoryProof } from "./project-deletion-recovery.js";
import type { ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
export interface ProjectDeletionCleanupPorts {
  removeBindings(projectId: string, actorId: string, at: string): number;
  removePanels(projectId: string): void;
}
/** Already reconciled by the cold Catalog owner against the complete source/target receipt histories. */
export interface ProjectDeletionRecoveryAcceptance {
  deletion_id: string; project_id: string; actor_id: string; idempotency_key: string; request_fingerprint: string;
  owner_ids: readonly string[];
  /** A previous fixed target plan in this persisted group has been verified cleared. */
  require_empty: boolean;
}
/**
 * Freeze the trusted deletion plan before accepting it. Keep the Catalog and directory until Memory, Sessions and
 * business owners finish; recovery uses the same receipt and original decisions.
 */
export class ManagedProjectDeletion {
  private readonly finishing = new Map<string, Promise<MolisWorkProjectDeletionRecord>>();
  constructor(private readonly projects: Pick<ProjectsModule, "query" | "lifecycle">,
    private readonly projectsDirectory: string, private readonly cleanup: ProjectDeletionCleanupPorts,
    private readonly validation: Pick<RuntimeProjectBindingValidation, "requiredActorId" | "requiredProjectId">, private readonly commit: CatalogCommit,
    private readonly owners: ProjectDeletedPort, private readonly maintenance?: ProjectDeletionControl) {}

  /** The cold entry accepts a fresh target decision, or continues the existing target's exact plan and steps. */
  async restoreProjectDeletion(input: ProjectDeletionRecoveryAcceptance): Promise<MolisWorkProjectDeletionRecord> {
    if (!this.maintenance) throw catalogErrors.project_storage_invalid("恢复需要活维护权限");
    this.maintenance.assertCurrent();
    const replay = this.projects.lifecycle.findDeletion(input.actor_id, input.idempotency_key);
    if (replay) {
      if (replay.deletion_id !== input.deletion_id || replay.project_id !== input.project_id || replay.request_fingerprint !== input.request_fingerprint)
        throw catalogErrors.deletion_idempotency_conflict("恢复引用不属于原目标决定");
      const steps = this.projects.lifecycle.deletionSteps(replay.deletion_id);
      if (input.owner_ids.some(owner => !steps.some(step => step.owner_id === owner)))
        throw catalogErrors.project_storage_invalid("原目标决定缺少所需清理主人");
      return replay.cleanup_state === "complete" ? this.verifyOriginalDeletion(replay) : this.finishProjectDeletionCleanup(replay);
    }
    const requiredOwners = [...new Set([...this.owners.owners().map(owner => owner.id), ...input.owner_ids])];
    const project = this.projects.lifecycle.retainedProject(input.project_id);
    if (input.require_empty && project) throw catalogErrors.project_storage_invalid("前项目的原决定尚未清除");
    const directory = project ? managedProjectDirectory(this.projectsDirectory, project) : path.join(this.projectsDirectory, input.project_id);
    const stat = await fs.lstat(directory).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
    this.maintenance.assertCurrent();
    if (project ? !stat?.isDirectory() || stat.isSymbolicLink() : stat !== null)
      throw catalogErrors.project_storage_invalid("目标目录与已选项目不符");
    return this.owners.withRecovery({ project_id: input.project_id, operation_id: input.deletion_id }, async (plan, proof) => {
      if (input.require_empty && !emptyRecovery(plan)) throw catalogErrors.project_storage_invalid("前项目的原选集清除后目标仍非空");
      const record = await this.commit(() => {
        proof.assertCurrent();
        if (this.projects.lifecycle.findDeletion(input.actor_id, input.idempotency_key) || this.projects.lifecycle.pendingDeletions(input.project_id).length)
          throw catalogErrors.deletion_idempotency_conflict("目标请求已接受，请继续原决定");
        const deletion: StoredProjectDeletion = { deletion_id: input.deletion_id, project_id: input.project_id, actor_id: input.actor_id,
          idempotency_key: input.idempotency_key, request_fingerprint: input.request_fingerprint, display_name: project?.display_name ?? "已删除项目",
          staged_directory: path.join(this.projectsDirectory, `.deleting-${input.project_id}-${randomUUID()}`),
          deleted_binding_count: 0, cleanup_state: "pending", cleanup_error: null, deleted_at: new Date().toISOString(), cleaned_at: null,
          recovery_plan: JSON.stringify(plan) };
        this.projects.lifecycle.insertDeletion(deletion);
        this.projects.lifecycle.insertDeletionSteps(deletion.deletion_id, requiredOwners);
        return deletion;
      });
      return this.runHeldCleanup(record, plan, proof);
    });
  }

  /** Completed target receipts are read-only. They cannot authorize another project's partition or directory. */
  async verifyOriginalDeletion(record: StoredProjectDeletion): Promise<MolisWorkProjectDeletionRecord> {
    this.maintenance?.assertCurrent();
    const steps = this.projects.lifecycle.deletionSteps(record.deletion_id);
    if (record.cleanup_state !== "complete" || !steps.length || steps.some(step => step.state !== "complete"))
      throw catalogErrors.project_storage_invalid("原目标决定尚未完成");
    const plan = decodeProjectDeletionRecovery(record.recovery_plan, record.project_id, record.deletion_id);
    return this.owners.withRecovery({ project_id: record.project_id, operation_id: record.deletion_id, original: plan, verification: "original" }, async (_saved, proof) => {
      if (!proof.verifyOriginal) throw catalogErrors.project_storage_invalid("原选集缺少精确核验主人");
      await proof.verifyOriginal(); proof.assertCurrent(); this.maintenance?.assertCurrent();
      return this.projects.lifecycle.deletionRecord(record);
    });
  }

  async deleteProject(input: DeleteMolisWorkProjectInput): Promise<MolisWorkProjectDeletionResult> {
    const projectId = this.validation.requiredProjectId(input.project_id);
    const actorId = this.validation.requiredActorId(input.actor_id);
    requireDeletionConfirmed(input.delete_confirmed);
    const idempotencyKey = requiredDeletionIdempotencyKey(input.idempotency_key);
    const requestFingerprint = JSON.stringify({ project_id: projectId, delete_confirmed: true });
    const replay = this.projects.lifecycle.findDeletion(actorId, idempotencyKey);
    if (replay) {
      if (replay.request_fingerprint !== requestFingerprint) {
        throw catalogErrors.deletion_idempotency_conflict("同一个项目删除请求键不能用于不同的项目或删除确认",
        );
      }
      const deletion = await this.finishProjectDeletionCleanup(replay);
      return { deletion, replayed: true };
    }

    const project = this.projects.query.getProject(projectId);
    const directory = managedProjectDirectory(this.projectsDirectory, project);
    if (!(await fs.stat(directory)).isDirectory()) throw catalogErrors.project_storage_invalid("项目目录不完整，不能接受删除计划");
    const deletionId = `project-deletion-${randomUUID()}`;
    // Nothing has been accepted or removed if the trusted owners cannot freeze a complete plan.
    return this.owners.withRecovery({ project_id: projectId, operation_id: deletionId }, async (plan, proof) => {
      const deletion = await this.commit(() => this.projects.lifecycle.transaction(() => {
        proof.assertCurrent();
        if (this.projects.lifecycle.findDeletion(actorId, idempotencyKey) || this.projects.lifecycle.pendingDeletions(projectId).length)
          throw catalogErrors.deletion_idempotency_conflict("项目删除请求已经接受，请继续原收据");
        const now = new Date().toISOString();
        const record: StoredProjectDeletion = {
          deletion_id: deletionId, actor_id: actorId, idempotency_key: idempotencyKey, request_fingerprint: requestFingerprint,
          project_id: project.project_id, display_name: project.display_name,
          staged_directory: path.join(this.projectsDirectory, `.deleting-${project.project_id}-${randomUUID()}`),
          deleted_binding_count: 0, cleanup_state: "pending", cleanup_error: null, deleted_at: now, cleaned_at: null,
          recovery_plan: JSON.stringify(plan),
        };
        this.projects.lifecycle.insertDeletion(record);
        this.projects.lifecycle.insertDeletionSteps(record.deletion_id, this.owners.owners().map(owner => owner.id));
        return record;
      }));
      // Share this initial cleanup with sweep/retry callers too; the hold already covers the committed plan.
      const run = this.runHeldCleanup(deletion, plan, proof).finally(() => { this.finishing.delete(deletion.deletion_id); });
      this.finishing.set(deletion.deletion_id, run);
      return { deletion: await run, replayed: false };
    });
  }

  /**
   * Runs what is still pending of one receipt. Callers in this process that ask for the same receipt while it runs (the
   * Web server's sweep, a person's retry, the demo's re-creation) share that one run: an owner step never runs twice at once.
   */
  finishProjectDeletionCleanup(record: StoredProjectDeletion): Promise<MolisWorkProjectDeletionRecord> {
    const running = this.finishing.get(record.deletion_id);
    if (running) return running;
    const run = this.runCleanup(record).finally(() => { this.finishing.delete(record.deletion_id); });
    this.finishing.set(record.deletion_id, run);
    return run;
  }

  private async runCleanup(record: StoredProjectDeletion): Promise<MolisWorkProjectDeletionRecord> {
    if (record.cleanup_state === "complete") {
      const plan = decodeProjectDeletionRecovery(record.recovery_plan, record.project_id, record.deletion_id);
      return this.owners.withRecovery({ project_id: record.project_id, operation_id: record.deletion_id, original: plan }, async (_saved, proof) => {
        await proof.verifyMemory(); proof.assertCurrent();
        return this.projects.lifecycle.deletionRecord(record);
      });
    }
    try {
      const plan = decodeProjectDeletionRecovery(record.recovery_plan, record.project_id, record.deletion_id);
      return await this.owners.withRecovery({ project_id: record.project_id, operation_id: record.deletion_id, original: plan },
        (saved, proof) => this.runHeldCleanup(record, saved, proof));
    } catch (error) { return this.pending(record, error instanceof Error ? error.message : String(error)); }
  }

  private async pending(record: StoredProjectDeletion, error: string): Promise<MolisWorkProjectDeletionRecord> {
    return this.projects.lifecycle.deletionRecord(await this.commit(() => this.projects.lifecycle.updateDeletionCleanup(record.deletion_id,
      { state: "pending", error, cleaned_at: null })));
  }

  private async runHeldCleanup(record: StoredProjectDeletion, plan: ProjectDeletionRecovery, proof: ProjectDeletionMemoryProof): Promise<MolisWorkProjectDeletionRecord> {
    const directory = this.maintenance ? holdProjectDeletionDirectory(this.projectsDirectory, record.project_id, record.staged_directory,
      Boolean(this.projects.lifecycle.retainedProject(record.project_id)), this.maintenance.assertCurrent) : undefined;
    const steps = this.projects.lifecycle.deletionSteps(record.deletion_id);
    if (!steps.some(step => step.owner_id === "memory")) return this.pending(record, "原收据没有 Memory 清理主人，保留待核对");
    const problems: string[] = [];
    // One concrete prerequisite, not a dependency graph: every Memory and Session must be cleared before business copies.
    const ordered = [...steps.filter(step => step.owner_id === "memory"), ...steps.filter(step => step.owner_id !== "memory")];
    for (const step of ordered) {
      if (step.owner_id === "memory" && step.state === "complete") {
        try { await proof.verifyMemory(); proof.assertCurrent(); }
        catch (error) { return this.pending(record, error instanceof Error ? error.message : String(error)); }
        continue;
      }
      if (step.state !== "pending") continue;
      try {
        this.maintenance?.assertCurrent();
        if (!await this.owners.clear(step.owner_id, record.project_id,
          { deletion_id: record.deletion_id, project_id: record.project_id, recovery: plan }, this.maintenance)) {
          problems.push(`${step.owner_id}：${step.error ?? "这一步要由有这项数据的 Molis Work 入口完成"}`);
        } else {
          if (step.owner_id === "memory") await proof.verifyMemory();
          await this.commit(() => { proof.assertCurrent(); return this.projects.lifecycle.updateDeletionStep(record.deletion_id, step.owner_id, { state: "complete", error: null }); });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        problems.push(`${step.owner_id}：${message}`);
        await this.commit(() => this.projects.lifecycle.updateDeletionStep(record.deletion_id, step.owner_id, { state: "pending", error: message }));
      }
      if (step.owner_id === "memory" && problems.length) return this.pending(record, problems.join("；"));
    }
    if (problems.length) return this.pending(record, problems.join("；"));
    try {
      await proof.verifyMemory(); proof.assertCurrent();
      const source = path.join(this.projectsDirectory, record.project_id);
      this.maintenance?.assertCurrent();
      try { if (directory) await directory.stage(); else await fs.rename(source, record.staged_directory); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const staged = await fs.stat(record.staged_directory).catch(failure => { if (failure.code !== "ENOENT") throw failure; return null; });
        if (!staged && this.projects.lifecycle.retainedProject(record.project_id)) throw error;
      }
      // The original row and installation bindings stay available until all owners above have succeeded.
      await this.commit(() => this.projects.lifecycle.transaction(() => {
        proof.assertCurrent();
        directory?.assertCurrent();
        const now = new Date().toISOString();
        const removed = this.cleanup.removeBindings(record.project_id, record.actor_id, now)
          + this.projects.lifecycle.removeWorkspaceMembershipsForProject(record.project_id);
        this.cleanup.removePanels(record.project_id);
        this.projects.lifecycle.removeFacts(record.project_id);
        if (removed) this.projects.lifecycle.updateDeletionCleanup(record.deletion_id,
          { state: "pending", error: null, cleaned_at: null, add_binding_count: removed });
      }));
      proof.assertCurrent(); this.maintenance?.assertCurrent();
      if (directory) await directory.remove(); else await fs.rm(record.staged_directory, { recursive: true, force: true });
      this.maintenance?.assertCurrent();
      let assertCovered!: () => void;
      record = await this.commit(() => {
        assertCovered();
        proof.assertCurrent();
        return this.projects.lifecycle.updateDeletionCleanup(record.deletion_id, { state: "complete", error: null, cleaned_at: new Date().toISOString() });
      }, async () => { assertCovered = await proof.verifyMemory(); });
      return this.projects.lifecycle.deletionRecord(record);
    } catch (error) { return this.pending(record, error instanceof Error ? error.message : String(error)); }
  }

  /**
   * Finishes the clean-up of earlier deletions of this project id that is still pending, so a project made again under
   * the same id (the fixed-id demo) never starts on what the old one left. Refuses while something is still left.
   */
  async settleProject(projectId: string): Promise<void> {
    for (const pending of this.projects.lifecycle.pendingDeletions(projectId)) {
      const settled = await this.finishProjectDeletionCleanup(pending);
      if (settled.cleanup_state !== "complete") {
        throw catalogErrors.project_storage_invalid(`这个项目上一次删除的清理还没有完成，先重试清理，或打开 Molis Work 让它接着做：${settled.cleanup_error ?? ""}`);
      }
    }
  }

  /**
   * Finishes every deletion whose clean-up is still pending, for any project: what a Host does when it starts, since the
   * deletions that other processes (the CLI, MCP, a Host that has since closed) left pending wait for an owner only a
   * Host has. Returns how many are still pending.
   */
  async finishAll(): Promise<number> {
    let pending = 0;
    for (const record of this.projects.lifecycle.pendingDeletions()) {
      if ((await this.finishProjectDeletionCleanup(record)).cleanup_state !== "complete") pending += 1;
    }
    return pending;
  }
}

/** What every door checks before it touches anything of the project: the person's separate, explicit confirmation. */
export function requireDeletionConfirmed(confirmed: boolean): void {
  if (confirmed !== true) {
    throw catalogErrors.delete_confirmation_required("删除 Molis Work 项目及其数据库需要当前对话中的单独明确确认",
    );
  }
}

export function requiredDeletionIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key) {
    throw catalogErrors.deletion_idempotency_conflict("删除项目需要幂等请求键",
    );
  }
  return key;
}

function emptyRecovery(plan: ProjectDeletionRecovery): boolean {
  return plan.kind === "absent" || (plan.sessions.sessions.length === 0
    && plan.memory.scopes.every(scope => !scope.memories.length && !scope.candidates.length && !scope.sources.length));
}
