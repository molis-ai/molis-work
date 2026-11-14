import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewDecisionReference, ReviewEvidence, ReviewRequirement, ReviewRequest, ReviewTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ProjectReviewCoverage, ProjectTrustedDecision, TrustedReviewOffer } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";

const invalid = () => new ActionError("actions.input_invalid", "审查的要求或证据无法对应到原目标和版本");
const key = (value: unknown): value is string => typeof value === "string" && value.length <= 2800 && value.trim().length > 0;
const same = (a: unknown, b: unknown) => canonicalJsonText(a) === canonicalJsonText(b);
type Owner = Extract<ReviewTarget["owner"], { kind: "plugin"; scope: "project" }>;
type ReadDecision = (id: string) => ProjectTrustedDecision | null;

function reviewTarget(value: unknown, owner: Owner): ReviewTarget {
  if (!isRecord(value) || !key(value.version) || !isRecord(value.subject) || !key(value.subject.kind) || !key(value.subject.id)
    || !same(value.owner, owner)) throw invalid();
  return { subject: { kind: value.subject.kind, id: value.subject.id }, version: value.version, owner };
}

function reference(value: unknown, projectId: string): ReviewDecisionReference {
  if (!isRecord(value) || !key(value.decision_id) || !isRecord(value.reference) || !key(value.reference.id) || !key(value.reference.version)
    || !isRecord(value.reference.owner)) throw invalid();
  const { owner, id, version } = value.reference;
  if (owner.project_id !== projectId || !key(owner.plugin_id) || !key(owner.install_id)) throw invalid();
  const base = { project_id: projectId, plugin_id: owner.plugin_id, install_id: owner.install_id };
  if (owner.kind === "trusted-decision" && owner.scope === "project" && key(owner.installation_generation)) return {
    decision_id: value.decision_id, reference: { owner: { ...base, kind: "trusted-decision", scope: "project",
      installation_generation: owner.installation_generation }, id, version },
  };
  if (owner.kind !== "agent-review" && owner.kind !== "goal-acceptance") throw invalid();
  return { decision_id: value.decision_id, reference: { owner: { ...base, kind: owner.kind }, id, version } };
}

function reviewEvidence(values: unknown, owner: Owner): ReviewEvidence[] {
  if (!Array.isArray(values) || values.length > 32) throw invalid();
  return values.map((value: unknown) => {
    if (!isRecord(value)) throw invalid();
    const target = reviewTarget(value.target, owner);
    if (value.tier === "self_reported" || value.tier === "machine_checked") return { target, tier: value.tier };
    if (value.tier !== "person_accepted") throw invalid();
    return { target, tier: "person_accepted", decision: reference(value.decision, owner.project_id) };
  });
}

function requirement(value: unknown, owner: Owner) {
  if (!isRecord(value) || !key(value.id) || !key(value.version)) throw invalid();
  return { id: value.id, version: value.version, target: reviewTarget(value.target, owner), evidence: reviewEvidence(value.evidence, owner) };
}

function readRequirements(values: unknown, owner: Owner, read?: ReadDecision): ReviewRequirement[] {
  if (!Array.isArray(values) || values.length > 100) throw invalid();
  const requirements = values.map((value: unknown) => {
    if (!isRecord(value) || typeof value.statement !== "string" || !value.statement.trim() || value.statement.length > 2000
      || typeof value.requires_person !== "boolean") throw invalid();
    const row = requirement(value, owner);
    for (const evidence of row.evidence) if (read && evidence.tier === "person_accepted") {
      const original = read(evidence.decision.decision_id);
      if (!original || !same(original.reference, evidence.decision.reference) || !original.review.requirements.some(accepted =>
        accepted.disposition === "accepted" && accepted.id === row.id && accepted.version === row.version
        && same(accepted.target, row.target) && (same(accepted.target, evidence.target) ||
          accepted.evidence.some(prior => same(prior.target, evidence.target))))) throw invalid();
    }
    return { ...row, statement: value.statement, requires_person: value.requires_person };
  });
  if (new Set(requirements.map(row => row.id)).size !== requirements.length) throw invalid();
  return requirements;
}

export function assertProjectReviewCoverage(value: unknown, owner: ProjectTrustedDecision["reference"]["owner"]): ProjectReviewCoverage {
  if (!isRecord(value) || !Array.isArray(value.requirements) || value.requirements.length > 100) throw invalid();
  if (!isRecord(value.target) || !isRecord(value.target.owner) || !key(value.target.owner.provider_id)) throw invalid();
  const targetOwner: Owner = { ...owner, kind: "plugin", provider_id: value.target.owner.provider_id };
  const target = reviewTarget(value.target, targetOwner);
  const requirements = value.requirements.map((row: unknown) => {
    if (!isRecord(row) || (row.disposition !== "accepted" && row.disposition !== "returned")) throw invalid();
    return { ...requirement(row, targetOwner), disposition: row.disposition } as const;
  });
  const coverage = { target, requirements };
  if (new Set(requirements.map(row => row.id)).size !== requirements.length || !same(value, coverage)) throw invalid();
  return coverage;
}

export function reviewRequirementCoverage(requirements: readonly ReviewRequirement[], choice: ReviewRequest["choices"][number]): ProjectReviewCoverage["requirements"] {
  return requirements.flatMap(({ id, version, target, evidence }) => {
    const disposition = choice.accepts.includes(id) ? "accepted" : choice.returns.includes(id) ? "returned" : undefined;
    return disposition ? [{ id, version, target, evidence, disposition }] : [];
  });
}

function choiceText(value: unknown, owner: Owner, stored: boolean) {
  if (!stored || !isRecord(value) || !Object.hasOwn(value, "owner")) return tryOwnedTextRef(value, owner.plugin_id);
  const { owner: _owner, ...declared } = value;
  const bound = tryOwnedTextRef(declared, owner.plugin_id);
  return same(bound, value) ? bound : null;
}

function reviewChoice(value: unknown, owner: Owner, stored: boolean): ReviewRequest["choices"][number] {
  if (!isRecord(value) || !key(value.id) || value.id.length > 240 || !isRecord(value.availability)
    || typeof value.availability.available !== "boolean" || !Array.isArray(value.accepts) || !value.accepts.every(key)
    || !Array.isArray(value.returns) || !value.returns.every(key)) throw invalid();
  const label = choiceText(value.label, owner, stored);
  if (!label) throw invalid();
  const base = { id: value.id, label, accepts: value.accepts, returns: value.returns };
  const { available, code, reason } = value.availability;
  if (available) return { ...base, availability: { available: true } };
  const detail = choiceText(reason, owner, stored);
  if (!detail || !key(code)) throw invalid();
  return { ...base, availability: { available: false, code, reason: detail } };
}

/** A project command may describe only facts read by its registered review query. */
export function projectReviewPresentation(value: unknown, owner: Owner, read?: ReadDecision): TrustedReviewOffer["request"] {
  if (!isRecord(value) || typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 20_000
    || !Array.isArray(value.choices) || !value.choices.length || value.choices.length > 30
    || !isRecord(value.approver) || value.approver.kind !== "person" || value.approver.actor_id !== undefined && !key(value.approver.actor_id)
    || value.expires_at !== null && (typeof value.expires_at !== "string" || !Number.isFinite(Date.parse(value.expires_at)))) throw invalid();
  const requirements = readRequirements(value.requirements, owner, read);
  const ids = new Set(requirements.map(row => row.id));
  const choices = value.choices.map(row => reviewChoice(row, owner, !read));
  if (new Set(choices.map(row => row.id)).size !== choices.length || choices.some(({ accepts, returns }) => {
    const selected = [...accepts, ...returns];
    return new Set(selected).size !== selected.length || selected.some(id => !ids.has(id));
  })) throw invalid();
  return { summary: value.summary, requirements, approver: { kind: "person",
    ...(typeof value.approver.actor_id === "string" ? { actor_id: value.approver.actor_id } : {}) }, choices, expires_at: value.expires_at };
}

export function assertFrozenProjectReview(value: unknown, coverage: ProjectReviewCoverage, choiceId: string, actorId: string) {
  if (value === undefined) return;
  const { owner } = coverage.target;
  if (owner.kind !== "plugin" || owner.scope !== "project" || (canonicalJsonText(value)?.length ?? 100_001) > 100_000) throw invalid();
  const presentation = projectReviewPresentation(value, owner);
  const choice = presentation.choices.find(item => item.id === choiceId);
  if (!same(value, presentation) || !choice?.availability.available || (presentation.approver.actor_id && presentation.approver.actor_id !== actorId)
    || !same(coverage.requirements, reviewRequirementCoverage(presentation.requirements, choice))) throw invalid();
}
