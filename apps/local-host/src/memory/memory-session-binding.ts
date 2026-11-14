import { isDeepStrictEqual } from "node:util";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { LOCAL_PERSON_ACTOR_ID, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentSessionWriteObservation } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemorySessionBinding, MemorySessionTarget } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "@molis-ai/molis-work-service-memory";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { MolisWorkLocalHost } from "../project-host.js";

export interface AssistantMemoryBindingProjection {
  session_id: string | null; project_ref: LocalHostProjectReference | null; archived: boolean;
}
export type AssistantMemoryBindingReader = (id: string) => AssistantMemoryBindingProjection;
type Grant = NonNullable<ActionCallContext["memory_session"]>;

/** One request's original business owner and canonical Session. Never a Session registry or a creation path. */
export async function bindMemorySession(input: {
  localHost: MolisWorkLocalHost; agentHost: AgentHost; projectRef?: LocalHostProjectReference;
  caller: ActionCallContext; kind: string; id: string; mode: "read" | "write" | "delete";
  assistantBinding?: AssistantMemoryBindingReader; acceptedPlan?(binding: MemorySessionBinding): boolean; assertBusiness(): void;
}): Promise<{ context: Grant; dispose(): void }> {
  const { caller } = input;
  if (caller.audience !== "user" || caller.actor_kind === "runtime" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID)
    throw memoryErrors.forbidden("只有本人业务入口可以管理会话记忆");
  if (!["coding", "assistant"].includes(input.kind) || !input.id.trim() || input.id.length > 200)
    throw memoryErrors.invalid("会话记忆需要明确的业务会话");
  const kind = input.kind as MemorySessionTarget["kind"], project_id = input.projectRef?.project_id ?? null;
  if (caller.project_id !== project_id) throw memoryErrors.scope("业务会话不属于当前项目");
  const target = Object.freeze({ kind, id: input.id, project_id });
  const client = input.projectRef ? input.localHost.actionClient(input.projectRef) : input.localHost.homeActionClient();
  let pinned: ActionView | undefined, observation: AgentSessionWriteObservation | undefined, closed = false;
  const assertCurrent = () => {
    input.assertBusiness(); caller.signal?.throwIfAborted();
    if (closed) throw memoryErrors.unavailable("原会话记忆调用已经结束");
    if (pinned) {
      const current = input.localHost.inspectActionMetadata(caller, input.projectRef).find(view => view.capability_id === pinned!.capability_id
        && view.version === pinned!.version && view.provider.provider_id === pinned!.provider.provider_id);
      // The original live registration must remain, including removal/re-registration with the same public names.
      if (!current || current.provider !== pinned.provider)
        throw memoryErrors.forbidden("原业务会话提供方已变化，请重新进入");
      if (!caller.assert_authority_current) throw memoryErrors.unavailable("原业务会话权限无法同步核验");
      requireSynchronous(caller.assert_authority_current({ capability_id: pinned.capability_id, version: pinned.version,
        provider_id: pinned.provider.provider_id }, pinned.action.permissions), "原业务会话权限检查必须同步完成");
    }
    observation?.assert_current();
  };
  const business = async () => {
    assertCurrent();
    if (kind === "coding") {
      if (!input.projectRef) throw memoryErrors.scope("编码会话需要原项目");
      if (!pinned) {
        const choices = (await client.discover(caller)).filter(view => view.capability_id === "coding.sessions.binding.read" && view.version === /* @version action.coding.sessions.binding.read */ 1
          && view.provider.plugin_id === "io.molis.work.coding" && view.provider.project_id === project_id && view.availability.available);
        if (choices.length !== 1 || !choices[0]!.provider.plugin_install_id) throw memoryErrors.unavailable("当前编码会话主人不可用");
        pinned = choices[0]!;
      }
      const value = await client.invoke(caller, { capability_id: pinned.capability_id, version: pinned.version, provider_id: pinned.provider.provider_id }, { session_id: input.id }) as {
        session_id: string; project_id: string; runtime: { runtime_id: string; session_id: string } | null; archived: boolean;
      };
      assertCurrent();
      if (value.session_id !== input.id || value.project_id !== project_id) throw memoryErrors.scope("业务会话绑定不属于当前项目");
      return { session: value.runtime, archived: value.archived, plugin_id: "io.molis.work.coding", install_id: pinned.provider.plugin_install_id!, owner_project: project_id! };
    }
    if (!input.assistantBinding) throw memoryErrors.unavailable("原助理会话主人不可用");
    const value = input.assistantBinding(input.id);
    if ((value.project_ref?.project_id ?? null) !== project_id) throw memoryErrors.scope("助理会话不属于当前项目");
    return { session: value.session_id ? { runtime_id: "prologue", session_id: value.session_id } : null, archived: value.archived,
      plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, owner_project: project_id ?? ASSISTANT_PERSONAL_OWNER };
  };
  const first = await business();
  if (!first.session || first.session.runtime_id !== "prologue") throw memoryErrors.unavailable("这项业务尚无可管理的原执行会话");
  const session = Object.freeze({ ...first.session }), lifecycle = input.agentHost.adapter(session.runtime_id).sessionLifecycle;
  if (!lifecycle?.observeWrites) throw memoryErrors.unavailable("当前运行时不能核验会话绑定");
  const refresh = async () => {
    assertCurrent();
    observation?.dispose(); observation = lifecycle.observeWrites!([session]);
    const fresh = await business();
    if (!isDeepStrictEqual(fresh.session, session) || fresh.plugin_id !== first.plugin_id || fresh.install_id !== first.install_id || fresh.owner_project !== first.owner_project)
      throw memoryErrors.conflict("原业务执行绑定已变化");
    let current: Awaited<ReturnType<typeof lifecycle.read>>, usingOwnerFallback = false;
    try { current = await lifecycle.read(session); }
    catch {
      const binding = { session, current_scene: kind, target };
      if (input.mode !== "delete" || !input.acceptedPlan?.(binding) || !lifecycle.readOwner)
        throw memoryErrors.conflict("原执行会话不可核验，请核对原清理操作", { cleanup: "needs-reconcile" });
      let owner: Awaited<ReturnType<NonNullable<typeof lifecycle.readOwner>>>;
      try { owner = await lifecycle.readOwner(session); }
      catch { assertCurrent(); throw memoryErrors.conflict("原执行会话主人不可核验，请核对原清理操作", { cleanup: "needs-reconcile" }); }
      assertCurrent();
      if (!owner) throw memoryErrors.conflict("原执行会话主人不可核验，请核对原清理操作", { cleanup: "needs-reconcile" });
      current = { owner } as typeof current; usingOwnerFallback = true;
    }
    const owner = current.owner;
    if (owner.actor_id !== caller.actor_id || owner.project_id !== first.owner_project || owner.plugin_id !== first.plugin_id || owner.install_id !== first.install_id)
      throw memoryErrors.forbidden("执行会话不属于当前业务主人", usingOwnerFallback ? { cleanup: "needs-reconcile" } : undefined);
    if (input.mode === "write" && (fresh.archived || current.view.state !== "active")) throw memoryErrors.conflict("已归档会话不能修改记忆，请先恢复原会话");
    assertCurrent();
  };
  const dispose = () => { closed = true; observation?.dispose(); observation = undefined; };
  try {
    await refresh();
    return { context: Object.freeze({ session, current_scene: kind, target, beforeEffect: refresh, assertCurrent }), dispose };
  } catch (error) { dispose(); throw error; }
}
