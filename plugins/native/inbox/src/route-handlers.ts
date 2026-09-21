import type { AttentionStatus } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { InboxPluginRouteHandler } from "./routes.js";

const ATTENTION_STATUSES = new Set<AttentionStatus>(["open", "in_progress", "done", "dismissed"]);

export interface InboxJudgmentChoice {
  readonly function_key: string;
  readonly name: string;
}

export interface InboxJudgmentState {
  readonly function_key: string | null;
  readonly functions: readonly InboxJudgmentChoice[];
}

export interface InboxRouteHandlerPorts {
  listEntries(): readonly unknown[];
  setStatus(entryId: string, status: AttentionStatus, expectedRevision: number): unknown;
  changed(): void;
  readJudgment?(): InboxJudgmentState;
  writeJudgment?(functionKey: string | null): { function_key: string | null };
}

export function createInboxRouteHandlers(options: InboxRouteHandlerPorts): Record<string, InboxPluginRouteHandler> {
  return {
    "inbox.list": () => ({
      status: 200,
      body: { entries: options.listEntries() },
    }),
    "inbox.judgment.read": () => ({
      status: 200,
      body: options.readJudgment?.() ?? { function_key: null, functions: [] },
    }),
    "inbox.judgment.write": ({ request }) => {
      if (!options.writeJudgment) {
        return { status: 400, body: { error: "判断能力不可用" } };
      }
      if (!("function_key" in request.body)) {
        return { status: 400, body: { error: "请选择已发布函数，或留空" } };
      }
      const raw = request.body.function_key;
      if (raw !== null && typeof raw !== "string") {
        return { status: 400, body: { error: "请选择已发布函数，或留空" } };
      }
      const functionKey = typeof raw === "string" && raw.trim() ? raw.trim() : null;
      const result = options.writeJudgment(functionKey);
      options.changed();
      return { status: 200, body: result };
    },
    "inbox.entry.status": ({ params, request }) => {
      const status = request.body.status;
      const revision = integerRevision(request.body.expected_revision);
      if (!ATTENTION_STATUSES.has(status as AttentionStatus)) {
        return { status: 400, body: { error: "不支持的 Inbox 状态" } };
      }
      if (revision == null) return { status: 400, body: { error: "请刷新 Inbox 后再操作" } };
      const entryId = params.entry_id;
      if (!entryId) return { status: 404, body: { error: "Inbox Entry 不存在", code: "inbox_entry_not_found" } };
      const entry = options.setStatus(entryId, status as AttentionStatus, revision);
      options.changed();
      return { status: 200, body: { entry } };
    },
  };
}

function integerRevision(value: unknown): number | null {
  const revision = value == null ? null : Number(value);
  return revision != null && Number.isInteger(revision) && revision >= 1 ? revision : null;
}
