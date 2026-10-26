import { errorMessage } from "../dom.js";
import { commitRound } from "./click-commit.js";
import type { ClickRule } from "./click-types.js";
import { continueRound, currentSelection, recoverAndContinue, startRound } from "./composer.js";
import { refreshState } from "./configuration.js";
import { shut } from "./composer-state.js";
import { controls, openMaterials } from "./controls.js";
import { ownTask } from "./helpers.js";
import { renderGoalFace } from "./goals.js";
import { openMethods, renderMcp } from "./methods.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";

const INTENT_BY_ROLE: Readonly<Record<string, string>> = { builder: "execute", writer: "edit", reader: "discuss", reviewer: "review", planner: "plan", coordinator: "collaborate" };

/** A round that only announced its next step goes on when the person asks, with the same way of working. */
async function nudge(page: Page, target: HTMLButtonElement) {
  const { L, q, s } = page;
  if (s.sending) return;
  const run = s.allRuns.find(item => item.ref.run_id === target.dataset.codingNudge);
  if (!run || run.light) return;
  const said = [...run.turns].reverse().find(turn => turn.kind === "assistant")?.text.trim() || "", asked = ownTask(run.turns.find(turn => turn.kind === "user")?.text || "");
  const intent = INTENT_BY_ROLE[run.frozen.role_id] || q<HTMLSelectElement>("[data-coding-intent]").value, id = s.current, modelValue = q<HTMLSelectElement>("[data-coding-model]").value;
  s.sending = true;
  controls(page);
  try {
    await startRound(page, id, "上一轮你说「" + said + "」之后就结束了，没有调用任何工具，所以还什么都没做。请直接调用工具执行下一步，完成原任务：\n" + asked, intent, modelValue, currentSelection(page, id), { continued_from: run.ref });
    status(page, L("coding.run.nudged"));
    s.follow.resume();
    await refreshState(page);
    await readCurrent(page);
  } catch (error) {
    status(page, errorMessage(error), true);
  } finally {
    s.sending = false;
    controls(page);
  }
}

/** The tool choice dialog opens on the session's own choices, read fresh from the Host's list. */
async function openMcp(page: Page) {
  const { q, s } = page, id = s.current;
  await refreshState(page);
  if (s.current !== id || shut(page)) return;
  s.mcpChoices = [...structuredClone(s.mcpSelections.get(s.current) || [])];
  s.mcpSourceChoices = [...structuredClone(s.mcpSourceSelections.get(s.current) || [])];
  renderMcp(page);
  q("[data-coding-mcp-error]").textContent = "";
  q<HTMLDialogElement>("[data-coding-mcp-dialog]").showModal();
}

/** Pauses or resumes the round on show. */
async function pause(page: Page, target: HTMLButtonElement) {
  const { L, s } = page;
  if (!s.lastRun) return;
  const action = target.dataset.action === "resume" ? "resume" : "pause";
  target.disabled = true;
  try {
    await api(page, sessionPath(s.current) + "/control", "POST", { run_id: s.lastRun.ref.run_id, kind: action });
    status(page, action === "pause" ? L("coding.run.pause-received") : L("coding.run.resumed"));
    await readCurrent(page);
  } catch (error) {
    status(page, errorMessage(error), true);
  } finally {
    controls(page);
  }
}

/** Archives the session after the person agrees; the page goes back to the list. */
async function archive(page: Page, target: HTMLButtonElement) {
  const { L, host, root, s } = page, { taskboard } = page.refs;
  if (!s.current || !await host.confirm(L("coding.session.archive-confirm"))) return;
  target.disabled = true;
  const id = s.current;
  try {
    await api(page, sessionPath(id), "PATCH", { archive: true });
    s.generation++;
    s.current = "";
    s.lastRun = null;
    root.dataset.codingDetail = "false";
    s.sessionOnShow = false;
    taskboard.loading("");
    renderGoalFace(page);
    await refreshState(page);
    status(page, L("coding.session.archived"));
  } finally {
    target.disabled = false;
  }
}

/** The title becomes a field: Enter saves the name, Escape puts the old one back. */
function rename(page: Page) {
  const { L, host, lifetime, q, s } = page, title = q("[data-coding-title]");
  if (!s.current || title.querySelector("input")) return;
  const field = document.createElement("input");
  field.className = "mw-input";
  field.value = title.textContent || "";
  field.setAttribute("aria-label", L("coding.session.name"));
  title.replaceChildren(field);
  field.focus();
  field.select();
  const save = async () => {
    const id = s.current, result = await api<{ session: { title: string } }>(page, sessionPath(id), "PATCH", { title: field.value });
    title.textContent = result.session.title;
    await refreshState(page);
    host.openItem("coding", id, result.session.title);
    status(page, L("coding.session.name-saved"));
  };
  lifetime.listen(field, "keydown", event => {
    const key = (event as KeyboardEvent).key;
    if (key === "Enter") {
      event.preventDefault();
      void save().catch(error => status(page, errorMessage(error), true));
    }
    if (key === "Escape") title.textContent = s.state.sessions.find(item => item.session_id === s.current)?.title || "";
  });
  status(page, L("coding.session.rename-hint"));
}

export const ROUND_CLICKS: readonly ClickRule[] = [
  ["[data-coding-mcp-open]", openMcp],
  ["[data-coding-mcp-settings-link],[data-coding-mcp-close]", page => page.q<HTMLDialogElement>("[data-coding-mcp-dialog]").close()],
  ["[data-coding-material-open]", page => openMaterials(page)],
  ["[data-coding-delegate-open]", page => page.refs.cooperationUi.openDialog()],
  ["[data-coding-nudge]", nudge],
  ["[data-coding-commit-round]", commitRound],
  ["[data-coding-method-open]", page => openMethods(page)],
  ["[data-coding-method-close]", page => {
    page.s.methodDocumentTicket++;
    page.q<HTMLDialogElement>("[data-coding-method-dialog]").close();
    page.input.focus();
  }],
  ["[data-coding-continue]", async (page, target) => {
    target.disabled = true;
    await continueRound(page, target.dataset.codingContinue || "");
    target.disabled = false;
  }],
  ["[data-coding-recover-continue]", async (page, target) => {
    target.disabled = true;
    await recoverAndContinue(page, target.dataset.codingRecoverContinue || "");
    target.disabled = false;
  }],
  ["[data-coding-pause]", pause],
  ["[data-coding-stop]", async (page, target) => {
    const { L, s } = page;
    if (!s.lastRun) return;
    target.disabled = true;
    await api(page, sessionPath(s.current) + "/control", "POST", { run_id: s.lastRun.ref.run_id, kind: "stop" });
    status(page, L("coding.run.stop-received"));
    await readCurrent(page);
  }],
  ["[data-coding-archive]", archive],
  ["[data-coding-rename]", rename],
];
