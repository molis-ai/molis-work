import type { ObservationFactInput } from "@molis-ai/molis-work-contracts/services/observation";
import { WORKFLOWS_PLUGIN_ID, isActionStation, type WorkflowHandoff, type WorkflowInstance, type WorkflowVerdict } from "./model.js";

/** Reports this plugin's own facts through `observation.report@1`; a report that is refused or lost never changes the step. */
export type WorkflowStepReport = (fact: ObservationFactInput) => Promise<void>;

type StepOutcome = "succeeded" | "failed" | "refused";
interface StepMore { readonly verdict?: WorkflowVerdict; readonly retry?: boolean; readonly error?: string; readonly result_truncated?: true }

const cut = (text: string, length: number) => [...text].slice(0, length).join("");

/**
 * One handoff of a run, as a work record (specs/observation-collection/design.md §4「工作流」): which link and who handed over, the
 * judgment's answer and the station it reached, pinned to the version the run fixed when it started. The handoff's text stays in the
 * run (its owner keeps it for as long as the run), so the record names it, never copies it; the action a station ran is the action
 * exit's record under the same call. A handoff that went through, a judgment that held the content back, and an action station whose
 * attempt failed each say so; a retry says it is one.
 */
export function workflowStepFact(instance: WorkflowInstance, from: number, outcome: StepOutcome, handoff: Pick<WorkflowHandoff, "kind" | "actor"> & { readonly key: string },
  more: StepMore = {}): ObservationFactInput {
  const target = instance.chain.stations[from + 1], verdict = more.verdict;
  return {
    fact: "io.molis.work.native.workflows.step", outcome, stage: handoff.kind,
    work: { work_ref: instance.instance_id },
    subjects: [{ kind: "workflow_run", id: instance.instance_id }, { kind: "workflow", id: instance.workflow_id }],
    detail: {
      from, kind: handoff.kind, actor: handoff.actor,
      ...(target ? { to_plugin: target.plugin } : {}),
      ...(target && isActionStation(target) ? { action: `${target.action.ref.capability_id}@${target.action.ref.version}`, action_provider: target.action.ref.provider_id } : {}),
      ...(verdict ? { verdict_passed: verdict.passed, verdict_status: verdict.status, verdict_function: `${verdict.function_key}@${verdict.version}`,
        ...(verdict.choice !== null ? { verdict_choice: cut(verdict.choice, 200) } : {}), ...(verdict.confidence !== null ? { verdict_confidence: verdict.confidence } : {}) } : {}),
      ...(more.retry ? { retry: true } : {}),
      ...(more.result_truncated ? { result_truncated: true } : {}),
      ...(more.error ? { error: cut(more.error, 400) } : {}),
    },
    ...(outcome === "succeeded" ? { evidence: [{ role: "handoff", ref: { kind: "owner" as const, owner: WORKFLOWS_PLUGIN_ID, id: handoff.key, version: instance.updated_at } }] } : {}),
  };
}
