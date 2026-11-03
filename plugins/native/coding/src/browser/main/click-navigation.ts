import { loadArtifacts } from "./artifacts.js";
import { showBoard, onShow } from "./board.js";
import type { ClickRule } from "./click-types.js";
import { shut } from "./composer-state.js";
import { controls } from "./controls.js";
import { renderDirectory } from "./directory.js";
import { renderGoalFace } from "./goals.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { select, create } from "./select.js";
import { status } from "./request.js";

/** Brings a face to the directory column: the Files face is the companions' (the Host shows them), every other hides them and shows its own panel. */
async function openFace(page: Page, target: HTMLButtonElement) {
  const { L, directory, host, s } = page, { taskboard } = page.refs, face = target.dataset.codingFace || "", handled = host.onDirectoryFace?.(face) ?? false;
  if (face === "files" && !handled) {
    status(page, L("coding.face.files-unavailable"));
    return;
  }
  directory.dataset.codingCurrentFace = face;
  directory.querySelector<HTMLElement>("[data-coding-artifact-directory]")!.hidden = face !== "artifacts";
  directory.querySelector<HTMLElement>("[data-coding-goal-face]")!.hidden = face !== "goals";
  directory.querySelectorAll("[data-coding-face]").forEach(button => button.setAttribute("aria-pressed", String(button === target)));
  directory.querySelector(".mw-dir__label")!.textContent = face === "taskboard" ? "TaskBoard" : face === "goals" ? L("coding.face.goals") : face === "artifacts" ? L("coding.face.artifacts") : face === "files" ? L("coding.face.files") : L("coding.face.sessions");
  if (face === "taskboard") {
    taskboard.showOutline();
    if (s.current) await readCurrent(page);
  } else {
    taskboard.hideOutline();
  }
  if (face === "goals") renderGoalFace(page);
  if (face === "artifacts") await loadArtifacts(page);
}

/** A suggestion on the welcome fills the composer, in the way of working it names. */
function usePrompt(page: Page, target: HTMLButtonElement) {
  const { input, q } = page;
  if (input.value.trim() || shut(page)) return;
  const intent = q<HTMLSelectElement>("[data-coding-intent]"), wanted = [...intent.options].find(option => option.value === target.dataset.codingPromptIntent && !option.disabled);
  if (wanted) {
    intent.value = wanted.value;
    intent.dispatchEvent(new Event("change", { bubbles: true }));
  }
  input.value = target.dataset.codingPrompt || "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

/** The first list is drawn by the server, so a row can be clicked before the directory read has arrived. ⌘/Ctrl-click opens it beside this pane. */
async function openSession(page: Page, target: HTMLButtonElement, event: MouseEvent) {
  const { host, s } = page;
  event.preventDefault();
  const id = target.dataset.codingSession || "", session = s.state.sessions.find(item => item.session_id === id);
  const title = session?.title || (target.querySelector(".coding-session-title,strong,.mw-dir-row__title")?.textContent || "").trim();
  if ((event.metaKey || event.ctrlKey) && host.openBeside) {
    host.openBeside("coding", id, title);
    return;
  }
  host.openItem("coding", id, title);
  await select(page, id);
}

/** Starts a session (or reuses an untouched one) and puts the cursor in the composer. */
async function startSession(page: Page, target: HTMLButtonElement, event: MouseEvent) {
  const { input, s } = page;
  event.preventDefault();
  target.disabled = s.creating = true;
  controls(page);
  try {
    await create(page);
  } finally {
    target.disabled = s.creating = false;
    controls(page);
  }
  input.focus();
}

/** Expanding from the directory brings the session's main area back on a narrow screen, where the two take turns. */
async function expandBoard(page: Page) {
  const { host, q, root, s } = page;
  if (!s.current || !onShow(page)) return;
  host.revealTask?.();
  root.dataset.codingDetail = "true";
  showBoard(page, true);
  await readCurrent(page);
  q("[data-coding-board]").focus({ preventScroll: true });
}

export const NAVIGATION_CLICKS: readonly ClickRule[] = [
  ["[data-coding-search-toggle]", (page, target) => {
    const query = page.directory.querySelector<HTMLElement>("[data-coding-query]")!;
    query.hidden = !query.hidden;
    target.setAttribute("aria-expanded", String(!query.hidden));
    if (!query.hidden) page.directory.querySelector<HTMLElement>("[data-coding-search]")?.focus();
  }],
  ["[data-coding-context-toggle]", (page, target) => {
    const context = page.q("[data-coding-context]");
    context.hidden = !context.hidden;
    target.setAttribute("aria-expanded", String(!context.hidden));
  }],
  ["[data-coding-workspace-open]", page => page.q<HTMLDialogElement>("[data-coding-workspace-dialog]").showModal()],
  ["[data-coding-workspace-close]", page => page.q<HTMLDialogElement>("[data-coding-workspace-dialog]").close()],
  ["[data-coding-results-open]", page => {
    const { q, root } = page;
    root.dataset.codingResults = root.dataset.codingResults === "true" ? "false" : "true";
    if (root.dataset.codingResults === "true") {
      q("[data-coding-results-close]").focus({ preventScroll: true });
      void readCurrent(page);
    }
  }],
  ["[data-coding-results-close]", page => {
    page.root.dataset.codingResults = "false";
    page.q("[data-coding-results-open]").focus({ preventScroll: true });
  }],
  ["[data-coding-directory-back]", page => {
    page.root.dataset.codingDetail = "false";
    (page.directory.querySelector<HTMLElement>("[aria-current=true]") || page.directory.querySelector<HTMLElement>("[data-coding-new]"))?.focus({ preventScroll: true });
  }],
  ["[data-coding-prompt]", usePrompt],
  ["[data-coding-new]", startSession],
  ["[data-coding-session]", openSession],
  ["[data-coding-open-beside]", page => page.host.openBeside?.("coding")],
  ["[data-coding-filter]", (page, target) => {
    page.directory.querySelectorAll("[data-coding-filter]").forEach(item => item.setAttribute("aria-pressed", String(item === target)));
    renderDirectory(page);
  }],
  ["[data-coding-face]", openFace],
  ["[data-coding-view]", async (page, target) => {
    const open = target.dataset.codingView === "board";
    showBoard(page, open);
    if (open && page.s.current) await readCurrent(page);
  }],
  ["[data-coding-board-expand]", expandBoard],
  ["[data-coding-board-close]", page => {
    showBoard(page, false);
    page.q("[data-coding-view=dialogue]").focus({ preventScroll: true });
  }],
  ["[data-coding-goal-face-visit]", (page, target) => {
    if (target.dataset.goalId) page.host.openItem("goals", target.dataset.goalId, target.dataset.goalTitle || "");
  }],
  ["[data-coding-latest]", (page, target) => {
    page.s.follow.toLatest();
    target.hidden = true;
  }],
];
