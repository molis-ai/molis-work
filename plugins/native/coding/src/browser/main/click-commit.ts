import { CONTINUATION_MARKER } from "../../continuation.js";
import { errorMessage } from "../dom.js";
import { ownTask } from "./helpers.js";
import type { Page } from "./page.js";
import { api, sessionPath, status } from "./request.js";
import type { RunView } from "./shapes.js";
import { useProjectWorkspace } from "./workspace.js";

const HANDED = "完成原任务：\n";

/** The person's own request titles the commit, unwrapped from a "let it continue" or a continuation the product composed. */
function requestOf(run: RunView): string {
  let request = ownTask(run.turns.find(turn => turn.kind === "user")?.text || "");
  const handed = request.indexOf(HANDED);
  if (request.startsWith("上一轮你说「") && handed >= 0) request = request.slice(handed + HANDED.length);
  if (request.startsWith(CONTINUATION_MARKER)) {
    const from = request.indexOf("原任务：\n"), to = request.indexOf("\n\n宿主核实的事实");
    if (from >= 0) request = request.slice(from + "原任务：\n".length, to > from ? to : undefined);
  }
  return request;
}

/** A message drafted by rule from the round: its request as the title, the points of its answer, and the files it wrote. */
function ruleDraft(page: Page, run: RunView): string {
  const { L } = page, asked = requestOf(run).trim().split("\n")[0]!.replace(/^#+\s*/, ""), answer = [...run.turns].reverse().find(turn => turn.kind === "assistant")?.text || "";
  const points = answer.split("\n").map(line => line.replace(/^[#>*\-\s\d.、]+/, "").replace(/[*`]/g, "").trim()).filter(line => line.length > 4).slice(0, 5);
  const files = [...new Set(run.activity.filter(item => ["edit", "write"].includes(item.name) && item.state === "completed" && item.target).map(item => item.target))];
  const title = asked.length > 72 ? asked.slice(0, 70) + "…" : asked;
  return [title, "", ...points.map(point => "- " + point), "", L("coding.commit.files"), ...files.map(file => "- " + file)].join("\n").trim();
}

/** The model drafts from every recent round that changed files (a call that costs a little); the rule draft stays as the fallback. */
async function modelDraft(page: Page, id: string, run: RunView, fallback: string): Promise<{ draft: string; note: string; failed: boolean } | null> {
  const { L, lifetime, q } = page;
  try {
    const [provider_id, model_id] = JSON.parse(q<HTMLSelectElement>("[data-coding-model]").value || "[]") as [string?, string?];
    const result = await api<{ message: string; rounds: readonly string[]; usage?: { input: number; output: number } }>(page, sessionPath(id, run.ref.run_id) + "/commit-draft", "POST", { provider_id, model_id });
    const rounds = result.rounds.join(L("coding.list.joiner")), tokens = result.usage ? (result.usage.input + result.usage.output).toLocaleString() : "";
    return { draft: result.message, note: result.usage ? L("coding.commit.drafted-usage", { rounds, tokens }) : L("coding.commit.drafted", { rounds, tokens }), failed: false };
  } catch (error) {
    if (!lifetime.alive) return null;
    return { draft: fallback, note: L("coding.commit.draft-failed", { reason: errorMessage(error) }), failed: true };
  }
}

/** Hands the drafted message to Git, which works on the project's directory: point it at the round's own directory first. */
async function handToGit(page: Page, run: RunView, draft: string, note: string, failed: boolean) {
  const { L, directory, s } = page;
  const ownWorkspace = (s.state.workspaces || []).find(item => item.canonical_path === run.frozen.directory?.canonical_path), own = ownWorkspace?.workspace_id || s.workspaceId;
  try {
    sessionStorage.setItem("molis-commit-draft:" + own, draft);
  } catch {
    // No storage: Git opens without the drafted message.
  }
  let pointed = false;
  try {
    await useProjectWorkspace(page, own);
    pointed = true;
  } catch {
    // The directory could not be made the project's; the status below says so.
  }
  directory.querySelector<HTMLElement>("[data-coding-face=files]")?.click();
  // Git would otherwise stay on another directory, where this message does not belong: say so rather than claim it is there.
  const name = String(ownWorkspace?.display_name || "");
  status(page, pointed ? note : ownWorkspace ? L("coding.commit.git-not-pointed-named", { name }) : L("coding.commit.git-not-pointed", { name }), failed || !pointed);
}

/** Committing a round's changes happens in Git, under Host review; the round only drafts the message. */
export async function commitRound(page: Page, target: HTMLButtonElement) {
  const { L, s } = page, run = s.allRuns.find(item => item.ref.run_id === target.dataset.codingCommitRound);
  if (!run || run.light) return;
  const id = s.current, fallback = ruleDraft(page, run);
  target.disabled = true;
  status(page, L("coding.commit.drafting"));
  let drafted: Awaited<ReturnType<typeof modelDraft>>;
  try {
    drafted = await modelDraft(page, id, run, fallback);
  } finally {
    target.disabled = false;
  }
  if (!drafted || id !== s.current) return;
  await handToGit(page, run, drafted.draft, drafted.note, drafted.failed);
}
