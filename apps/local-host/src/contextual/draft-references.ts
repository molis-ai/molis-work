import { randomUUID } from "node:crypto";
import { bindActionHandler, defineErrorCodes, type ActionSchema, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { createActionDefinition, objectSchema } from "@molis-ai/molis-work-plugin-sdk";

export const DRAFT_REFERENCE_PERMISSION = "ui:drafts";
const errors = defineErrorCodes("contextual", { draft_missing: "not_found", draft_owner: "forbidden", draft_capacity: "conflict", draft_closed: "unavailable" });
const purpose = { type: "string", minLength: 1, maxLength: 120 } as const;
const define = <O>() => <const S extends ActionSchema>(name: string, version: number, input: S, output: ActionSchema) =>
  createActionDefinition<InferActionInput<S>, O>(name, "command", { title: "交接一次性页面草稿", description: "只为当前用户和项目暂存文字；引用按用途校验、限时且只消费一次，不保存业务事实", kind: "operation", scope: "project", audiences: ["user"], permissions: [DRAFT_REFERENCE_PERMISSION], subject_kinds: [], input_schema: input, output_schema: output }, version);
export const draftReferenceActions = {
  issue: define<{ reference: string; expires_at: string }>()("contextual.draft_reference.issue", /* @version action.contextual.draft_reference.issue */ 1,
    objectSchema({ purpose, text: { type: "string", minLength: 1, maxLength: 4000 } } as const), objectSchema({ reference: { type: "string" }, expires_at: { type: "string" } })),
  take: define<{ text: string }>()("contextual.draft_reference.take", /* @version action.contextual.draft_reference.take */ 1,
    objectSchema({ purpose, reference: { type: "string", minLength: 1, maxLength: 80 } } as const), objectSchema({ text: { type: "string", maxLength: 4000 } })),
};

/** D0225: one Home lifetime, no text in a URL; no disk, second preference or business record. */
export class DraftReferences {
  private closed = false;
  private readonly drafts = new Map<string, { actor: string; project: string | null; purpose: string; text: string; expires: number; timer: ReturnType<typeof setTimeout> }>();
  private expire() { for (const [key, value] of this.drafts) if (value.expires <= Date.now()) { clearTimeout(value.timer); this.drafts.delete(key); } }
  close(): void { this.closed = true; for (const value of this.drafts.values()) clearTimeout(value.timer); this.drafts.clear(); }
  handlers() {
    return [
      bindActionHandler(draftReferenceActions.issue, async (input, caller) => {
        await caller.beforeEffect();
        if (this.closed) throw errors.draft_closed("草稿暂存服务已关闭");
        this.expire();
        if (this.drafts.size >= 100) throw errors.draft_capacity("暂存草稿已达上限，请稍后重试");
        const reference = randomUUID(), expires = Date.now() + 10 * 60_000;
        const timer = setTimeout(() => this.drafts.delete(reference), 10 * 60_000).unref();
        this.drafts.set(reference, { timer, actor: caller.actor_id, project: caller.project_id, purpose: input.purpose, text: input.text, expires });
        return { reference, expires_at: new Date(expires).toISOString() };
      }),
      bindActionHandler(draftReferenceActions.take, async (input, caller) => {
        await caller.beforeEffect();
        if (this.closed) throw errors.draft_closed("草稿暂存服务已关闭");
        this.expire();
        const value = this.drafts.get(input.reference);
        if (!value) throw errors.draft_missing("草稿引用已过期或已经使用，请从原记忆重新打开");
        if (value.actor !== caller.actor_id || value.project !== caller.project_id || value.purpose !== input.purpose) throw errors.draft_owner("草稿不属于当前用户、项目或用途");
        clearTimeout(value.timer); this.drafts.delete(input.reference); return { text: value.text };
      }),
    ];
  }
}
