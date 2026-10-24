import { isDeepStrictEqual } from "node:util";
import type { ExactRef, Runtime } from "@prologue/sdk";
import type { AgentRunRef, AgentSessionDecision, AgentSessionLifecycle, AgentSessionOwner, AgentSessionPurgePreview, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import type { PrologueEffects } from "./prologue-effects.js";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";

export interface ProjectSessionDeletionPlan {
  project_id: string;
  operation_id: string;
  sessions: Array<{ session: AgentSessionRef; owner: AgentSessionOwner; decision: AgentSessionDecision;
    preview: AgentSessionPurgePreview; state: "active" | "archived" | "purged"; indexed: boolean; parent_run?: AgentRunRef }>;
}

/** Internal Catalog owner port. A retry accepts only its persisted plan, never HTTP/Action input. */
export interface PrologueProjectDeletion {
  withHold<T>(input: { project_id: string; associated_sessions: readonly { session: AgentSessionRef; owner: AgentSessionOwner }[] },
    work: (held: { preview(operation_id: string): Promise<ProjectSessionDeletionPlan>; purge(plan: ProjectSessionDeletionPlan): Promise<void> }) => Promise<T>): Promise<T>;
}

interface Deps {
  runtime: Runtime;
  index: SessionIndexStore;
  lifecycle: AgentSessionLifecycle;
  effects: PrologueEffects;
}
const denied = () => agentErrors.session_busy("项目清理集合或原决定不可确认，请保留原收据处理");
const exact = (session: AgentSessionRef): ExactRef<"session"> => ({ kind: "session", id: session.session_id, revision: 1 });
const view = (id: string): AgentSessionRef => ({ runtime_id: "prologue", session_id: id });
const sameOwner = (a: AgentSessionOwner, b: AgentSessionOwner) => ["project_id", "plugin_id", "install_id", "actor_id"].every(key => a[key as keyof AgentSessionOwner] === b[key as keyof AgentSessionOwner]);

/** Own index roots and SDK public graph relations are the only collection facts. No synthetic child index is written. */
export function createProjectDeletion(deps: Deps): PrologueProjectDeletion {
  const relationMap = () => {
    const relations = new Map<string, AgentRunRef[]>();
    const add = (child: ExactRef<"session">, parent: ExactRef<"session">, run: ExactRef<"run">) => {
      if (child.kind !== "session" || child.revision !== 1 || parent.kind !== "session" || parent.revision !== 1 || run.kind !== "run" || run.revision !== 1) throw denied();
      if (child.id === parent.id) return; // A board's root attempt is not a child relationship.
      const value = { session_id: parent.id, run_id: run.id };
      const rows = relations.get(child.id) ?? [];
      if (!rows.some(row => isDeepStrictEqual(row, value))) rows.push(value);
      relations.set(child.id, rows);
    };
    for (const child of deps.runtime.subagents.list()) add(child.session, child.parentSession, child.parentRun);
    for (const ref of deps.runtime.boards.refs()) for (const node of deps.runtime.boards.get(ref).nodes) {
      for (const attempt of node.attempts) if (attempt.origin) add(attempt.session, attempt.origin.session, attempt.origin.run);
    }
    return relations;
  };
  const quietChild = async (session: AgentSessionRef) => {
    const target = await deps.runtime.sessions.open(exact(session));
    if (!target) throw agentErrors.session_unknown("子会话不可读取，缺失不能证明清理完成");
    const recovery = target.state === "active" ? await deps.runtime.sessions.inspectRecovery(target.ref) : undefined;
    const open = await deps.runtime.listOpenWork();
    if (recovery?.runs.length || open.unavailable.length || open.items.some(item => item.origin.session === session.session_id)
      || deps.runtime.background.list({ session: session.session_id }).some(task => task.state === "running" || task.state === "interrupted")) throw denied();
    return target;
  };
  return {
    async withHold(input, work) {
      const scope = structuredClone(input);
      if (!scope.project_id || scope.associated_sessions.some(item => item.session.runtime_id !== "prologue")) throw denied();
      return deps.index.holdProject(scope.project_id, scope.associated_sessions.map(item => item.session.session_id), async hold => {
        let active = true;
        const assertHeld = () => { if (!active) throw denied(); };
        const current = () => { assertHeld(); deps.effects.assertCurrent(); };
        const associated = new Map(scope.associated_sessions.map(item => [item.session.session_id, item.owner]));
        const checkRoot = (saved: SessionIndex) => {
          if (saved.owner.project_id !== scope.project_id && !(associated.has(saved.ref.id) && sameOwner(saved.owner, associated.get(saved.ref.id)!))) throw denied();
          if (!saved.owner.actor_id) throw denied();
        };
        try {
          return await work({
            async preview(operation_id) {
              current();
              if (!operation_id.trim() || operation_id.length > 180) throw denied();
              const all = await deps.index.enumerate(); current();
              const indexed = new Map(all.map(saved => [saved.ref.id, saved]));
              for (const [id, owner] of associated) {
                const saved = indexed.get(id);
                if (!saved || !sameOwner(saved.owner, owner)) throw denied();
              }
              const roots = all.filter(saved => saved.owner.project_id === scope.project_id || associated.has(saved.ref.id));
              const included = new Map(roots.map(saved => [saved.ref.id, { owner: saved.owner, parent: saved.parent_run }]));
              const relations = relationMap();
              let changed = true;
              while (changed) {
                changed = false;
                for (const [id, parents] of relations) {
                  if (!parents.some(parent => included.has(parent.session_id))) continue;
                  if (parents.length !== 1) throw denied();
                  const parent = parents[0]!, parentOwner = included.get(parent.session_id)!.owner;
                  const existing = included.get(id), saved = indexed.get(id);
                  if (saved && !sameOwner(saved.owner, parentOwner) || existing && !sameOwner(existing.owner, parentOwner)
                    || existing?.parent && !isDeepStrictEqual(existing.parent, parent)) throw denied();
                  if (!existing) { included.set(id, { owner: parentOwner, parent }); changed = true; }
                  else existing.parent = parent;
                }
              }
              // Topological order is stored once; retries never rebuild this graph or refresh a preview.
              const ordered: string[] = [], visiting = new Set<string>();
              const visit = (id: string) => {
                if (ordered.includes(id)) return;
                if (visiting.has(id)) throw denied();
                visiting.add(id);
                const parent = included.get(id)!.parent;
                if (parent) { if (!included.has(parent.session_id)) throw denied(); visit(parent.session_id); }
                visiting.delete(id); ordered.push(id);
              };
              for (const root of roots) visit(root.ref.id);
              for (const id of included.keys()) visit(id);
              hold.include(ordered);
              const sessions: ProjectSessionDeletionPlan["sessions"] = [];
              for (const id of ordered) {
                const item = included.get(id)!, saved = indexed.get(id), session = view(id);
                if (!item.parent) { if (!saved) throw denied(); checkRoot(saved); }
                if (item.parent) {
                  const parent = await deps.runtime.sessions.open(exact(view(item.parent.session_id)));
                  if (!parent || !(await parent.terminalRuns()).some(run => run.id === item.parent!.run_id)) throw denied();
                }
                deps.index.assertIdle(id);
                let preview: AgentSessionPurgePreview, original: AgentSessionDecision | undefined, state: "active" | "archived" | "purged" | undefined;
                if (saved?.lifecycle?.action === "purge") {
                  const prior = await deps.lifecycle.read(session, item.owner);
                  if (!prior.operation?.preview) throw denied();
                  if (prior.state === "unknown") throw denied();
                  preview = prior.operation.preview; original = prior.operation.decision; state = prior.state;
                } else if (saved) preview = await deps.lifecycle.previewPurge(session, item.owner);
                else {
                  const target = await quietChild(session), sdk = await target.previewPurge();
                  if (target.state !== "active" && target.state !== "archived") throw denied();
                  preview = { session, version: sdk.atVersion, state: target.state, runs: sdk.runs, resources: sdk.resources, destroys_key: sdk.destroysKey };
                }
                current();
                sessions.push({ session, owner: structuredClone(item.owner), indexed: !!saved, state: state ?? preview.state,
                  ...(item.parent ? { parent_run: structuredClone(item.parent) } : {}), preview,
                  decision: original ?? { operation_id: `${operation_id}:${sessions.length}`, expected_version: preview.version, expected_state: preview.state } });
              }
              current(); return { project_id: scope.project_id, operation_id, sessions };
            },
            purge: submitted => deps.effects.admit(assertHeld, async () => {
              const plan = structuredClone(submitted); current();
              if (plan.project_id !== scope.project_id || !plan.operation_id.trim() || plan.operation_id.length > 180) throw denied();
              const seen = new Map<string, AgentSessionOwner>();
              // Validate the whole persisted set before the first irreversible SDK operation.
              for (const item of plan.sessions) {
                const id = item.session.session_id, parent = item.parent_run && seen.get(item.parent_run.session_id);
                if (!["active", "archived", "purged"].includes(item.state) || seen.has(id) || item.session.runtime_id !== "prologue" || !sameOwner(item.owner, parent ?? item.owner)
                  || item.parent_run && !parent || !isDeepStrictEqual(item.preview.session, item.session)
                  || !item.decision.operation_id.trim() || item.decision.operation_id.length > 200 || item.decision.expected_version !== item.preview.version
                  || item.decision.expected_state !== item.preview.state) throw denied();
                const saved = await deps.index.inspect(id); current(); deps.index.assertIdle(id);
                if (item.indexed ? !saved || !sameOwner(saved.owner, item.owner) : !!saved || !parent) throw denied();
                if (!item.parent_run) { if (!saved) throw denied(); checkRoot(saved); }
                seen.set(id, item.owner);
              }
              hold.include([...seen.keys()]);
              for (const item of plan.sessions) {
                await deps.effects.beforeEffect(); current();
                if (item.indexed) await hold.purge(item.session.session_id, item.decision.operation_id,
                  () => deps.lifecycle.purge(item.session, item.decision, item.preview, item.owner));
                else await deps.runtime.sessions.purge({ sessionRef: exact(item.session), atVersion: item.preview.version,
                  runs: item.preview.runs, resources: item.preview.resources, destroysKey: item.preview.destroys_key });
                current();
              }
            }),
          });
        } finally { active = false; }
      });
    },
  };
}
