import { format, renderCodingRoundMaterials, type MwCodingRoundMaterialItem, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { el, errorMessage } from "../dom.js";
import { refreshState } from "./configuration.js";
import { terminal } from "./composer-state.js";
import { controls, openMaterials } from "./controls.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { readRecovery } from "./recovery.js";
import { api, sessionPath, status } from "./request.js";
import type { ContinuationRead, RecoveryReport, RoundSelection, StartedRound } from "./shapes.js";

/** What the Host said about the digest a round started from: written by the model (with its cost) or by the Host. */
function digestNote(page: Page, started: StartedRound | null) {
  const digest = started?.digest;
  if (!digest) return;
  const tokens = digest.usage ? format.number(digest.usage.input + digest.usage.output) : "";
  const note = digest.source !== "model" ? uiText.text("coding.digest.host", { reason: digest.problem || "" }) : digest.usage ? uiText.text("coding.digest.model-usage", { tokens }) : uiText.text("coding.digest.model", { tokens });
  status(page, note, digest.source !== "model");
}

interface FailedMaterialItem {
  readonly index?: number;
  readonly key?: string;
  readonly artifact_id?: string;
  readonly version?: number;
  readonly title?: string;
  readonly reason: string;
  readonly failure_kind?: "not_found" | "forbidden" | "unavailable";
}

export function selectionMaterialKey(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  if ("ref" in entry && entry.ref && typeof entry.ref === "object") {
    const ref = entry.ref as { subject?: { kind?: string; id?: string }; pin?: unknown; range?: unknown };
    return JSON.stringify([ref.subject?.kind, ref.subject?.id, ref.pin, ref.range ?? null]);
  }
  if ("recorded" in entry && entry.recorded && typeof entry.recorded === "object") {
    const recorded = entry.recorded as { kind?: string; id?: string };
    return JSON.stringify(["recorded", recorded.kind, recorded.id]);
  }
  return "";
}

export function failedMaterialsOf(error: unknown): readonly FailedMaterialItem[] | null {
  if (!error || typeof error !== "object") return null;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const body = "body" in error && error.body && typeof error.body === "object" ? error.body as Record<string, unknown> : null;
  const details = body && "details" in body && body.details && typeof body.details === "object"
    ? body.details as Record<string, unknown>
    : "details" in error && error.details && typeof error.details === "object"
      ? error.details as Record<string, unknown>
      : null;
  const list = details && Array.isArray(details.failed_materials) ? details.failed_materials as FailedMaterialItem[] : null;
  return code === "coding.material_unreadable" && list?.length ? list : null;
}

function showMaterialRecovery(page: Page, id: string, failures: readonly FailedMaterialItem[] | null, submitted: readonly unknown[] = []) {
  page.q("[data-coding-composer]").querySelector("[data-coding-material-recovery]")?.remove();
  let bar = page.turns.querySelector<HTMLElement>(":scope > [data-coding-material-recovery]");
  const allChosen = page.s.materialSelections.get(id) || [];
  const keys = new Set(allChosen.map(selectionMaterialKey));
  // Source picks live in the shared composer, not in this saved selection. An error index belongs to the submitted merged list.
  const failed = failures?.map(item => ({ ...item, key: item.key ?? selectionMaterialKey(submitted[item.index ?? -1]) })).filter(item => keys.has(item.key));
  if (!failed?.length) {
    bar?.remove();
    return;
  }
  if (!bar) {
    bar = el("div", "", "coding-material-recovery");
    bar.dataset.codingMaterialRecovery = "";
    page.turns.append(bar);
  }
  const badKeys = new Set(failed.flatMap(item => item.key ? [item.key] : []));
  const keptSelection = allChosen.filter(entry => !badKeys.has(selectionMaterialKey(entry)));
  const items: MwCodingRoundMaterialItem[] = failed.map(item => {
    const why = item.failure_kind === "not_found"
      ? uiText.text("coding.material.reason.deleted")
      : item.failure_kind === "forbidden"
        ? uiText.text("coding.material.reason.forbidden")
        : item.reason;
    return {
      state: "failed",
      name: item.title || item.artifact_id || "",
      how: why,
      statusLabel: uiText.text("coding.material.status.unreadable"),
      statusTone: "blocked",
    };
  });
  // Local UI renders and escapes every value; content sanitization would remove its action bindings.
  bar.innerHTML = renderCodingRoundMaterials({
    title: uiText.text("coding.material.round-title"),
    summaryLabel: uiText.text("coding.material.status.unreadable"),
    summaryTone: "blocked",
    items,
    recovery: {
      tone: "warning",
      title: uiText.text("coding.material.recovery.title"),
      body: uiText.text("coding.material.kept-summary", { kept: keptSelection.length }),
      actions: [
        { label: uiText.text("coding.material.remove-unreadable"), variant: "primary", attrs: { "data-coding-drop-failed-materials": "" } },
        { label: uiText.text("coding.material.pick-another"), variant: "secondary", attrs: { "data-coding-replace-failed-materials": "" } },
      ],
    },
  });
  const drop = bar.querySelector<HTMLButtonElement>("[data-coding-drop-failed-materials]");
  if (drop) {
    page.lifetime.listen(drop, "click", () => {
      page.s.materialSelections.set(id, keptSelection);
      bar?.remove();
      controls(page);
      void page.refs.draft.flush().then(() => {
        page.refs.composer.focus();
      }).catch(error => status(page, errorMessage(error), true));
    });
  }
  const alt = bar.querySelector<HTMLButtonElement>("[data-coding-replace-failed-materials]");
  if (alt) {
    page.lifetime.listen(alt, "click", () => {
      void openMaterials(page);
    });
  }
  page.s.follow.pin();
}

/** One way to start a round, shared by the composer and by continuing from a breakpoint. */
export async function startRound(page: Page, id: string, task: string | undefined, intent: string, modelValue: string, selection: RoundSelection, extra: Record<string, unknown> = {}) {
  const { s } = page, { composerModels } = page.refs, [provider_id, model_id] = JSON.parse(modelValue) as [string, string];
  // A round that carries a digest waits for the model to write it first; say so rather than look stuck.
  if (id === s.current && s.lastData?.next_history?.history === "digest") status(page, uiText.text("coding.digest.writing"));
  let started: StartedRound | null;
  try {
    started = await page.refs.inputReceipts.start<StartedRound | null>(id, {
      ...extra, task, intent, provider_id, model_id, ...composerModels.effort(), workspace_id: selection.workspace_id, skills: selection.skills,
      // The naming envelope the Host takes off before Coding reads the request: resending the session's Skills names them (§2.3).
      named_skills: selection.skills,
      ...(selection.action_tools === undefined ? {} : { action_tools: selection.action_tools }),
      mcp_tools: selection.mcp_tools, mcp_sources: selection.mcp_sources, materials: selection.materials, character: selection.character,
      character_skill_ids: s.characterSkills.get(id), ...(intent === "parallel" ? { writer_assignments: selection.writer_assignments } : {}),
      ...(selection.worktree_id ? { worktree_id: selection.worktree_id } : {}),
      ...(selection.images?.length ? { images: selection.images } : {}),
    });
  } catch (error) {
    if (id === s.current) showMaterialRecovery(page, id, failedMaterialsOf(error), selection.materials);
    throw error;
  }
  if (id === s.current) showMaterialRecovery(page, id, null);
  if (task !== undefined) page.refs.inputEditor.accepted(id, started?.cleared_input_revision, task);
  if (id === s.current) digestNote(page, started);
}

/** The choices the session holds for its next round. */
export function currentSelection(page: Page, id: string): RoundSelection {
  const { s } = page;
  return {
    workspace_id: s.workspaceId, ...(s.worktree ? { worktree_id: s.worktree.worktree_id } : {}), skills: structuredClone(s.methodSelections.get(id) || []), mcp_tools: structuredClone(s.mcpSelections.get(id) || []),
    mcp_sources: structuredClone(s.mcpSourceSelections.get(id) || []), materials: structuredClone(s.materialSelections.get(id) || []),
    character: structuredClone(s.characterSelections.get(id) ?? null), writer_assignments: [],
  };
}

/** Continues an unfinished round (the Host states what already happened) or asks a closed question again; the composer draft stays untouched. */
export async function continueRound(page: Page, runId: string | null, reask?: { readonly run_id: string; readonly pending_id: string }) {
  const { readText, refs, s } = page;
  if (s.sending || !s.current) return;
  const id = s.current, modelValue = refs.composerModels.value();
  s.sending = true;
  controls(page);
  try {
    if (!s.state.models.some(model => JSON.stringify([model.provider_id, model.model_id]) === modelValue)) throw new Error(readText("coding.model.choose-first"));
    const chosen = s.intent;
    const next: ContinuationRead = reask || runId === null ? { intent: chosen } : await api<ContinuationRead>(page, sessionPath(id, runId) + "/continuation");
    if (s.current !== id) return;
    // A plan round continues on its own graph; everything else starts a fresh round with the Host's facts. The rest of a plan runs
    // the way the person picks now: steps left after subtasks (such as running the tests) may need execution rather than another round of parallel writers.
    const intent = next.continue_step_board_of && ["execute", "parallel"].includes(chosen) ? chosen : next.intent;
    // A parallel round goes on with the directories it was given; the saved split is what those subtasks used.
    const selection = currentSelection(page, id);
    if (intent === "parallel") selection.writer_assignments = structuredClone(s.configurations.get(id)?.writer_assignments || []);
    await startRound(page, id, next.task, intent, modelValue, selection, { ...(next.continue_step_board_of ? { plan_revision: next.plan_revision, continue_step_board_of: next.continue_step_board_of } : {}), ...(next.continued_from ? { continued_from: next.continued_from } : {}), ...(reask ? { reask } : {}) });
    if (!reask) status(page, uiText.text("coding.run.continued"));
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
  const { root, s } = page;
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
      status(page, uiText.text("coding.run.blocked", { reason: report.blockers.length ? report.blockers.join(uiText.text("common.punctuation.semicolon")) : (blocked || entry)?.blockers?.join(uiText.text("common.punctuation.semicolon")) || uiText.text("coding.run.unknown-operations") }), true);
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
