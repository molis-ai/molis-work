import { childCallerTask } from "./prologue-session-opening.js";
import type { ChildOpeningFact } from "./prologue-session-index.js";
import type { Runtime, SubagentStartedObserver, ExactRef } from "@prologue/sdk";
import type { AgentFrozenSubagentRole, AgentRunRef, AgentSubagentsCapability, AgentSubagentView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { applyRunEvent, emptyPrologueStreamState } from "./prologue-stream.js";

export interface PrologueSubagentRoot {
  id: string;
  rootRef: ExactRef<"authorized-root">;
  path: string;
}
const sameRoot = (a: ExactRef<"authorized-root">, b: ExactRef<"authorized-root">) => a.id === b.id && a.revision === b.revision;

/** SDK owns parent/child identity and the event ledger. This is a read projection. */
export function createPrologueSubagents(runtime: Runtime, provenanceOf: (run: AgentRunRef) => Promise<{ path: string; roles: Array<[string, AgentFrozenSubagentRole]>; roots?: PrologueSubagentRoot[]; errors?: Record<string, string>; child_openings?: ChildOpeningFact[] }>): AgentSubagentsCapability {
  const owned = (run: AgentRunRef) => runtime.subagents.list().filter(child => child.parentSession.id === run.session_id && child.parentRun.id === run.run_id);
  return {
    async list(run) {
      const provenance = await provenanceOf(run), roles = new Map(provenance.roles);
      const result: AgentSubagentView[] = [];
      for (const child of owned(run)) {
        const session = await runtime.sessions.open(child.session);
        if (!session) throw new Error("子任务原始会话不可读取，不能当作空结果");
        const terminal = (await session.terminalRuns()).find(ref => ref.id === child.run.id);
        const events = terminal ? await session.replay(terminal) : await session.readRunProgress(child.run);
        const stream = emptyPrologueStreamState();
        for (const event of events) applyRunEvent(stream, event, null);
        const role = child.character ? roles.get(exactCharacterKey(child.character)) : undefined;
        if (!role) throw new Error("原子角色来源不可读取，不能猜测其权限与身份");
        const root = child.workspace && provenance.roots?.find(root => root.id === child.workspace!.id && sameRoot(root.rootRef, child.workspace!.rootRef));
        if (child.workspace && !root || provenance.roots?.length && !root) throw new Error("子任务原目录来源不可读取，不能显示为主工作区");
        const task = childCallerTask(provenance.child_openings ?? [], run.run_id, child.session, child.run, events);
        result.push({ continuation_task: task === undefined ? { status: "unavailable" } : { status: "available", text: task }, subagent_id: child.ref.id, parent_run: { ...run }, child_run: { session_id: child.session.id, run_id: child.run.id },
          role_id: role.role_id, role_name: role.name, task: stream.turns.filter(turn => turn.kind === "user" && !turn.steer).map(turn => turn.text).join("\n\n"),
          state: child.state, result: stream.turns.filter(turn => turn.kind === "assistant").map(turn => turn.text).join("\n\n") || null,
          workspace_path: root?.path ?? provenance.path, activity: stream.activity, usage: stream.usage, host_tools: [...role.host_tools],
          ...(provenance.errors?.[child.run.id] || stream.stop_reason ? { error: provenance.errors?.[child.run.id] ?? stream.stop_reason } : {}) });
      }
      return result;
    },
    async cancel(run, id, _actor) {
      const child = owned(run).find(child => child.ref.id === id);
      if (!child) throw new Error("子任务不属于这一轮执行");
      await runtime.subagents.cancel(child.ref);
    },
  };
}

/** Install the observer before dispatch, so unknown role references never reach a provider. */
export function verifySubagentStart(runtime: Runtime, roles: ReadonlyMap<string, AgentFrozenSubagentRole>, roots: readonly PrologueSubagentRoot[] = []): SubagentStartedObserver {
  return ({ parentSession, parentRun, childSession, run, workspace }) => {
    const child = runtime.subagents.list().find(child => child.parentSession.id === parentSession.id && child.parentRun.id === parentRun.id
      && child.session.id === childSession.ref.id && child.run.id === run.ref.id);
    const role = child?.character && roles.get(exactCharacterKey(child.character));
    // In the main workspace a child never writes files; one that runs commands (each a Host review) is allowed.
    const writesFiles = role?.host_tools.some(tool => tool === "write" || tool === "edit-file");
    if (!role || !roots.length && (role.execution === "text-edit" || writesFiles)) throw new Error("本轮没有授权这个子角色，未开始子任务模型请求");
    if (roots.length && (!workspace || !roots.some(root => root.id === workspace.id && sameRoot(root.rootRef, workspace.rootRef)))) throw new Error("本轮没有授权这个子目录，未开始子任务模型请求");
  };
}
export function exactCharacterKey(ref: ExactRef<"character">): string { return ref.id; }

/**
 * The runs above a subagent's run, nearest first, as the runtime's one register of dispatched children has them; empty for a run
 * nobody dispatched. A child is registered before its first model request (`verifySubagentStart` reads it there), so a request
 * always finds its parents. Bounded, so a malformed register cannot loop.
 */
export function runLineage(runtime: Runtime, runId: string, depth = 8): string[] {
  const lineage: string[] = [], children = runtime.subagents.list();
  for (let at = runId; lineage.length < depth;) {
    const child = children.find(one => one.run.id === at);
    if (!child) break;
    lineage.push(at = child.parentRun.id);
  }
  return lineage;
}
