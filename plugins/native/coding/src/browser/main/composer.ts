import { errorMessage } from "../dom.js";
import { refreshState } from "./configuration.js";
import { terminal } from "./composer-state.js";
import { controls } from "./controls.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { readRecovery } from "./recovery.js";
import { api, sessionPath, status } from "./request.js";
import type { ContinuationRead, RecoveryReport, RoundSelection, StartedRound } from "./shapes.js";

/** What the Host said about the digest a round started from: written by the model (with its cost) or by the Host. */
function digestNote(page: Page, started: StartedRound | null) {
  const { L } = page, digest = started?.digest;
  if (!digest) return;
  const tokens = digest.usage ? (digest.usage.input + digest.usage.output).toLocaleString() : "";
  const note = digest.source !== "model" ? L("coding.digest.host", { reason: digest.problem || "" }) : digest.usage ? L("coding.digest.model-usage", { tokens }) : L("coding.digest.model", { tokens });
  status(page, note, digest.source !== "model");
}

/** One way to start a round, shared by the composer and by continuing from a breakpoint. */
export async function startRound(page: Page, id: string, task: string | undefined, intent: string, modelValue: string, selection: RoundSelection, extra: Record<string, unknown> = {}) {
  const { L, s } = page, { composerModels } = page.refs, [provider_id, model_id] = JSON.parse(modelValue) as [string, string];
  // A round that carries a digest waits for the model to write it first; say so rather than look stuck.
  if (id === s.current && s.lastData?.next_history?.history === "digest") status(page, L("coding.digest.writing"));
  const started = await api<StartedRound | null>(page, sessionPath(id) + "/runs", "POST", {
    ...extra, task, intent, provider_id, model_id, ...composerModels.effort(), workspace_id: selection.workspace_id, methods: selection.methods,
    ...(selection.action_tools === undefined ? {} : { action_tools: selection.action_tools }),
    mcp_tools: selection.mcp_tools, mcp_sources: selection.mcp_sources, materials: selection.materials, character: selection.character,
    character_skill_ids: s.characterSkills.get(id), ...(intent === "parallel" ? { writer_assignments: selection.writer_assignments } : {}),
  });
  if (id === s.current) digestNote(page, started);
}

/** The choices the session holds for its next round. */
export function currentSelection(page: Page, id: string): RoundSelection {
  const { s } = page;
  return {
    workspace_id: s.workspaceId, methods: structuredClone(s.methodSelections.get(id) || []), mcp_tools: structuredClone(s.mcpSelections.get(id) || []),
    mcp_sources: structuredClone(s.mcpSourceSelections.get(id) || []), materials: structuredClone(s.materialSelections.get(id) || []),
    character: structuredClone(s.characterSelections.get(id) ?? null), writer_assignments: [],
  };
}

/** Continues an unfinished round (the Host states what already happened) or asks a closed question again; the composer draft stays untouched. */
export async function continueRound(page: Page, runId: string | null, reask?: { readonly run_id: string; readonly pending_id: string }) {
  const { L, q, s } = page;
  if (s.sending || !s.current) return;
  const id = s.current, modelValue = q<HTMLSelectElement>("[data-coding-model]").value;
  s.sending = true;
  controls(page);
  try {
    if (!s.state.models.some(model => JSON.stringify([model.provider_id, model.model_id]) === modelValue)) throw new Error(L("coding.model.choose-first"));
    const chosen = q<HTMLSelectElement>("[data-coding-intent]").value;
    const next: ContinuationRead = reask || runId === null ? { intent: chosen } : await api<ContinuationRead>(page, sessionPath(id, runId) + "/continuation");
    if (s.current !== id) return;
    // A plan round continues on its own graph; everything else starts a fresh round with the Host's facts. The rest of a plan runs
    // the way the person picks now: steps left after subtasks (such as running the tests) may need execution rather than another round of parallel writers.
    const intent = next.continue_step_board_of && ["execute", "parallel"].includes(chosen) ? chosen : next.intent;
    // A parallel round goes on with the directories it was given; the saved split is what those subtasks used.
    const selection = currentSelection(page, id);
    if (intent === "parallel") selection.writer_assignments = structuredClone(s.configurations.get(id)?.writer_assignments || []);
    await startRound(page, id, next.task, intent, modelValue, selection, next.continue_step_board_of ? { plan_revision: next.plan_revision, continue_step_board_of: next.continue_step_board_of } : { reask });
    if (!reask) status(page, L("coding.run.continued"));
    s.follow.resume();
    await refreshState(page);
    await readCurrent(page);
  } catch (error) {
    if (s.current === id) status(page, errorMessage(error), true);
  } finally {
    s.sending = false;
    controls(page);
  }
}

/** An interrupted round is checked first; only a round whose outcomes are all known is closed and continued. */
export async function recoverAndContinue(page: Page, runId: string) {
  const { L, root, s } = page;
  if (s.sending || !s.current) return;
  const id = s.current;
  try {
    const report = await api<RecoveryReport>(page, sessionPath(id) + "/recovery");
    const entry = report.runs.find(run => run.run_id === runId);
    // The round's subtasks were cut off with it; they are settled together, or a new round would be refused.
    const blocked = report.runs.find(run => !run.can_close);
    if (!entry || blocked || report.blockers.length) {
      root.dataset.codingResults = "true";
      s.recoveryKey = "";
      void readRecovery(page);
      status(page, L("coding.run.blocked", { reason: report.blockers.length ? report.blockers.join("；") : (blocked || entry)?.blockers?.join("；") || L("coding.run.unknown-operations") }), true);
      return;
    }
    for (const run of [...report.runs.filter(item => item.subagent), entry]) await api(page, sessionPath(id, run.run_id) + "/recover", "POST", { expected_version: run.version });
    if (s.current !== id) return;
    await continueRound(page, runId);
  } catch (error) {
    if (s.current === id) status(page, errorMessage(error), true);
  }
}

/** How soon the conversation reads again: quickly while a round works, slowly when nothing runs. */
export function conversationDelay(page: Page): number {
  const { s } = page, run = s.lastRun;
  if (!run) return 2500;
  if (["starting", "running", "compacting", "pausing"].includes(run.phase)) return s.liveRun ? 1200 : 350;
  return terminal(run.phase) ? 2500 : 1000;
}
