import { createHash, randomUUID } from 'node:crypto';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import type { ProjectsSqliteDatabase } from './repository.js';

const errors = defineErrorCodes('catalog', { recycle_invalid: 'invalid', recycle_changed: 'conflict', recycle_missing: 'not_found' });
export interface ProjectRecycleInput {
  project_id: string;
  actor_id: string;
  operation_id: string;
  expected_state: string;
  recycled: boolean;
  confirmed: boolean;
}
export interface ProjectRecycleObservation {
  project_id: string;
  display_name: string;
  database_path: string;
  recycled: boolean;
  generation: number;
  state: string;
}

/** Projects retains its original facts. Local observation time never authorizes 30-day expiry. */
export function createProjectRecycleSchema(db: ProjectsSqliteDatabase): void {
  db.exec(`CREATE TABLE project_recycle (
    project_id TEXT PRIMARY KEY,
    recycled INTEGER NOT NULL CHECK(recycled IN (0,1)), generation INTEGER NOT NULL,
    observed_at TEXT NOT NULL
  );
  CREATE TABLE project_recycle_receipts (
    actor_id TEXT NOT NULL, operation_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL, PRIMARY KEY(actor_id,operation_id)
  );`);
}

/** Lifecycle commands run inside the catalog transaction after the Host has released execution. */
export class ProjectRecycle {
  constructor(private readonly db: ProjectsSqliteDatabase, private readonly now: () => string) {}

  inspect(projectId: string): ProjectRecycleObservation {
    const project = this.db.prepare('SELECT * FROM projects WHERE project_id=?').get(projectId) as Record<string, unknown> | undefined;
    if (!project || project.data_class !== 'user') throw errors.recycle_missing('找不到可回收的项目');
    const lifecycle = this.db.prepare('SELECT recycled,generation FROM project_recycle WHERE project_id=?').get(projectId) as { recycled: number; generation: number } | undefined;
    const facts = [project, lifecycle ?? null,
      this.db.prepare('SELECT * FROM project_plugins WHERE project_id=? ORDER BY plugin_id').all(projectId),
      this.db.prepare('SELECT * FROM project_portable_plugins WHERE project_id=? ORDER BY plugin_id').all(projectId),
      this.db.prepare('SELECT * FROM project_plugin_exclusions WHERE project_id=? ORDER BY plugin_id').all(projectId),
      this.db.prepare('SELECT * FROM workspace_project_memberships WHERE project_id=? ORDER BY membership_id').all(projectId)];
    return { project_id: projectId, display_name: String(project.display_name), database_path: String(project.database_path),
      recycled: lifecycle?.recycled === 1, generation: lifecycle?.generation ?? 0,
      state: createHash('sha256').update(JSON.stringify(facts)).digest('hex') };
  }

  isRecycled(projectId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM project_recycle WHERE project_id=? AND recycled=1').get(projectId);
  }

  list(): ProjectRecycleObservation[] {
    return (this.db.prepare('SELECT project_id FROM project_recycle WHERE recycled=1 AND EXISTS(SELECT 1 FROM projects WHERE projects.project_id=project_recycle.project_id) ORDER BY project_id').all() as { project_id: string }[])
      .map(row => this.inspect(row.project_id));
  }

  /** Checked even before asynchronous runtime release; a retry returns its original receipt without reapplying it. */
  check(input: ProjectRecycleInput): ProjectRecycleObservation | null {
    if (input.confirmed !== true || typeof input.recycled !== 'boolean'
      || ![input.project_id, input.actor_id, input.operation_id].every(value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200)
      || typeof input.expected_state !== 'string' || !/^[a-f0-9]{64}$/.test(input.expected_state)) {
      throw errors.recycle_invalid('请确认所查看的项目版本和回收操作');
    }
    const receipt = this.db.prepare('SELECT fingerprint,result_json FROM project_recycle_receipts WHERE actor_id=? AND operation_id=?')
      .get(input.actor_id, input.operation_id) as { fingerprint: string; result_json: string } | undefined;
    if (receipt) {
      if (receipt.fingerprint !== this.fingerprint(input)) throw errors.recycle_changed('此操作标识已用于另一次项目操作');
      return JSON.parse(receipt.result_json) as ProjectRecycleObservation;
    }
    const current = this.inspect(input.project_id);
    if (current.state !== input.expected_state || current.recycled === input.recycled) throw errors.recycle_changed('项目已变化，请重新查看后确认');
    return null;
  }

  change(input: ProjectRecycleInput, beforeEffect: () => void): ProjectRecycleObservation {
    input = { ...input };
    return this.db.transaction(() => {
      beforeEffect();
      const replay = this.check(input);
      if (replay) return replay;
      const current = this.inspect(input.project_id), at = this.now();
      this.db.prepare(`INSERT INTO project_recycle VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET
        recycled=excluded.recycled,generation=excluded.generation,observed_at=excluded.observed_at`)
        .run(input.project_id, input.recycled ? 1 : 0, current.generation + 1, at);
      this.db.prepare('INSERT INTO project_events(event_id,project_id,type,actor_id,payload_json,created_at) VALUES(?,?,?,?,?,?)')
        .run(`event-${randomUUID()}`, input.project_id, input.recycled ? 'project.recycled' : 'project.restored', input.actor_id, '{}', at);
      const result = this.inspect(input.project_id);
      this.db.prepare('INSERT INTO project_recycle_receipts VALUES(?,?,?,?)')
        .run(input.actor_id, input.operation_id, this.fingerprint(input), JSON.stringify(result));
      beforeEffect();
      return result;
    })();
  }

  private fingerprint(input: ProjectRecycleInput): string {
    return JSON.stringify([input.project_id, input.expected_state, input.recycled]);
  }
}
