import { codingUsageSummary } from "../../usage.js";
import { errorMessage } from "../dom.js";
import { planProgress } from "../plan-progress.js";
import type { Amendment } from "../shapes.js";
import { subagentGroups } from "../subagents.js";
import { taskboard } from "../taskboard.js";
import type { BoardTarget } from "../taskboard-types.js";
import { onShow, showBoard } from "./board.js";
import { ownTask } from "./helpers.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";
import { openCodingItem } from "./select.js";

/** What the Host says of a change to a plan graph. */
interface AmendResult { readonly board?: { readonly terminal?: boolean }; readonly steered?: boolean; readonly steer_error?: string }

/** Sends the person's change of a plan graph, then reads the session so the board shows what the Host kept. */
async function amend(page: Page, runId: string, version: number, amendment: Amendment, live: boolean) {
  const { L, s } = page, id = s.current;
  try {
    const result = await api<AmendResult>(page, sessionPath(id, runId) + "/plan-amendments", "POST", { amendment, expected_version: version });
    if (!live) status(page, result.board?.terminal ? L("coding.board.saved-done") : L("coding.board.saved-continue"));
    else status(page, result.steered ? L("coding.board.steered") : L("coding.board.steer-failed", { reason: result.steer_error || L("coding.common.unknown-reason") }), !result.steered);
  } catch (error) {
    status(page, errorMessage(error), true);
  }
  // The board's copy of rounds outside the loaded window is kept by round count; a change to the graph renews it.
  s.boardAll.key = "";
  if (id === s.current) await readCurrent(page);
}

/** The place in the conversation or the results panel a board row leads to. */
function boardNode(page: Page, target: BoardTarget): HTMLElement | undefined {
  const { q, turns } = page;
  if (target.kind === "plan") return q<HTMLElement>("[data-coding-plan]");
  if (target.kind === "recovery") return q<HTMLElement>("[data-coding-recovery]");
  if (target.kind === "reviews") return q<HTMLElement>("[data-coding-host-reviews]");
  if (target.kind === "child") return [...q("[data-coding-subagents]").querySelectorAll<HTMLElement>("details[data-child]")].find(node => node.dataset.child === target.child_id);
  if (target.kind === "run") return [...turns.children].find((node): node is HTMLElement => node instanceof HTMLElement && node.dataset.run === target.run_id);
  return undefined;
}

/** Opens what a board row stands for: a step's reports, or the place of the plan, the recovery, the reviews, a subtask or a round. */
async function navigate(page: Page, id: string, target: BoardTarget) {
  const { L, host, refs, root, s, turns } = page, record = s.state.sessions.find(item => item.session_id === id);
  if (!record) throw new Error(L("coding.error.session-unreadable"));
  host.openItem("coding", id, record.title);
  await openCodingItem(page, id);
  if (s.current !== id) return;
  host.revealTask?.();
  if (target.kind === "step") { await refs.stepReports.open(id, target.run_id, target.step_id); return; }
  // Everything else lives in the conversation or the results panel: leave the board and show it there.
  showBoard(page, false);
  if (["plan", "child", "recovery", "reviews"].includes(target.kind)) root.dataset.codingResults = "true";
  const node = boardNode(page, target);
  if (!node || node.hidden) throw new Error(L("coding.error.content-unreadable"));
  if (target.kind === "child" && node instanceof HTMLDetailsElement) node.open = true;
  if (turns.contains(node)) s.follow.release();
  node.scrollIntoView({ block: "nearest" });
  node.tabIndex = -1;
  node.focus({ preventScroll: true });
}

/** The board of the session's rounds, and the cards that draw one round's plan and subtasks. */
export function mountBoard(page: Page) {
  const { L, directory, host, lifetime, q, refs, s } = page;
  // The board shows every round of the session: the loaded window as it is, earlier rounds from one read of the whole
  // session's plans and subagents, fetched again only when the number of rounds changes.
  s.boardAll = { key: "", id: "", value: null };
  // A session is "on show" from the moment it is opened until its tab closes or it is archived. Going back to the
  // directory on a narrow screen does not end it: the faces there describe the session the person just left.
  s.sessionOnShow = false;
  refs.taskboard = taskboard({
    lifetime, translate: L, board: q("[data-coding-board]"), outline: directory.querySelector<HTMLElement>("[data-coding-board-outline]"), current: () => s.current,
    onShow: () => onShow(page), status: s.ports.status, ownTask, from: node => refs.inputReceipts.from(node, () => showBoard(page, false)),
    roleName: id => (id && s.ROLE_NAMES[id]) || id || "Agent",
    progress: text => {
      const count = q("[data-coding-view-board-count]");
      count.textContent = text ? " " + text : "";
      count.hidden = !text;
    },
    amend: (runId, version, amendment, live) => amend(page, runId, version, amendment, live),
    navigate: (id, target) => navigate(page, id, target),
  });
  refs.planProgress = planProgress({ ...s.ports, roleLabel: id => s.ROLE_NAMES[id], openStep: (runId, stepId) => refs.stepReports.open(s.current, runId, stepId), from: node => refs.inputReceipts.from(node), word: state => host.receipts.step(state) });
  refs.subagents = subagentGroups({
    ...s.ports, roleName: id => s.ROLE_NAMES[id] || id || "Agent", openIntegration: refs.integrations.open, usageSummary: usage => codingUsageSummary(usage, L),
    prepareRework: async (id, runId, child, notes) => {
      if (s.current !== id) return;
      const instruction = L("coding.rework.instruction", { subagent: child.subagent_id, run: runId, path: child.workspace_path ?? "", task: child.task, notes });
      await refs.draft.append(id, text => text.trim() ? text + "\n\n" + instruction : instruction, L("coding.rework.saved-not-added"));
    },
  });
}
