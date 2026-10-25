import { errorMessage } from "../dom.js";
import { shut, terminal, unread } from "./composer-state.js";
import type { Page } from "./page.js";
import { status } from "./request.js";

/** Materials are picked in the one picker of project knowledge (specs/project-knowledge PMAT-17); the page holds the whole choice it hears back for the session that asked. */
export async function openMaterials(page: Page) {
  const { L, lifetime } = page, { draft } = page.refs, { s } = page;
  const id = s.current, ticket = ++s.materialTicket;
  if (document.documentElement.dataset.knowledgePicker !== "1") {
    status(page, L("coding.material.picker-unavailable"), true);
    return;
  }
  try {
    await draft.flush();
  } catch (error) {
    if (lifetime.alive) status(page, errorMessage(error), true);
    return;
  }
  if (s.current !== id || ticket !== s.materialTicket) return;
  document.dispatchEvent(new CustomEvent("molis-work:knowledge-pick", { detail: { request_id: "coding:" + id + ":" + ticket, selected: structuredClone(s.materialSelections.get(id) || []), max: 30 } }));
}

function contextLabel(page: Page, selector: string, label: string, count = 0) {
  const button = page.q(selector), text = button.querySelector("[data-slot=button-label]");
  if (text) text.textContent = label;
  button.title = label;
  button.dataset.count = count ? String(count) : "";
  button.setAttribute("aria-label", label);
}

/** The send, stop and pause buttons, and the pickers of what the next round is given. */
function runButtons(page: Page, active: boolean) {
  const { L, input, q } = page, { s } = page;
  input.disabled = shut(page);
  const send = q<HTMLButtonElement>("[data-coding-send]");
  const chosen = q<HTMLSelectElement>("[data-coding-model]").value;
  send.disabled = input.disabled || s.recovery || s.checkpointBusy || (!active && (!s.state.models.some(model => JSON.stringify([model.provider_id, model.model_id]) === chosen) || !s.state.workspaces?.some(workspace => workspace.workspace_id === s.workspaceId)));
  send.textContent = s.sending ? L("coding.composer.sending") : L("coding.composer.send");
  q("[data-coding-mode]").hidden = !active;
  q("[data-coding-stop]").hidden = !active;
  q<HTMLButtonElement>("[data-coding-stop]").disabled = s.sending;
  // Pausing lets the current step finish; a paused round resumes with its context intact.
  const pause = q<HTMLButtonElement>("[data-coding-pause]"), phase = s.lastRun?.phase;
  const paused = phase === "paused" || phase === "pausing", pausable = phase === "starting" || phase === "running" || phase === "compacting";
  pause.hidden = !(paused || pausable);
  pause.dataset.action = paused ? "resume" : "pause";
  pause.textContent = phase === "pausing" ? L("coding.run.pausing") : paused ? L("coding.run.resume") : L("coding.run.pause");
  pause.disabled = s.sending || phase === "pausing";
  q<HTMLSelectElement>("[data-coding-intent]").disabled = Boolean(active || s.sending || unread(page));
  q("[data-coding-rename]").hidden = !s.current;
  q("[data-coding-archive]").hidden = !s.current;
  for (const name of s.choosers) q<HTMLButtonElement>("[data-coding-" + name + "-open]").disabled = input.disabled;
}

/** What is attached to the next round, counted on the pickers' buttons. */
function attachLabels(page: Page) {
  const { L, q } = page, { s } = page;
  const materialCount = (s.materialSelections.get(s.current) || []).length;
  contextLabel(page, "[data-coding-material-open]", L("coding.attach.material") + (materialCount ? " · " + materialCount : ""), materialCount);
  const character = s.characterSelections.get(s.current);
  contextLabel(page, "[data-coding-character-open]", character ? L("coding.attach.character") + " · v" + character.version : L("coding.attach.character"), character ? 1 : 0);
  q("[data-coding-character-open]").title = character ? L("coding.character.next", { title: s.characterTitles.get(s.current) || character.artifact_id, version: character.version }) : L("coding.character.none-next");
  const actionCount = (s.actionSelections.get(s.current) || []).length;
  contextLabel(page, "[data-coding-actions-open]", L("coding.attach.actions") + (actionCount ? " · " + actionCount : ""), actionCount);
  const mcpCount = (s.mcpSelections.get(s.current) || []).length + (s.mcpSourceSelections.get(s.current) || []).length;
  contextLabel(page, "[data-coding-mcp-open]", "MCP" + (mcpCount ? " · " + mcpCount : ""), mcpCount);
  const count = (s.methodSelections.get(s.current) || []).length;
  contextLabel(page, "[data-coding-method-open]", L("coding.attach.method") + (count ? " · " + count : ""), count);
}

/** The rewind buttons of the checkpoints list are for a writable, idle session. */
function checkpointButtons(page: Page, active: boolean) {
  const { L, q } = page, { s } = page;
  const writable = ["edit", "execute"].includes(q<HTMLSelectElement>("[data-coding-intent]").value);
  q<HTMLButtonElement>("[data-coding-checkpoints-refresh]").disabled = !s.current || s.checkpointLoading;
  q("[data-coding-checkpoints-list]").querySelectorAll("button").forEach(button => {
    button.disabled = Boolean(!writable || active || s.sending || s.recovery || s.checkpointBusy || s.checkpointLoading);
    button.title = !writable ? L("coding.worktrees.needs-writing") : active ? L("coding.run.wait-end") : s.checkpointBusy ? L("coding.checkpoints.busy") : "";
  });
}

/** Draws what the composer and its pickers may do now. */
export function controls(page: Page) {
  const { lifetime } = page, { composerModels } = page.refs, { s } = page;
  if (!lifetime.alive) return;
  const active = Boolean(s.lastRun && !terminal(s.lastRun.phase));
  runButtons(page, active);
  composerModels.controls({ active, sending: s.sending || unread(page), run: s.lastRun });
  attachLabels(page);
  checkpointButtons(page, active);
}
