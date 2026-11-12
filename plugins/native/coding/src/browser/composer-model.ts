import type { ComposerControl } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { errorMessage } from "./dom.js";
import type { PagePorts } from "./types.js";

/** A model the Host's catalog lists (`state.models`). */
export interface ModelChoice {
  readonly provider_id: string;
  readonly model_id: string;
  readonly label: string;
  /** The person marked the model as taking a reasoning effort. */
  readonly reasoning_effort?: boolean;
}

/** The round the controls read, as far as they read it. */
export interface ComposerRun {
  readonly ref: { readonly run_id: string };
  readonly frozen?: { readonly model_id?: string; readonly reasoning_effort?: string; readonly thinking?: unknown };
  readonly model_switch?: { readonly now?: string; readonly requested?: string };
}

export interface ComposerModelPorts extends Pick<PagePorts, "lifetime" | "translate" | "q" | "status"> {
  /** Asks the running round to take the model from its next call. */
  readonly switchModel: (run: ComposerRun, model: { readonly provider_id: string; readonly model_id: string }) => Promise<unknown>;
  /** The person changed a choice in the bar (the model or the effort): the page keeps it as the session's start. */
  readonly changed: () => void;
  /** Something the bar shows changed (the note beside it is the models' own): the composer draws its controls again. */
  readonly redraw: () => void;
}

export interface ComposerModels {
  /** Fills the model choice from the catalog. */
  fill(next: readonly ModelChoice[]): void;
  /** The chosen model as `[provider_id, model_id]` in JSON, the way rounds are started with it; "" when none is. */
  value(): string;
  /** Chooses a model by that value; one the catalog no longer lists is kept, said to be unavailable, so a send can say so. */
  choose(value: string): void;
  /** The effort this round is started with, when the chosen model takes one and the person chose it. */
  effort(): { reasoning_effort?: string };
  /** The session's saved start: the effort it was started with, where the model still takes one. */
  apply(config: { readonly reasoning_effort?: string } | null | undefined): void;
  /** Busy, and the round on show: the live one may be switched, and its settings are what the note says. */
  controls(view: { readonly active: boolean; readonly sending: boolean; readonly run: ComposerRun | null | undefined }): void;
  /** The bar's model controls now (unified-input-voice K4): the model, its effort while no round runs, and switching a live round. */
  scene(): ComposerControl[];
}

/**
 * The composer's model controls. Which configured model the next round uses (the Host's own catalog, `state.models`),
 * its reasoning effort where the person marked the model as taking one, and — while a round runs — switching that round
 * to the chosen model from its next model call. The page's composer draws them as scene controls (`scene`); a note beside
 * the composer says what the round on show is really using.
 */
export function composerModels(ports: ComposerModelPorts): ComposerModels {
  const { q, lifetime, switchModel, status, changed, redraw, translate: readText } = ports;
  const note = q("[data-coding-model-note]");
  const effortKeys: Readonly<Record<string, string>> = { low: "coding.effort.low", medium: "coding.effort.medium", high: "coding.effort.high" };
  let list: readonly ModelChoice[] = [], live: ComposerRun | null = null, busy = false, switching = false, round: ComposerRun | null = null;
  let value = "", effort = "";
  const key = (item: Pick<ModelChoice, "provider_id" | "model_id">) => JSON.stringify([item.provider_id, item.model_id]);
  const chosen = () => list.find((item) => key(item) === value) || null;
  /** No model chosen yet (a session started before any was set up): the first the catalog lists, as the select shows it. */
  const settle = () => { if (!value && list.length) value = key(list[0]!); };
  /** What the round on show really uses: its start model, a switch taken or asked for, its effort and thinking. */
  const noteOf = (on: ComposerRun) => [
    readText("coding.model.round", { model: on.model_switch?.now ? readText("coding.model.switched", { now: on.model_switch.now, start: on.frozen?.model_id ?? "" }) : on.frozen?.model_id || "" }),
    ...(on.frozen?.reasoning_effort ? [readText("coding.model.effort", { effort: effortKeys[on.frozen.reasoning_effort] ? readText(effortKeys[on.frozen.reasoning_effort]!) : on.frozen.reasoning_effort })] : []),
    ...(on.frozen?.thinking ? [readText("coding.model.thinking")] : []),
    ...(on.model_switch?.requested ? [readText("coding.model.requested", { model: on.model_switch.requested })] : []),
  ];
  const paint = () => {
    const parts = round ? noteOf(round) : [];
    note.hidden = !parts.length;
    note.textContent = parts.join(" · ");
    redraw();
  };
  /** A running round can be sent to another model from its next call; the one it already uses or asked for is no switch. */
  const switchable = () => {
    const model = chosen(), using = live?.model_switch?.now || live?.frozen?.model_id;
    return live && model && model.model_id !== using && live.model_switch?.requested !== model.model_id ? model : null;
  };
  async function switchTo() {
    const model = switchable();
    if (!model || !live || busy || switching) return;
    switching = true;
    paint();
    try {
      await switchModel(live, { provider_id: model.provider_id, model_id: model.model_id });
      status(readText("coding.model.switch-asked", { model: model.label }));
    } catch (error) {
      if (lifetime.alive) status(readText("coding.model.switch-failed", { reason: errorMessage(error) }), true);
    } finally {
      switching = false;
      paint();
    }
  }
  return {
    fill(next) {
      list = next;
      settle();
      q("[data-coding-model-setup]").hidden = next.length > 0;
      paint();
    },
    value: () => value,
    choose(next) { value = next; settle(); paint(); },
    effort: () => chosen()?.reasoning_effort && effort ? { reasoning_effort: effort } : {},
    apply(config) { effort = config?.reasoning_effort || ""; paint(); },
    controls({ active, sending, run }) {
      live = active ? run ?? null : null;
      round = run || null;
      busy = Boolean(sending);
      paint();
    },
    scene() {
      const options = list.map((item) => ({ value: key(item), label: item.label }));
      // A session started on a model the catalog no longer lists keeps it, said to be unavailable, until another is chosen.
      if (value && !options.some((option) => option.value === value)) options.push({ value, label: readText("coding.model.unavailable") });
      if (!options.length) options.push({ value: "", label: readText("coding.model.none") });
      const controls: ComposerControl[] = [{ kind: "select", id: "model", label: readText("coding.model.label"), options, value, disabled: busy,
        change: (next) => { value = next; changed(); paint(); } }];
      // The effort is fixed for a running round (the note says which); the choice is for the next one.
      if (chosen()?.reasoning_effort && !live) controls.push({ kind: "select", id: "effort", label: readText("coding.effort.label"), value: effort, disabled: busy,
        options: [{ value: "", label: readText("coding.effort.default") }, ...(["low", "medium", "high"] as const).map((level) => ({ value: level, label: readText(effortKeys[level]!) }))],
        change: (next) => { effort = next; changed(); paint(); } });
      const target = switchable();
      if (target) controls.push({ kind: "button", id: "model-switch", label: readText("coding.model.switch"), title: readText("coding.model.switch-title", { model: target.label }),
        disabled: busy || switching, run: () => void switchTo() });
      return controls;
    },
  };
}
