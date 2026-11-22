import { escapeHtml, renderButton, renderSelect, renderSettingRow } from "@molis-ai/molis-work-plugin-sdk/ui";
import { errorMessage } from "./dom.js";
import type { PagePorts } from "./types.js";

/** A model the Host's catalog lists (`state.models`). */
export interface ModelChoice {
  readonly provider_id: string;
  readonly model_id: string;
  readonly label: string;
  /** The person marked the model as taking a reasoning effort. */
  readonly reasoning_effort?: boolean;
  /** What the person marked: true sees pictures, false does not; absent when unmarked. */
  readonly vision?: boolean;
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
  /** The chosen model as the catalog lists it, or null. */
  current(): ModelChoice | null;
  /** The first model marked as seeing pictures, as a value `choose` takes, or "" when none is. */
  sighted(): string;
  /** The effort this round is started with, when the chosen model takes one and the person chose it. */
  effort(): { reasoning_effort?: string };
  /** The session's saved start: the effort it was started with, where the model still takes one. */
  apply(config: { readonly reasoning_effort?: string } | null | undefined): void;
  /** Busy, and the round on show: the live one may be switched, and its settings are what the note says. */
  controls(view: { readonly active: boolean; readonly sending: boolean; readonly run: ComposerRun | null | undefined }): void;
  /** The chosen model by name, as the bar's tooltip and ＋ say it: "" when none is chosen, and the unavailable one says so. */
  summary(): string;
}

/**
 * The composer's model controls. Which configured model the next round uses (the Host's own catalog, `state.models`),
 * its reasoning effort where the person marked the model as taking one, and — while a round runs — switching that round
 * to the chosen model from its next model call. They are rows of 「本轮设置」 (screen-polish §6.7: the bar's bottom row keeps
 * ＋, who it goes to, the way of working and send), opened from ＋; the bar's tooltip names the model (`summary`), and a note
 * beside the composer says what the round on show is really using.
 */
export function composerModels(ports: ComposerModelPorts): ComposerModels {
  const { q, lifetime, switchModel, status, changed, redraw, translate: readText } = ports;
  const note = q("[data-coding-model-note]"), rows = q("[data-coding-round-model]");
  const effortKeys: Readonly<Record<string, string>> = { low: "coding.effort.low", medium: "coding.effort.medium", high: "coding.effort.high" };
  let list: readonly ModelChoice[] = [], live: ComposerRun | null = null, busy = false, switching = false, round: ComposerRun | null = null;
  let value = "", effort = "", listed = "";
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
    // The round's model is said beside the composer only when it is not the one the composer shows: a switch taken or
    // asked for, or a round started with another model (screen-polish §6.3). The results panel's run details always name it.
    const using = round?.model_switch?.now || round?.frozen?.model_id;
    note.hidden = !parts.length || !(round?.model_switch?.now || round?.model_switch?.requested || (using && chosen() && chosen()!.model_id !== using));
    note.textContent = parts.join(" · ");
    draw(parts);
    redraw();
  };
  const option = (item: { value: string; label: string }, now: string) => `<option value="${escapeHtml(item.value)}"${item.value === now ? " selected" : ""}>${escapeHtml(item.label)}</option>`;
  /** One row of 「本轮设置」 by its mark, made from `markup` the first time it is wanted; `null` when it is not there and no markup is given. */
  const row = (mark: string, markup?: () => string): HTMLElement | null => {
    const had = rows.querySelector<HTMLElement>("[" + mark + "]");
    if (had || !markup) return had;
    const made = document.createElement("template");
    made.innerHTML = markup();
    return made.content.firstElementChild as HTMLElement;
  };
  /**
   * The rows of 「本轮设置」: the model, its effort while no round runs (a running round's is fixed; the row above says which), and
   * switching a live round. A row is made once and kept: each draw sets what changed on the same nodes (the select picker follows
   * its select's options, value and `disabled`), so the control the person is on keeps the focus through a choice. Only a row that
   * no longer applies is taken out, and focus that was in it goes to the model's choice.
   */
  const draw = (parts: readonly string[]) => {
    const options = list.map((item) => ({ value: key(item), label: item.label }));
    // A session started on a model the catalog no longer lists keeps it, said to be unavailable, until another is chosen.
    if (value && !options.some((one) => one.value === value)) options.push({ value, label: readText("coding.model.unavailable") });
    if (!options.length) options.push({ value: "", label: readText("coding.model.none") });
    const modelRow = row("data-coding-model-row", () => renderSettingRow({ name: readText("coding.model.label"), hint: "", attrs: { "data-coding-model-row": "" }, hintAttrs: { "data-coding-model-hint": "" },
      control: renderSelect({ attrs: { "data-coding-model": "", "aria-label": readText("coding.model.label") } }) }))!;
    if (!modelRow.isConnected) rows.prepend(modelRow);
    modelRow.querySelector("[data-coding-model-hint]")!.textContent = parts.length ? parts.join(" · ") : readText("coding.palette.model-hint");
    const model = modelRow.querySelector<HTMLSelectElement>("[data-coding-model]")!, offered = JSON.stringify(options);
    if (offered !== listed) {
      listed = offered;
      model.innerHTML = options.map((one) => option(one, value)).join("");
    }
    choose(model, value);
    let lost = false;
    const leave = (gone: HTMLElement | null) => {
      if (!gone) return;
      lost ||= gone.contains(document.activeElement);
      gone.remove();
    };
    if (chosen()?.reasoning_effort && !live) {
      const effortRow = row("data-coding-effort-row", () => renderSettingRow({ name: readText("coding.effort.label"), attrs: { "data-coding-effort-row": "" },
        control: renderSelect({ attrs: { "data-coding-effort": "", "aria-label": readText("coding.effort.label") },
          optionsHtml: [{ value: "", label: readText("coding.effort.default") }, ...(["low", "medium", "high"] as const).map((level) => ({ value: level, label: readText(effortKeys[level]!) }))].map((one) => option(one, effort)).join("") }) }))!;
      if (!effortRow.isConnected) modelRow.after(effortRow);
      choose(effortRow.querySelector<HTMLSelectElement>("[data-coding-effort]")!, effort);
    } else leave(row("data-coding-effort-row"));
    const target = switchable();
    if (target) {
      const switchRow = row("data-coding-model-switch-row", () => renderSettingRow({ name: "", hint: "", attrs: { "data-coding-model-switch-row": "" }, nameAttrs: { "data-coding-model-switch-name": "" }, hintAttrs: { "data-coding-model-switch-hint": "" },
        control: renderButton({ label: readText("coding.model.switch"), variant: "secondary", size: "sm", attrs: { "data-coding-model-switch": "" } }) }))!;
      if (!switchRow.isConnected) rows.append(switchRow);
      // The row is named by the model alone: its button says 本轮改用, its hint when that takes effect.
      switchRow.querySelector("[data-coding-model-switch-name]")!.textContent = target.label;
      switchRow.querySelector("[data-coding-model-switch-hint]")!.textContent = readText("coding.model.switch-title", { model: target.label });
      const press = switchRow.querySelector<HTMLButtonElement>("[data-coding-model-switch]")!, off = busy || switching;
      // Pressed, it goes off while the switch is asked for: the focus it held goes to the model's choice rather than nowhere.
      lost ||= off && !press.disabled && press === document.activeElement;
      press.disabled = off;
    } else leave(row("data-coding-model-switch-row"));
    // `focus` on a select the picker has taken is the picker's own control.
    if (lost) model.focus({ preventScroll: true });
  };
  /** Sets a select to `now` and to whether it can be changed, touching it only where it differs (each touch redraws its picker). */
  const choose = (select: HTMLSelectElement, now: string) => {
    if (select.value !== now) select.value = now;
    if (select.disabled !== busy) select.disabled = busy;
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
  rows.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.hasAttribute("data-coding-model")) value = select.value;
    else if (select.hasAttribute("data-coding-effort")) effort = select.value;
    else return;
    changed();
    paint();
  });
  rows.addEventListener("click", (event) => { if (event.target instanceof Element && event.target.closest("[data-coding-model-switch]")) void switchTo(); });
  return {
    fill(next) {
      list = next;
      settle();
      q("[data-coding-model-setup]").hidden = next.length > 0;
      paint();
    },
    value: () => value,
    choose(next) { value = next; settle(); paint(); },
    current: () => chosen(),
    sighted: () => { const one = list.find((item) => item.vision === true); return one ? key(one) : ""; },
    effort: () => chosen()?.reasoning_effort && effort ? { reasoning_effort: effort } : {},
    apply(config) { effort = config?.reasoning_effort || ""; paint(); },
    controls({ active, sending, run }) {
      live = active ? run ?? null : null;
      round = run || null;
      busy = Boolean(sending);
      paint();
    },
    summary: () => chosen()?.label ?? (value ? readText("coding.model.unavailable") : ""),
  };
}
