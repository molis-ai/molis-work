import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import type { AgentReviewRequest, ReviewDecisionRecord, ReviewReference } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "./errors.js";

export interface ReviewDecisionControl {
  beforeEffect(): void | Promise<void>;
  assertCurrent(): void;
}

/** The Node adapter owns encrypted bytes and CAS. The decision service owns their current schema. */
export interface ReviewDecisionStorage {
  read(id: string): Promise<unknown | undefined>;
  create(id: string, value: unknown, control: ReviewDecisionControl): Promise<void>;
  withControl<T>(control: ReviewDecisionControl, work: () => Promise<T>): Promise<T>;
}

/** Frozen presentation permits history without a live gateway or workspace. It never restores an executor. */
export interface StoredReviewDecision { readonly record: ReviewDecisionRecord; readonly request: AgentReviewRequest }

export type ReviewDecisionSave =
  | ({ readonly state: "committed" } & StoredReviewDecision)
  | ({ readonly state: "conflict" } & StoredReviewDecision)
  | { readonly state: "not-saved"; readonly error: unknown }
  | { readonly state: "unknown"; readonly error: unknown };

/** Only frozen execution facts belong here. Callers project out labels, clocks and mutable SDK state. */
export function reviewProposalVersion(proposal: unknown): string {
  const canonical = canonicalJsonText(proposal);
  if (canonical === undefined) throw agentErrors.review_unreadable("原执行提案不可读取，不能生成审查版本");
  return createHash("sha256").update(canonical).digest("hex");
}

/** Version is deliberately absent: one original operation cannot get a second decision under a new version key. */
export function reviewDecisionKey(reference: Pick<ReviewReference, "owner" | "id">): string {
  return reviewProposalVersion({ owner: reference.owner, id: reference.id });
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const revision = (value: unknown): boolean => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const date = (value: unknown): boolean => text(value) && Number.isFinite(Date.parse(value));
const delegation = (value: unknown): boolean => object(value) && text(value.id) && revision(value.revision) && text(value.work_epoch) && text(value.grantor_id);

function source(value: unknown): boolean {
  if (!object(value)) return false;
  if (value.kind === "person") return text(value.actor_id);
  if (value.kind === "delegation") return delegation(value.delegation);
  if (value.kind === "policy") return text(value.owner) && text(value.id) && revision(value.revision) && text(value.set_by) && date(value.set_at);
  if (value.kind !== "ai" || !delegation(value.delegation) || !text(value.reason) || !object(value.assessment)) return false;
  return [value.assessment.id, value.assessment.version, value.assessment.provider_id, value.assessment.model_id].every(text);
}

function reference(value: unknown): value is ReviewReference {
  return object(value) && text(value.id) && text(value.version) && object(value.owner)
    && ["agent-review", "goal-acceptance"].includes(String(value.owner.kind))
    && [value.owner.project_id, value.owner.plugin_id, value.owner.install_id].every(text);
}

function decision(value: unknown): value is ReviewDecisionRecord {
  return object(value) && reference(value.reference) && ["approve", "reject"].includes(String(value.decision))
    && text(value.actor_id) && date(value.decided_at) && (value.note === null || typeof value.note === "string") && source(value.source)
    && (value.source && object(value.source) && value.source.kind === "person" ? value.source.actor_id === value.actor_id : true);
}

function presentation(value: unknown, record: ReviewDecisionRecord): value is AgentReviewRequest {
  return object(value) && value.review_id === record.reference.id && isDeepStrictEqual(value.reference, record.reference)
    && value.project_id === record.reference.owner.project_id && value.plugin_id === record.reference.owner.plugin_id
    && date(value.requested_at) && (value.expires_at === null || date(value.expires_at))
    && object(value.document) && value.document.kind === value.kind
    && ["text-edit", "command", "tool-operation", "mcp", "rewind", "git-index", "git-integration"].includes(String(value.kind))
    && (value.run === null ? object(value.operation) && text(value.operation.operation_id)
      : object(value.run) && text(value.run.session_id) && text(value.run.run_id));
}

interface SavedDecision extends StoredReviewDecision { schema: 1; submission_id: string }

/** One immutable encrypted fact per original operation, including its provenance. Never replays delivery. */
export class ReviewDecisionStore {
  constructor(readonly storage: ReviewDecisionStorage) {}

  async #read(key: string, owner: Pick<ReviewReference, "owner" | "id">): Promise<SavedDecision | undefined> {
    const value = await this.storage.read(key);
    if (value === undefined) return undefined;
    if (!object(value) || value.schema !== 1 || !text(value.submission_id) || !decision(value.record)
      || reviewDecisionKey(value.record.reference) !== key || !isDeepStrictEqual(value.record.reference.owner, owner.owner)
      || value.record.reference.id !== owner.id || !presentation(value.request, value.record)) throw agentErrors.review_unreadable("批准决定记录不可读，不能当作尚未决定");
    return { schema: 1, submission_id: value.submission_id, record: structuredClone(value.record), request: structuredClone(value.request) };
  }

  async read(owner: Pick<ReviewReference, "owner" | "id"> & Partial<Pick<ReviewReference, "version">>): Promise<StoredReviewDecision | undefined> {
    const saved = await this.#read(reviewDecisionKey(owner), owner);
    if (saved && owner.version !== undefined && saved.record.reference.version !== owner.version) throw agentErrors.review_version_changed("已保存的决定与原执行提案版本不符，需核对原记录");
    return saved && { record: saved.record, request: saved.request };
  }

  withControl<T>(control: ReviewDecisionControl, work: () => Promise<T>): Promise<T> { return this.storage.withControl(control, work); }

  async save(record: ReviewDecisionRecord, request: AgentReviewRequest, control: ReviewDecisionControl): Promise<ReviewDecisionSave> {
    if (!decision(record) || !presentation(request, record)) throw agentErrors.review_unreadable("批准决定缺少可信归属或来源");
    const saved: SavedDecision = { schema: 1, submission_id: randomUUID(), record: structuredClone(record), request: structuredClone(request) };
    const key = reviewDecisionKey(saved.record.reference);
    try {
      await this.storage.create(key, saved, control);
      return { state: "committed", record: saved.record, request: saved.request };
    } catch (error) {
      // A failed return does not prove the write failed. Read the same stable key;
      // only this invocation's token can establish that this invocation won.
      try {
        const current = await this.#read(key, saved.record.reference);
        if (!current) return { state: "not-saved", error };
        return { state: current.submission_id === saved.submission_id && isDeepStrictEqual(current, saved) ? "committed" : "conflict", record: current.record, request: current.request };
      } catch (readError) { return { state: "unknown", error: readError }; }
    }
  }
}
