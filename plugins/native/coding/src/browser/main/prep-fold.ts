import { icon, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { buildEnvironmentChecklistHtml, buildRoundMaterialsHtml, environmentAttention, roundMaterialCount } from "../../recovery-parts.js";
import { el } from "../dom.js";
import { terminal } from "./composer-state.js";
import type { Page } from "./page.js";
import type { RunView } from "./shapes.js";

type Readiness = Page["s"]["state"]["environment_readiness"];

/**
 * What a round was prepared with — its environment and the materials it took in — folds into one line once nothing in it
 * waits on the person, so the answer is what the reader meets first (screen-polish §6.2, §6.3; POLISH-24). The cards stay
 * inside, one click away. Something to handle opens the fold and marks its line amber (POLISH-26: amber only where the
 * person is asked for something).
 */
function foldOf(parent: Element): HTMLDetailsElement {
  let fold = parent.querySelector<HTMLDetailsElement>(":scope > [data-coding-prep]");
  if (fold) return fold;
  fold = el("details", "", "coding-prep mw-disclosure");
  fold.dataset.codingPrep = "";
  const summary = el("summary", "", "coding-prep-line");
  summary.append(el("span", "", "coding-prep-mark"), el("span", "", "coding-prep-text"));
  summary.insertAdjacentHTML("beforeend", icon("chevron-down"));
  // Once the person opens or closes it, the fold is theirs: later draws leave it as they left it.
  summary.addEventListener("click", () => { fold!.dataset.chosen = "true"; });
  fold.append(summary);
  return fold;
}

/** One card inside the fold, kept across draws so an open disclosure or a focused button in it survives polling. */
function card(fold: HTMLElement, className: string, mark: "codingEnvChecklist" | "codingRoundMaterials", html: string) {
  let box = [...fold.children].find((node): node is HTMLElement => node instanceof HTMLElement && node.dataset[mark] !== undefined);
  if (!html) { box?.remove(); return; }
  if (!box) {
    box = el("div", "", className);
    box.dataset[mark] = "";
    // The environment comes before the materials, as the round met them.
    if (mark === "codingEnvChecklist") fold.querySelector(":scope > summary")!.after(box); else fold.append(box);
  }
  if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
}

function draw(fold: HTMLDetailsElement, line: string, attention: number, open: boolean, env: string, materials: string) {
  fold.dataset.attention = String(attention > 0);
  const mark = fold.querySelector<HTMLElement>(".coding-prep-mark")!, text = fold.querySelector<HTMLElement>(".coding-prep-text")!;
  mark.dataset.mwState = attention > 0 ? "verify" : "done";
  if (text.textContent !== line) text.textContent = line;
  card(fold, "coding-env-checklist", "codingEnvChecklist", env);
  card(fold, "coding-round-materials", "codingRoundMaterials", materials);
  // Something new to handle opens it again even after the person closed it; otherwise their choice stands.
  if (attention > 0 && fold.dataset.asked !== "true") { fold.open = true; fold.dataset.asked = "true"; }
  else if (attention === 0) { delete fold.dataset.asked; if (fold.dataset.chosen !== "true") fold.open = open; }
}

const workspaceName = (readiness: NonNullable<Readiness>) => readiness.canonical_path?.split("/").filter(Boolean).at(-1) ?? "";

/** What the line says when the environment asks for something: the inspection could not be finished, or how many rows wait. */
const asks = (readiness: NonNullable<Readiness>, attention: number) =>
  readiness.status === "unavailable" ? uiText.text("coding.env.unavailable") : uiText.text("coding.env.status.attention", { count: attention });

/** The welcome of a session with no round yet: the environment the first round would start in. */
export function drawWelcomePrep(page: Page, readiness: Readiness, matches: boolean): void {
  const { turns } = page, html = matches ? buildEnvironmentChecklistHtml(readiness) : "";
  if (!html || !readiness) { turns.querySelector(":scope > [data-coding-prep]")?.remove(); return; }
  const fold = foldOf(turns), attention = environmentAttention(readiness);
  if (!fold.isConnected) turns.append(fold);
  const line = readiness.status === "unavailable" || attention > 0
    ? uiText.text("coding.env.title") + " · " + asks(readiness, attention)
    : [uiText.text("coding.prep.env-ready"), workspaceName(readiness), readiness.deps_installed ? uiText.text("coding.prep.deps-ready") : ""].filter(Boolean).join(" · ");
  draw(fold, line, attention, false, html, "");
}

/** Whether the environment read for the session is the one this round ran in. */
function readinessMatchesRun(run: RunView, readiness: Readiness): boolean {
  if (!readiness) return false;
  if (run.frozen?.directories?.execution.kind === "worktree") return false;
  const runDir = run.frozen?.directory?.canonical_path;
  return !runDir || !readiness.canonical_path || runDir === readiness.canonical_path;
}

/**
 * A round's fold: the environment (the newest round only: it is the session's environment now) and the round's materials.
 * It stays open while the round has not said anything yet, and closes to one line when the answer starts. Null when the
 * round has neither.
 */
export function runPrep(page: Page, block: HTMLElement, run: RunView, last: boolean): HTMLDetailsElement | null {
  const readiness = page.s.state.environment_readiness, shown = last && readinessMatchesRun(run, readiness) ? readiness : null;
  const env = shown ? buildEnvironmentChecklistHtml(shown) : "", materials = buildRoundMaterialsHtml(run);
  if (!env && !materials) { block.querySelector(":scope > [data-coding-prep]")?.remove(); return null; }
  const fold = foldOf(block), attention = env && shown ? environmentAttention(shown) : 0, count = roundMaterialCount(run);
  const facts = shown && shown.status !== "unavailable" ? shown : null;
  const parts = [...(env ? [uiText.text(facts?.is_git_repo ? "coding.prep.repo" : "coding.prep.folder"), ...(facts?.deps_manager ? [uiText.text("coding.prep.deps")] : [])] : []), ...(count ? [uiText.text("coding.prep.materials", { count })] : [])];
  const line = uiText.text("coding.prep.title") + " · " + (shown && attention > 0 ? asks(shown, attention) : parts.join(uiText.text("common.list.separator")));
  const answered = terminal(run.phase) || (run.turns ?? []).some(turn => turn.kind === "assistant" && turn.text.trim() !== "");
  draw(fold, line, attention, !answered, env, materials);
  return fold;
}

/**
 * The environment was read again. The newest round's fold says what it says now, and is made right under the task when the
 * round had nothing to fold until this read; a round that is no longer the newest gives the environment up (it is the
 * session's environment now, not that round's). `drawn` are the rounds this same pass has just drawn, fold included.
 */
export function refreshRunPrep(page: Page, drawn: ReadonlySet<string> = new Set()): void {
  const { s, turns } = page, newest = s.lastRun?.ref.run_id;
  for (const block of turns.querySelectorAll<HTMLElement>(":scope > [data-run]")) {
    const last = block.dataset.run === newest, had = block.querySelector(":scope > [data-coding-prep]");
    if (drawn.has(block.dataset.run ?? "") || (!last && !had?.querySelector(":scope > [data-coding-env-checklist]"))) continue;
    const run = last ? s.lastRun : s.allRuns.find(one => one.ref.run_id === block.dataset.run);
    const fold = run ? runPrep(page, block, run, last) : null;
    if (!fold || had) continue;
    const task = block.querySelector(":scope > [data-kind=user]");
    if (task) task.after(fold); else block.prepend(fold);
  }
}
