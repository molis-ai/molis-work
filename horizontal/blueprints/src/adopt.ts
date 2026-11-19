import { ActionError, requireSynchronous, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { EffectiveSetting } from "@molis-ai/molis-work-contracts/platform/settings";
import { blueprintsErrors, type BlueprintAdoptionApplyInput, type BlueprintAdoptionApplyResult, type BlueprintAdoptionReadResult,
  type BlueprintAdoptionUndoInput, type BlueprintAdoptionUndoResult, type BlueprintApplyStep, type BlueprintOwnerReceipt,
  type UndoResult, type UndoStep } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { AdoptionStore, DiscoveredSetting, SettingPlan, StepRecord } from "./store.js";
import { readOwnerValues, sameBinding, type SettingsAccess } from "./preview.js";

type Operation = UndoResult["operation"];
type RecordView = ReturnType<AdoptionStore["load"]>;
type Guard = ActionExecutionContext;
type PendingOwnerStatus = Extract<BlueprintApplyStep, { state: "pending_verification" }>["current"];
export type AdoptionProgress = { preview_id: string; adoption_id: string; project_id: string | null } & (
  { kind: "accepted" | "target_created" } | { kind: "apply"; step: BlueprintApplyStep } | { kind: "undo"; undo: Pick<UndoResult, "request_id" | "operation">; step: UndoStep }
);

export function assertCurrent(caller: Guard): void {
  requireSynchronous(caller.assert_authority_current?.(), "采用授权检查必须同步完成");
  caller.signal?.throwIfAborted();
}
async function beforeWrite(caller: Guard): Promise<void> {
  await caller.beforeEffect();
  assertCurrent(caller);
}

function identity({ row, preview }: RecordView): Omit<BlueprintAdoptionApplyResult, "steps"> {
  if (!row.adoption_id) throw blueprintsErrors.step_conflict("此预览还没有采用");
  const target = row.project_id ? { kind: "project" as const, project_id: row.project_id } : { kind: "personal" as const };
  return { adoption_id: row.adoption_id, target, locale: preview.locale, source: preview.source };
}
function ownerReceipt(plan: SettingPlan, value: EffectiveSetting): BlueprintOwnerReceipt {
  return { action: plan.binding.write, subject: { kind: "setting", id: plan.key }, revision: value.revision };
}
function sameObservedLayer(plan: SettingPlan, fullRevision: string | number, current: EffectiveSetting, layerRevision?: string): boolean {
  const now = current.state === "ok" ? current.layer_revisions?.[plan.layer] : undefined;
  return now !== undefined && layerRevision !== undefined ? now === layerRevision : current.revision === fullRevision;
}
function verifiedStep(part_id: string, plan: SettingPlan, current?: EffectiveSetting, receipt?: BlueprintOwnerReceipt): BlueprintApplyStep | undefined {
  if (receipt) {
    if (!current) return undefined;
    const observed = !sameObservedLayer(plan, receipt.revision, current, plan.applied_layer_revision) ? "changed" : current.state === "unavailable" || current.value_unavailable ? "owner_unavailable" : undefined;
    return { part_id, state: "applied", outcome: "modified", receipt, ...(observed && { current: observed }) };
  }
  if (current?.state !== "ok" || current.value_unavailable) return { part_id, state: "skipped", reason: "owner_unavailable" };
  if (!sameObservedLayer(plan, plan.expected_revision, current, plan.original_layer_revision)) return { part_id, state: "skipped", reason: "revision_changed" };
  const observed = current.layer_revisions?.[plan.layer];
  if (observed !== undefined) plan.applied_layer_revision = observed;
  return { part_id, state: "applied", outcome: "reused" };
}
function knownFailure(error: unknown) {
  if (error instanceof ActionError && ["invalid", "conflict", "forbidden", "not_found"].includes(error.kind ?? "")) return { code: error.code, message: error.message };
  return undefined;
}

function ownerProblem(owners: readonly DiscoveredSetting[], plan: SettingPlan | null): PendingOwnerStatus {
  if (!plan) return undefined;
  const original = plan.binding;
  const candidates = owners.filter(({ entry, binding }) => entry.key === plan.key
    && binding.provider_id === original.provider_id && binding.project_scoped === original.project_scoped);
  if (candidates.some(owner => !owner.unavailable && sameBinding(owner.binding, original))) return undefined;
  const replaced = original.generation !== undefined && candidates.some(({ binding }) =>
    binding.generation !== undefined && (binding.generation !== original.generation || binding.install_id !== original.install_id));
  return replaced ? "owner_replaced" : "owner_unavailable";
}

function withOwnerStatus<Step extends BlueprintApplyStep | UndoStep>(step: Step, current: PendingOwnerStatus): Step {
  return step.state === "pending_verification" && current ? { ...step, current } : step;
}

export class AdoptionExecution {
  constructor(private readonly store: AdoptionStore, private readonly notify: (actor: string, progress: AdoptionProgress) => void) {}

  private async change(scope: Guard, record: RecordView, step: StepRecord, next: BlueprintApplyStep | UndoStep, operation: "apply" | "undo", current?: PendingOwnerStatus) {
    await beforeWrite(scope);
    if (!this.store.writeStep(record.row.preview_id, step, next, operation)) throw blueprintsErrors.step_conflict("采用进度已变化，请重新读取");
    step.revision++;
    const identity = { preview_id: record.row.preview_id, project_id: record.row.project_id, adoption_id: record.row.adoption_id! };
    const progress = withOwnerStatus(next, current);
    this.notify(scope.actor_id, operation === "apply" ? { ...identity, kind: operation, step: progress as BlueprintApplyStep }
      : { ...identity, kind: operation, undo: { operation: record.row.undo_operation!, request_id: record.row.undo_request! }, step: progress as UndoStep });
  }

  async apply(caller: Guard, input: BlueprintAdoptionApplyInput, now: number,
    accessFor: (project: string | null) => Promise<SettingsAccess>, ensureProject: (id: string, name: string) => Promise<void>): Promise<BlueprintAdoptionApplyResult> {
    const preview = this.store.load(caller, "preview_id", input.preview_id).preview;
    const selected = new Set(input.part_ids);
    if (selected.size !== input.part_ids.length || input.part_ids.some(id => !preview.parts.some(part => part.part_id === id))) throw blueprintsErrors.part_unsupported("请求包含未预览的部分");
    await beforeWrite(caller);
    const adoptionId = this.store.start(caller, preview, input.part_ids, input.request_id, now);
    const record = this.store.load(caller, "adoption_id", adoptionId);
    if (record.row.undo_request) throw blueprintsErrors.step_conflict("这次采用已开始撤销，请查看进度");
    this.notify(caller.actor_id, { kind: "accepted", preview_id: input.preview_id, project_id: record.row.project_id, adoption_id: adoptionId });
    if (preview.target.kind === "new_project") {
      await beforeWrite(caller);
      if (caller.project_id !== record.row.project_id) {
        await ensureProject(record.row.project_id!, preview.target.display_name);
        assertCurrent(caller);
        this.notify(caller.actor_id, { kind: "target_created", preview_id: input.preview_id, project_id: record.row.project_id, adoption_id: adoptionId });
        // The workbench resumes in the new project with its own user grants.
        return { ...identity(record), steps: record.steps.map(step => step.apply) };
      }
    }
    const access = await accessFor(record.row.project_id);
    const owners = await access.discover();
    const problem = (plan: SettingPlan | null) => ownerProblem(owners, plan);
    const recovery = await readOwnerValues(access, record.steps.flatMap(step =>
      step.apply.state === "pending_verification" && step.plan && !problem(step.plan) ? [step.plan] : []), caller);
    const toVerify: { step: StepRecord; plan: SettingPlan; receipt?: BlueprintOwnerReceipt }[] = [];
    const previousWrites = new Map<string, { plan: SettingPlan; revision: string }>();
    for (const step of record.steps) {
      assertCurrent(caller);
      if (step.apply.state === "applied") {
        if (step.plan && "receipt" in step.apply) {
          previousWrites.set(step.plan.key, { plan: step.plan, revision: String(step.apply.receipt.revision) });
        }
        continue;
      }
      if (step.apply.state === "skipped" && step.apply.reason !== "owner_unavailable") continue;
      const part = preview.parts.find(item => item.part_id === step.part_id)!;
      const base = { part_id: step.part_id }, plan = step.plan;
      const unavailable = problem(plan);
      let result: BlueprintApplyStep;
      if (!selected.has(step.part_id)) result = { ...base, state: "skipped", reason: "not_selected" };
      else if (part.decision === "skip") result = { ...base, state: "skipped", reason: part.reason };
      else if (!plan) result = { ...base, state: "skipped", reason: "unsupported" };
      else if (unavailable) {
        result = step.apply.state === "pending_verification" ? step.apply : { ...base, state: "skipped", reason: "owner_unavailable" };
      } else if (part.decision === "reuse") {
        toVerify.push({ step, plan });
        continue;
      } else {
        const requestId = adoptionId + ":" + step.part_id;
        const pending = { ...base, state: "pending_verification" as const, request_id: requestId };
        let writing = step.apply.state === "pending_verification";
        try {
          if (writing && !recovery.has(plan.key)) continue;
          if (!writing) {
            const previous = previousWrites.get(plan.key);
            plan.apply_expected_revision = previous && previous.plan.layer !== plan.layer && sameBinding(previous.plan.binding, plan.binding)
              && previous.plan.expected_revision === plan.expected_revision ? previous.revision : plan.expected_revision;
            await this.change(caller, record, step, pending, "apply");
          }
          writing = true;
          const accepted = await access.write(plan.binding, { key: plan.key, layer: plan.layer, change: plan.change, recovery: { previous: plan.previous },
            expected_revision: plan.apply_expected_revision ?? plan.expected_revision, request_id: requestId });
          if (accepted.key !== plan.key) continue;
          const observed = accepted.state === "ok" ? accepted.layer_revisions?.[plan.layer] : undefined;
          if (observed !== undefined) plan.applied_layer_revision = observed;
          previousWrites.set(plan.key, { plan, revision: accepted.revision });
          toVerify.push({ step, plan, receipt: ownerReceipt(plan, accepted) });
          continue;
        } catch (error) {
          assertCurrent(caller);
          const failure = knownFailure(error);
          result = failure ? { ...base, state: "failed", error: failure } : writing ? pending
            : { ...base, state: "failed", error: { code: "blueprints.dependency_unmet", message: "暂时读不到设置，可继续重试" } };
        }
      }
      await this.change(caller, record, step, result, "apply", unavailable);
    }
    const readback = await readOwnerValues(access, toVerify.map(item => item.plan), caller);
    for (const { step, plan, receipt } of toVerify) {
      const result = verifiedStep(step.part_id, plan, readback.get(plan.key), receipt);
      if (result) await this.change(caller, record, step, result, "apply");
    }
    const finished = this.store.load(caller, "adoption_id", adoptionId);
    return { ...identity(finished), steps: finished.steps.map(({ apply, plan }) => withOwnerStatus(apply, problem(plan))) };
  }

  async read(caller: Guard, id: string, accessFor: (project: string | null) => Promise<SettingsAccess>): Promise<BlueprintAdoptionReadResult> {
    const record = this.store.load(caller, "adoption_id", id);
    const access = await accessFor(record.row.project_id);
    const owners = await access.discover();
    const problem = (plan: SettingPlan | null) => ownerProblem(owners, plan);
    const values = await readOwnerValues(access, record.steps.flatMap(({ plan, apply }) => plan && apply.state === "applied"
      && !problem(plan) ? [plan] : []), caller);
    const applied = record.steps.map(({ plan, apply }): BlueprintApplyStep => {
      if (!plan || apply.state !== "applied") return withOwnerStatus(apply, problem(plan));
      const current = values.get(plan.key);
      const expected = "receipt" in apply ? apply.receipt.revision : plan.expected_revision;
      if (current && !sameObservedLayer(plan, expected, current, plan.applied_layer_revision)) return { ...apply, current: "changed" };
      if (current?.state !== "ok" || current.value_unavailable) return { ...apply, current: "owner_unavailable" };
      const { current: _observed, ...original } = apply;
      return original;
    });
    assertCurrent(caller);
    return { ...identity(record), apply_steps: applied, latest_undo: record.row.undo_operation && record.row.undo_request
      ? { operation: record.row.undo_operation, request_id: record.row.undo_request,
        steps: record.steps.flatMap(({ undo, plan }) => undo ? [withOwnerStatus(undo, problem(plan))] : []) } : null };
  }

  async undo<Op extends Operation>(caller: Guard, input: BlueprintAdoptionUndoInput, op: Op,
    accessFor: (project: string | null) => Promise<SettingsAccess>): Promise<BlueprintAdoptionUndoResult<Op>> {
    const record = this.store.load(caller, "adoption_id", input.adoption_id);
    const access = await accessFor(record.row.project_id), owners = await access.discover();
    await beforeWrite(caller);
    const problem = (plan: SettingPlan | null) => ownerProblem(owners, plan);
    const pending = record.steps.filter(step => step.apply.state === "pending_verification");
    if (!record.row.undo_request && pending.length && pending.every(step => step.plan && !problem(step.plan)))
      throw blueprintsErrors.step_conflict("有一步的结果还没确认，请先继续核对，再撤销");
    this.store.startUndo(caller, input.adoption_id, op, input.request_id);
    record.row.undo_operation = op; record.row.undo_request = input.request_id;
    const results: UndoStep[] = [];
    for (const step of record.steps) {
      assertCurrent(caller);
      const { plan, apply, part_id } = step;
      const unavailable = problem(plan);
      if (step.undo?.state === "restored" || step.undo?.state === "detached" || step.undo?.state === "skipped" && (step.undo.reason === "shared" || apply.state === "pending_verification" && step.undo.reason === "revision_changed")) {
        results.push(step.undo); continue;
      }
      let result: UndoStep;
      if (!plan || apply.state !== "pending_verification" && !(apply.state === "applied" && "receipt" in apply)) result = { part_id, state: "detached" };
      else if (unavailable) {
        result = step.undo?.state === "pending_verification" ? step.undo : apply.state === "pending_verification" ? apply : { part_id, state: "skipped", reason: "owner_unavailable" };
      }
      else {
        const requestId = input.adoption_id + ":undo:" + part_id;
        const pending = { part_id, state: "pending_verification" as const, request_id: requestId };
        let writing = step.undo?.state === "pending_verification" && step.undo.request_id === requestId;
        try {
          const current = (await access.read(plan.binding, [plan.key]))[0];
          assertCurrent(caller);
          if (!current || current.key !== plan.key) throw new ActionError("actions.output_invalid", "设置读回缺失");
          if (!writing && apply.state === "applied" && !sameObservedLayer(plan, apply.receipt.revision, current, plan.applied_layer_revision)) result = { part_id, state: "skipped", reason: "revision_changed" };
          else if (!writing && current.state !== "ok") result = { part_id, state: "skipped", reason: "owner_unavailable" };
          else if (current.state === "ok" && (!writing || current.revision === plan.undo_expected_revision)
            && this.store.sharedSetting(caller.actor_id, record.row.project_id, record.row.preview_id, plan, current))
            result = { part_id, state: "skipped", reason: "shared" };
          else {
            if (!writing) {
              plan.undo_expected_revision = current.revision;
              await this.change(caller, record, step, pending, "undo");
            }
            writing = true;
            const saved = await access.write(plan.binding, { key: plan.key, layer: plan.layer, change: plan.previous,
              recovery: { undo_of: input.adoption_id + ":" + part_id }, expected_revision: plan.undo_expected_revision ?? current.revision, request_id: requestId });
            if (saved.key !== plan.key) throw new ActionError("actions.output_invalid", "主人没有回执这项设置");
            result = { part_id, state: "restored", receipt: ownerReceipt(plan, saved) };
          }
        } catch (error) {
          assertCurrent(caller);
          const failure = knownFailure(error);
          if (error instanceof ActionError && error.kind === "conflict") {
            const originalChanged = error.details?.reason === "revision_changed" && error.details.undo_of === input.adoption_id + ":" + part_id;
            if (!originalChanged && apply.state === "pending_verification") result = apply;
            else if (!originalChanged && typeof error.details?.revision === "string" && plan.applied_layer_revision !== undefined)
              result = { part_id, state: "failed", error: { code: error.code, message: error.message } };
            else result = { part_id, state: "skipped", reason: "revision_changed" };
          } else result = failure ? { part_id, state: "failed", error: failure } : writing ? pending : { part_id, state: "skipped", reason: "owner_unavailable" };
        }
      }
      await this.change(caller, record, step, result, "undo", unavailable);
      results.push(withOwnerStatus(result, unavailable));
    }
    return { adoption_id: input.adoption_id, undo: { operation: op, request_id: input.request_id, steps: results } };
  }
}
