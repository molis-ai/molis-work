import { randomUUID } from "node:crypto";
import type { AgentHost, AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentCreateSessionInput, AgentMemoryExecutionControl, AgentSessionDecision, AgentSessionOwner, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID, type AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { ownerOf } from "./assistant-round-start.js";
import { assistantErrors } from "./assistant-errors.js";

/** The caller retains this exact request if the SDK commits before the Work does. No second lifecycle ledger. */
export interface AssistantArchiveRequest {
  revision: number;
  session_id: string | null;
  archived: boolean;
  decision?: AgentSessionDecision;
}
interface LifecyclePorts {
  store: AssistantStore;
  actorId: string;
  host(): Promise<AgentHost>;
  state(host: AgentHost, work: StoredWork): Promise<AssistantWorkState>;
  blockStart(id: string): () => void;
  stopFollowUps(id: string, control: AgentMemoryExecutionControl): Promise<void>;
}
const conflict = () => assistantErrors.conflict("工作或原归档决定已变化，请核对当前状态后操作");
const ref = (work: StoredWork): AgentSessionRef => ({ runtime_id: "prologue", session_id: work.session_id! });
const owner = (work: StoredWork): AgentSessionOwner => ({ project_id: ownerOf(work), plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: work.actor_id });
const action = (archived: boolean) => archived ? "archive" as const : "unarchive" as const;

/** Assistant owns the Work commit; AgentHost owns the original SDK decision and its recovery. */
export class AssistantWorkLifecycle {
  private readonly changing = new Set<string>();
  private readonly starting = new Map<string, number>();
  constructor(private readonly ports: LifecyclePorts) {}

  assertStart(work: StoredWork): void {
    const now = this.ports.store.get(this.ports.actorId, work.work_id);
    if (this.changing.has(work.work_id)) throw assistantErrors.busy("这项工作正在归档或恢复，请等待本次结果");
    if (now.archived || now.session_id !== work.session_id || ownerOf(now) !== ownerOf(work)) throw conflict();
  }

  private holdStart(work: StoredWork): () => void {
    this.assertStart(work);
    const id = work.work_id;
    this.starting.set(id, (this.starting.get(id) ?? 0) + 1);
    return () => { const count = this.starting.get(id)! - 1; if (count) this.starting.set(id, count); else this.starting.delete(id); };
  }

  /** Creation and its Work binding share one admission interval; later preparation retains its own guards. */
  async bindSession(host: AgentHost, work: StoredWork, input: AgentCreateSessionInput, authority: AgentStartAuthority, assertCurrent: () => void): Promise<StoredWork> {
    const release = this.holdStart(work);
    try {
      const session = await host.createSession("prologue", { ...input, ...owner(work) }, authority);
      assertCurrent(); this.assertStart(work);
      return this.ports.store.update(this.ports.actorId, work.work_id, null, { session_id: session.session_id });
    } finally { release(); }
  }

  async preview(workId: string, archived: boolean, operationId?: string): Promise<AssistantArchiveRequest> {
    if (typeof archived !== "boolean") throw assistantErrors.invalid("需要明确选择归档或恢复");
    const { store, actorId } = this.ports, work = store.get(actorId, workId);
    if (this.changing.has(workId)) throw assistantErrors.busy("这项工作正在归档或恢复");
    const request: AssistantArchiveRequest = { revision: work.revision, session_id: work.session_id, archived };
    if (!work.session_id) {
      if (work.archived === archived) throw conflict();
      return request;
    }
    const adapter = (await this.ports.host()).adapter("prologue");
    if (!adapter.sessionLifecycle || !adapter.withEffect) throw assistantErrors.unsupported("当前运行时不能管理会话归档");
    const view = await adapter.sessionLifecycle.read(ref(work), owner(work));
    if (store.get(actorId, workId).revision !== work.revision) throw conflict();
    const held = view.operation;
    if (held?.action === action(archived) && (!held.completed || work.archived !== archived)
      && (!operationId || held.decision.operation_id === operationId)) request.decision = structuredClone(held.decision);
    else {
      if (held && !held.completed || view.state !== (archived ? "active" : "archived") || view.version === null || work.archived === archived) throw conflict();
      request.decision = { operation_id: operationId ?? randomUUID(), expected_version: view.version, expected_state: view.state };
    }
    return request;
  }

  async change(workId: string, input: AssistantArchiveRequest, caller: AgentMemoryExecutionControl): Promise<StoredWork> {
    const request = structuredClone(input), { store, actorId } = this.ports;
    if (!Number.isSafeInteger(request.revision) || request.revision < 1 || typeof request.archived !== "boolean"
      || request.session_id !== null && typeof request.session_id !== "string"
      || Boolean(request.session_id) !== Boolean(request.decision)) throw assistantErrors.invalid("请提交完整的原归档预览");
    const original = store.get(actorId, workId), group = request.archived ? [original, ...store.delegatedBy(actorId, original, "any")] : [original];
    if (group.some(work => this.changing.has(work.work_id) || this.starting.has(work.work_id))) throw assistantErrors.busy("这项工作正在归档或恢复");
    const repeated = original.revision === request.revision + 1 && original.archived === request.archived && Boolean(request.decision);
    if (original.session_id !== request.session_id || original.revision !== request.revision && !repeated) throw conflict();
    const assertCurrent = () => {
      caller.assert_current();
      const now = store.get(actorId, workId);
      if (now.revision !== original.revision || now.session_id !== original.session_id || ownerOf(now) !== ownerOf(original)) throw conflict();
    };
    const control: AgentMemoryExecutionControl = { beforeEffect: async () => { await caller.beforeEffect(); assertCurrent(); }, assert_current: assertCurrent };
    const releases = group.map(work => { this.changing.add(work.work_id); return this.ports.blockStart(work.work_id); });
    try {
      await control.beforeEffect();
      const host = await this.ports.host(), adapter = host.adapter("prologue");
      if (original.session_id && (!adapter.sessionLifecycle || !adapter.withEffect)) throw assistantErrors.unsupported("当前运行时不能管理会话归档");
      const view = original.session_id ? await adapter.sessionLifecycle!.read(ref(original), owner(original)) : undefined;
      const resuming = view?.operation?.action === action(request.archived) && view.operation.decision.operation_id === request.decision?.operation_id;
      const inspect = group.filter(work => work.work_id !== workId || !resuming || work.executor.kind === "plugin");
      if (request.archived && (await Promise.all(inspect.map(work => this.ports.state(host, work))))
        .some(state => ["running", "paused", "waiting-input", "waiting-review", "needs-check"].includes(state))) throw assistantErrors.state("这项工作还有一轮在进行或待核对，先停止或处理它再归档");
      await control.beforeEffect();
      if (original.session_id) {
        await adapter.withEffect!(control, () => adapter.sessionLifecycle![action(request.archived)](ref(original), request.decision!, owner(original)));
      } else if (original.archived === request.archived) throw conflict();
      await control.beforeEffect();
      if (repeated) return original;
      if (request.archived) {
        if (!adapter.withEffect) throw assistantErrors.unsupported("当前运行时不能受控停用定时工作");
        await adapter.withEffect(control, () => this.ports.stopFollowUps(workId, control));
      }
      await control.beforeEffect();
      control.assert_current();
      return store.update(actorId, workId, request.revision, { archived: request.archived });
    } finally {
      for (const release of releases) release();
      for (const work of group) this.changing.delete(work.work_id);
    }
  }
}
