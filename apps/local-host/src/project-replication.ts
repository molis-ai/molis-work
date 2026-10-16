import { replicaError } from './project-replication-errors.js';
import type { ProjectReplicaRows, SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { goalReplicationDefinition } from '@molis-ai/molis-work-module-goals';
import { governanceReplicationDefinition } from '@molis-ai/molis-work-module-governance-collaboration';
import { goalContextReplicationDefinition } from '@molis-ai/molis-work-module-context-ledger';
import { createProjectReplicaSection, createProjectReplicaJournal, createSqliteReplica, installProjectReplicaJournal, namespacedReplicaDatabase, mapReplicaSequences, readDatabaseSpace, type ReplicaDatabase } from '@molis-ai/molis-work-storage';

const definitions = () => [goalReplicationDefinition(), governanceReplicationDefinition(), goalContextReplicationDefinition()];

/** Composition root: each owner declares its own fields and validation, Storage owns the journal mechanism. */
export function installProjectGoalReplication(db: ReplicaDatabase): void {
  installProjectReplicaJournal(db, 'goals', definitions());
}

export function createProjectGoalReplica(db: ReplicaDatabase, context: { spaceId: string; projectId: string; title: string; authorize(): void }): SyncReplicaAdapter {
  const binding = readDatabaseSpace(db);
  if (binding?.spaceId !== context.spaceId || binding.kind !== 'personal') throw replicaError('replica_scope_mismatch');
  const owners = definitions(), sections = owners.map(d => createProjectReplicaSection(db, d, context.projectId));
  const journal = createProjectReplicaJournal(db, context.projectId, owners);
  const fields = [...new Set(owners.flatMap(d => d.sequenceFields))];
  const assertKey = (key: string) => {
    context.authorize();
    if (key !== JSON.stringify([context.projectId, 'project_goals', context.projectId])) throw replicaError('replica_key_invalid');
  };
  return createSqliteReplica(namespacedReplicaDatabase(db, 'goals'), {
    authorize: context.authorize,
    read(key) {
      assertKey(key);
      const history = journal.read();
      const facts = Object.fromEntries(owners.map((d, i) => [d.id, sections[i]!.read()]));
      validateProjectGoalLinks(facts);
      const value = { format: 1, spaceId: context.spaceId, project: { id: context.projectId, title: context.title },
        facts: mapReplicaSequences(facts, fields, history.encode), journal: history.value };
      size(value); return value;
    },
    apply(key, value) {
      assertKey(key); size(value);
      const wire = record(value);
      exact(wire, ['format', 'spaceId', 'project', 'facts', 'journal']);
      const project = record(wire.project); exact(project, ['id', 'title']);
      if (wire.format !== 1 || wire.spaceId !== context.spaceId || project.id !== context.projectId || typeof project.title !== 'string' || !project.title.trim() || project.title.length > 120) throw replicaError('replica_scope_mismatch');
      const facts = record(wire.facts); exact(facts, owners.map(d => d.id));
      // Validate identities before clearing old content; foreign-key deferral is scoped to this transaction.
      owners.forEach((d, i) => sections[i]!.validate(facts[d.id]));
      journal.validate(wire.journal);
      db.exec('PRAGMA defer_foreign_keys=ON');
      [...sections].reverse().forEach(s => s.clear());
      const decode = journal.apply(wire.journal);
      const restored = mapReplicaSequences(facts, fields, decode) as Record<string, ProjectReplicaRows>;
      validateProjectGoalLinks(restored);
      // A work event's sequence must point at that same stable event, not another valid journal entry.
      for (const event of restored.goals!.goal_work_events!) {
        if (event.journal_seq !== decode('@event:' + event.event_id)) throw replicaError('replica_references_invalid');
      }
      owners.forEach((d, i) => sections[i]!.write(sections[i]!.validate(restored[d.id])));
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw replicaError('replica_references_invalid');
      context.authorize();
    },
  });
}

function validateProjectGoalLinks(facts: Record<string, ProjectReplicaRows>): void {
  const goals = facts.goals!, governance = facts.governance!, context = facts.goal_context!;
  const ids = new Set(goals.goals!.map(r => r.goal_id));
  const trusted = new Map(governance.goal_event_trusted_decisions!.map(r => [r.decision_id, r]));
  for (const row of governance.goal_tree_proposals!) if (row.root_goal_id && !ids.has(row.root_goal_id)) throw replicaError('replica_references_invalid');
  for (const row of governance.goal_event_trusted_decisions!) if (!ids.has(row.goal_id)) throw replicaError('replica_decision_invalid');
  for (const row of goals.goal_event_applied_decisions!) {
    const source = trusted.get(row.governance_decision_id);
    if (!source || ['goal_id', 'actor_id', 'authority_source', 'conclusion', 'accepts_requirements', 'scope_json'].some(k => row[k] !== source[k])) throw replicaError('replica_decision_invalid');
  }
  const edges = new Map(context.context_edges!.map(r => [r.edge_key, r]));
  for (const row of goals.input_bindings!) if (row.source_edge_key) {
    const edge = edges.get(row.source_edge_key);
    if (!edge || JSON.parse(String(edge.source_json)).id !== row.goal_id) throw replicaError('replica_input_invalid');
  }
  for (const row of context.context_edges!) for (const json of [row.source_json, row.target_json]) {
    const ref = JSON.parse(String(json));
    if (ref.module === 'goals' && !ids.has(ref.id)) throw replicaError('replica_context_invalid');
  }
}
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw replicaError('replica_invalid'); return value as Record<string, unknown>; }
function exact(value: Record<string, unknown>, keys: readonly string[]): void { if (Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw replicaError('replica_invalid'); }
function size(value: unknown): void { if (Buffer.byteLength(JSON.stringify(value)) > 512 * 1024) throw replicaError('replica_limit'); }
