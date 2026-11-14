import { ActionError, bindActionClient, findSubjectReader, requireSynchronous, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { PRESENTATION_FORM_KINDS, type FormKind, type PresentationValues, type PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { SURFACES_PROVIDER_ID, surfaceCompositionActions, type SurfaceCorrectionInput, type SurfaceGroup, type SurfaceSlot } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { isPresentationValuesReader, presentationValuesProblems } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { displayedFallback, homeChanged, homeOwnsView, type HomeReadSample } from "./surface-home-display.js";
import type { SurfaceProjectContext } from "./surface-project-read.js";
import { withSlotCorrectionCatalog } from "./surface-read-sample.js";

type Correction = Omit<SurfaceCorrectionInput, "slot" | "position">;
type Read = (view: ActionView, input: PresentationValuesInput, signal: AbortSignal) => Promise<PresentationValues>;
const same = (a: ActionSubject, b: ActionSubject) => a.kind === b.kind && a.id === b.id;
const text = (value: unknown, limit: number): value is string => typeof value === "string" && value.length > 0 && value.length <= limit;
const invalid = () => new ActionError("actions.input_invalid", "显示设置请求无效");
const hidden = () => new ActionError("actions.subject_unavailable", "原对象目前不可读取");

export function positionRecovery(value: unknown): ActionSubject | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.keys(value).length !== 2 || !text(value.kind, 200) || !text(value.id, 1000)) throw invalid();
  return { kind: value.kind, id: value.id };
}

export function positionCorrection(value: unknown): Correction | null {
  if (value === undefined) return null;
  if (!isRecord(value) || Object.keys(value).some(key => !["correction", "expected_revision", "subject", "form"].includes(key))) throw invalid();
  const { correction, expected_revision, subject, form } = value;
  if ((correction !== "form" && correction !== "remove" && correction !== "pin" && correction !== "reset")
    || !text(expected_revision, 32) || !/^(?:0|[1-9][0-9]*)$/u.test(expected_revision)) throw invalid();
  if (correction === "form" ? !PRESENTATION_FORM_KINDS.includes(form as FormKind) : form !== undefined) throw invalid();
  if (subject === undefined) {
    if (correction !== "reset") throw invalid();
    return { correction, expected_revision };
  }
  return { correction, expected_revision, subject: positionRecovery(subject), ...(form ? { form: form as FormKind } : {}) };
}

/** Capture the actual item from this read, then query only that owner/subject to recheck its membership and revision. */
export function attentionPositionGuard(sample: HomeReadSample, { runtime }: Pick<SurfaceProjectContext, "runtime">, owner: string, subject: ActionSubject) {
  const { project_id: projectId, store } = runtime, attention = new AttentionModule(store.db, { exists: () => true });
  const original = sample.attention?.find(entry => entry.owner_plugin_id === owner && same(entry.subject, subject));
  if (!original) throw homeChanged();
  return () => {
    const [entry] = attention.listSurfaceEntries(projectId, original);
    if (!entry || entry.revision !== original.revision || entry.entered_at !== original.entered_at || entry.reason !== original.reason) throw homeChanged();
  };
}

async function proveKnownReference(sample: HomeReadSample, subject: ActionSubject, read: Read) {
  const reader = findSubjectReader(sample.directory, subject.kind);
  if (reader.found !== "one") throw hidden();
  const entry = sample.catalog.entries.find(item => homeOwnsView(item, reader.view));
  if (!entry) throw hidden();
  const answers = sample.directory.filter(view => homeOwnsView(entry, view) && isPresentationValuesReader(view) && view.availability.available
    && view.action.subject_kinds.includes(subject.kind));
  if (answers.length !== 1 || !sample.deadline?.active) throw hidden();
  sample.retain([reader.view, answers[0]!]);
  const input = { subjects: [subject], fields: [] };
  const result = await sample.deadline.wait(read(answers[0]!, input, sample.deadline.signal));
  if (!result || presentationValuesProblems(input, result).length || result.items[0]?.state !== "ok") throw hidden();
  return entry.plugin.plugin_id;
}

const knownReference = (sample: HomeReadSample, slot: SurfaceSlot, subject: ActionSubject, known: readonly ActionSubject[]) =>
  slot.kind === "attention" ? sample.attention?.some(entry => same(entry.subject, subject)) : known.some(item => same(item, subject));

export async function canRestoreSurfaceObject(sample: HomeReadSample, context: SurfaceProjectContext, slot: SurfaceSlot, subject: ActionSubject,
  read: Read, known: readonly ActionSubject[]) {
  if (!knownReference(sample, slot, subject, known)) return false;
  try {
    const owner = await proveKnownReference(sample, subject, read);
    if (slot.kind === "attention") attentionPositionGuard(sample, context, owner, subject)();
    return true;
  } catch (error) {
    if (error instanceof ActionError && error.code === "actions.subject_unavailable") return false;
    throw error;
  }
}

/** The renderer supplies no actor, scope, or slot identity. A hidden reset needs a real current source reference. */
export async function correctSurfacePosition(sample: HomeReadSample, context: SurfaceProjectContext, slot: SurfaceSlot, groups: readonly SurfaceGroup[],
  input: Correction, read: Read, known: readonly ActionSubject[] = []) {
  const { client, caller, transport } = context;
  let sourceCurrent: (() => void) | undefined;
  const current = () => {
    requireSynchronous(transport.assert_authority_current?.());
    sample.assertCurrent(); sourceCurrent?.();
  };
  current();
  if (input.subject) {
    const subject = input.subject;
    const group = groups.find(group => group.items.some(item => item.state === "ok" && same(item.subject, subject)));
    const item = group?.items.find(item => item.state === "ok" && same(item.subject, subject));
    if (item && displayedFallback(sample, item)) throw hidden();
    if (input.correction === "pin" && (!sample.position?.pin || group?.kind === "attention")) throw invalid();
    const related = knownReference(sample, slot, subject, known);
    if (!item && (input.correction !== "reset" || !related)) throw hidden();
    const owner = item?.owner_plugin_id ?? await proveKnownReference(sample, subject, read);
    if (slot.kind === "attention") sourceCurrent = attentionPositionGuard(sample, context, owner, subject);
  }
  current();
  const action = bindActionClient(client, () => caller);
  const apply = () => action.invoke({ ...surfaceCompositionActions.correct, provider_id: SURFACES_PROVIDER_ID },
    { ...input, slot, ...(input.correction === "pin" ? { position: 0 } : {}) },
    { signal: transport.signal, locale: transport.locale, assert_authority_current: current, async beforeEffect() { await transport.beforeEffect(); current(); } });
  const result = slot.kind === "plugin-slot" ? await withSlotCorrectionCatalog(context.runtime.store, sample.catalog, apply) : await apply();
  current();
  return result;
}
