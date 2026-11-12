import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { commandsClient } from "../commands.js";
import { errorMessage } from "../dom.js";
import { codingCommands } from "./commands.js";
import { refreshState } from "./configuration.js";
import { conversationDelay, startRound } from "./composer.js";
import { askOverlap } from "./overlap.js";
import type { Page } from "./page.js";
import { renderPriority } from "./queued.js";
import { readCurrent } from "./read.js";
import { mountReturns } from "./returns.js";
import { api, sessionPath, status } from "./request.js";
import { select } from "./select.js";
import type { Overlap, RoundSelection } from "./shapes.js";

/** The palette and the page's shortcuts; the suggestions on the welcome wait while the composer holds words. */
function mountCommands(page: Page) {
  const { readText, host, input, lifetime, refs, s, turns } = page;
  refs.commandsUi = commandsClient({
    lifetime, translate: readText, q: page.q, input: () => input, status: s.ports.status, commands: () => codingCommands(page), current: () => s.current,
    sessions: () => s.state.sessions.map(session => ({ ...session, state_label: s.SESSION_STATE[session.state] || "" })),
    openSession: (id, title) => { host.openItem("coding", id, title || ""); return select(page, id); },
  });
  lifetime.listen(input, "input", () => turns.querySelectorAll<HTMLButtonElement>("[data-coding-prompt]").forEach(button => { button.disabled = Boolean(input.value.trim()); }));
}

/** Marks the session as one other sessions working on the same files should wait for, or clears the mark. */
async function togglePriority(page: Page, button: HTMLButtonElement) {
  const id = button.dataset.session;
  if (!id) return;
  const on = button.getAttribute("aria-pressed") !== "true";
  button.disabled = true;
  try {
    const result = await api<{ priority: boolean; notified: string[]; paths: string[] }>(page, sessionPath(id) + "/priority", "POST", { on });
    renderPriority(page, id, result.priority);
    status(page, !on ? uiText.text("coding.priority.cleared") : result.notified.length
      ? uiText.text("coding.priority.notified", { sessions: result.notified.map(title => uiText.text("coding.quote", { title })).join(uiText.text("coding.list.joiner")), paths: result.paths.join(uiText.text("coding.list.joiner")) }) : uiText.text("coding.priority.no-one"));
    await refreshState(page);
  } catch (error) {
    status(page, errorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

/** Starts a round for the words in the composer, once the person has said who goes first when other work names the same files. */
export async function startFromComposer(page: Page, id: string, task: string, selection: RoundSelection, intent: string, modelValue: string) {
  // Another session already working on the same files in this directory: the person decides who goes first.
  const { overlaps } = await api<{ overlaps: Overlap[] }>(page, sessionPath(id) + "/scope-check", "POST", { task, workspace_id: selection.workspace_id });
  const choice = overlaps.length ? await askOverlap(page, overlaps) : "parallel";
  if (choice === "cancel") { status(page, uiText.text("coding.overlap.not-sent")); return false; }
  if (choice === "wait") {
    await startRound(page, id, task, intent, modelValue, selection, { wait_for: overlaps[0].work_id });
    status(page, uiText.text("coding.overlap.will-wait", { title: overlaps[0].title }));
  } else await startRound(page, id, task, intent, modelValue, selection);
  return true;
}

/**
 * The button that puts the session first, and the way back from the model settings: its send is the composer's own (the same
 * button a person presses), so it asks and checks what every send does.
 */
function mountSend(page: Page) {
  const { lifetime, q, s } = page;
  s.queuedKey = "";
  const priority = q<HTMLButtonElement>("[data-coding-priority]");
  lifetime.listen(priority, "click", () => { void togglePriority(page, priority); });
  mountReturns(page, async () => { q<HTMLButtonElement>("[data-coding-input] [data-composer-send]").click(); });
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

/** The composer's side: the commands and shortcuts, the priority button and the way back from the model settings. */
export function mountComposer(page: Page) {
  mountCommands(page);
  mountSend(page);
}
