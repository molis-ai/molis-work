import { cutWithEllipsis } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { format, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { CONTINUATION_MARKER } from "../../continuation.js";
import { errorMessage } from "../dom.js";
import { ownTask } from "./helpers.js";
import type { Page } from "./page.js";
import { api, sessionPath, status } from "./request.js";
import type { RunView } from "./shapes.js";
import { useProjectWorkspace } from "./workspace.js";

const NUDGE_WRAPPERS: readonly (readonly [prefix: string, head: string])[] = [
  ["上一轮你说「", "完成原任务：\n"],
  ["Last turn you stopped after saying “", "complete the original task:\n"],
  ["前のターンは「", "元のタスクを完了してください：\n"],
];

/** The person's own request titles the commit, unwrapped from a "let it continue" or a continuation the product composed. */
function requestOf(run: RunView): string {
  let request = ownTask(run.turns.find(turn => turn.kind === "user")?.text || "");
  for (const [prefix, head] of NUDGE_WRAPPERS) {
    const handed = request.indexOf(head);
    if (request.startsWith(prefix) && handed >= 0) {
      request = request.slice(handed + head.length);
      break;
    }
  }
  if (request.startsWith(CONTINUATION_MARKER)) {
    const from = request.indexOf("原任务：\n"), to = request.indexOf("\n\n宿主核实的事实");
    if (from >= 0) request = request.slice(from + "原任务：\n".length, to > from ? to : undefined);
  }
  return request;
}

/** A message drafted by rule from the round: its request as the title, the points of its answer, and the files it wrote. */
function ruleDraft(_page: Page, run: RunView): string {
  const asked = requestOf(run).trim().split("\n")[0]!.replace(/^#+\s*/, ""), answer = [...run.turns].reverse().find(turn => turn.kind === "assistant")?.text || "";
  const points = answer.split("\n").map(line => line.replace(/^[#>*\-\s\d.、]+/, "").replace(/[*`]/g, "").trim()).filter(line => line.length > 4).slice(0, 5);
  const files = [...new Set(run.activity.filter(item => ["edit", "write"].includes(item.name) && item.state === "completed" && item.target).map(item => item.target))];
  const title = cutWithEllipsis(asked, 72, { prefixLength: 70 });
  return [title, "", ...points.map(point => "- " + point), "", uiText.text("coding.commit.files"), ...files.map(file => "- " + file)].join("\n").trim();
}

/** The model drafts from every recent round that changed files (a call that costs a little); the rule draft stays as the fallback. */
async function modelDraft(page: Page, id: string, run: RunView, fallback: string): Promise<{ draft: string; note: string; failed: boolean } | null> {
  const { lifetime, refs } = page;
  try {
    const [provider_id, model_id] = JSON.parse(refs.composerModels.value() || "[]") as [string?, string?];
    const result = await api<{ message: string; rounds: readonly string[]; usage?: { input: number; output: number } }>(page, sessionPath(id, run.ref.run_id) + "/commit-draft", "POST", { provider_id, model_id });
    const rounds = result.rounds.join(uiText.text("coding.list.joiner")), tokens = result.usage ? format.number(result.usage.input + result.usage.output) : "";
    return { draft: result.message, note: result.usage ? uiText.text("coding.commit.drafted-usage", { rounds, tokens }) : uiText.text("coding.commit.drafted", { rounds, tokens }), failed: false };
  } catch (error) {
    if (!lifetime.alive) return null;
    return { draft: fallback, note: uiText.text("coding.commit.draft-failed", { reason: errorMessage(error) }), failed: true };
  }
}

/** Hands the drafted message to Git, which works on the project's directory: point it at the round's own directory first. */
async function handToGit(page: Page, run: RunView, draft: string, note: string, failed: boolean) {
  const { directory, s } = page;
  // A round that ran in one of the Host's worktrees changed files there, and Git shows only the project's folders: its draft is not
  // handed to another folder, where it does not belong.
  if (run.frozen.directories?.execution.kind === "worktree") {
    status(page, uiText.text("coding.commit.git-worktree"), true);
    return;
  }
  const ownWorkspace = (s.state.workspaces || []).find(item => item.canonical_path === run.frozen.directory?.canonical_path);
  const originalSession = s.current;
  if (!ownWorkspace) { status(page, uiText.text("coding.commit.original-directory-gone"), true); return; }
  try {
    const outcome = await page.host.offerCommitDraft(ownWorkspace.workspace_id, draft);
    if (!page.lifetime.alive || s.current !== originalSession) return;
    await useProjectWorkspace(page, ownWorkspace.workspace_id);
    directory.querySelector<HTMLElement>("[data-coding-face=files]")?.click();
    status(page, outcome === "suggested" ? uiText.text("coding.commit.suggestion-saved") : note, failed);
  } catch (error) {
    if (!page.lifetime.alive || s.current !== originalSession) return;
    status(page, uiText.text("coding.commit.handoff-failed", { reason: errorMessage(error) }), true);
    const retry = document.createElement("button");
    retry.type = "button"; retry.className = "mw-btn mw-btn--ghost mw-btn--sm"; retry.dataset.codingCommitRetry = "";
    retry.textContent = uiText.text("common.control.retry");
    page.lifetime.listen(retry, "click", () => {
      if (s.current !== originalSession) return;
      retry.disabled = true;
      void handToGit(page, run, draft, note, failed);
    });
    page.q("[data-coding-status]").append(" ", retry);
  }
}

/** Committing a round's changes happens in Git, under Host review; the round only drafts the message. */
export async function commitRound(page: Page, target: HTMLButtonElement) {
  const { s } = page, run = s.allRuns.find(item => item.ref.run_id === target.dataset.codingCommitRound);
  if (!run || run.light || target.disabled) return;
  const id = s.current, fallback = ruleDraft(page, run);
  target.disabled = true;
  status(page, uiText.text("coding.commit.drafting"));
  try {
    const drafted = await modelDraft(page, id, run, fallback);
    if (!drafted || id !== s.current) return;
    await handToGit(page, run, drafted.draft, drafted.note, drafted.failed);
  } finally {
    target.disabled = false;
  }
}
