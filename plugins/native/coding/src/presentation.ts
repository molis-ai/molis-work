import { bindActionHandler, ActionError, type ActionAvailability, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindPresentationValuesHandler, definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS,
  type PresentationDeclaration, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import { codingCreateSessionAction } from "./route-actions.js";
import type { CodingSessionStore } from "./store.js";

const values = definePresentationValuesAction("coding.presentation.values", /* @version action.coding.presentation.values */ 1, ["coding_session"], "编码会话显示字段", ["artifact:read"]);
const overview = definePresentationOverviewAction("coding.presentation.overview", /* @version action.coding.presentation.overview */ 1, "编码会话首页概况", ["artifact:read"]);
const { capability_id, version } = codingCreateSessionAction;
const start = { capability_id, version };
export const codingPresentationActions = [values, overview];

export const codingPresentation = {
  objects: [{
    kind: "coding_session",
    fields: [{ key: "title", role: "title" }, { key: "status", role: "status" }, { key: "updated_at", role: "updated_at" }, { key: "created_at", role: "happened_at" }],
    status: { field: "status", map: { idle: { ring: "idle" }, running: { ring: "running" }, paused: { ring: "paused" },
      "waiting-answer": { ring: "answer", attention: "needs_decision" }, "waiting-approval": { ring: "approval", attention: "needs_decision" },
      failed: { ring: "failed", attention: "failed" }, stopped: { ring: "stopped" }, cancelled: { ring: "cancelled" },
      "reconcile-required": { ring: "verify" }, queued: { ring: "queued" }, done: { ring: "done" } } },
    forms: { chip: { fields: ["title"] }, row: { fields: ["title", "status", "updated_at"] },
      card: { fields: ["title", "status", "created_at", "updated_at"] }, peek: { fields: ["title", "status", "created_at", "updated_at"] } },
    text: { lines: ["title", "status", "updated_at"] },
  }],
  overview: { capability_id: overview.capability_id, version: overview.version, start: [start] },
} as const satisfies PresentationDeclaration;

/** Sessions are the local owner's personal state, like every other Coding read: only that owner reads their displayed values and overview. */
export function createCodingPresentationHandlers(projectId: string, sessions: Pick<CodingSessionStore, "get" | "list">, ownerActorId: string | undefined) {
  const owner = (caller: ActionCallContext): ActionAvailability => ownerActorId && caller.actor_id === ownerActorId ? { available: true }
    : { available: false, code: "actions.owner_mismatch", reason: "此入口使用本地用户的个人状态与成果；当前调用者尚未接通独立归属，不能借用该用户身份" };
  return [
    bindPresentationValuesHandler(values, input => ({ items: input.subjects.filter(subject => subject.kind === "coding_session").map((subject): PresentationValueItem => {
      try {
        const session = sessions.get(projectId, subject.id);
        if (!session.archived) return { subject, revision: session.updated_at, state: "ok",
          values: { title: session.title, status: session.state, updated_at: session.updated_at, created_at: session.created_at } };
      } catch (error) {
        if (!(error instanceof ActionError && error.code === "coding.session_unknown")) throw error;
      }
      return { subject, revision: "0", state: "deleted" };
    }) }), owner),
    bindActionHandler(overview, () => {
      const recent = sessions.list(projectId).slice(0, PRESENTATION_LIMITS.overview_subjects);
      return { summary: { key: recent.length ? "coding.presentation.summary" : "coding.presentation.empty" },
        subjects: recent.map(session => ({ kind: "coding_session", id: session.session_id })), start: [start] };
    }, { availability: owner }),
  ];
}
