import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentActionReviewControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantServicePorts } from "./assistant-service-shared.js";
import { RUNTIME, sessionRef } from "./assistant-service-shared.js";
import type { AssistantWorkReads } from "./assistant-work-reads.js";
import type { AssistantFollowUps } from "./assistant-followups.js";
import { assistantErrors } from "./assistant-errors.js";
import { assertAssistantSessionSettled, assistantEndControl, assistantWorkEnding, beginAssistantWorkEnds } from "./assistant-work-permissions.js";

/** Assistant owns the business decision; only its own SDK Session follows that decision. */
export async function changeAssistantSessionLifecycle(store: AssistantStore, ports: AssistantServicePorts, actorId: string,
  reads: AssistantWorkReads, followUps: AssistantFollowUps<StoredWork>, starting: ReadonlyMap<string, string>, work: StoredWork,
  group: readonly StoredWork[], archived: boolean, caller?: AgentActionReviewControl): Promise<StoredWork> {
  let expected = work;
  const workId = work.work_id;
  const host = group.some(member => member.session_id || member.executor.kind === "plugin" && member.executor.session_id)
    ? await ports.host() : await ports.hostForDraftPermissions?.();
  const adapter = expected.session_id ? host!.adapter(RUNTIME) : undefined, lifecycle = adapter?.sessionLifecycle;
  const current = () => {
    caller?.assertCurrent();
    const now = store.get(actorId, workId);
    if (starting.has(workId) || now.revision !== expected.revision || now.session_id !== expected.session_id) throw assistantErrors.conflict("这项工作或执行会话已改变，请重新查看");
  };
  const beforeEffect = async () => { await caller?.beforeEffect(); current(); };
  const control = { beforeEffect, assertCurrent: current };
  current();
  const states = archived && host ? await Promise.all(group.map(member => reads.stateFor(host, member, true))) : [];
  // A running round is stopped first; one paused or waiting on the person or a check is dealt with first.
  if (states.includes("running")) throw assistantErrors.state("这项工作还有一轮在进行，先停止它再归档");
  if (states.some(state => ["paused", "waiting-input", "waiting-review", "needs-check"].includes(state))) throw assistantErrors.state("这项工作还有一轮暂停着或在等处理，先处理它再归档");
  let sessionArchived = false;
  if (adapter) {
    if (!lifecycle || !adapter.withEffect) throw assistantErrors.unsupported("运行时未接通会话归档与恢复，业务状态未改变");
    const found = await lifecycle.read(sessionRef(expected));
    if (found.owner.actor_id !== actorId || found.owner.plugin_id !== ASSISTANT_PLUGIN_ID || found.owner.install_id !== ASSISTANT_INSTALL_ID
      || found.owner.project_id !== (expected.project_ref?.project_id ?? ASSISTANT_PERSONAL_OWNER)) throw assistantErrors.scope("原执行会话不属于这项助理工作");
    sessionArchived = found.view.state === "archived";
    const view = await adapter.readSession(sessionRef(expected));
    if (view.checkpoint_busy || view.recovery || view.latest_run && !isTerminalAgentPhase(view.latest_run.phase)) throw assistantErrors.state("原执行会话仍在进行或待核对");
  }
  current();
  if (!archived && store.permissionTransitions.isArchiving(workId) && !sessionArchived) throw assistantErrors.state("原工作仍在归档，请稍后重试");
  try {
    const finish = archived && host ? await beginAssistantWorkEnds(host, store, group, "archived", control) : undefined;
    if (archived && host) for (const member of group) {
      if (followUps.list(member.work_id).some(item => item.enabled)) await followUps.stopForArchive(member.work_id,
        { adapter: host.adapter(RUNTIME), control: assistantEndControl(store, member, control) });
      assertAssistantSessionSettled(host, member);
    }
    if (archived && lifecycle) await adapter!.withEffect!({ beforeEffect, assert_current: current }, () => lifecycle.archive(sessionRef(expected)));
    // A restore can arrive after SDK archive commits but before its acknowledgement. Close only the observed archive epoch.
    if (!archived && host) {
      const endings = (await Promise.all(group.map(async member => {
        const owner = assistantWorkEnding(host, member);
        if (!owner) return undefined;
        const state = await owner.read();
        return state?.lifecycle === "ending" ? { owner, state, member } : undefined;
      }))).filter(row => row !== undefined);
      if (endings.length && (!sessionArchived || endings.some(row => row.state.ended_reason !== "archived")
        || group.some(member => followUps.list(member.work_id).some(item => item.enabled)))) {
        throw assistantErrors.state("原工作仍待收口，请重试原操作");
      }
      for (const pending of endings) {
        assertAssistantSessionSettled(host, pending.member);
        await pending.owner.finish(pending.state.epoch, assistantEndControl(store, pending.member, control));
      }
    }
    await beforeEffect();
    expected = store.update(actorId, workId, expected.revision, { archived });
    if (!archived && lifecycle) await adapter!.withEffect!({ beforeEffect, assert_current: current }, () => lifecycle.unarchive(sessionRef(expected)));
    await finish?.();
    current(); return expected;
  } catch (error) {
    const business = store.get(actorId, workId).archived;
    const execution = lifecycle ? await lifecycle.read(sessionRef(expected)).catch(() => null) : null;
    if (adapter && (execution === null || business !== (execution.view.state === "archived"))) {
      const state = { business: business ? "archived" : "active", execution: execution?.view.state ?? null };
      throw new ActionError("assistant.needs_check", archived ? "归档还没完成，请重试。" : "这项工作已重新显示，但恢复还没完成。请再点一次恢复。", { kind: "conflict", details: { lifecycle: state }, cause: error });
    }
    throw error;
  }
}


/** Reopening reports the two current facts; it never guesses the lost request or changes either writer. */
export async function assistantSessionLifecycleProblem(ports: AssistantServicePorts, work: StoredWork): Promise<{ message: string } | undefined> {
  if (!work.session_id) return undefined;
  try {
    const adapter = (await ports.host()).adapter(RUNTIME);
    if (!adapter.sessionLifecycle) return { message: "暂时无法确认会话状态，请稍后重试。" };
    const result = await adapter.sessionLifecycle.read(sessionRef(work)), owner = result.owner;
    if (owner.actor_id !== work.actor_id || owner.plugin_id !== ASSISTANT_PLUGIN_ID || owner.install_id !== ASSISTANT_INSTALL_ID
      || owner.project_id !== (work.project_ref?.project_id ?? ASSISTANT_PERSONAL_OWNER)) return { message: "原执行会话归属无法核实，不能继续任务。" };
    if (work.archived !== (result.view.state === "archived")) return { message: work.archived ? "归档还没完成，请重试。" : "这项工作已重新显示，但恢复还没完成。请再点一次恢复。" };
  } catch { return { message: "暂时无法确认会话状态，请稍后重试。" }; }
  return undefined;
}
