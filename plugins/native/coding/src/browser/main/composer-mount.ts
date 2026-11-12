import type { ComposerCommand, ComposerControl, ComposerDelivery, ComposerOutcome, ComposerPause, ComposerSubmission } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { sessionTitle } from "../session-title.js";
import { codingComposerLabels } from "../../composer-labels.js";
import { errorMessage } from "../dom.js";
import { mac } from "../matching.js";
import { codingCommands } from "./commands.js";
import { chooseIntent, drawIntents, refreshState, rememberConfiguration } from "./configuration.js";
import { terminal, unread } from "./composer-state.js";
import { controls, counts } from "./controls.js";
import { currentSelection } from "./composer.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { retitleMethodControls } from "./methods.js";
import { api, sessionPath, status } from "./request.js";
import { select, surfaceChanged } from "./select.js";
import { startFromComposer } from "./mount-submit.js";
import type { RoundSelection } from "./shapes.js";

/** How many other sessions 「发给」 lists: the latest; the rest are in the page's own list beside it. */
const OTHERS = 5;

/** A round of the session on show is under way (paused included): words go to it, and stop and pause are offered. */
export const roundActive = (page: Page) => Boolean(page.s.lastRun && !terminal(page.s.lastRun.phase));

/** Every delivery while a round runs; idle, the plain send starts a round and the others say why they wait. */
function deliveries(page: Page): ComposerDelivery {
  if (roundActive(page)) return { "next-boundary": { available: true }, interrupt: { available: true }, "after-run": { available: true } };
  const idle = { available: false as const, reason: page.readText("coding.send-mode.idle") };
  return { "next-boundary": { available: true }, interrupt: idle, "after-run": idle };
}

/** Pausing lets the current step finish; a paused round resumes with its context intact. */
function pauseOf(page: Page): ComposerPause | null {
  const { readText, s } = page, phase = s.lastRun?.phase ?? "";
  const paused = phase === "paused" || phase === "pausing", pausable = ["starting", "running", "compacting"].includes(phase);
  if (!paused && !pausable) return null;
  const kind = paused ? "resume" : "pause";
  return {
    label: phase === "pausing" ? readText("coding.run.pausing") : paused ? readText("coding.run.resume") : readText("coding.run.pause"), title: paused ? readText("coding.run.resume") : readText("coding.run.pause-title"),
    busy: s.sending || phase === "pausing",
    run: async () => {
      const run = s.lastRun;
      if (!run) return;
      try {
        await api(page, sessionPath(s.current) + "/control", "POST", { run_id: run.ref.run_id, kind });
        status(page, kind === "pause" ? readText("coding.run.pause-received") : readText("coding.run.resumed"));
        await readCurrent(page);
      } catch (error) {
        status(page, errorMessage(error), true);
      }
    },
  };
}

/** Stops the round on show; the Host then checks what it carried out. */
export async function stopRound(page: Page) {
  const { readText, s } = page, run = s.lastRun;
  if (!run || terminal(run.phase)) return;
  try {
    await api(page, sessionPath(s.current) + "/control", "POST", { run_id: run.ref.run_id, kind: "stop" });
    status(page, readText("coding.run.stop-received"));
    await readCurrent(page);
  } catch (error) {
    status(page, errorMessage(error), true);
  }
}

/** What the next round is given (materials, methods, a Character, actions, MCP), as small tags in the bar once chosen; each opens its choice again. */
function nextRound(page: Page): ComposerControl[] {
  const held = counts(page);
  const chosen: Record<string, number> = { materials: held.materials, character: held.character ? 1 : 0, methods: held.methods, actions: held.actions, mcp: held.mcp };
  return codingCommands(page).filter(command => (chosen[command.slash] ?? 0) > 0)
    .map(command => ({ kind: "button" as const, id: "next-" + command.slash, label: command.label, ...(command.hint ? { title: command.hint } : {}), disabled: command.enabled === false, run: () => void command.run() }));
}

/** The bar's controls: the way of working (fixed while a round runs), then the model's, then what the next round is given. */
function sceneControls(page: Page): ComposerControl[] {
  const { readText, s } = page;
  return [
    { kind: "select", id: "intent", label: readText("coding.intent.label"), value: s.intent, options: s.intents, disabled: roundActive(page) || s.sending || unread(page),
      change: value => chooseIntent(page, value) },
    ...page.refs.composerModels.scene(),
    ...nextRound(page),
  ];
}

/** The page's commands under `/`; those that set what the next round is given are in ＋ too, with their glyph. */
function composerCommands(page: Page): ComposerCommand[] {
  return codingCommands(page).filter(command => command.enabled !== false).map(command => ({
    slash: command.slash, label: command.label, ...(command.hint ? { hint: command.hint } : {}), ...(command.keywords ? { keywords: command.keywords } : {}),
    ...(command.adds ? { icon: command.adds } : { add: false as const }), run: () => void page.refs.commandsUi.run(command),
  }));
}

/** What stops a send before it goes, said in the composer's status line rather than by a send that does nothing. */
function missing(page: Page): string | null {
  const { readText, s } = page;
  if (s.recovery) return readText("coding.composer.recovering");
  if (s.checkpointBusy) return readText("coding.checkpoints.busy");
  if (roundActive(page)) return null;
  if (!s.state.models.some(model => JSON.stringify([model.provider_id, model.model_id]) === page.refs.composerModels.value())) return readText("coding.model.choose-first");
  if (!s.state.workspaces?.some(workspace => workspace.workspace_id === s.workspaceId)) return readText("coding.workspace.choose-first");
  return null;
}

/**
 * The composer's words: to the round under way as a supplement in the delivery chosen, or as the task of a new round once the
 * person said who goes first when other work names the same files. Only a send that went clears the box (the composer's rule);
 * one whose answer was lost fails, and its retry goes under the same key (input-receipts.ts).
 */
async function submit(page: Page, id: string, input: ComposerSubmission): Promise<ComposerOutcome> {
  const { readText, refs, s } = page;
  if (s.current !== id || s.sending) return { state: "failed", message: readText("coding.composer.busy") };
  const run = s.lastRun, task = input.text;
  const selection: RoundSelection = { ...currentSelection(page, id), action_tools: structuredClone(s.actionSelections.get(id) || []), writer_assignments: structuredClone(s.configurations.get(id)?.writer_assignments || []) };
  s.sending = true;
  s.composerSending = true;
  controls(page);
  try {
    rememberConfiguration(page);
    await refs.draft.flush();
    if (run && !terminal(run.phase)) status(page, await refs.inputReceipts.steer(id, run.ref.run_id, task, input.delivery ?? "next-boundary"));
    else if (!await startFromComposer(page, id, task, selection, s.intent, refs.composerModels.value())) return { state: "failed", message: readText("coding.composer.cancelled") };
    surfaceChanged(page, id);
    void refreshState(page).then(() => readCurrent(page)).catch(error => status(page, errorMessage(error), true));
    return { state: "sent" };
  } catch (error) {
    return { state: "failed", message: errorMessage(error) };
  } finally {
    s.sending = false;
    s.composerSending = false;
    controls(page);
  }
}

/**
 * Mounts the platform's composer (unified-input-voice K4) for the session on show, or for none: each session gets its own mount
 * with its own draft (draft.ts's adapter), so what a send or a draft read brings back late lands only on the session it was for.
 * The bar's controls, commands, stop and pause are read on every draw; `controls()` asks for one when they changed.
 */
export function mountCodingComposer(page: Page, id: string) {
  const { readText, q, refs, s } = page;
  if (!window.molisComposer) throw new Error("The page has no composer");
  s.composerDrawn = "";
  refs.composerLabels = codingComposerLabels(readText, mac());
  refs.composer = window.molisComposer(q("[data-coding-input]"), {
    kind: "ai", entry: "session", labels: refs.composerLabels, sources: false,
    ...(id ? { draft: { adapter: refs.draft.adapter(id) } } : {}),
    receiver: () => {
      const session = s.current ? s.state.sessions.find(item => item.session_id === s.current) : undefined;
      // Only a session on show takes words: on the directory or the start page the bar is the Assistant's (one input, O3).
      if (!s.current || !s.sessionOnShow) return null;
      // 「发给」 lists the latest few other sessions too; picking one opens it as its row in the list would (§10.4).
      const others = s.state.sessions.filter(item => item.session_id !== s.current).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, OTHERS)
        .map(item => ({ id: item.session_id, label: sessionTitle(item.title) || readText("coding.session.untitled"), detail: readText("coding.receiver.detail") }));
      return { label: sessionTitle(session?.title) || readText("coding.session.untitled"), icon: "code", detail: readText("coding.receiver.detail"), others,
        choose: (other: string) => { const item = s.state.sessions.find(one => one.session_id === other); if (!item) return; page.host.openItem("coding", other, sessionTitle(item.title)); void select(page, other); } };
    },
    delivery: () => deliveries(page),
    stop: () => stopRound(page),
    pause: () => pauseOf(page),
    get controls() { return sceneControls(page); },
    get commands() { return composerCommands(page); },
    mentions: (query, signal) => refs.mentions(query, signal),
    required: () => missing(page),
    submit: input => submit(page, id, input),
  });
}

/** Keep the mounted input and its draft while the same composer starts using the selected words. */
export function retitleCodingComposer(page: Page): void {
  const { readText, refs, s } = page;
  if (!refs.composerLabels) return;
  Object.assign(refs.composerLabels, codingComposerLabels(readText, mac()));
  drawIntents(page, s.state);
  retitleMethodControls(page);
  s.composerDrawn = "";
  controls(page);
}
