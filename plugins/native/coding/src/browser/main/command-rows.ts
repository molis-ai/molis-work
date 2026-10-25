import { el, errorMessage } from "../dom.js";
import type { Page } from "./page.js";
import { api, sessionPath } from "./request.js";
import type { CommandReceipt, CommandRef, RunView } from "./shapes.js";

/** One command of a round, as its row in the results panel holds it. */
interface Row { readonly ref: CommandRef; readonly number: number; readonly target: string }

/** A summarized round names its command targets itself; a loaded one is read from its activity. */
function commandRows(runs: readonly RunView[]): Row[] {
  return runs.flatMap((run, index) => (run.command_outputs || []).map(({ target, ...ref }) => ({ ref, number: index + 1, target: target ?? run.activity?.find(item => item.call_id === ref.call_id)?.target ?? "" })));
}

/** How the command ended, in words; empty when it simply exited. */
function endedWith(page: Page, receipt: CommandReceipt): string {
  const { L } = page;
  if (receipt.stop_reason === "timed-out" || receipt.timed_out) return L("coding.commands.timed-out");
  if (receipt.stop_reason === "cancelled" || receipt.cancelled) return L("coding.state.cancelled");
  return receipt.exit_code === null ? L("coding.commands.exit-unknown") : "";
}

/** The receipt of a command: what was run, how it ended, and what it printed. */
function drawReceipt(page: Page, body: HTMLElement, receipt: CommandReceipt) {
  const { L } = page;
  body.replaceChildren(el("p", L("coding.commands.recorded", { command: receipt.command }), "coding-command-recorded"));
  for (const [label, value] of [[L("coding.commands.stdout"), receipt.stdout], [L("coding.commands.stderr"), receipt.stderr]] as const) {
    body.append(el("p", label), el("pre", value || L("coding.commands.no-output")));
  }
  if (receipt.truncated) body.append(el("p", L("coding.commands.truncated")));
}

/** One command's row: its receipt is read from the Host when the row is opened. */
function commandRow(page: Page, region: HTMLElement, row: Row, key: string) {
  const { L, lifetime } = page, { s } = page, { ref, number, target } = row;
  const detail = el("details", "", "coding-command"), summary = el("summary"), line = el("code", target ? "$ " + target : L("coding.commands.title")), state = el("span", "", "coding-command-state");
  detail.dataset.command = key;
  line.title = target;
  summary.append(line, state, el("span", L("coding.turn.number", { number }), "coding-command-round"));
  const body = el("div");
  detail.append(summary, body);
  region.insertBefore(detail, region.querySelector(":scope > h3")?.nextSibling || null);
  let loaded = false, busy = false;
  const load = async () => {
    if (loaded || busy) return;
    busy = true;
    body.textContent = L("coding.commands.loading");
    const id = s.current, ticket = s.generation;
    try {
      const receipt = await api<CommandReceipt>(page, sessionPath(id, ref.run_id) + "/commands/" + encodeURIComponent(ref.call_id));
      if (id !== s.current || ticket !== s.generation) return;
      loaded = true;
      state.textContent = endedWith(page, receipt) || "exit " + receipt.exit_code;
      state.dataset.tone = receipt.exit_code === 0 && !receipt.timed_out && !receipt.cancelled ? "done" : "failed";
      if (!target) {
        line.textContent = "$ " + receipt.command;
        line.title = receipt.command;
      }
      drawReceipt(page, body, receipt);
    } catch (error) {
      if (!lifetime.alive || id !== s.current || ticket !== s.generation) return;
      body.textContent = errorMessage(error);
      const retry = el("button", L("coding.common.reload"), "mw-btn");
      retry.type = "button";
      lifetime.listen(retry, "click", load);
      body.append(retry);
    } finally {
      busy = false;
    }
  };
  lifetime.listen(detail, "toggle", () => {
    if (detail.open) void load();
  });
}

/** The commands the rounds ran, one row each; a row already drawn is kept. */
export function renderCommandRows(page: Page, runs: readonly RunView[]) {
  const region = page.q("[data-coding-commands]"), rows = commandRows(runs);
  region.hidden = !rows.length;
  const shown = new Set([...region.children].map(node => (node as HTMLElement).dataset.command));
  for (const row of rows) {
    const key = JSON.stringify(row.ref);
    if (shown.has(key)) continue;
    shown.add(key);
    commandRow(page, region, row, key);
  }
}
