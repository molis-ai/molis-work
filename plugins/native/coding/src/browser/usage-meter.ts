import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { errorMessage } from "./dom.js";
import type { PagePorts } from "./types.js";

interface TokenCounts { readonly input: number; readonly output: number; readonly cached_input?: number }

interface UsageTotal {
  readonly rounds: number;
  readonly tokens: TokenCounts;
  readonly digests?: { readonly calls: number; readonly tokens: TokenCounts };
  readonly cost_usd?: number;
  readonly uncertain_rounds?: number;
}

/** What the session read says about spending (src/usage.ts, routes-sessions.ts write it). */
export interface UsageData {
  readonly run_count: number;
  readonly usage_total?: UsageTotal | null;
  readonly budget?: { readonly tokens: number } | null;
  readonly next_history?: { readonly history: string; readonly reason?: string };
  readonly compact_requested?: boolean;
}

/** The run the meter reads the context of. */
export interface MeterRun {
  readonly frozen?: { readonly model_context?: { readonly window_tokens?: number } };
  readonly usage?: { readonly context?: { readonly tokens?: number; readonly coverage?: string } };
}

export type UsageMeterPorts = PagePorts;

export interface UsageMeter {
  /** Draws the meter for the session read and its latest run (none: the meter hides). */
  render(data: UsageData, run: MeterRun | null | undefined): void;
}

interface MeterView { readonly data: UsageData; readonly run: MeterRun | null | undefined }

const RING = 2 * Math.PI * 8;

const el = <Tag extends keyof HTMLElementTagNameMap>(tag: Tag, cls?: string, text?: string): HTMLElementTagNameMap[Tag] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const n = (value: unknown) => Number(value).toLocaleString("zh-CN");
const short = (value: number) => new Intl.NumberFormat(document.documentElement.lang || "zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const contextOf = (run: MeterRun | null | undefined) => {
  const windowTokens = run?.frozen?.model_context?.window_tokens, used = run?.usage?.context?.tokens;
  return { windowTokens, used, share: windowTokens && used !== undefined ? used / windowTokens : null, coverage: run?.usage?.context?.coverage };
};
const spentOf = (data: UsageData) => data.usage_total ? data.usage_total.tokens.input + data.usage_total.tokens.output : 0;

/** The panel's pieces, drawn from the view the meter holds. `budgetSaved` lets the meter say the budget line again. */
interface PanelParts { readonly ports: UsageMeterPorts; readonly panel: HTMLElement; readonly budgetSaved: () => void }

const section = (panel: HTMLElement, title: string) => {
  const node = el("section");
  node.append(el("h3", "", title));
  panel.append(node);
  return node;
};

/** The context bar, what the next round will send, and the compact button. */
function drawContext({ ports, panel }: PanelParts, { data, run }: MeterView) {
  const { lifetime, api, current, status, refresh } = ports;
  const context = contextOf(run);
  const box = section(panel, uiText.text("coding.meter.context"));
  if (context.used === undefined) {
    box.append(el("p", "coding-meter-note", uiText.text("coding.meter.no-count")));
  } else {
    const bar = el("div", "coding-meter-bar"), level = el("span");
    level.style.width = (context.share === null ? 0 : Math.min(100, context.share * 100)) + "%";
    bar.append(level);
    bar.dataset.tone = (context.share ?? 0) >= 0.85 ? "attention" : (context.share ?? 0) >= 0.6 ? "notice" : "";
    const figure = (context.coverage === "reported" ? "" : uiText.text("coding.meter.about")) + n(context.used) + (context.windowTokens ? " / " + n(context.windowTokens) : "") + " tokens" + (context.share === null ? "" : " · " + Math.round(context.share * 100) + "%");
    const source = context.coverage === "reported" ? uiText.text("coding.meter.prompt-reported", { number: data.run_count })
      : context.coverage === "partial" ? uiText.text("coding.meter.prompt-partial", { number: data.run_count })
      : uiText.text("coding.meter.prompt-estimated", { number: data.run_count });
    box.append(el("p", "coding-meter-figure", figure), bar, el("p", "coding-meter-note", source + (context.windowTokens ? "" : uiText.text("coding.meter.no-window"))));
  }
  const next = data.next_history || { history: "session", reason: undefined };
  box.append(el("p", "", next.history === "digest" ? uiText.text("coding.meter.next-digest", { reason: next.reason ?? "" }) : uiText.text("coding.meter.next-full")));
  if (!data.run_count) return;
  const compact = el("button", "mw-btn mw-btn--ghost", data.compact_requested ? uiText.text("coding.meter.compact-cancel") : uiText.text("coding.meter.compact"));
  compact.type = "button";
  lifetime.listen(compact, "click", async () => {
    compact.disabled = true;
    try {
      await api("/sessions/" + encodeURIComponent(current()) + "/compact", "POST", { on: !data.compact_requested });
      await refresh();
      status(data.compact_requested ? uiText.text("coding.meter.compact-cancelled") : uiText.text("coding.meter.compact-set"));
    } catch (error) {
      if (!lifetime.alive) return;
      status(errorMessage(error), true);
    } finally {
      compact.disabled = false;
    }
  });
  box.append(compact);
}

/** What the session has used, as a list. */
function drawUsage({ panel }: PanelParts, total: UsageTotal) {
  const usage = section(panel, uiText.text("coding.meter.usage")), list = el("dl");
  const row = (key: string, value: string) => list.append(el("dt", "", key), el("dd", "", value));
  row(uiText.text("coding.meter.rounds"), n(total.rounds));
  row(uiText.text("coding.usage-line.input"), n(total.tokens.input) + " tokens");
  row(uiText.text("coding.usage-line.output"), n(total.tokens.output) + " tokens");
  if (total.tokens.cached_input !== undefined) row(uiText.text("coding.usage-line.cached_input"), n(total.tokens.cached_input) + " tokens");
  if (total.digests) row(uiText.text("coding.meter.digests"), uiText.text("coding.meter.digests-value", { calls: total.digests.calls, tokens: n(total.digests.tokens.input + total.digests.tokens.output) }));
  row(uiText.text("coding.usage-line.cost_usd"), total.cost_usd !== undefined ? "$" + total.cost_usd.toFixed(4) : uiText.text("coding.meter.cost-unknown"));
  usage.append(list);
  if (total.uncertain_rounds) usage.append(el("p", "coding-meter-note", uiText.text("coding.meter.uncertain", { count: total.uncertain_rounds })));
  if (total.digests && total.cost_usd !== undefined) usage.append(el("p", "coding-meter-note", uiText.text("coding.meter.digest-cost")));
}

/** The line the person sets for the session, and how much of it is spent. */
function drawBudget({ ports, panel, budgetSaved }: PanelParts, data: UsageData) {
  const { lifetime, api, current, status, refresh } = ports;
  const budget = data.budget, spent = spentOf(data);
  const limit = section(panel, uiText.text("coding.meter.budget")), form = el("form", "coding-meter-budget"), input = el("input", "mw-input"), save = el("button", "mw-btn mw-btn--secondary", uiText.text("coding.meter.save"));
  input.type = "number";
  input.min = "0.1";
  input.step = "any";
  input.inputMode = "decimal";
  input.placeholder = uiText.text("coding.meter.no-budget");
  input.value = budget ? String(budget.tokens / 1e4) : "";
  input.setAttribute("aria-label", uiText.text("coding.meter.budget-label"));
  save.type = "submit";
  form.append(input, el("span", "", uiText.text("coding.meter.budget-unit")), save);
  lifetime.listen(form, "submit", async (event) => {
    event.preventDefault();
    const value = input.value.trim(), tokens = value ? Math.round(Number(value) * 1e4) : null;
    if (value && !(tokens !== null && tokens >= 1000)) {
      status(uiText.text("coding.meter.budget-min"), true);
      return;
    }
    save.disabled = true;
    try {
      await api("/sessions/" + encodeURIComponent(current()), "PATCH", { budget: tokens === null ? null : { tokens } });
      budgetSaved();
      status(tokens ? uiText.text("coding.meter.budget-saved") : uiText.text("coding.meter.budget-cleared"));
      await refresh();
    } catch (error) {
      if (!lifetime.alive) return;
      status(errorMessage(error), true);
    } finally {
      save.disabled = false;
    }
  });
  const used = budget ? uiText.text("coding.meter.budget-used", { spent: short(spent), budget: short(budget.tokens), percent: Math.round(spent / budget.tokens * 100) }) : uiText.text("coding.meter.budget-how");
  limit.append(form, el("p", "coding-meter-note", used));
}

/**
 * How full the context is and what the session has used, next to the send button, like the context ring in Cursor or
 * Claude Code's /context and /cost. The figures are the Host's: the latest call's whole prompt against the window the
 * round was packed for, and the session's recorded usage. A figure that is not known says so instead of reading as 0.
 * The budget is the person's own line; reaching it is reported and never stops a round.
 */
export function usageMeter(ports: UsageMeterPorts): UsageMeter {
  const { lifetime, q, current, status } = ports;
  const root = q("[data-coding-meter]"), toggle = q("[data-coding-meter-toggle]"), panel = q("[data-coding-meter-panel]"), fill = q<SVGElement>("[data-coding-meter-fill]"), label = q("[data-coding-meter-label]");
  let view: MeterView | null = null, owner = "", warned = "";
  const parts: PanelParts = { ports, panel, budgetSaved: () => { warned = ""; } };
  const draw = () => {
    if (!view) return;
    panel.replaceChildren();
    drawContext(parts, view);
    if (view.data.usage_total) {
      drawUsage(parts, view.data.usage_total);
      drawBudget(parts, view.data);
    }
  };
  const open = (on: boolean) => {
    panel.hidden = !on;
    toggle.setAttribute("aria-expanded", String(on));
    if (on) {
      draw();
      panel.querySelector<HTMLElement>("button,input")?.focus({ preventScroll: true });
    }
  };
  lifetime.listen(toggle, "click", () => open(panel.hidden));
  lifetime.listen(panel, "keydown", event => {
    if (event instanceof KeyboardEvent && event.key === "Escape") {
      event.stopPropagation();
      open(false);
      toggle.focus();
    }
  });
  lifetime.listen(document, "pointerdown", event => {
    if (!panel.hidden && !(event.target instanceof Node && root.contains(event.target))) open(false);
  });
  return {
    render(data, run) {
      if (owner !== current()) {
        owner = current();
        warned = "";
        open(false);
      }
      view = { data, run };
      root.hidden = !run;
      if (!run) return;
      const context = contextOf(run), budget = data.budget, spent = spentOf(data), over = budget && spent >= budget.tokens, near = budget && spent >= budget.tokens * 0.8;
      const share = context.share === null ? null : Math.min(1, context.share);
      fill.style.strokeDasharray = (share === null ? 0 : share * RING) + " " + RING;
      root.dataset.tone = over ? "attention" : data.next_history?.history === "digest" ? "notice" : (share ?? 0) >= 0.85 ? "attention" : "";
      label.textContent = over ? uiText.text("coding.meter.over") : share === null ? uiText.text("coding.meter.context") : Math.round(share * 100) + "%";
      toggle.setAttribute("aria-label", uiText.text("coding.meter.toggle", { state: share === null ? uiText.text("coding.meter.share-unknown") : uiText.text("coding.meter.share", { percent: Math.round(share * 100) }) }) + (data.next_history?.history === "digest" ? uiText.text("coding.meter.toggle-digest") : "") + (over ? uiText.text("coding.meter.toggle-over") : ""));
      // Crossing the budget is said once, where the person is looking; the round carries on.
      const mark = over ? "over" : near ? "near" : "";
      if (mark && warned !== mark) {
        warned = mark;
        const message = over ? uiText.text("coding.meter.over-status", { spent: short(spent), budget: short(budget?.tokens ?? 0) }) : uiText.text("coding.meter.near-status", { spent: short(spent), budget: short(budget?.tokens ?? 0) });
        status(message);
      }
      if (!panel.hidden) draw();
    },
  };
}
