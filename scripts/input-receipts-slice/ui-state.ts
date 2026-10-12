/**
 * The page's own state and what each action does to it. Pure, so the tests can walk the same paths a person clicks.
 *
 * There is one rule behind every action that touches the conversation itself: the page never invents an event. A click
 * moves the cursor along a recorded ledger (play, step, send the recorded next input, withdraw the recorded withdrawal,
 * insist on the recorded correction) or switches to a recorded branch. What was not recorded is disabled, and says so.
 */
import type { Checkpoint, Ledger, Recording, Scene } from "./facts.ts";
import { checkpointAt, viewAt, type Cursor, type View } from "./scene-state.ts";

export type Layout = "assistant" | "coding";
export type SendMode = "next-boundary" | "interrupt" | "after-run" | "side";
export type CorrectionKind = "treatment" | "target" | "note" | "withdraw";

/** A correction the person made on the page. It is Molis-layer (simulated): no SDK fact stands behind it. */
export interface Correction {
  readonly inputId: string;
  readonly kind: CorrectionKind;
  readonly summary: string;
  /** The recorded branch it led to, if the recording has one (only "insist on the input that was not adopted"). */
  readonly recorded: boolean;
}
export interface Draft { readonly kind: CorrectionKind; readonly treatment: string; readonly note: string }

export interface Ui {
  readonly layout: Layout;
  readonly theme: "light" | "dark";
  readonly sceneId: string;
  readonly cursor: Cursor;
  readonly expanded: readonly string[];
  readonly trayOpen: boolean;
  readonly menu: "send" | "demo" | null;
  readonly correcting: string | null;
  readonly draft: Draft;
  readonly sendMode: SendMode;
  readonly chip: "this-run" | "questionnaire";
  readonly corrections: readonly Correction[];
  readonly playing: boolean;
  readonly note: string;
}

export const DEFAULT_DRAFT: Draft = { kind: "treatment", treatment: "apply-now", note: "" };

export function sceneOf(rec: Recording, id: string): Scene {
  const found = rec.scenes.find(one => one.id === id);
  if (found === undefined) throw new Error(`no scene ${id}`);
  return found;
}
export function firstCheckpoint(scene: Scene): Checkpoint {
  const found = scene.checkpoints[0];
  if (found === undefined) throw new Error(`scene ${scene.id} has no checkpoint`);
  return found;
}

export function initial(rec: Recording, layout: Layout, theme: "light" | "dark"): Ui {
  const scene = sceneOf(rec, "main");
  const cp = firstCheckpoint(scene);
  return { layout, theme, sceneId: scene.id, cursor: { run: cp.run, at: cp.at }, expanded: [], trayOpen: false, menu: null, correcting: null,
    draft: DEFAULT_DRAFT, sendMode: "next-boundary", chip: "this-run", corrections: [], playing: false, note: "" };
}

/** The checkpoint the cursor rests on, if it rests on one. */
export function restingCheckpoint(scene: Scene, cursor: Cursor): Checkpoint | undefined {
  return scene.checkpoints.find(one => one.run === cursor.run && one.at === cursor.at);
}
export function view(rec: Recording, ui: Ui): View {
  const scene = sceneOf(rec, ui.sceneId);
  return viewAt(scene, ui.cursor, restingCheckpoint(scene, ui.cursor));
}

export function toScene(rec: Recording, ui: Ui, sceneId: string, checkpointId?: string): Ui {
  const scene = sceneOf(rec, sceneId);
  const cp = checkpointId === undefined ? firstCheckpoint(scene) : checkpointAt(scene, checkpointId);
  return { ...ui, sceneId, cursor: { run: cp.run, at: cp.at }, expanded: [], trayOpen: false, menu: null, correcting: null, draft: DEFAULT_DRAFT,
    chip: "this-run", corrections: [], playing: false, note: "" };
}
export function toCheckpoint(rec: Recording, ui: Ui, checkpointId: string): Ui {
  const cp = checkpointAt(sceneOf(rec, ui.sceneId), checkpointId);
  return { ...ui, cursor: { run: cp.run, at: cp.at }, playing: false };
}
export function restart(ui: Ui): Ui {
  return { ...ui, cursor: { run: 0, at: 1 }, expanded: [], trayOpen: false, correcting: null, corrections: [], playing: false };
}

/** The event the cursor would play next, if there is one in this run. */
export function nextEvent(rec: Recording, ui: Ui): Ledger | undefined {
  return sceneOf(rec, ui.sceneId).runs[ui.cursor.run]?.events[ui.cursor.at];
}
export function lastCursor(scene: Scene): Cursor {
  const run = scene.runs.length - 1;
  return { run, at: scene.runs[run]?.events.length ?? 0 };
}
/** One event forward; at the end of a run, the first events of the next one. */
export function step(rec: Recording, ui: Ui): Ui {
  const scene = sceneOf(rec, ui.sceneId);
  const run = scene.runs[ui.cursor.run];
  if (run === undefined) return { ...ui, playing: false };
  if (ui.cursor.at < run.events.length) return { ...ui, cursor: { run: ui.cursor.run, at: ui.cursor.at + 1 } };
  if (ui.cursor.run + 1 < scene.runs.length) return { ...ui, cursor: { run: ui.cursor.run + 1, at: 1 } };
  return { ...ui, playing: false };
}
export function atEnd(rec: Recording, ui: Ui): boolean {
  const end = lastCursor(sceneOf(rec, ui.sceneId));
  return ui.cursor.run === end.run && ui.cursor.at >= end.at;
}

// ---- what can be done with the recording as it is ------------------------------------------------------------------
export interface Offer {
  /** The recorded next input of the person: sending plays it. */
  readonly send: { readonly text: string } | undefined;
  /** Inputs whose recorded next event is their own withdrawal. */
  readonly withdraw: readonly string[];
  /** The next recorded event is the answer to the question that is waiting. */
  readonly answer: boolean;
  readonly canStep: boolean;
}
export function offers(rec: Recording, ui: Ui): Offer {
  const event = nextEvent(rec, ui);
  const send = event?.type === "prompt" && typeof event["steerId"] === "string" && event["source"] !== "app" && event["source"] !== "peer"
    ? { text: String(event["text"]) } : undefined;
  const withdrawn = event?.type === "steer-withdrawn" ? [String(event["steerId"])] : [];
  return { send, withdraw: withdrawn, answer: event?.type === "tool-result", canStep: !atEnd(rec, ui) };
}

export function sendRecorded(rec: Recording, ui: Ui): Ui {
  return offers(rec, ui).send === undefined ? ui : { ...step(rec, ui), menu: null };
}
/** Plays the recorded withdrawal of `steerId`. */
export function withdrawRecorded(rec: Recording, ui: Ui, steerId: string): Ui {
  return offers(rec, ui).withdraw.includes(steerId) ? { ...step(rec, ui), correcting: null } : ui;
}

/** "坚持采纳" on the input the model did not adopt: plays the recorded correction run (the only branch the recording has). */
export function insist(rec: Recording, ui: Ui): Ui | undefined {
  const scene = sceneOf(rec, ui.sceneId);
  const cp = scene.checkpoints.find(one => one.id === "corrected");
  if (cp === undefined) return undefined;
  return { ...ui, cursor: { run: cp.run, at: cp.at }, correcting: null, expanded: [], playing: false };
}

export function toggle(list: readonly string[], key: string): readonly string[] {
  return list.includes(key) ? list.filter(one => one !== key) : [...list, key];
}

export function addCorrection(ui: Ui, correction: Correction): Ui {
  return { ...ui, corrections: [...ui.corrections.filter(one => !(one.inputId === correction.inputId && one.kind === correction.kind)), correction], correcting: null, draft: DEFAULT_DRAFT };
}
