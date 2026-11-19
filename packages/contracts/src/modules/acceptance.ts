import { inputSchemaFor } from "../platform/action-input.js";
import { ACTION_SUBJECT_SCHEMA, defineErrorCodes, type ActionDefinition, type ActionSubject } from "../platform/actions.js";
import { REVIEW_REFERENCE_SCHEMA, type ReviewEvidence, type ReviewOwner, type ReviewReference } from "../platform/reviews.js";

/**
 * Requirements, what was delivered against them, how each was checked and what the person decided (specs/proactive-assistant §7.3.1,
 * PWA-144～147; `modules/acceptance`). A platform capability: the object the requirements hang on is any provider's — an Assistant
 * task, a to-do, a Goal — named by (provider, kind, id), and nothing here knows Goals. The shapes follow the shared review contract
 * (`platform/reviews`, specs/agent-approval §3.5): a requirement has its own version, evidence is tiered by the platform and never by
 * the reporter, and a person's decision names the exact requirement versions and delivered version it is about.
 */
export const ACCEPTANCE_PROVIDER_ID = "system.acceptance";
export const ACCEPTANCE_READ_PERMISSION = "acceptance:read";
/** Attaching requirements, recording a delivered version and reporting a check. Never a decision. */
export const ACCEPTANCE_REPORT_PERMISSION = "acceptance:report";
/** The person's own accept or return. No Agent, workflow, plugin or MCP client is offered the action that needs it. */
export const ACCEPTANCE_DECIDE_PERMISSION = "acceptance:decide";
export const ACCEPTANCE_REQUIREMENT_MAX = 40;
export const ACCEPTANCE_EVIDENCE_MAX = 8;
/** Objects one read answers for: a page reads every card it shows in one call. */
export const ACCEPTANCE_READ_MAX = 32;
export const ACCEPTANCE_REVIEW_SUBJECT_KINDS = ["acceptance_subject", "acceptance_requirement", "acceptance_check"] as const;

/** The canonical request identifier for an object's acceptance review on the platform's trusted-decision entry (APR-15, APR-16). */
export function acceptanceRequestId(subject: AcceptanceSubject): string {
  return `${encodeURIComponent(subject.provider_id.trim())}/${encodeURIComponent(subject.subject.kind.trim())}/${encodeURIComponent(subject.subject.id.trim())}`;
}

export function parseAcceptanceRequestId(requestId: string): AcceptanceSubject | null {
  const parts = requestId.split("/");
  if (parts.length !== 3) return null;
  try {
    const [provider_id, kind, id] = parts.map(part => decodeURIComponent(part).trim()) as [string, string, string];
    return provider_id && kind && id ? { provider_id, subject: { kind, id } } : null;
  } catch { return null; }
}

/** The object requirements hang on: whose it is and which one. The record is kept per project; the object stays with its owner. */
export interface AcceptanceSubject { provider_id: string; subject: ActionSubject }

/** One requirement as its writer states it. `part` names the part of the deliverable it is about, in the deliverable's own words. */
export interface AcceptanceRequirementInput { id: string; statement: string; expected?: string; part?: string; requires_person: boolean }

/** A reference only: the record stays with its owner (the 成果库, the Agent Host) and is read there. */
export type AcceptanceEvidenceRef =
  | { kind: "artifact_version"; artifact_id: string; version: number }
  | { kind: "command_receipt"; run_id: string; call_id: string };

/** Engineering evidence and trying the product by hand are told apart and neither stands for the other (PWA-145). */
export type AcceptanceCheckKind = "engineering" | "hands_on";
/**
 * Why a check that names evidence does not count as passed: nothing the platform could look up, evidence of an earlier delivered
 * version, evidence of another object (or of a round that did not make this version), evidence that could not be read, or a
 * command that did not end well.
 */
export type AcceptanceGap = "evidence_missing" | "evidence_stale" | "wrong_object" | "evidence_unreadable" | "check_failed";
/**
 * The platform's own finding when the report arrives; no input carries it (`ReviewEvidence["tier"]` without the person's). `machine_checked`:
 * commands the platform ran in the round that made the version; `peer_reviewed`: a session the platform knows, other than the one that made
 * the version, checked that version against readable evidence (contract-design §10.9 question 2).
 */
export type AcceptanceTier = Exclude<ReviewEvidence["tier"], "person_accepted">;

export interface AcceptanceReportInput {
  requirement_id: string;
  verdict: "supports" | "contradicts";
  kind?: AcceptanceCheckKind;
  /** The delivered version that was looked at, exactly; and the object, when it was not the requirement's own. */
  checked: { version: string; subject?: ActionSubject };
  method: string;
  observed: string;
  evidence?: AcceptanceEvidenceRef[];
}

export interface AcceptanceCheck {
  kind: AcceptanceCheckKind;
  verdict: "supports" | "contradicts";
  tier: AcceptanceTier;
  gap: AcceptanceGap | null;
  requirement_version: number;
  checked_version: string;
  method: string;
  observed: string;
  evidence: AcceptanceEvidenceRef[];
  reported_at: string;
}

/** Where a decision's standing comes from: the platform's trusted-decision entry, or Goals' own applied decision moved over by the 6→7 upgrade. */
export type AcceptanceDecisionOrigin = "trusted_decision" | "goals_v5";

export interface AcceptancePersonDecision {
  decision_id: string;
  origin: AcceptanceDecisionOrigin;
  decision: "accepted" | "returned";
  note: string | null;
  requirement_version: number;
  /** The delivered version the requirement stood on when the person decided. */
  version: string;
  actor_id: string;
  decided_at: string;
}

/** One line of a requirement's record, oldest first. Nothing in it is ever rewritten (PWA-146). */
export type AcceptanceHistoryEntry =
  | { type: "requirement"; at: string; requirement_version: number; statement: string; by_person: boolean }
  | { type: "delivery"; at: string; version: string; round: number; touched: boolean }
  | ({ type: "check"; at: string } & AcceptanceCheck)
  | ({ type: "decision"; at: string } & AcceptancePersonDecision);

export interface AcceptanceRequirementState {
  id: string;
  version: number;
  statement: string;
  expected: string | null;
  part: string | null;
  requires_person: boolean;
  /** The delivered version this requirement's state is about: the last one that touched it. Null before anything is delivered. */
  stands_on: string | null;
  /** True when the current delivered version did not touch it, so what was found and decided on `stands_on` still holds. */
  carried: boolean;
  /** Waiting for rework or a new check: the person returned it, or the requirement itself changed since it was last checked. */
  recheck: "returned" | "requirement_changed" | null;
  check: AcceptanceCheck | null;
  hands_on: AcceptanceCheck | null;
  verified: boolean;
  /** Why it is not verified. `self_only`: nothing but the executor's own word. */
  gap: AcceptanceGap | "self_only" | "contradicted" | null;
  person: "accepted" | "returned" | "pending" | "not_needed";
  decision: AcceptancePersonDecision | null;
  /** A decision synced from another device whose trusted-decision record has not arrived here yet: it does not count until it does. */
  awaiting_voucher: boolean;
  satisfied: boolean;
  history: AcceptanceHistoryEntry[];
}

export interface AcceptanceView {
  subject: AcceptanceSubject;
  /** The current delivered version and how many there have been; null and 0 before the first. */
  version: string | null;
  round: number;
  requirements: AcceptanceRequirementState[];
  /** Kept apart on purpose: that the work ran, what was verified, and what the person accepted (PWA-145). */
  counts: { total: number; verified: number; needs_person: number; accepted: number; satisfied: number };
  /** Every requirement satisfied. A finished run or a round of rework never makes this true by itself. */
  complete: boolean;
  /** What the current round changed, as its deliverer said: only on a second or later delivery. */
  changes: { summary: string | null; touched: string[] } | null;
  /** The canonical review reference of the current delivered state, shared by the acceptance card and the decision request card (APR-16). */
  review_reference?: ReviewReference<ReviewOwner>;
}

export interface AcceptanceSetRequest { subject: AcceptanceSubject; requirements: AcceptanceRequirementInput[] }
export interface AcceptanceDeliverRequest {
  subject: AcceptanceSubject;
  version: string;
  summary?: string;
  /** The requirements this version changed anything for. Omitted on the first delivery (all of them); required afterwards. */
  touches?: string[];
  /** The round of the caller's own session that made this version, for command receipts to be weighed against. */
  made_in?: { run_id: string };
}
export interface AcceptanceReportRequest { subject: AcceptanceSubject; reports: AcceptanceReportInput[] }
/** Several objects at once; the views come back in the order asked, an object with nothing hung on it as an empty view. */
export interface AcceptanceReadRequest { subjects: AcceptanceSubject[] }
export interface AcceptanceReadResult { views: AcceptanceView[] }
/** The person's selection, frozen: each item names the requirement version it is about, and `version` the delivery being looked at. */
export interface AcceptanceDecideRequest {
  subject: AcceptanceSubject;
  version: string;
  accepts: Array<{ id: string; version: number }>;
  returns: Array<{ id: string; version: number; note: string }>;
}
export interface AcceptanceReviewRequest {
  request_id: string;
  draft?: Readonly<Record<string, unknown>>;
}

export const acceptanceErrors = defineErrorCodes("acceptance", {
  /** Not called in a project, or the subject is not well formed. */
  scope: "invalid",
  invalid: "invalid",
  /** Nothing is attached to this object in this project. */
  subject_unknown: "not_found",
  requirement_unknown: "not_found",
  /** After the first delivery only the person changes what was asked. */
  requirements_fixed: "forbidden",
  /** The version reported, or decided on, is not one that was delivered. */
  version_unknown: "conflict",
  /** What the person selected is no longer what stands: a requirement or the delivered version moved since it was shown. */
  selection_changed: "conflict",
  /** A return without the words that say why. */
  note_required: "invalid",
});

const text = (max: number) => ({ type: "string", minLength: 1, maxLength: max }) as const;
const id = text(200);
const SUBJECT = { type: "object", properties: { provider_id: id, subject: ACTION_SUBJECT_SCHEMA }, required: ["provider_id", "subject"], additionalProperties: false } as const;
const EVIDENCE = { oneOf: [
  { type: "object", properties: { kind: { const: "artifact_version" }, artifact_id: id, version: { type: "integer", minimum: 1 } }, required: ["kind", "artifact_id", "version"], additionalProperties: false },
  { type: "object", properties: { kind: { const: "command_receipt" }, run_id: id, call_id: id }, required: ["kind", "run_id", "call_id"], additionalProperties: false },
] } as const;
const REQUIREMENT = { type: "object", properties: { id, statement: text(1000), expected: text(1000), part: text(200), requires_person: { type: "boolean" } },
  required: ["id", "statement", "requires_person"], additionalProperties: false } as const;
const REPORT = { type: "object", properties: { requirement_id: id, verdict: { enum: ["supports", "contradicts"] }, kind: { enum: ["engineering", "hands_on"] },
  checked: { type: "object", properties: { version: id, subject: ACTION_SUBJECT_SCHEMA }, required: ["version"], additionalProperties: false },
  method: text(1000), observed: text(2000), evidence: { type: "array", maxItems: ACCEPTANCE_EVIDENCE_MAX, items: EVIDENCE } },
  required: ["requirement_id", "verdict", "checked", "method", "observed"], additionalProperties: false } as const;
const ITEM = { type: "object", properties: { id, version: { type: "integer", minimum: 1 } }, required: ["id", "version"], additionalProperties: false } as const;
/** The view is the owner's projection; a consumer reads it whole. */
const VIEW = { type: "object", properties: { subject: SUBJECT, version: { type: ["string", "null"] }, round: { type: "integer", minimum: 0 }, requirements: { type: "array", items: { type: "object" } },
  counts: { type: "object" }, complete: { type: "boolean" }, changes: { type: ["object", "null"] }, review_reference: REVIEW_REFERENCE_SCHEMA }, required: ["subject", "version", "round", "requirements", "counts", "complete", "changes"], additionalProperties: false } as const;
const REVIEW_INPUT = { type: "object", properties: { request_id: text(240), draft: { type: "object" } }, required: ["request_id"], additionalProperties: false } as const;

const metadata = { scope: "project" as const, scheduling: "concurrent" as const, subject_kinds: [] };
export const acceptanceActions = {
  set: { capability_id: "acceptance.requirements.set", version: /* @version action.acceptance.requirements.set */ 1, operation: "command", action: { ...metadata,
    title: "写下交付要满足的各项要求", description: "把一件工作要满足的要求逐项挂到它的对象上：每项一句话说明、可选的预期与所指的部分、是否要用户本人认可。同一个 id 的说明变了算这条要求的新版本，之前的核验和认可不再算数；没再列出的要求撤下。第一次交付之后只有用户本人能改要求。",
    kind: "operation", effect: "write", audiences: ["user", "agent", "workflow", "plugin"], permissions: [ACCEPTANCE_REPORT_PERMISSION],
    input_schema: inputSchemaFor<AcceptanceSetRequest>()({ type: "object", properties: { subject: SUBJECT, requirements: { type: "array", minItems: 1, maxItems: ACCEPTANCE_REQUIREMENT_MAX, items: REQUIREMENT } },
      required: ["subject", "requirements"], additionalProperties: false } as const), output_schema: VIEW } } as ActionDefinition<AcceptanceSetRequest, AcceptanceView>,
  deliver: { capability_id: "acceptance.deliveries.record", version: /* @version action.acceptance.deliveries.record */ 1, operation: "command", action: { ...metadata,
    title: "记下交付了哪个版本", description: "记下这件工作交付的确切版本（不写「最新」）。返工后再交付时写明这一版动了哪几项要求、改了什么：没动到的要求沿用上一版的核验与认可，动到的重新核。交付本身不算任何一项通过。",
    kind: "operation", effect: "write", audiences: ["user", "agent", "workflow"], permissions: [ACCEPTANCE_REPORT_PERMISSION],
    input_schema: inputSchemaFor<AcceptanceDeliverRequest>()({ type: "object", properties: { subject: SUBJECT, version: id, summary: text(2000), touches: { type: "array", maxItems: ACCEPTANCE_REQUIREMENT_MAX, uniqueItems: true, items: id },
      made_in: { type: "object", properties: { run_id: id }, required: ["run_id"], additionalProperties: false } }, required: ["subject", "version"], additionalProperties: false } as const), output_schema: VIEW } } as ActionDefinition<AcceptanceDeliverRequest, AcceptanceView>,
  report: { capability_id: "acceptance.reports.submit", version: /* @version action.acceptance.reports.submit */ 1, operation: "command", action: { ...metadata,
    title: "逐项报告核对结果", description: "对每项要求报告核对了哪个交付版本、用什么方法、看到了什么，并可附至多 8 条证据引用（成果库里的确切版本、本会话里平台运行过的命令回执）。算不算「核验通过」由平台自己核对后给出：只有自述、证据缺失、证据是旧版本的、核对的不是这个对象、命令没有正常结束，都照常保存但不算通过。工程检查和产品实操分开报告。",
    kind: "operation", effect: "write", audiences: ["agent", "workflow"], permissions: [ACCEPTANCE_REPORT_PERMISSION],
    input_schema: inputSchemaFor<AcceptanceReportRequest>()({ type: "object", properties: { subject: SUBJECT, reports: { type: "array", minItems: 1, maxItems: ACCEPTANCE_REQUIREMENT_MAX * 2, items: REPORT } },
      required: ["subject", "reports"], additionalProperties: false } as const), output_schema: VIEW } } as ActionDefinition<AcceptanceReportRequest, AcceptanceView>,
  read: { capability_id: "acceptance.read", version: /* @version action.acceptance.read */ 1, operation: "query", action: { ...metadata,
    title: "逐项看要求、证据与认可", description: "读取一件或几件工作（subjects，至多 32 个）的各项要求此刻的状态：所核版本、方法、证据与可信层级、缺口、用户的认可或退回、各轮的记录，以及执行、核验、认可三个各自的进度。按所问的顺序返回 views；没挂要求的对象返回空的一份。只读。",
    kind: "query", effect: "read", audiences: ["user", "agent", "workflow", "plugin"], permissions: [ACCEPTANCE_READ_PERMISSION],
    input_schema: inputSchemaFor<AcceptanceReadRequest>()({ type: "object", properties: { subjects: { type: "array", minItems: 1, maxItems: ACCEPTANCE_READ_MAX, items: SUBJECT } }, required: ["subjects"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { views: { type: "array", items: VIEW } }, required: ["views"], additionalProperties: false } } } as ActionDefinition<AcceptanceReadRequest, AcceptanceReadResult>,
  review: { capability_id: "acceptance.review", version: /* @version action.acceptance.review */ 1, operation: "query", action: { ...metadata, subject_kinds: [...ACCEPTANCE_REVIEW_SUBJECT_KINDS],
    title: "查看交付要求的待审状态与选项", description: "读取一件已交付对象的各项要求、依据、延续认可和当前可决定的选项，供受保护可信决定入口与双卡引用共用；只读。",
    kind: "query", effect: "read", audiences: ["user"], permissions: [ACCEPTANCE_READ_PERMISSION],
    input_schema: inputSchemaFor<AcceptanceReviewRequest>()(REVIEW_INPUT), output_schema: { type: "object" } } } as ActionDefinition<AcceptanceReviewRequest, object>,
  decide: { capability_id: "acceptance.decide", version: /* @version action.acceptance.decide */ 1, operation: "command", action: { ...metadata, subject_kinds: [...ACCEPTANCE_REVIEW_SUBJECT_KINDS],
    requires_trusted_decision: true, trusted_decision_request: { capability_id: "acceptance.review", version: /* @version action.acceptance.review */ 1 },
    title: "认可或退回各项要求", description: "用户本人经受保护可信决定入口对列出的要求逐项认可或退回（退回要写原因），一次可以定多项。每项写明所针对的要求版本和正在看的交付版本；其中任何一项在显示之后变过，整次决定不生效。没列出的要求不受影响。",
    kind: "operation", effect: "write", audiences: ["user"], permissions: [ACCEPTANCE_DECIDE_PERMISSION],
    input_schema: inputSchemaFor<AcceptanceDecideRequest>()({ type: "object", properties: { subject: SUBJECT, version: id, accepts: { type: "array", maxItems: ACCEPTANCE_REQUIREMENT_MAX, items: ITEM },
      returns: { type: "array", maxItems: ACCEPTANCE_REQUIREMENT_MAX, items: { ...ITEM, properties: { ...ITEM.properties, note: text(2000) }, required: ["id", "version", "note"] } } },
      required: ["subject", "version", "accepts", "returns"], additionalProperties: false } as const), output_schema: VIEW } } as ActionDefinition<AcceptanceDecideRequest, AcceptanceView>,
};

/**
 * One subject's whole record as Goals hands it over in the project library's 6→7 upgrade (contract-design §10.4), and nowhere else:
 * the rows exactly as they are to be written, with ids, rounds and clocks already worked out from Goals' own data, and what Goals' own
 * rules said of each current requirement. The platform writes them and refuses the upgrade where its own reading differs.
 */
export interface AcceptanceHandoverSubject {
  subject: AcceptanceSubject;
  created_at: string;
  requirements: Array<{ requirement_id: string; version: number; statement: string; expected: string | null; part: string | null; requires_person: boolean; withdrawn: boolean;
    position: number; by_person: boolean; actor_id: string; created_at: string }>;
  deliveries: Array<{ round: number; version: string; touches: string[] | null; actor_id: string; delivered_at: string }>;
  checks: Array<{ check_id: string; clock: number; requirement_id: string; requirement_version: number; round: number; verdict: "supports" | "contradicts"; tier: AcceptanceTier;
    gap: AcceptanceGap | null; checked_version: string; method: string; observed: string; evidence: AcceptanceEvidenceRef[]; reporter_session: string | null; actor_id: string; reported_at: string }>;
  decisions: Array<{ decision_id: string; clock: number; requirement_id: string; requirement_version: number; stands_round: number; version: string; decision: "accepted" | "returned";
    note: string | null; origin_ref: string; actor_id: string; decided_at: string }>;
  /** Goals' own reading of each current requirement before the move: satisfied or not. */
  satisfied: Record<string, boolean>;
}
