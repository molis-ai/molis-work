import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomeStoreDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  type Workflow,
  type WorkflowChain,
  type WorkflowInstance,
  type WorkflowInstanceStatus,
  type WorkflowItemRef,
  type WorkflowStep,
  advanceInstance,
  holdInstance,
  nextUpdatedAt,
  startInstanceSteps,
  stoppedOf,
} from "./model.js";
import { workflowsErrors } from "./error.js";
import { WORKFLOWS_DATABASE } from "./database.js";
export { WORKFLOWS_DATABASE };

interface WorkflowRow {
  workflow_id: string;
  project_id: string;
  title: string;
  chain_json: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

interface InstanceRow {
  instance_id: string;
  workflow_id: string;
  project_id: string;
  title: string;
  status: string;
  current: number;
  chain_json: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowSummary extends Workflow {
  readonly instance_count: number;
  readonly active_count: number;
  readonly last_activity_at: string | null;
}

/** The SQL the store runs: its own connection, or the library the Runtime gives the plugin. */
export type WorkflowsSqlValue = string | number | null;
export interface WorkflowsSql {
  get(sql: string, parameters?: readonly WorkflowsSqlValue[]): Readonly<Record<string, unknown>> | null | undefined;
  all(sql: string, parameters?: readonly WorkflowsSqlValue[]): readonly Readonly<Record<string, unknown>>[];
  run(sql: string, parameters?: readonly WorkflowsSqlValue[]): { changes: number | bigint };
}

/** Where the actions read and write: reads run on their own; a write waits for the call's authority. */
export interface WorkflowsStores {
  read<T>(run: (store: WorkflowsStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: WorkflowsStore) => T): Promise<T>;
}

/** Reads and writes on a store opened for each run, for tests and maintenance; the caller's beforeEffect is awaited. */
export function ownWorkflowsStores(withStore: <T>(run: (store: WorkflowsStore) => T) => T): WorkflowsStores {
  return { read: withStore, async write(caller, run) { await caller.beforeEffect(); return withStore(run); } };
}

export class WorkflowsStore {
  constructor(private readonly db: WorkflowsSql, private readonly release: () => void = () => {}) {}

  close(): void {
    this.release();
  }

  /** The one cast from the SQL rows to this store's row shape: the columns are the schema's. */
  private rows<T>(sql: string, parameters?: readonly WorkflowsSqlValue[]): T[] {
    return this.db.all(sql, parameters) as unknown as T[];
  }

  list(projectId: string): WorkflowSummary[] {
    return this.rows<WorkflowRow>("SELECT * FROM workflows WHERE project_id = ? AND deleted = 0 ORDER BY updated_at DESC, rowid DESC", [projectId]).map((row) => {
      const count = this.db.get("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, MAX(updated_at) AS last FROM instances WHERE workflow_id = ?", [row.workflow_id]);
      return { ...fromWorkflowRow(row), instance_count: Number(count?.total ?? 0), active_count: Number(count?.active ?? 0),
        last_activity_at: typeof count?.last === "string" ? count.last : null };
    });
  }

  get(workflowId: string, projectId: string): Workflow {
    const row = this.rows<WorkflowRow>("SELECT * FROM workflows WHERE workflow_id = ? AND deleted = 0", [workflowId])[0];
    if (!row || row.project_id !== projectId) throw workflowsErrors.not_found("找不到这条流程");
    return fromWorkflowRow(row);
  }

  create(input: { project_id: string; title: string; chain: WorkflowChain }): Workflow {
    const now = new Date().toISOString();
    const workflow: Workflow = {
      workflow_id: crypto.randomUUID(),
      project_id: input.project_id,
      title: normalizeTitle(input.title),
      stations: input.chain.stations,
      links: input.chain.links,
      revision: 1,
      created_at: now,
      updated_at: now,
    };
    this.db.run("INSERT INTO workflows (workflow_id, project_id, title, chain_json, revision, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
      [workflow.workflow_id, workflow.project_id, workflow.title, chainJson(workflow), workflow.revision, now, now]);
    return workflow;
  }

  /** Every edit is saved at once; `revision` stops two windows from overwriting each other silently. */
  update(workflowId: string, projectId: string, patch: { title?: string; chain?: WorkflowChain; revision: number }): Workflow {
    const current = this.get(workflowId, projectId);
    if (patch.revision !== current.revision) throw workflowsErrors.conflict("这条流程在别处改过了，已载入最新的样子");
    const next: Workflow = {
      ...current,
      title: patch.title === undefined ? current.title : normalizeTitle(patch.title),
      stations: patch.chain?.stations ?? current.stations,
      links: patch.chain?.links ?? current.links,
      revision: current.revision + 1,
      updated_at: new Date().toISOString(),
    };
    this.db.run("UPDATE workflows SET title = ?, chain_json = ?, revision = ?, updated_at = ? WHERE workflow_id = ?",
      [next.title, chainJson(next), next.revision, next.updated_at, workflowId]);
    return next;
  }

  /** Hidden from the list; its instances keep their history. */
  delete(workflowId: string, projectId: string): void {
    this.get(workflowId, projectId);
    this.db.run("UPDATE workflows SET deleted = 1, updated_at = ? WHERE workflow_id = ?", [new Date().toISOString(), workflowId]);
  }

  instances(workflowId: string, projectId: string): WorkflowInstance[] {
    this.get(workflowId, projectId);
    return this.rows<InstanceRow>("SELECT * FROM instances WHERE workflow_id = ? ORDER BY created_at DESC, rowid DESC", [workflowId]).map(fromInstanceRow);
  }

  instance(instanceId: string, projectId: string): WorkflowInstance {
    const row = this.rows<InstanceRow>("SELECT * FROM instances WHERE instance_id = ?", [instanceId])[0];
    if (!row || row.project_id !== projectId) throw workflowsErrors.not_found("找不到这一次");
    return fromInstanceRow(row);
  }

  startInstance(workflow: Workflow, first: WorkflowItemRef): WorkflowInstance {
    const now = new Date().toISOString();
    const chain: WorkflowChain = { stations: workflow.stations, links: workflow.links };
    const instance: WorkflowInstance = {
      instance_id: crypto.randomUUID(),
      workflow_id: workflow.workflow_id,
      project_id: workflow.project_id,
      title: normalizeTitle(first.title),
      status: "active",
      current: 0,
      chain,
      steps: startInstanceSteps(chain, first, now),
      created_at: now,
      updated_at: now,
    };
    this.db.run("INSERT INTO instances (instance_id, workflow_id, project_id, title, status, current, chain_json, steps_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [instance.instance_id, instance.workflow_id, instance.project_id, instance.title, instance.status, instance.current,
        JSON.stringify(chain), JSON.stringify(instance.steps), now, now]);
    return instance;
  }

  /**
   * Writes only when the stored instance is still the one the change was computed from. `updated_at` is that
   * comparison, so every write leaves a later one than it started from (`nextUpdatedAt`), and what comes back is what a
   * reload gives: the stop reason is read from the held step, not taken from `next.stopped`.
   */
  saveInstance(previous: WorkflowInstance, next: WorkflowInstance): WorkflowInstance {
    const updatedAt = nextUpdatedAt(previous.updated_at, next.updated_at);
    const result = this.db.run("UPDATE instances SET title = ?, status = ?, current = ?, chain_json = ?, steps_json = ?, updated_at = ? WHERE instance_id = ? AND updated_at = ?",
      [next.title, next.status, next.current, JSON.stringify(next.chain), JSON.stringify(next.steps), updatedAt, next.instance_id, previous.updated_at]);
    if (Number(result.changes) !== 1) throw workflowsErrors.conflict("这一次刚被推进过，请刷新后再看");
    const { stopped: _derived, ...saved } = next;
    const stopped = stoppedOf(next.status, next.steps);
    return { ...saved, updated_at: updatedAt, ...(stopped ? { stopped } : {}) };
  }

  stopInstance(instanceId: string, projectId: string): WorkflowInstance {
    const current = this.instance(instanceId, projectId);
    if (current.status !== "active") return current;
    const at = new Date().toISOString();
    const pending = current.steps[current.current]?.pending;
    const next = pending?.attempted_at ? holdInstance(current, current.current, { at,
      reason: "流程已停止；已派出步骤的结果尚未确认，请到目标核对，不会自动重派。" }) : { ...current, status: "stopped" as const, updated_at: at };
    return this.saveInstance(current, next);
  }
}

/** A real returned delivery can settle its original stopped attempt; cancellation never invents a receipt. */
export function recordStoppedDelivery(store: WorkflowsStore, expected: WorkflowInstance, from: number,
  arrived: WorkflowItemRef, arrival: NonNullable<Parameters<typeof advanceInstance>[5]>): WorkflowInstance | null {
  const latest = store.instance(expected.instance_id, expected.project_id);
  const pending = expected.steps[from]?.pending;
  const recorded = latest.steps[from]?.pending;
  if (latest.status !== "stopped" || latest.current !== from || !pending || recorded?.key !== pending.key
    || recorded.attempted_at !== pending.attempted_at) return null;
  const { attempted_at: _attempted, attempt_error: _error, ...handoff } = pending;
  // The arrival and the run's token are the same moment: taken past the attempt mark written in the same millisecond.
  const at = nextUpdatedAt(latest.updated_at);
  const next = advanceInstance({ ...latest, status: "active" }, from, handoff, arrived, at, arrival);
  return store.saveInstance(latest, { ...next, status: "stopped", steps: next.steps.map((step, index) => index === from
    ? { ...step, held: { at, reason: "流程已停止；这一项已经返回真实结果，内容保留，不会继续下一站。" } } : step) });
}


function chainJson(chain: WorkflowChain): string {
  return JSON.stringify({ stations: chain.stations, links: chain.links });
}

function normalizeTitle(value: string): string {
  const title = value.replace(/\s+/g, " ").trim().slice(0, 120);
  return title || "未命名流程";
}

function fromWorkflowRow(row: WorkflowRow): Workflow {
  const chain = JSON.parse(row.chain_json) as WorkflowChain;
  return {
    workflow_id: row.workflow_id,
    project_id: row.project_id,
    title: row.title,
    stations: chain.stations ?? [],
    links: chain.links ?? [],
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function fromInstanceRow(row: InstanceRow): WorkflowInstance {
  const status = (["active", "done", "stopped"].includes(row.status) ? row.status : "active") as WorkflowInstanceStatus;
  const steps = JSON.parse(row.steps_json) as WorkflowStep[];
  const stopped = stoppedOf(status, steps);
  return {
    instance_id: row.instance_id,
    workflow_id: row.workflow_id,
    project_id: row.project_id,
    title: row.title,
    status,
    current: row.current,
    chain: JSON.parse(row.chain_json) as WorkflowChain,
    steps,
    ...(stopped ? { stopped } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** This plugin's store in the Home's store registry (W4-11): `workflows/workflows.db` at its one baseline. */
export const WORKFLOWS_HOME_STORE: HomeStoreDeclaration = { path: "workflows", library: { baseline: WORKFLOWS_DATABASE } };
