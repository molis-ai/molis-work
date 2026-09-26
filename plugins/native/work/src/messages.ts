import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { sessionMessagePrompt, type SessionMessageApi, type SessionMessageRecord, type PrepareSessionMessage, type WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { RuntimeHostApi } from "@molis-ai/molis-work-contracts/services/runtime-host";

type Caller = { actor_id: string; project_id: string };
/** All effects stay in the Session owner; adapters only deliver to a fixed native target. */
export class SessionMessageService {
  constructor(private readonly sessions: Pick<WorkSessionApi, "get">, private readonly messages: SessionMessageApi,
    private readonly runtime: Pick<RuntimeHostApi, "capabilities" | "invoke">) {}

  read(requestId: string, caller: Caller): SessionMessageRecord {
    const record = this.messages.get(requestId);
    if (record.actor_id !== caller.actor_id || record.project_id !== caller.project_id
      || this.sessions.get(record.target.session_id).project_id !== caller.project_id) {
      throw new ActionError("session.message_not_found", "找不到此调用者和项目的消息请求");
    }
    return record;
  }

  async send(input: PrepareSessionMessage, authorize: () => Promise<void>): Promise<SessionMessageRecord> {
    await authorize();
    if (this.sessions.get(input.session_id).project_id !== input.project_id) throw new ActionError("sessions.not_found", "找不到此项目的 Session");
    const record = this.messages.prepare(input);
    return this.deliver(record.request_id, input, false, authorize);
  }

  async retry(requestId: string, caller: Caller, authorize: () => Promise<void>): Promise<SessionMessageRecord> {
    return this.deliver(requestId, caller, true, authorize);
  }

  private async deliver(requestId: string, caller: Caller, retry: boolean, authorize: () => Promise<void>): Promise<SessionMessageRecord> {
    await authorize();
    const record = this.read(requestId, caller);
    if (record.state !== (retry ? "failed" : "pending")) return record;
    if (this.runtime.capabilities(record.target.runtime_id).message !== "native") throw new ActionError("session.message_unavailable", "此 Runtime 不支持原生消息发送");
    const claim = this.messages.claim(requestId, retry);
    if (!claim.claimed) return claim.record;
    let delivery: Parameters<SessionMessageApi["finish"]>[2];
    try {
      const result = await this.runtime.invoke(record.target.runtime_id, "message", { threadId: record.target.native_runtime_session_id, text: sessionMessagePrompt(record) });
      if (result.status === "ok" && result.source === "native" && result.value && typeof result.value === "object"
        && "native_turn_id" in result.value && typeof result.value.native_turn_id === "string" && result.value.native_turn_id.trim()) {
        delivery = { state: "accepted", native_turn_id: result.value.native_turn_id };
      } else if (result.status === "unsupported" || (result.status === "failed" && result.recovery?.retryable === true)) {
        delivery = { state: "failed", error_code: result.code };
      } else delivery = { state: "uncertain", error_code: result.status === "failed" ? result.code : "runtime.message_receipt_missing" };
    } catch { delivery = { state: "uncertain", error_code: "runtime.message_delivery_unknown" }; }
    // Persist a real receipt before post-flight permission checks. Revocation cannot undo an accepted turn.
    const finished = this.messages.finish(requestId, claim.record.attempt_count, delivery);
    await authorize();
    this.read(requestId, caller);
    return finished;
  }
}
