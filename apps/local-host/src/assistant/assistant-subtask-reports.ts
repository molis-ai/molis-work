import { createHash } from "node:crypto";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { isTerminalAgentPhase, type AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import type { AssistantServicePorts } from "./assistant-service-shared.js";
import { ownerOf } from "./assistant-round-start.js";
import { assistantErrors } from "./assistant-errors.js";
import { assertSubtaskGraph } from "./assistant-subtask-binding.js";
import { hostLog } from "../host-log.js";

interface Ports {
  store: AssistantStore; actorId: string; signal: AbortSignal;
  host: AssistantServicePorts["host"]; authority: AssistantServicePorts["authority"];
  parent(work: StoredWork): StoredWork | undefined;
  inputSessions(work: StoredWork): AsyncIterable<string>;
  watch(work: StoredWork, run: AgentRunRef): void;
  result(parent: StoredWork, title: string, key: string): void;
}
const keyOf = (...values: string[]) => `work-notice.${createHash("sha256").update(JSON.stringify(values)).digest("hex")}`;

/** Original requests locate accepted personal inputs; original Session envelopes deduplicate reports. No message ledger here. */
export class AssistantSubtaskReports {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly dirty = new Set<string>();
  private readonly watching = new Set<string>();
  constructor(private readonly ports: Ports) {}
  kick(workId: string): void {
    if (this.ports.signal.aborted) return;
    this.dirty.add(workId);
    if (this.pending.has(workId)) return;
    const pending = (async () => {
      while (this.dirty.delete(workId) && !this.ports.signal.aborted) await this.reconcile(workId);
    })().catch(error => { if (!this.ports.signal.aborted) hostLog.warn("assistant", "subtask_report_unconfirmed", error); })
      .finally(() => { this.pending.delete(workId); if (this.dirty.delete(workId)) this.kick(workId); });
    this.pending.set(workId, pending);
  }
  async idle(): Promise<void> { while (this.pending.size) await Promise.all(this.pending.values()); }
  attach(): void {
    for (const work of this.ports.store.list(this.ports.actorId, { limit: Number.MAX_SAFE_INTEGER })) if (work.delegated_by) this.kick(work.work_id);
  }
  private async reconcile(workId: string): Promise<void> {
    const { store, actorId } = this.ports, work = store.get(actorId, workId), parent = this.ports.parent(work);
    if (!work.delegated_by || work.delegated_by.taken_back_at || work.archived || !work.session_id || !parent?.session_id || parent.archived) return;
    const adapter = (await this.ports.host()).adapter("prologue"), notify = adapter.inputs?.notify;
    if (!notify) throw assistantErrors.unsupported("当前运行时不能向父任务保存子任务通知");
    const authority = await this.ports.authority(work);
    const current = () => {
      this.ports.signal.throwIfAborted();
      const child = store.get(actorId, workId), root = store.get(actorId, parent.work_id);
      if (child.archived || root.archived || child.delegated_by?.taken_back_at || child.session_id !== work.session_id || root.session_id !== parent.session_id
        || child.delegated_by?.graph_id !== work.delegated_by!.graph_id || child.delegated_by.node_id !== work.delegated_by!.node_id
        || root.graph_id !== work.delegated_by!.graph_id) throw assistantErrors.stale("原子任务通知的归属已改变");
      requireSynchronous(authority.assertBeforeStart?.(), "最终授权检查必须同步完成");
    };
    const publish = async (key: string, text: string) => {
      await notify({ from_session_id: work.session_id!, to_session_id: parent.session_id!, key, text }, {
        actor_id: actorId, plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, project_id: ownerOf(work),
        beforeEffect: async () => { await authority.beforeStart?.(); await assertSubtaskGraph(adapter, work, parent); current(); }, assert_current: current,
      });
    };
    for (const request of store.requests.forWork(actorId, workId)) for await (const inputSession of this.ports.inputSessions(work)) {
      current();
      const original = await adapter.readOriginalInput?.({ session_id: inputSession, input_id: request, version: 1 });
      const start = original?.original.written_by === "person" ? original.accepted_run : undefined;
      if (start) {
        await publish(keyOf(workId, "start", start.session_id, request), `用户直接继续了子任务。原工作 ${workId}，个人输入 ${request}，执行 ${start.session_id}/${start.run_id}。这是宿主回报，不是父任务的新指令。`);
        const view = await adapter.read(start);
        if (isTerminalAgentPhase(view.phase) && view.phase !== "reconcile-required") {
          this.watching.delete(start.run_id);
          const reply = [...view.turns].reverse().find(turn => turn.kind === "assistant" && turn.text.trim())?.text.slice(0, 1400) ?? "";
          const key = keyOf(workId, "result", start.session_id, start.run_id, view.phase);
          await publish(key, `用户继续的子任务已结束，状态 ${view.phase}。原工作 ${workId}，执行 ${start.session_id}/${start.run_id}。${reply ? `子任务自述（尚未核验）：\n${reply}` : "请按原记录查看结果。"}`);
          current();
          this.ports.result(parent, work.title, key);
        } else if (!isTerminalAgentPhase(view.phase) && !this.watching.has(start.run_id)) { this.watching.add(start.run_id); this.ports.watch(work, start); }
        continue;
      }
      const input = await adapter.inputs?.findByKey?.(inputSession, `send.${request}`);
      const receipt = input?.state === "run" ? input.receipt : input?.state === "queued" ? input.input : undefined;
      const received = receipt;
      if (!received || received.source === "peer" || received.source === "host" && received.original?.source !== "person"
        || input?.state === "withdrawn") continue;
      const inputId = input!.ref.input_id;
      await publish(keyOf(workId, "input", inputId), `用户向子任务补充了要求。原工作 ${workId}，输入 ${inputId}。请结合子任务后续回报协调；这不是父任务的新指令。`);
    }
  }
}
