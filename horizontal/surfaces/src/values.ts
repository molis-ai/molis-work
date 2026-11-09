import type { ActionSubject, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { PRESENTATION_LIMITS, type PresentationObject, type PresentationValueItem, type PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";
import { presentationValuesProblems } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { subjectKey, viewKey, viewRef, type SurfaceComposePorts } from "./ports.js";

const DEADLINE_MS = 1_000;
const PARALLEL_READS = 4;
type ReadResult<T> = { value: T } | { error: unknown };

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
  let closedSlots = 0;
  const active = () => {
    if (performance.now() >= at) expires.abort();
    return !signal.aborted;
  };
  const wait = <T>(pending: Promise<T>) => Promise.race([untilStopped, pending]);
  return {
    get active() { return active(); },
    wait,
    async read<Job, Output>(jobs: readonly Job[], current: () => void, invoke: (job: Job, signal: AbortSignal) => Promise<Output>,
      receive: (job: Job, result: ReadResult<Output>) => void) {
      let cursor = 0;
      const worker = async () => {
        while (active() && cursor < jobs.length) {
          current();
          if (!active()) return;
          const job = jobs[cursor++]!;
          let result: ReadResult<Output>;
          try { result = { value: await invoke(job, signal) }; } catch (error) { result = { error }; }
          current();
          if (!active()) return;
          receive(job, result);
          const kind = "error" in result ? actionErrorKind(result.error) : undefined;
          // A gateway timeout can settle before the provider stops, including in the overview phase.
          if (kind === "timeout" || kind === "cancelled") { closedSlots++; return; }
        }
      };
      await wait(Promise.all(Array.from({ length: Math.min(jobs.length, PARALLEL_READS - closedSlots) }, worker)));
      current();
    },
    dispose() { clearTimeout(timer); signal.removeEventListener("abort", stopped); expires.abort(); },
  };
}

interface ValueCandidate { subject: ActionSubject; fields: readonly string[]; action: ActionView }
interface Batch { action: ActionView; subjects: ActionSubject[]; fields: Set<string> }
interface ValueAnswer { item?: PresentationValueItem; denied?: true }

function makeBatches(candidates: readonly ValueCandidate[]): Batch[] {
  const byAction = new Map<string, Batch[]>();
  for (const candidate of candidates) {
    const key = viewKey(candidate.action);
    let batches = byAction.get(key);
    if (!batches) { batches = []; byAction.set(key, batches); }
    const { fields } = candidate;
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

export function readRuleValues(candidates: readonly (Omit<ValueCandidate, "fields"> & { object: PresentationObject })[],
  ports: SurfaceComposePorts, deadline: ReturnType<typeof startDeadline>, current: () => void) {
  return readSurfaceValues(candidates.map(({ subject, action, object }) => ({ subject, action,
    fields: object.fields.filter(field => field.role === "status" || field.role === "relation").map(field => field.key) })), ports, deadline, current);
}

export async function readSurfaceValues(candidates: readonly ValueCandidate[], ports: Pick<SurfaceComposePorts, "values" | "diagnostic">, deadline: ReturnType<typeof startDeadline>, current: () => void) {
  const batches = makeBatches(candidates).map(({ action, subjects, fields }) => ({ action, input: { subjects, fields: [...fields].sort() } satisfies PresentationValuesInput }));
  const answers = new Map<string, ValueAnswer>();
  await deadline.read(batches, current, ({ action, input }, signal) => ports.values(action, input, signal, current), ({ action, input }, result) => {
    if ("value" in result && !presentationValuesProblems(input, result.value).length) {
      for (const item of result.value.items) answers.set(subjectKey(item.subject), { item });
    } else if ("error" in result && actionErrorKind(result.error) === "forbidden") {
      for (const subject of input.subjects) answers.set(subjectKey(subject), { denied: true });
    } else {
      ports.diagnostic?.("values_unavailable", { provider_id: action.provider.provider_id, ref: viewRef(action) });
    }
  });
  return answers;
}
