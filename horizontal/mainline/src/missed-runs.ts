import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { RUN_DECISION_INPUT_TYPE, RUN_DECISION_OUTPUT_TYPE, RUNS_OVERVIEW_INPUT_TYPE, RUNS_OVERVIEW_OUTPUT_TYPE, type ActionReference, type ActionView, type RunsWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import { isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";

// What runs on its own and was missed (specs/work-line §6, WLN-39): a project's runs owners (Schedule, Feed …) already say it with the
// runs types, so the task table reads those answers instead of asking each owner to report a second time. A missed run is a task that
// waits on the person: 「现在做一次」 or 「跳过」, both the owner's own decision action. What is still ahead is not a task.

/** The kind a missed run has in the task table; its id is the owner's run id. */
export const MISSED_RUN_KIND = "scheduled_run";

/** A project's runs owner: the overview query with the runs types. There is no other list of owners. */
export const isRunsSource = (view: ActionView): boolean => view.action.input_type === RUNS_OVERVIEW_INPUT_TYPE && view.action.output_type === RUNS_OVERVIEW_OUTPUT_TYPE && isHomeAggregateQuery(view);
/** The action that owner decides a missed run with: the decision types, under the same provider. */
export const isRunDecisionOf = (view: ActionView, source: Required<ActionReference>): boolean =>
  view.action.input_type === RUN_DECISION_INPUT_TYPE && view.action.output_type === RUN_DECISION_OUTPUT_TYPE && view.provider.provider_id === source.provider_id && view.availability.available;

/** Only what was missed is asked for: the window ahead is empty. */
export const missedRunsWindow = (now: Date = new Date()): RunsWindow => ({ now: now.toISOString(), upcoming_until: now.toISOString() });

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * An owner's overview as the collection a task provider would have sent. Nothing is checked here beyond the shape needed to copy:
 * the rows go through the same check as any provider's. Without a decision action the run still shows, with nothing to press.
 */
export function missedRunTasks(output: unknown, decide: Required<ActionReference> | undefined): unknown {
  if (!record(output) || !record(output.source) || !Array.isArray(output.missed)) return null;
  const owner = output.source.title;
  const answer = (role: "approve" | "reject", run: unknown, decision: "run_now" | "skip", summary: string) =>
    ({ role, action: { capability_id: decide!.capability_id, version: decide!.version }, input: { run_id: run, decision }, summary });
  return { source: { surface: output.source.surface, title: owner, icon: "clock" }, tasks: output.missed.filter(record).map(run => ({
    subject: { kind: MISSED_RUN_KIND, id: run.run_id }, title: run.title, state: "answer", waiting: true, updated_at: run.missed_at, step: { text: uiText.text("workbench.mainline.missed-step") }, details: [],
    executor: { kind: "plugin", label: owner }, serves: [], scope: "project", commands: [],
    decisions: decide ? [{ id: "missed", ask: uiText.text("workbench.mainline.missed-ask"), changes: [],
      answers: [answer("approve", run.run_id, "run_now", uiText.text("workbench.mainline.run-now")), answer("reject", run.run_id, "skip", uiText.text("workbench.mainline.skip-once"))] }] : [],
    open: record(run.open) ? { kind: "item", surface: run.open.surface, id: run.open.id, title: run.title, label: uiText.text("workbench.mainline.open") } : null,
  })) };
}
