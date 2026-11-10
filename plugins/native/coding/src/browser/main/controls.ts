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

/**
 * The composer as the page stands: held while the session is unread or a round is being started by another button (its own send
 * lets the person go on writing), running while a round is under way, and drawn again only when what its bar shows changed, so an
 * open select is never closed under the person.
 */
export function drawComposer(page: Page) {
  const { L, q, refs, s } = page, composer = refs.composer;
  if (!composer) return;
  const active = Boolean(s.lastRun && !terminal(s.lastRun.phase));
  composer.hold(unread(page) ? L("coding.composer.reading-session") : s.sending && !s.composerSending ? L("coding.composer.busy") : null);
  composer.setRunning(active);
  const title = s.state.sessions.find(item => item.session_id === s.current)?.title ?? "";
  const drawn = JSON.stringify([s.current, title, active, s.lastRun?.phase, s.sending, s.intent, s.intents, refs.composerModels.scene()]);
  if (drawn !== s.composerDrawn) {
    s.composerDrawn = drawn;
    composer.refresh();
  }
  q("[data-coding-rename]").hidden = !s.current;
  q("[data-coding-archive]").hidden = !s.current;
  for (const name of ["workspace", "goal", "writer-directories"]) q<HTMLButtonElement>("[data-coding-" + name + "-open]").disabled = shut(page);
}

/** What the next round is given, as ＋ counts it (materials, Character, actions, MCP, methods). */
export function counts(page: Page) {
  const { s } = page, id = s.current;
  return {
    materials: (s.materialSelections.get(id) || []).length, character: s.characterSelections.get(id) ?? null, actions: (s.actionSelections.get(id) || []).length,
    mcp: (s.mcpSelections.get(id) || []).length + (s.mcpSourceSelections.get(id) || []).length, methods: (s.methodSelections.get(id) || []).length,
  };
}

/** The rewind buttons of the checkpoints list are for a writable, idle session. */
function checkpointButtons(page: Page, active: boolean) {
  const { L, q } = page, { s } = page;
  const writable = ["edit", "execute"].includes(s.intent);
  q<HTMLButtonElement>("[data-coding-checkpoints-refresh]").disabled = !s.current || s.checkpointLoading;
  q("[data-coding-checkpoints-list]").querySelectorAll("button").forEach(button => {
    button.disabled = Boolean(!writable || active || s.sending || s.recovery || s.checkpointBusy || s.checkpointLoading);
    button.title = !writable ? L("coding.worktrees.needs-writing") : active ? L("coding.run.wait-end") : s.checkpointBusy ? L("coding.checkpoints.busy") : "";
  });
}

/** Draws what the composer and the next round's choices may do now. */
export function controls(page: Page) {
  const { lifetime } = page, { composerModels } = page.refs, { s } = page;
  if (!lifetime.alive) return;
  const active = Boolean(s.lastRun && !terminal(s.lastRun.phase));
  composerModels.controls({ active, sending: s.sending || unread(page), run: s.lastRun });
  drawComposer(page);
  checkpointButtons(page, active);
}
