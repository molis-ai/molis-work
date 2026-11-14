import { createHash, randomUUID } from "node:crypto";
import { ActionError, type ActionCallContext, type ActionUserAction, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  TRUSTED_REVIEW_COMMAND_SCHEMA, TRUSTED_REVIEW_LOOKUP_SCHEMA, TRUSTED_REVIEW_READ_SCHEMA, type ProjectReviewCoverage, type ProjectTrustedDecision, type TrustedReviewCommand, type TrustedReviewLookup, type TrustedReviewOffer,
  type TrustedReviewRead,
  type TrustedReviewReference,
} from "@molis-ai/molis-work-contracts/services/project-approvals";
import { assertActionInput, withTrustedDecision } from "@molis-ai/molis-work-kernel";
import { assertSandboxJson, canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { projectApprovalRules, projectReviewDecisions, projectReviewPresentation, reviewRequirementCoverage } from "@molis-ai/molis-work-service-project-approvals";
import { withProtectedHostAction } from "./plugin-consent-settings-entry.js";
import { bindProjectReview } from "./project-review-effect.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const missing = () => new ActionError("actions.missing", "找不到当前项目和原安装的决定请求");
const stale = () => new ActionError("actions.conflict", "待审对象、范围或选项已变化，请重新查看");
const fullId = (owner: TrustedReviewReference["owner"], action: ExactActionReference, requestId: string, roundId?: string) =>
  JSON.stringify([owner.install_id, owner.installation_generation, action.capability_id, action.version, action.provider_id, requestId, ...(roundId ? [roundId] : [])]);
const same = (left: unknown, right: unknown) => canonicalJsonText(left) === canonicalJsonText(right);
const draftLifetime = 10 * 60_000;
const drafts = new WeakMap<MolisWorkLocalHost, Map<string, { project: string; actor: string; lookup: TrustedReviewLookup; expires: number }>>();

export interface ProtectedReviewEntry {
  readonly caller: ActionCallContext;
  readonly action: ActionUserAction & { readonly source: "web" | "management" };
  assertCurrent(): void;
}

export async function readProjectReview(host: MolisWorkLocalHost, project: LocalHostProjectReference, input: unknown, entry: ProtectedReviewEntry): Promise<ReviewRequest> {
  assertActionInput(TRUSTED_REVIEW_READ_SCHEMA, input);
  const read = input as TrustedReviewRead;
  if ("reference" in read) return readByReference(host, project, read.reference, entry);
  const held = await loadOffer(host, project, read, entry);
  const record = await inReviewLibrary(host, project, entry, decisions => decisions.forRequest(held.view.reference.id));
  held.assertCurrent();
  if (record && !same(record.reference, held.view.reference)) throw stale();
  if (read.draft) holdDraft(host, project.project_id, held.caller.actor_id, held.view.reference, read);
  return presentReview(held, record);
}

async function readByReference(host: MolisWorkLocalHost, project: LocalHostProjectReference, reference: TrustedReviewReference, entry: ProtectedReviewEntry) {
  if (reference.owner.project_id !== project.project_id) throw missing();
  const locator = reviewLookup(reference);
  const registered = await holdCommand(host, project, locator, entry);
  if (!same(registered.owner, reference.owner)) throw missing();
  const readSettled = async () => {
    const record = await inReviewLibrary(host, project, entry, decisions => decisions.forRequest(reference.id));
    registered.assertCurrent();
    if (!record) return null;
    if (!same(record.reference, reference)) throw stale();
    return presentSettledReview(record, registered.targetOwner);
  };
  const original = await readSettled();
  if (original) return original;
  let held: Awaited<ReturnType<typeof loadOffer>>;
  try {
    held = await loadOffer(host, project, heldDraft(host, project.project_id, entry.caller.actor_id, reference, locator), entry, registered);
  } catch (error) {
    const settled = await readSettled();
    if (settled) return settled;
    throw error;
  }
  const settled = await readSettled();
  if (settled) return settled;
  if (!same(held.view.reference, reference)) throw stale();
  held.assertCurrent();
  return presentReview(held, null);
}

/** A settled request reopens the exact facts the person saw. */
function presentSettledReview(record: ProjectTrustedDecision, owner: ProjectReviewCoverage["target"]["owner"]): ReviewRequest {
  const original = record.presentation, { target } = record.review, { reference } = record;
  if (!original || !same(target.owner, owner)) throw missing();
  return { ...original, reference, target, choices: original.choices.map(choice => ({ ...choice,
    availability: { available: false, code: "actions.conflict", reason: { literal: "此请求已有决定" } } })),
    decision: { reference, decision_id: record.decision_id } };
}

function presentReview(held: Awaited<ReturnType<typeof loadOffer>>, record: ProjectTrustedDecision | null): ReviewRequest {
  const unavailable = record ? { code: "actions.conflict", reason: { literal: "此请求已有决定" } }
    : held.view.expires_at && Date.now() >= Date.parse(held.view.expires_at) ? { code: "actions.expired", reason: { literal: "原决定请求已过期" } }
    : held.view.approver.actor_id && held.view.approver.actor_id !== held.caller.actor_id ? { code: "actions.forbidden", reason: { literal: "需要指定的本人决定" } }
    : null;
  return { ...held.view,
    choices: held.view.choices.map(choice => {
      const reason = unavailable ?? (!choice.availability.available || Object.hasOwn(held.commands, choice.id)
        ? null : { code: "actions.conflict", reason: { literal: "原选项已不可用" } });
      return reason ? { ...choice, availability: { available: false, ...reason } } : choice;
    }),
    ...(record ? { decision: { reference: record.reference, decision_id: record.decision_id } } : {}) };
}

/** The operation is the same for Web and management MCP. Only either authenticated transport supplies entry authority. */
export async function decideProjectReview(host: MolisWorkLocalHost, project: LocalHostProjectReference, input: unknown, entry: ProtectedReviewEntry) {
  assertActionInput(TRUSTED_REVIEW_COMMAND_SCHEMA, input);
  const command = structuredClone(input) as TrustedReviewCommand;
  if (command.reference.owner.project_id !== project.project_id) throw missing();
  const locator = reviewLookup(command.reference);
  // A transport retry after a successful commit returns its stored receipt even when the owner's pending request has since closed.
  const registered = await holdCommand(host, project, locator, entry);
  if (!same(registered.owner, command.reference.owner)) throw missing();
  const prior = await inReviewLibrary(host, project, entry, decisions => decisions.sameRequest(command, entry.caller.actor_id));
  if (prior) { registered.assertCurrent(); return { record: prior, replayed: true }; }
  const lookup = heldDraft(host, project.project_id, entry.caller.actor_id, command.reference, locator);
  const held = await loadOffer(host, project, lookup, entry, registered);
  const choice = held.view.choices.find(option => option.id === command.choice_id);
  if (!same(held.view.reference, command.reference) || !choice?.availability.available
    || !Object.hasOwn(held.commands, command.choice_id)) throw stale();
  if (held.view.approver.actor_id && held.view.approver.actor_id !== entry.caller.actor_id) throw new ActionError("actions.forbidden", "此请求需要指定的本人决定");
  const frozenChoice = structuredClone(held.commands[command.choice_id]);
  const { caller } = held;
  const wholeSubject = held.wholeChoices?.includes(choice.id) ? held.view.target.subject.id : undefined;
  const coverage: ProjectReviewCoverage = { target: held.view.target, requirements: reviewRequirementCoverage(held.view.requirements, choice) };
  const control = host.prepareActionReview(held.caller, held.definition, frozenChoice, project, held.reader);
  const assertCurrent = () => {
    held.assertCurrent();
    if (held.view.expires_at && Date.now() >= Date.parse(held.view.expires_at)) throw new ActionError("actions.expired", "原决定请求已过期");
    if (held.rules.read(false).revision !== held.rulesRevision) throw stale();
    control.assertCurrent();
  };
  assertCurrent();
  const reference = { ...lookup.action, provider_id: held.definition.provider.provider_id };
  const decisionId = randomUUID();
  const deadline = held.view.expires_at ? Date.parse(held.view.expires_at) : undefined;
  const beforeEffect = async () => {
    const prior = await inReviewLibrary(host, project, entry, decisions => decisions.sameRequest(command, entry.caller.actor_id, frozenChoice));
    if (prior?.decision_id !== decisionId) {
      if (prior) throw stale();
      const latest = await loadOffer(host, project, lookup, entry, registered);
      if (!same(latest.view.reference, command.reference) || !latest.view.choices.find(row => row.id === command.choice_id)?.availability.available) throw stale();
    }
    await control.beforeEffect();
    assertCurrent();
  };
  const readReceipt = async () => {
    registered.assertCurrent();
    const record = await inReviewLibrary(host, project, entry, decisions => decisions.sameRequest(command, caller.actor_id, frozenChoice));
    registered.assertCurrent();
    return record;
  };
  const attachExecution = bindProjectReview({
    command, decisionId, frozenChoice, rulesRevision: held.rulesRevision, actor_id: caller.actor_id, deadline,
    entry: { ...entry.action, ...(wholeSubject ? { whole_confirmation_prompted: true, prompted_subject_id: wholeSubject } : {}) },
    review: { publisher_signature: held.publisherSignature, review: coverage,
      presentation: { summary: held.view.summary, approver: held.view.approver, requirements: held.view.requirements,
        choices: held.view.choices, expires_at: held.view.expires_at } },
  });
  return withProtectedHostAction(entry.action, () => withTrustedDecision({
    actor_id: caller.actor_id, project_id: project.project_id, entry: entry.action,
    action: reference, input: frozenChoice, attachExecution, assertCurrent, beforeEffect,
  }, async submitted => {
    try {
      const result = await host.actionClient(project).invoke(caller, reference, frozenChoice);
      const record = await readReceipt();
      if (!record) throw new ActionError("actions.unredeemed", "原动作没有在项目事务内保存决定");
      return { record, replayed: false, result };
    } catch (error) {
      if (!submitted() && (!(error instanceof ActionError) || error.code !== "actions.conflict")) throw error;
      try {
        const record = await readReceipt();
        if (record) return { record, replayed: true };
      } catch (readError) {
        if (!submitted()) throw readError;
      }
      if (!submitted()) throw error;
      throw new ActionError("actions.outcome_unknown", "原决定可能已提交，请用原操作编号核对");
    }
  }));
}

async function holdCommand(host: MolisWorkLocalHost, project: LocalHostProjectReference, lookup: TrustedReviewLookup, entry: ProtectedReviewEntry) {
  entry.assertCurrent();
  const caller: ActionCallContext = { ...entry.caller, actor_kind: "user", user_action: entry.action };
  const rows = host.inspectActionMetadata(caller, project);
  const row = rows.find(view => view.capability_id === lookup.action.capability_id && view.version === lookup.action.version
    && view.provider.provider_id === lookup.action.provider_id && view.provider.project_id === project.project_id && view.provider.kind === "plugin"
    && view.action.requires_trusted_decision === true);
  if (!row?.provider.plugin_id || !row.provider.plugin_install_id || !row.action.trusted_decision_request) throw missing();
  const reader = { ...row.action.trusted_decision_request, provider_id: row.provider.provider_id };
  const related = rows.find(view => view.capability_id === reader.capability_id && view.version === reader.version
    && view.provider.provider_id === reader.provider_id && view.provider.plugin_install_id === row.provider.plugin_install_id);
  if (!related) throw missing();
  const installations = await host.projectActionInstallations(project), install = installations?.get(row.provider.plugin_install_id);
  if (!install || install.plugin_id !== row.provider.plugin_id || !install.installation_generation || install.state !== "running") throw missing();
  const owner = { kind: "trusted-decision", scope: "project", project_id: project.project_id, plugin_id: install.plugin_id,
    install_id: install.install_id, installation_generation: install.installation_generation } as const;
  const preparedReader = host.prepareActionReview(caller, { ...related, availability: { available: true } },
    { request_id: lookup.request_id }, project, lookup.action);
  const assertCurrent = () => {
    entry.assertCurrent();
    const current = installations!.get(install.install_id);
    if (current?.installation_generation !== install.installation_generation || current.state !== "running"
      || !row.action.permissions.every(permission => current.grants.includes(permission))) throw missing();
    preparedReader.assertCurrent();
  };
  await preparedReader.beforeEffect();
  assertCurrent();
  const targetOwner = { ...owner, kind: "plugin", provider_id: reader.provider_id } as const;
  return { caller, definition: { ...row, availability: { available: true as const } }, reader, owner,
    targetOwner, publisherSignature: install.publisher_signature, assertCurrent };
}

async function loadOffer(host: MolisWorkLocalHost, project: LocalHostProjectReference, lookup: TrustedReviewLookup, entry: ProtectedReviewEntry,
  existing?: Awaited<ReturnType<typeof holdCommand>>) {
  const held = existing ?? await holdCommand(host, project, lookup, entry);
  const { rules, decisions } = await host.withProject(project, ({ store }) => ({
    rules: projectApprovalRules(store.db, project.project_id), decisions: projectReviewDecisions(store.db, project.project_id),
  }));
  held.assertCurrent();
  const rulesRevision = rules.read(false).revision;
  if (lookup.draft && (canonicalJsonText(lookup.draft)?.length ?? 100_001) > 100_000) throw new ActionError("actions.input_invalid", "审查草稿过长");
  const candidate = await host.actionClient(project).invoke({ ...held.caller, read_only_effects: true }, held.reader,
    { request_id: lookup.request_id, ...(lookup.draft ? { draft: lookup.draft } : {}) });
  held.assertCurrent();
  if (rules.read(false).revision !== rulesRevision) throw stale();
  const { request, target, commands, whole_choices, round_id } = reviewOffer(candidate, held.definition.action.subject_kinds, held.targetOwner, decisions.findCommitted);
  for (const command of Object.values(commands)) assertActionInput(held.definition.action.input_schema, command);
  const version = createHash("sha256").update(canonicalJsonText([held.owner, lookup.action, lookup.request_id, lookup.draft, rulesRevision, target, request.requirements,
    request.summary, request.approver, request.choices.map(({ id, label, accepts, returns }) => [id, label, accepts, returns]),
    commands, whole_choices, round_id, request.expires_at], "null")).digest("hex");
  const reference: TrustedReviewReference = { owner: held.owner, id: fullId(held.owner, lookup.action, lookup.request_id, round_id), version };
  const view: ReviewRequest & { reference: TrustedReviewReference } = { ...request, reference,
    target: { ...target, owner: held.targetOwner } };
  return { ...held, view, commands, wholeChoices: whole_choices, rules, rulesRevision };
}

function holdDraft(host: MolisWorkLocalHost, project: string, actor: string, reference: TrustedReviewReference, lookup: TrustedReviewLookup) {
  const current = drafts.get(host) ?? new Map();
  const now = Date.now();
  for (const [key, value] of current) if (value.expires <= now) current.delete(key);
  if (current.size >= 100 && !current.has(reference.version)) throw new ActionError("actions.conflict", "待审草稿已达上限，请稍后再试");
  current.set(reference.version, { project, actor, lookup: structuredClone(lookup), expires: now + draftLifetime });
  drafts.set(host, current);
}

function heldDraft(host: MolisWorkLocalHost, project: string, actor: string, reference: TrustedReviewReference, locator: TrustedReviewLookup): TrustedReviewLookup {
  const cached = drafts.get(host)?.get(reference.version);
  if (cached && (cached.project !== project || cached.actor !== actor || cached.expires <= Date.now()
    || !same(cached.lookup.action, locator.action) || cached.lookup.request_id !== locator.request_id)) throw stale();
  return cached?.lookup ?? locator;
}

function assertReviewJson(value: unknown): void {
  assertSandboxJson(value, () => { throw missing(); });
}

function reviewOffer(value: unknown, kinds: readonly string[], owner: Parameters<typeof projectReviewPresentation>[1],
  read: (id: string) => ProjectTrustedDecision | null): TrustedReviewOffer {
  assertReviewJson(value);
  if (!isRecord(value) || !isRecord(value.target) || !isRecord(value.commands)) throw missing();
  const t = value.target;
  if (!isRecord(t.subject) || typeof t.subject.kind !== "string" || !kinds.includes(t.subject.kind)
    || typeof t.subject.id !== "string" || !t.subject.id.trim() || typeof t.version !== "string" || !t.version.trim()
    || (canonicalJsonText(value)?.length ?? 100_001) > 100_000) throw missing();
  const request = projectReviewPresentation(value.request, owner, read);
  const ids = new Set(request.choices.map(choice => choice.id));
  if (Object.keys(value.commands).some(id => !ids.has(id))) throw missing();
  const whole = value.whole_choices;
  if (whole !== undefined && (!Array.isArray(whole) || new Set(whole).size !== whole.length || !whole.every(id => typeof id === "string" && ids.has(id)))) throw missing();
  const round = value.round_id;
  if (round !== undefined && (typeof round !== "string" || !round.trim() || round.length > 240)) throw missing();
  return {
    request,
    target: { subject: { kind: t.subject.kind, id: t.subject.id }, version: t.version },
    commands: value.commands,
    ...(typeof round === "string" ? { round_id: round } : {}),
    ...(Array.isArray(whole) ? { whole_choices: whole as readonly string[] } : {}),
  };
}

function reviewLookup(reference: TrustedReviewReference): TrustedReviewLookup {
  let parts: unknown;
  try { parts = JSON.parse(reference.id); } catch { throw missing(); }
  if (!Array.isArray(parts) || (parts.length !== 6 && parts.length !== 7)
    || parts[0] !== reference.owner.install_id || parts[1] !== reference.owner.installation_generation) throw missing();
  const [, , capability_id, version, provider_id, request_id] = parts;
  const lookup = { action: { capability_id, version, provider_id }, request_id };
  assertActionInput(TRUSTED_REVIEW_LOOKUP_SCHEMA, lookup);
  return lookup;
}

async function inReviewLibrary<T>(host: MolisWorkLocalHost, project: LocalHostProjectReference, entry: ProtectedReviewEntry,
  read: (decisions: ReturnType<typeof projectReviewDecisions>) => T): Promise<T> {
  return host.withProject(project, runtime => { entry.assertCurrent(); return read(projectReviewDecisions(runtime.store.db, project.project_id)); });
}
