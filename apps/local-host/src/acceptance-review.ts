import { createHash } from "node:crypto";
import { ActionError, LOCAL_PERSON_ACTOR_ID, isSubjectReader, type ActionCallContext, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ReviewEvidence, ReviewRequest, ReviewRequirement, ReviewTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  ACCEPTANCE_PROVIDER_ID, ACCEPTANCE_READ_MAX, acceptanceActions, acceptanceErrors, acceptanceRequestId, parseAcceptanceRequestId,
  type AcceptanceCheck, type AcceptanceDecideRequest, type AcceptanceReviewRequest, type AcceptanceSubject, type AcceptanceView,
} from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { ProjectTrustedDecision, TrustedReviewOffer } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { acceptanceSubjectOf, type AssistantLineAcceptance } from "./assistant/assistant-line-actions.js";
import type { StoredWork } from "./assistant/assistant-store.js";
import { decideProjectReview, readProjectReview, type ProtectedReviewEntry, type ReadReviewEntry } from "./project-review-commands.js";
import { hasProtectedWebAction } from "./plugin-consent-settings-entry.js";
import { projectReviewPerson } from "./project-review-entry.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { withProjectAcceptance } from "./acceptance-library.js";

export const ACCEPTANCE_DECIDE_ACTION = {
  capability_id: acceptanceActions.decide.capability_id,
  version: acceptanceActions.decide.version,
  provider_id: ACCEPTANCE_PROVIDER_ID,
} as const;

const missing = () => new ActionError("actions.missing", "找不到当前项目里这份交付的待审请求");
const same = (a: unknown, b: unknown) => canonicalJsonText(a) === canonicalJsonText(b);
const digest = (value: unknown) => createHash("sha256").update(canonicalJsonText(value, "null")).digest("hex");

export function acceptanceSubjectFromReview(input: AcceptanceReviewRequest): AcceptanceSubject {
  const parsed = parseAcceptanceRequestId(input.request_id);
  if (!parsed) throw missing();
  return parsed;
}

/**
 * When the object's owner declares a subject reader in this project, the caller must also be allowed to read that object;
 * a caller without read permission gets no requirement text or evidence details (APR-16).
 */
export async function assertAcceptanceObjectReadable(
  caller: ActionCallContext,
  client: ActionClient,
  host: MolisWorkLocalHost | undefined,
  project: LocalHostProjectReference | undefined,
  subject: AcceptanceSubject,
): Promise<void> {
  if (!host || !project) return;
  const declared = (await host.inspectPreparedActionMetadata(caller, project)).filter(view =>
    view.provider.provider_id === subject.provider_id
    && isSubjectReader(view.action)
    && view.action.subject_kinds.includes(subject.subject.kind));
  if (!declared.length) return;
  const discovered = await client.discover({ ...caller, query_only: true });
  const readable = declared.some(reader => discovered.some(view =>
    view.capability_id === reader.capability_id
    && view.version === reader.version
    && view.provider.provider_id === subject.provider_id
    && view.availability.available));
  if (!readable) throw new ActionError("actions.forbidden", "没有读取原对象的权限");
}

function checkEvidence(requestId: string, itemId: string, check: AcceptanceCheck, owner: Extract<ReviewTarget["owner"], { kind: "system"; scope: "project" }>): ReviewEvidence {
  const passed = check.verdict === "supports" && (check.tier === "machine_checked" || check.tier === "peer_reviewed") && check.gap === null;
  return {
    tier: passed ? check.tier : "self_reported",
    target: {
      owner,
      subject: { kind: "acceptance_check", id: `${requestId}:${itemId}:${check.kind}` },
      version: digest([check.requirement_version, check.checked_version, check.verdict, check.tier, check.gap, check.method, check.observed, check.evidence]),
    },
  };
}

export function acceptanceStateDigest(view: AcceptanceView): string {
  return digest([
    view.subject,
    view.version,
    view.round,
    view.requirements.map(item => [
      item.id, item.version, item.statement, item.expected, item.part, item.requires_person,
      item.stands_on, item.carried, item.recheck, item.verified, item.gap, item.person,
      item.decision?.decision_id ?? null, item.check, item.hands_on,
    ]),
  ]);
}

export function buildAcceptanceReviewOffer(
  view: AcceptanceView,
  projectId: string,
  input: AcceptanceReviewRequest,
  findCommitted: (id: string) => ProjectTrustedDecision | null,
  actorId: string,
): TrustedReviewOffer {
  if (!view.requirements.length || view.version === null) throw missing();
  const requestId = acceptanceRequestId(view.subject);
  if (requestId !== input.request_id) throw missing();
  const owner = { kind: "system", scope: "project", project_id: projectId, provider_id: ACCEPTANCE_PROVIDER_ID } as const;
  const stateVersion = acceptanceStateDigest(view);
  const target = { subject: { kind: "acceptance_subject", id: requestId }, version: stateVersion };
  const requirements: ReviewRequirement[] = view.requirements.map(item => {
    const reqTarget: ReviewTarget = {
      owner,
      subject: { kind: "acceptance_requirement", id: `${requestId}:${item.id}` },
      version: `r${item.version}@${item.stands_on ?? "none"}`,
    };
    const evidence: ReviewEvidence[] = [];
    if (item.check) evidence.push(checkEvidence(requestId, item.id, item.check, owner));
    if (item.hands_on) evidence.push(checkEvidence(requestId, item.id, item.hands_on, owner));
    if (item.person === "accepted" && item.decision) {
      const committed = findCommitted(item.decision.decision_id);
      if (committed && committed.actor_id === actorId && committed.review.requirements.some(accepted =>
        accepted.disposition === "accepted" && accepted.id === item.id && accepted.version === String(item.version) && same(accepted.target, reqTarget))) {
        evidence.push({ tier: "person_accepted", target: reqTarget, decision: { reference: committed.reference, decision_id: committed.decision_id } });
      }
    }
    return { id: item.id, version: String(item.version), target: reqTarget, statement: item.statement, requires_person: item.requires_person, evidence };
  });

  if (input.draft) {
    return buildDraftAcceptanceOffer(view, target, requirements, input.draft);
  }

  const open = view.requirements.filter(item => item.stands_on !== null && item.person === "pending" && item.recheck !== "returned");
  const summary = `交付 ${view.version}（待认可 ${open.length}/${view.counts.needs_person}）`;
  const choices: TrustedReviewOffer["request"]["choices"][number][] = [
    {
      id: "accept_all",
      label: { literal: "认可全部待确认项" },
      accepts: open.map(item => item.id),
      returns: [],
      availability: open.length > 0
        ? { available: true }
        : { available: false, code: "actions.conflict", reason: { literal: "当前没有待本人认可的要求" } },
    },
    ...open.map(item => ({
      id: `accept:${item.id}`,
      label: { literal: `认可「${(item.part ?? item.statement).slice(0, 40)}」` },
      accepts: [item.id],
      returns: [] as readonly string[],
      availability: { available: true as const },
    })),
  ];
  const commands: Record<string, AcceptanceDecideRequest> = open.length > 0
    ? {
        accept_all: { subject: view.subject, version: view.version, accepts: open.map(item => ({ id: item.id, version: item.version })), returns: [] },
        ...Object.fromEntries(open.map(item => [`accept:${item.id}`, { subject: view.subject, version: view.version!, accepts: [{ id: item.id, version: item.version }], returns: [] }])),
      }
    : {};
  return {
    target,
    round_id: stateVersion.slice(0, 32),
    request: { summary, requirements, approver: { kind: "person" }, choices, expires_at: null },
    commands,
    ...(open.length > 0 ? { whole_choices: ["accept_all"] } : {}),
  };
}

function buildDraftAcceptanceOffer(
  view: AcceptanceView,
  target: TrustedReviewOffer["target"],
  requirements: readonly ReviewRequirement[],
  draft: Readonly<Record<string, unknown>>,
): TrustedReviewOffer {
  const version = typeof draft.version === "string" ? draft.version.trim() : "";
  const rawAccepts = Array.isArray(draft.accepts) ? draft.accepts : null;
  const rawReturns = Array.isArray(draft.returns) ? draft.returns : null;
  const expiresAt = draft.expires_at === undefined || draft.expires_at === null ? null : typeof draft.expires_at === "string" ? draft.expires_at : undefined;
  if (!version || !rawAccepts || !rawReturns || expiresAt === undefined || (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt)))) {
    throw acceptanceErrors.invalid("审查草稿缺少有效的交付版本或要求选择");
  }
  const accepts = rawAccepts.map(item => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || !Number.isSafeInteger(item.version) || Number(item.version) < 1) {
      throw acceptanceErrors.invalid("认可项需要有效编号与版本");
    }
    return { id: item.id.trim(), version: Number(item.version) };
  });
  const returns = rawReturns.map(item => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || !Number.isSafeInteger(item.version) || Number(item.version) < 1 || typeof item.note !== "string") {
      throw acceptanceErrors.invalid("退回项需要有效编号、版本与原因");
    }
    const note = item.note.trim();
    if (!note) throw acceptanceErrors.note_required("退回要写原因");
    return { id: item.id.trim(), version: Number(item.version), note };
  });
  const ids = [...accepts.map(item => item.id), ...returns.map(item => item.id)];
  if (!ids.length || new Set(ids).size !== ids.length) throw acceptanceErrors.invalid("要列出认可或退回的要求，同一项只能出现一次");
  if (view.version !== version) throw acceptanceErrors.selection_changed("交付的版本在你看过之后变了，请按现在的版本再看一遍", { version: view.version });
  for (const selected of [...accepts, ...returns]) {
    const current = view.requirements.find(item => item.id === selected.id);
    if (!current) throw acceptanceErrors.requirement_unknown("报告的要求不在清单里", { requirement_id: selected.id });
    if (current.version !== selected.version) throw acceptanceErrors.selection_changed("有一项要求在你看过之后变了，请按现在的内容再看一遍", { requirement_id: selected.id });
  }
  const command: AcceptanceDecideRequest = { subject: view.subject, version, accepts, returns };
  const label = returns.length ? (accepts.length ? "提交认可与退回" : "退回所选要求") : "认可所选要求";
  return {
    target,
    round_id: digest([target.version, command, expiresAt]).slice(0, 32),
    request: {
      summary: `交付 ${view.version} · ${label}`,
      requirements,
      approver: { kind: "person" },
      choices: [{ id: "apply", label: { literal: label }, availability: { available: true }, accepts: accepts.map(item => item.id), returns: returns.map(item => item.id) }],
      expires_at: expiresAt,
    },
    commands: { apply: command },
  };
}

/**
 * Assistant tasks with delivered requirements waiting on the person share the same `ReviewReference` as the acceptance card
 * and commit through the same protected trusted-decision entry (APR-15, APR-16).
 */
export function assistantLineAcceptance(ports: {
  localHost: MolisWorkLocalHost;
  projectReference?: (projectId: string) => Promise<LocalHostProjectReference>;
}): AssistantLineAcceptance {
  return {
    async read(projectId, works, rawCaller) {
      if (!works.length || !ports.projectReference) return new Map();
      const subjects = works.map(work => ({ work, subject: acceptanceSubjectOf(work) }));
      const openByWork = new Map<string, StoredWork>();
      const project = await ports.projectReference(projectId);
      await withProjectAcceptance(ports.localHost, project, service => {
        for (let at = 0; at < subjects.length; at += ACCEPTANCE_READ_MAX) {
          const part = subjects.slice(at, at + ACCEPTANCE_READ_MAX);
          const { views } = service.read({ project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, person: true, session: null }, { subjects: part.map(item => item.subject) });
          part.forEach((item, index) => {
            const view = views[index]!;
            if (view.version !== null && view.requirements.some(req => req.stands_on !== null && req.person === "pending" && req.recheck !== "returned")) {
              openByWork.set(item.work.work_id, item.work);
            }
          });
        }
      });
      if (!openByWork.size) return new Map();
      const assertCurrent = () => {
        rawCaller?.signal?.throwIfAborted();
        if (ports.localHost.lifecycle() !== "running") throw new ActionError("actions.host_closed", "宿主正在关闭");
      };
      const caller = await projectReviewPerson({ host: ports.localHost, project }, rawCaller?.signal, assertCurrent);
      const entry: ReadReviewEntry = { caller, ...(rawCaller?.user_action ? { action: rawCaller.user_action } : {}), assertCurrent };
      const out = new Map<string, ReviewRequest>();
      for (const [workId, work] of openByWork) {
        try {
          const review = await readProjectReview(ports.localHost, project, { action: ACCEPTANCE_DECIDE_ACTION, request_id: acceptanceRequestId(acceptanceSubjectOf(work)) }, entry);
          out.set(workId, review);
        } catch { /* unreadable or closed */ }
      }
      return out;
    },
    async decide(work, input, boundary, rawCaller) {
      if (!work.project_ref) return false;
      const project = work.project_ref;
      const userAction = rawCaller?.user_action;
      if (!hasProtectedWebAction(userAction)) throw new ActionError("actions.forbidden", "这项操作需要在本人决定入口批准原请求");
      const assertCurrent = () => {
        rawCaller?.signal?.throwIfAborted();
        boundary?.assertCurrent?.();
        if (ports.localHost.lifecycle() !== "running") throw new ActionError("actions.host_closed", "宿主正在关闭");
      };
      await boundary?.beforeEffect?.();
      assertCurrent();
      const personCaller = await projectReviewPerson({ host: ports.localHost, project }, rawCaller?.signal, assertCurrent);
      const entry: ProtectedReviewEntry = {
        caller: personCaller,
        action: userAction,
        assertCurrent,
      };
      const subject = acceptanceSubjectOf(work), requestId = acceptanceRequestId(subject);
      const standing = await readProjectReview(ports.localHost, project, { action: ACCEPTANCE_DECIDE_ACTION, request_id: requestId }, entry);
      if (standing.reference.version !== input.version) throw new ActionError("actions.conflict", "待审对象、范围或选项已变化，请重新查看");
      if (input.decision === "approve") {
        await decideProjectReview(ports.localHost, project, { reference: standing.reference, choice_id: "accept_all", request_key: userAction.message_ref }, entry);
        return true;
      }
      const note = input.note?.trim() ?? "";
      if (!note) throw acceptanceErrors.note_required("退回要写原因");
      const view: AcceptanceView = await withProjectAcceptance(ports.localHost, project, service =>
        service.read({ project_id: project.project_id, actor_id: personCaller.actor_id, person: true, session: null }, { subjects: [subject] }).views[0]!);
      const openItems = view.requirements.filter(req => req.stands_on !== null && req.person === "pending" && req.recheck !== "returned");
      if (!view.version || !openItems.length) throw new ActionError("actions.conflict", "当前没有待退回的要求");
      const prepared = await readProjectReview(ports.localHost, project, {
        action: ACCEPTANCE_DECIDE_ACTION,
        request_id: requestId,
        draft: { version: view.version, accepts: [], returns: openItems.map(item => ({ id: item.id, version: item.version, note })) },
      }, entry);
      await decideProjectReview(ports.localHost, project, { reference: prepared.reference, choice_id: "apply", request_key: userAction.message_ref }, entry);
      return true;
    },
  };
}
