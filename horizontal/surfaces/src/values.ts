import type { ActionSubject, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { PRESENTATION_LIMITS, type PresentationObject, type PresentationValueItem, type PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { presentationValuesProblems } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { checkCurrent, subjectKey, viewKey, viewRef, type SurfaceComposePorts } from "./ports.js";

const DEADLINE_MS = 1_000;
const PARALLEL_READS = 4;

export function startDeadline(parent: AbortSignal | undefined) {
  const expires = new AbortController();
  const signal = parent ? AbortSignal.any([parent, expires.signal]) : expires.signal;
  const at = performance.now() + DEADLINE_MS;
  const timer = setTimeout(() => expires.abort(), DEADLINE_MS);
  let stopped: () => void = () => undefined;
  const untilStopped = signal.aborted ? Promise.resolve(undefined) : new Promise<undefined>(resolve => {
    stopped = () => resolve(undefined);
    signal.addEventListener("abort", stopped, { once: true });
  });
  return {
    signal,
    get active() {
      if (performance.now() >= at) expires.abort();
      return !signal.aborted;
    },
    wait: <T>(pending: Promise<T>) => Promise.race([untilStopped, pending]),
    dispose() { clearTimeout(timer); signal.removeEventListener("abort", stopped); expires.abort(); },
  };
}

interface ValueCandidate { subject: ActionSubject; object: PresentationObject; action: ActionView }
interface Batch { action: ActionView; subjects: ActionSubject[]; fields: Set<string> }
interface ValueAnswer { item?: PresentationValueItem; denied?: true }

function makeBatches(candidates: readonly ValueCandidate[]): Batch[] {
  const byAction = new Map<string, Batch[]>();
  for (const candidate of candidates) {
    const key = viewKey(candidate.action);
    let batches = byAction.get(key);
    if (!batches) { batches = []; byAction.set(key, batches); }
    const fields = candidate.object.fields.filter(field => field.role === "status" || field.role === "relation").map(field => field.key);
    let batch = batches.find(group => group.subjects.length < PRESENTATION_LIMITS.values_subjects
      && new Set([...group.fields, ...fields]).size <= PRESENTATION_LIMITS.fields);
    if (!batch) {
      batch = { action: candidate.action, subjects: [], fields: new Set() };
      batches.push(batch);
    }
    batch.subjects.push(candidate.subject);
    for (const field of fields) batch.fields.add(field);
  }
  return [...byAction.values()].flat();
}

export async function readRuleValues(candidates: readonly ValueCandidate[], ports: SurfaceComposePorts, deadline: ReturnType<typeof startDeadline>) {
  const batches = makeBatches(candidates);
  const answers = new Map<string, ValueAnswer>();
  let cursor = 0;
  const worker = async () => {
    while (deadline.active && cursor < batches.length) {
      checkCurrent(ports);
      const { action, subjects, fields } = batches[cursor++]!;
      const input: PresentationValuesInput = { subjects, fields: [...fields].sort() };
      try {
        const output = await ports.values(action, input, deadline.signal);
        checkCurrent(ports);
        if (!deadline.active) return;
        if (presentationValuesProblems(input, output).length) {
          ports.diagnostic?.("values_unavailable", { provider_id: action.provider.provider_id, ref: viewRef(action) });
          continue;
        }
        for (const item of output.items) answers.set(subjectKey(item.subject), { item });
      } catch (error) {
        checkCurrent(ports);
        if (!deadline.active) return;
        const kind = actionErrorKind(error);
        if (kind === "forbidden") for (const subject of subjects) answers.set(subjectKey(subject), { denied: true });
        else ports.diagnostic?.("values_unavailable", { provider_id: action.provider.provider_id, ref: viewRef(action) });
        // A gateway timeout can settle before the provider stops. This worker must keep its slot closed.
        if (kind === "timeout" || kind === "cancelled") return;
      }
    }
  };
  await deadline.wait(Promise.all(Array.from({ length: Math.min(batches.length, PARALLEL_READS) }, worker)));
  checkCurrent(ports);
  return answers;
}
