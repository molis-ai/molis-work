import { commandsClient } from "../commands.js";
import { errorMessage } from "../dom.js";
import { codingCommands } from "./commands.js";
import { refreshState, rememberConfiguration } from "./configuration.js";
import { terminal, shut } from "./composer-state.js";
import { controls } from "./controls.js";
import { conversationDelay, currentSelection, startRound } from "./composer.js";
import { askOverlap } from "./overlap.js";
import type { Page } from "./page.js";
import { renderPriority } from "./queued.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";
import { select, surfaceChanged } from "./select.js";
import type { Overlap, RoundSelection } from "./shapes.js";

/** The slash menu, the palette and the keys of the composer. */
function mountCommands(page: Page) {
  const { L, host, input, lifetime, q, refs, s, turns } = page;
  refs.commandsUi = commandsClient({
    lifetime, translate: L, q, input, status: s.ports.status, commands: () => codingCommands(page), current: () => s.current, workspace: () => s.workspaceId,
    files: key => api(page, "/sessions/" + encodeURIComponent(s.current) + "/files?workspace_id=" + encodeURIComponent(key)),
    symbols: (key, path) => api(page, "/sessions/" + encodeURIComponent(s.current) + "/symbols?workspace_id=" + encodeURIComponent(key) + "&path=" + encodeURIComponent(path)),
    sessions: () => s.state.sessions.map(session => ({ ...session, state_label: s.SESSION_STATE[session.state] || "" })),
    openSession: (id, title) => { host.openItem("coding", id, title || ""); return select(page, id); },
  });
  lifetime.listen(input, "input", () => turns.querySelectorAll<HTMLButtonElement>("[data-coding-prompt]").forEach(button => { button.disabled = Boolean(input.value.trim()); }));
  lifetime.listen(input, "keydown", event => {
    const key = event as KeyboardEvent;
    if (key.key === "Enter" && (key.metaKey || key.ctrlKey) && !key.isComposing) { key.preventDefault(); q<HTMLFormElement>("[data-coding-composer]").requestSubmit(); }
  });
}

/** Marks the session as one other sessions working on the same files should wait for, or clears the mark. */
async function togglePriority(page: Page, button: HTMLButtonElement) {
  const { L } = page, id = button.dataset.session;
  if (!id) return;
  const on = button.getAttribute("aria-pressed") !== "true";
  button.disabled = true;
  try {
    const result = await api<{ priority: boolean; notified: string[]; paths: string[] }>(page, sessionPath(id) + "/priority", "POST", { on });
    renderPriority(page, id, result.priority);
    status(page, !on ? L("coding.priority.cleared") : result.notified.length
      ? L("coding.priority.notified", { sessions: result.notified.map(title => L("coding.quote", { title })).join(L("coding.list.joiner")), paths: result.paths.join(L("coding.list.joiner")) }) : L("coding.priority.no-one"));
    await refreshState(page);
  } catch (error) {
    status(page, errorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

/** Starts a round for the words in the composer, once the person has said who goes first when other work names the same files. */
async function startFromComposer(page: Page, id: string, task: string, selection: RoundSelection, intent: string, modelValue: string) {
  const { L } = page;
  // Another session already working on the same files in this directory: the person decides who goes first.
  const { overlaps } = await api<{ overlaps: Overlap[] }>(page, sessionPath(id) + "/scope-check", "POST", { task, workspace_id: selection.workspace_id });
  const choice = overlaps.length ? await askOverlap(page, overlaps) : "parallel";
  if (choice === "cancel") { status(page, L("coding.overlap.not-sent")); return false; }
  if (choice === "wait") {
    await startRound(page, id, task, intent, modelValue, selection, { wait_for: overlaps[0].work_id });
    status(page, L("coding.overlap.will-wait", { title: overlaps[0].title }));
  } else await startRound(page, id, task, intent, modelValue, selection);
  return true;
}

/** Sends the composer's words: to the round under way as a supplement, or as the task of a new round. */
async function send(page: Page) {
  const { input, q, refs, s } = page;
  if (shut(page) || s.recovery || s.checkpointBusy || !input.value.trim()) return;
  const id = s.current, task = input.value, activeRun = s.lastRun, intent = q<HTMLSelectElement>("[data-coding-intent]").value, modelValue = q<HTMLSelectElement>("[data-coding-model]").value;
  const selection: RoundSelection = { ...currentSelection(page, id), action_tools: structuredClone(s.actionSelections.get(id) || []), writer_assignments: structuredClone(s.configurations.get(id)?.writer_assignments || []) };
  s.sending = true;
  controls(page);
  try {
    rememberConfiguration(page);
    await refs.draft.flush();
    if (activeRun && !terminal(activeRun.phase)) {
      const mode = q<HTMLSelectElement>("[data-coding-send-mode]");
      status(page, await refs.inputReceipts.steer(id, activeRun.ref.run_id, task, mode.value));
      mode.value = "next-boundary";
    } else if (!await startFromComposer(page, id, task, selection, intent, modelValue)) return;
    if (s.current === id && input.value === task) { input.value = ""; window.molisFit?.(input); }
    if (refs.draft.local(id) === task) await refs.draft.save(id, "");
    surfaceChanged(page, id);
    await refreshState(page);
    await readCurrent(page);
  } catch (error) {
    status(page, errorMessage(error), true);
  } finally {
    s.sending = false;
    controls(page);
  }
}

/** The composer's own buttons: the one that puts the session first, and sending. */
function mountSend(page: Page) {
  const { lifetime, q, s } = page;
  s.queuedKey = "";
  const priority = q<HTMLButtonElement>("[data-coding-priority]");
  lifetime.listen(priority, "click", () => { void togglePriority(page, priority); });
  lifetime.listen(q("[data-coding-composer]"), "submit", event => { event.preventDefault(); void send(page); });
}

/** Reads the session on show again while the page is visible, a little faster while a round is running. */
function followConversation(page: Page) {
  const { lifetime, s } = page;
  lifetime.whenVisible(signal => {
    s.viewSignal = signal;
    void refreshState(page).then(() => { lifetime.assertCurrent(signal); return readCurrent(page); }).catch(error => { if (!signal.aborted) status(page, errorMessage(error), true); });
    let timer = 0;
    const again = async () => {
      try {
        lifetime.assertCurrent(signal);
        if (s.current) await readCurrent(page);
      } catch (error) {
        if (!signal.aborted) status(page, errorMessage(error), true);
      } finally {
        if (!signal.aborted && lifetime.visible) timer = lifetime.timeout(again, conversationDelay(page));
      }
    };
    timer = lifetime.timeout(again, conversationDelay(page));
    return () => { lifetime.clearTimeout(timer); s.liveTicket++; s.liveRun = ""; };
  });
}

/** What the page keeps reading while it is shown: the session, the directories, the reviews and, every fifth second, the directory. */
export function mountPolling(page: Page) {
  const { lifetime, refs, s } = page;
  s.pollingTicks = 0;
  followConversation(page);
  lifetime.poll(async signal => {
    await Promise.all([refs.writerDirectories.refresh(), refs.integrations.refreshReviews()]);
    lifetime.assertCurrent(signal);
    if (++s.pollingTicks % 5 === 0) await refreshState(page);
  }, 1000, error => status(page, errorMessage(error), true));
}

/** The composer's side: the commands and keys, the priority button and sending. */
export function mountComposer(page: Page) {
  mountCommands(page);
  mountSend(page);
}
