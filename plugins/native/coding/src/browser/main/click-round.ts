import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { sessionTitle } from "../session-title.js";
import { directoryStatus, loadArchivedDirectory, renderDirectory } from "./directory.js";
import { errorMessage } from "../dom.js";
import { commitRound } from "./click-commit.js";
import type { ClickRule } from "./click-types.js";
import { continueRound, currentSelection, recoverAndContinue, startRound } from "./composer.js";
import { chooseIntent, refreshState } from "./configuration.js";
import { shut } from "./composer-state.js";
import { controls } from "./controls.js";
import { ownTask } from "./helpers.js";
import { renderGoalFace } from "./goals.js";
import { renderMcp } from "./methods.js";
import type { Page } from "./page.js";
import type { RoundSelection } from "./shapes.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";

const INTENT_BY_ROLE: Readonly<Record<string, string>> = { builder: "execute", writer: "edit", reader: "discuss", reviewer: "review", planner: "plan", coordinator: "collaborate" };

/** A round that only announced its next step goes on when the person asks, with the same way of working. */
async function nudge(page: Page, target: HTMLButtonElement) {
  const { s } = page;
  if (s.sending) return;
  const run = s.allRuns.find(item => item.ref.run_id === target.dataset.codingNudge);
  if (!run || run.light) return;
  const said = [...run.turns].reverse().find(turn => turn.kind === "assistant")?.text.trim() || "", asked = ownTask(run.turns.find(turn => turn.kind === "user")?.text || "");
  const intent = INTENT_BY_ROLE[run.frozen.role_id] || s.intent, id = s.current, modelValue = page.refs.composerModels.value();
  s.sending = true;
  controls(page);
  try {
    await startRound(page, id, "上一轮你说「" + said + "」之后就结束了，没有调用任何工具，所以还什么都没做。请直接调用工具执行下一步，完成原任务：\n" + asked, intent, modelValue, currentSelection(page, id), { continued_from: run.ref });
    status(page, uiText.text("coding.run.nudged"));
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

async function rerunChecks(page: Page, target: HTMLButtonElement) {
  const { s } = page;
  if (s.sending) return;
  const run = s.allRuns.find(item => item.ref.run_id === target.dataset.codingRerunChecks);
  if (!run || run.light) return;
  const lastCmd = [...run.activity].reverse().find(item => (item.name === "run-command" || item.name === "start-command") && item.target);
  const command = lastCmd?.target || "npm test";
  const intent = INTENT_BY_ROLE[run.frozen.role_id] || s.intent;
  const id = s.current, modelValue = page.refs.composerModels.value();
  s.sending = true;
  controls(page);
  try {
    await startRound(page, id, uiText.text("coding.round.rerun-prompt", { command }), intent === "discuss" ? "execute" : intent, modelValue, currentSelection(page, id), { continued_from: run.ref });
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
export async function openMcp(page: Page) {
  const { q, s } = page, id = s.current;
  await refreshState(page);
  if (s.current !== id || shut(page)) return;
  s.mcpChoices = [...structuredClone(s.mcpSelections.get(s.current) || [])];
  s.mcpSourceChoices = [...structuredClone(s.mcpSourceSelections.get(s.current) || [])];
  renderMcp(page);
  q("[data-coding-mcp-error]").textContent = "";
  q<HTMLDialogElement>("[data-coding-mcp-dialog]").showModal();
}

/** Archives the session after the person agrees; the page goes back to the list. */
async function archive(page: Page, target: HTMLButtonElement) {
  const { host, root, s } = page, { taskboard } = page.refs;
  if (!s.current || !await host.confirm(uiText.text("coding.session.archive-confirm"))) return;
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
    status(page, uiText.text("coding.session.archived"));
  } finally {
    target.disabled = false;
  }
}

/** The title becomes a field: Enter saves the name, Escape puts the old one back. */
function rename(page: Page) {
  const { host, lifetime, q, s } = page, title = q("[data-coding-title]");
  if (!s.current || title.querySelector("input")) return;
  const field = document.createElement("input");
  field.className = "mw-input";
  field.value = title.textContent || "";
  field.setAttribute("aria-label", uiText.text("coding.session.name"));
  title.replaceChildren(field);
  field.focus();
  field.select();
  const save = async () => {
    const id = s.current, result = await api<{ session: { title: string } }>(page, sessionPath(id), "PATCH", { title: field.value });
    title.textContent = sessionTitle(result.session.title);
    await refreshState(page);
    host.openItem("coding", id, sessionTitle(result.session.title));
    status(page, uiText.text("coding.session.name-saved"));
  };
  lifetime.listen(field, "keydown", event => {
    const key = (event as KeyboardEvent).key;
    if (key === "Enter") {
      event.preventDefault();
      void save().catch(error => status(page, errorMessage(error), true));
    }
    if (key === "Escape") title.textContent = sessionTitle(s.state.sessions.find(item => item.session_id === s.current)?.title) || "";
  });
  status(page, uiText.text("coding.session.rename-hint"));
}

/** A press on a Skill of a round's line asks the shell's 「依据」 panel, which answers with `molis:skill-redo` (mount: `bindSkillRedo`). */
function openSkillPick(_page: Page, target: HTMLButtonElement) {
  const line = target.closest<HTMLElement>("[data-skill-round]"), box = target.getBoundingClientRect(), index = target.dataset.skillPick;
  if (!line) return;
  document.dispatchEvent(new CustomEvent("molis:skill-pick-open", { cancelable: true, detail: { reply: "coding:" + line.dataset.skillRound, consumer: "coding",
    picks: JSON.parse(line.dataset.skillPicks || "[]"), index: index === "" ? null : Number(index), box: { x: box.left, y: box.top, width: box.width, height: box.height } } }));
}

/**
 * 「换一个重做」 and 「这次不用技能」: the round's own task again as a new round, with exactly the Skills the person chose in the
 * panel and no automatic ones. The session's other choices (model, tools, materials) are the ones it holds now.
 */
export function bindSkillRedo(page: Page) {
  page.lifetime.listen(document, "molis:skill-redo", event => {
    const { s } = page, detail = (event as CustomEvent<{ reply?: string; named?: Array<{ ref: RoundSelection["skills"][number] }> }>).detail;
    const run = s.allRuns.find(item => "coding:" + item.ref.run_id === detail?.reply);
    if (!run || run.light || s.sending) return;
    const task = ownTask(run.turns.find(turn => turn.kind === "user")?.text || ""), id = s.current;
    if (!task) return;
    s.sending = true; controls(page);
    void startRound(page, id, task, INTENT_BY_ROLE[run.frozen.role_id] || s.intent, page.refs.composerModels.value(),
      { ...currentSelection(page, id), skills: (detail.named ?? []).map(skill => skill.ref) }, { auto_skills: false })
      .then(async () => { s.follow.resume(); await refreshState(page); await readCurrent(page); })
      .catch(error => status(page, errorMessage(error), true))
      .finally(() => { s.sending = false; controls(page); });
  });
}

function handleEnvAction(page: Page, target: HTMLButtonElement) {
  const kind = target.dataset.codingEnvAction;
  if (kind === "open-files") {
    page.directory.querySelector<HTMLButtonElement>("[data-coding-face=files]")?.click();
    return;
  }
  if (kind === "open-workspace") {
    page.q<HTMLDialogElement>("[data-coding-workspace-dialog]").showModal();
    return;
  }
  if (shut(page)) return;
  const wanted = page.s.intents.find(option => option.value === "execute" && !option.disabled);
  if (wanted) chooseIntent(page, wanted.value);
  const prompt = kind === "install-deps"
    ? uiText.text("coding.env.action.install-deps-prompt", { manifest: target.dataset.manifest || "npm" })
    : uiText.text("coding.env.action.run-baseline-prompt", { command: target.dataset.command || "npm test" });
  const existing = page.input.value.trim();
  page.input.value = existing ? existing + "\n" + prompt : prompt;
  window.molisFit?.(page.input);
  page.input.dispatchEvent(new Event("input", { bubbles: true }));
  page.input.focus();
  page.input.setSelectionRange(page.input.value.length, page.input.value.length);
}

export const ROUND_CLICKS: readonly ClickRule[] = [
  ["[data-coding-env-action]", handleEnvAction],
  ["[data-skill-pick]", openSkillPick],
  ["[data-coding-mcp-settings-link],[data-coding-mcp-close]", page => page.q<HTMLDialogElement>("[data-coding-mcp-dialog]").close()],
  ["[data-coding-nudge]", nudge],
  ["[data-coding-rerun-checks]", rerunChecks],
  ["[data-coding-commit-round]", commitRound],
  ["[data-coding-method-close]", page => {
    page.q<HTMLDialogElement>("[data-coding-method-dialog]").close();
    page.refs.composer.focus();
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
  // A round's own details open under its line; its footer remembers it, so the next draw of the round leaves them open.
  ["[data-coding-run-more]", (_page, target) => {
    const footer = target.closest<HTMLElement>(".coding-run-footer");
    if (!footer) return;
    const open = footer.dataset.more !== "open";
    if (open) footer.dataset.more = "open"; else delete footer.dataset.more;
    target.setAttribute("aria-expanded", String(open));
    footer.querySelector<HTMLElement>(".coding-run-more")?.toggleAttribute("hidden", !open);
  }],
  ["[data-coding-archived]", async (page, target) => {
    target.disabled = true;
    try {
      if (page.s.archivedDirectory) { page.s.archivedDirectory = undefined; renderDirectory(page); }
      else await loadArchivedDirectory(page);
    } finally { target.disabled = false; }
  }],
  ["[data-coding-archived-more]", page => loadArchivedDirectory(page, true)],
  ["[data-coding-restore]", async (page, target, event) => {
    event.preventDefault(); target.disabled = true; directoryStatus(page, "");
    try {
      await api(page, sessionPath(target.dataset.codingRestore!), "PATCH", { archive: false });
      if (page.s.archivedDirectory) page.s.archivedDirectory.rows = page.s.archivedDirectory.rows.filter(row => row.session_id !== target.dataset.codingRestore);
      await refreshState(page); directoryStatus(page, uiText.text("coding.session.restored")); status(page, uiText.text("coding.session.restored"));
    } catch (error) { directoryStatus(page, errorMessage(error)); throw error; }
    finally { target.disabled = false; }
  }],
  ["[data-coding-archive]", archive],
  ["[data-coding-rename]", rename],
];
