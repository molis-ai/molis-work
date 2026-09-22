import type { Runtime, SubagentStartedObserver, ExactRef } from "@prologue/sdk";
import type { AgentFrozenSubagentRole, AgentRunRef, AgentSubagentsCapability, AgentSubagentView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { applyPrologueEvent, emptyPrologueStreamState } from "./prologue-stream.js";

/** SDK owns parent/child identity and the event ledger. This is a read projection. */
export function createPrologueSubagents(runtime: Runtime, provenanceOf: (run: AgentRunRef) => Promise<{ path: string; roles: Array<[string, AgentFrozenSubagentRole]> }>): AgentSubagentsCapability {
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
        for (const event of events) applyPrologueEvent(stream, event, null);
        const role = child.character ? roles.get(exactCharacterKey(child.character)) : undefined;
        if (!role) throw new Error("原子角色来源不可读取，不能猜测其权限与身份");
        result.push({ subagent_id: child.ref.id, parent_run: { ...run }, child_run: { session_id: child.session.id, run_id: child.run.id },
          role_id: role.role_id, role_name: role.name, task: stream.turns.filter(turn => turn.kind === "user" && !turn.steer).map(turn => turn.text).join("\n\n"),
          state: child.state, result: stream.turns.filter(turn => turn.kind === "assistant").map(turn => turn.text).join("\n\n") || null,
          workspace_path: provenance.path, activity: stream.activity, usage: stream.usage, host_tools: [...role.host_tools],
          ...(stream.stop_reason ? { error: stream.stop_reason } : {}) });
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
export function verifySubagentStart(runtime: Runtime, roles: ReadonlyMap<string, AgentFrozenSubagentRole>): SubagentStartedObserver {
  return ({ parentSession, parentRun, childSession, run }) => {
    const child = runtime.subagents.list().find(child => child.parentSession.id === parentSession.id && child.parentRun.id === parentRun.id
      && child.session.id === childSession.ref.id && child.run.id === run.ref.id);
    const role = child?.character && roles.get(exactCharacterKey(child.character));
    if (!role || role.execution !== "read-only") throw new Error("本轮没有授权这个子角色，未开始子任务模型请求");
  };
}
export function exactCharacterKey(ref: ExactRef<"character">): string { return ref.id; }
