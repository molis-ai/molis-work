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
}

export interface ComposerModels {
  /** Fills the model picker from the catalog. */
  fill(next: readonly ModelChoice[]): void;
  /** The effort this round is started with, when the chosen model takes one and the person chose it. */
  effort(): { reasoning_effort?: string };
  /** The session's saved start: the effort it was started with, where the model still takes one. */
  apply(config: { readonly reasoning_effort?: string } | null | undefined): void;
  /** Busy, and the round on show: the live one may be switched, and its settings are what the note says. */
  controls(view: { readonly active: boolean; readonly sending: boolean; readonly run: ComposerRun | null | undefined }): void;
}

/**
 * The composer's model controls. Which configured model the next round uses (the Host's own catalog, `state.models`),
 * its reasoning effort where the person marked the model as taking one, and — while a round runs — switching that round
 * to the chosen model from its next model call. A note beside them says what the round on show is really using.
 */
export function composerModels(ports: ComposerModelPorts): ComposerModels {
  const { q, lifetime, switchModel, status, translate: L } = ports;
  // The effort select is enhanced into a picker, so it is shown and hidden through its wrapper.
  const models = q<HTMLSelectElement>("[data-coding-model]"), effort = q<HTMLSelectElement>("[data-coding-effort]"), effortWrap = q("[data-coding-effort-wrap]");
  const swap = q<HTMLButtonElement>("[data-coding-model-switch]"), note = q("[data-coding-model-note]");
  const EFFORT: Readonly<Record<string, string>> = { low: L("coding.effort.low"), medium: L("coding.effort.medium"), high: L("coding.effort.high") };
  let list: readonly ModelChoice[] = [], live: ComposerRun | null = null, busy = false, round: ComposerRun | null = null;
  const chosen = () => {
    try {
      const [provider, model] = JSON.parse(models.value || "[]") as [string, string];
      return list.find(item => item.provider_id === provider && item.model_id === model) || null;
    } catch {
      // The picker holds no model (the empty option), so none is chosen.
      return null;
    }
  };
  /** What the round on show really uses: its start model, a switch taken or asked for, its effort and thinking. */
  const noteOf = (on: ComposerRun) => [
    L("coding.model.round", { model: on.model_switch?.now ? L("coding.model.switched", { now: on.model_switch.now, start: on.frozen?.model_id ?? "" }) : on.frozen?.model_id || "" }),
    ...(on.frozen?.reasoning_effort ? [L("coding.model.effort", { effort: EFFORT[on.frozen.reasoning_effort] ?? on.frozen.reasoning_effort })] : []),
    ...(on.frozen?.thinking ? [L("coding.model.thinking")] : []),
    ...(on.model_switch?.requested ? [L("coding.model.requested", { model: on.model_switch.requested })] : []),
  ];
  const paint = () => {
    const model = chosen();
    // The effort is fixed for a running round (the note says which); the picker is for the next one.
    effortWrap.hidden = !model?.reasoning_effort || Boolean(live);
    effort.disabled = busy;
    // A running round can be sent to another model from its next call; the one it already uses or asked for is no switch.
    const using = live?.model_switch?.now || live?.frozen?.model_id;
    swap.hidden = !live || !model || model.model_id === using || live.model_switch?.requested === model.model_id;
    swap.disabled = busy;
    swap.title = model ? L("coding.model.switch-title", { model: model.label }) : "";
    const parts = round ? noteOf(round) : [];
    note.hidden = !parts.length;
    note.textContent = parts.join(" · ");
  };
  const fill = (next: readonly ModelChoice[]) => {
    list = next;
    const previous = models.value;
    const options = next.map(item => {
      const option = document.createElement("option");
      option.value = JSON.stringify([item.provider_id, item.model_id]);
      option.textContent = item.label;
      return option;
    });
    if (!options.length) {
      const option = document.createElement("option");
      option.textContent = L("coding.model.none");
      option.value = "";
      options.push(option);
    }
    q("[data-coding-model-setup]").hidden = next.length > 0;
    const key = JSON.stringify(next);
    if (models.dataset.options !== key) {
      models.replaceChildren(...options);
      models.dataset.options = key;
      if (options.some(option => option.value === previous)) models.value = previous;
    }
    paint();
  };
  lifetime.listen(models, "change", paint);
  lifetime.listen(swap, "click", async () => {
    const model = chosen();
    if (!model || !live || busy) return;
    busy = true;
    paint();
    try {
      await switchModel(live, { provider_id: model.provider_id, model_id: model.model_id });
      status(L("coding.model.switch-asked", { model: model.label }));
    } catch (error) {
      if (lifetime.alive) status(L("coding.model.switch-failed", { reason: errorMessage(error) }), true);
    } finally {
      busy = false;
      paint();
    }
  });
  return {
    fill,
    effort: () => chosen()?.reasoning_effort && effort.value ? { reasoning_effort: effort.value } : {},
    apply(config) {
      effort.value = config?.reasoning_effort || "";
      paint();
    },
    controls({ active, sending, run }) {
      live = active ? run ?? null : null;
      round = run || null;
      busy = Boolean(sending);
      models.disabled = busy;
      paint();
    },
  };
}
