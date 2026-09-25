import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { DatabaseSync } from "node:sqlite";
import {
  WorkflowError,
  type Workflow,
  type WorkflowChain,
  type WorkflowInstance,
  type WorkflowInstanceStatus,
  type WorkflowItemRef,
  type WorkflowStep,
  startInstanceSteps,
} from "./model.js";

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

export class WorkflowsStore {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  list(projectId: string): WorkflowSummary[] {
    const rows = this.db.prepare(
      "SELECT * FROM workflows WHERE project_id = ? AND deleted = 0 ORDER BY updated_at DESC, rowid DESC",
    ).all(projectId) as unknown as WorkflowRow[];
    const counts = this.db.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, MAX(updated_at) AS last FROM instances WHERE workflow_id = ?",
    );
    return rows.map((row) => {
      const count = counts.get(row.workflow_id) as { total: number; active: number | null; last: string | null };
      return { ...fromWorkflowRow(row), instance_count: count.total, active_count: count.active ?? 0, last_activity_at: count.last };
    });
  }

  get(workflowId: string, projectId: string): Workflow {
    const row = this.db.prepare("SELECT * FROM workflows WHERE workflow_id = ? AND deleted = 0").get(workflowId) as unknown as WorkflowRow | undefined;
    if (!row || row.project_id !== projectId) throw new WorkflowError("workflows.not_found", "找不到这条流程");
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
    this.db.prepare(
      "INSERT INTO workflows (workflow_id, project_id, title, chain_json, revision, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
    ).run(workflow.workflow_id, workflow.project_id, workflow.title, chainJson(workflow), workflow.revision, now, now);
    return workflow;
  }

  /** Every edit is saved at once; `revision` stops two windows from overwriting each other silently. */
  update(workflowId: string, projectId: string, patch: { title?: string; chain?: WorkflowChain; revision: number }): Workflow {
    const current = this.get(workflowId, projectId);
    if (patch.revision !== current.revision) throw new WorkflowError("workflows.conflict", "这条流程在别处改过了，已载入最新的样子");
    const next: Workflow = {
      ...current,
      title: patch.title === undefined ? current.title : normalizeTitle(patch.title),
      stations: patch.chain?.stations ?? current.stations,
      links: patch.chain?.links ?? current.links,
      revision: current.revision + 1,
      updated_at: new Date().toISOString(),
    };
    this.db.prepare("UPDATE workflows SET title = ?, chain_json = ?, revision = ?, updated_at = ? WHERE workflow_id = ?")
      .run(next.title, chainJson(next), next.revision, next.updated_at, workflowId);
    return next;
  }

  /** Hidden from the list; its instances keep their history. */
  delete(workflowId: string, projectId: string): void {
    this.get(workflowId, projectId);
    this.db.prepare("UPDATE workflows SET deleted = 1, updated_at = ? WHERE workflow_id = ?").run(new Date().toISOString(), workflowId);
  }

  instances(workflowId: string, projectId: string): WorkflowInstance[] {
    this.get(workflowId, projectId);
    const rows = this.db.prepare(
      "SELECT * FROM instances WHERE workflow_id = ? ORDER BY created_at DESC, rowid DESC",
    ).all(workflowId) as unknown as InstanceRow[];
    return rows.map(fromInstanceRow);
  }

  instance(instanceId: string, projectId: string): WorkflowInstance {
    const row = this.db.prepare("SELECT * FROM instances WHERE instance_id = ?").get(instanceId) as unknown as InstanceRow | undefined;
    if (!row || row.project_id !== projectId) throw new WorkflowError("workflows.not_found", "找不到这一次");
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
    this.db.prepare(
      "INSERT INTO instances (instance_id, workflow_id, project_id, title, status, current, chain_json, steps_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(instance.instance_id, instance.workflow_id, instance.project_id, instance.title, instance.status, instance.current,
      JSON.stringify(chain), JSON.stringify(instance.steps), now, now);
    return instance;
  }

  /** Writes only when the stored instance is still the one the change was computed from. */
  saveInstance(previous: WorkflowInstance, next: WorkflowInstance): WorkflowInstance {
    const result = this.db.prepare(
      "UPDATE instances SET title = ?, status = ?, current = ?, chain_json = ?, steps_json = ?, updated_at = ? WHERE instance_id = ? AND updated_at = ?",
    ).run(next.title, next.status, next.current, JSON.stringify(next.chain), JSON.stringify(next.steps), next.updated_at, next.instance_id, previous.updated_at);
    if (Number(result.changes) !== 1) throw new WorkflowError("workflows.conflict", "这一次刚被推进过，请刷新后再看");
    return next;
  }

  stopInstance(instanceId: string, projectId: string): WorkflowInstance {
    const current = this.instance(instanceId, projectId);
    if (current.status !== "active") return current;
    return this.saveInstance(current, { ...current, status: "stopped", updated_at: new Date().toISOString() });
  }
}

export function openWorkflowsStore(homeDirectory: string): WorkflowsStore {
  const db = openHomeSqliteDatabase(homeDirectory, "workflows");
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS workflows (
      workflow_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      chain_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS workflows_project ON workflows (project_id, deleted, updated_at);
    CREATE TABLE IF NOT EXISTS instances (
      instance_id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      current INTEGER NOT NULL,
      chain_json TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS instances_workflow ON instances (workflow_id, created_at);
  `);
  return new WorkflowsStore(db);
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
  return {
    instance_id: row.instance_id,
    workflow_id: row.workflow_id,
    project_id: row.project_id,
    title: row.title,
    status: (["active", "done", "stopped"].includes(row.status) ? row.status : "active") as WorkflowInstanceStatus,
    current: row.current,
    chain: JSON.parse(row.chain_json) as WorkflowChain,
    steps: JSON.parse(row.steps_json) as WorkflowStep[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
