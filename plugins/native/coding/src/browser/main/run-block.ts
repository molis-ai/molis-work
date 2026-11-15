import { setContentHtml } from "@molis-ai/molis-work-plugin-sdk/browser";
import { buildRoundMaterialsHtml } from "../../recovery-parts.js";
import { el } from "../dom.js";
import { changesBlock, changesRow } from "./boundary.js";
import { buildEnvironmentChecklistHtml } from "./configuration.js";
export { buildRoundMaterialsHtml };
import { terminal } from "./composer-state.js";
import { showReviews } from "./helpers.js";
import { offerApproval } from "./report.js";
import { renderQuestions } from "./questions.js";
import { groupEntries, type Group } from "./run-entries.js";
import { turnNode } from "./run-turn.js";
import type { Page } from "./page.js";
import type { RunView } from "./shapes.js";

/** Where a round's plan graph stands among the rounds that came after it. */
interface GraphStand {
  readonly entry: Page["s"]["planEntries"][number] | undefined;
  /** A later round works on the same graph: it shows the card, this one does not. */
  readonly laterOnSameGraph: boolean;
  /** The latest plan round keeps its graph open to change when only ended conversation rounds came after it. */
  readonly latest: boolean;
}

function graphStand(page: Page, run: RunView, all: readonly RunView[]): GraphStand {
  const { s } = page, entryOf = (item: RunView) => s.planEntries.find(entry => entry.run_id === item.ref.run_id);
  const entry = entryOf(run), projectId = entry?.board?.project_id, later = all.slice(all.indexOf(run) + 1);
  return {
    entry,
    laterOnSameGraph: Boolean(projectId) && later.some(item => entryOf(item)?.board?.project_id === projectId),
    latest: Boolean(entry?.board) && later.every(item => terminal(item.phase) && !entryOf(item)),
  };
}

/** The node of each entry of a round, in the order they are shown. */
function entryNodes(page: Page, block: HTMLElement, run: RunView, all: readonly RunView[], groups: readonly Group[]): HTMLElement[] {
  const { s } = page, { timeline, turnChanges } = page.refs, ordered: HTMLElement[] = [];
  const lastActivity = groups.filter(group => group.kind === "activity").at(-1);
  let skills = block.querySelector<HTMLElement>(":scope > [data-coding-skills]");
  if (!run.skills_html) { skills?.remove(); skills = null; }
  for (const entry of groups) {
    if (entry.kind === "turn") {
      // The Skills the round used sit right above its first reply (SKL-11); the shell's panel opens from the line's buttons.
      if (entry.value.kind === "assistant" && run.skills_html && !ordered.some(node => node === skills)) {
        skills ??= el("div", "", "coding-round-skills");
        skills.dataset.codingSkills = "";
        if (skills.dataset.html !== run.skills_html) { skills.dataset.html = run.skills_html; skills.innerHTML = run.skills_html; }
        ordered.push(skills);
      }
      ordered.push(turnNode(page, block, entry.value, run, all));
    } else if (entry.kind === "activity") {
      const key = entry.values[0]!.call_id;
      let detail = [...block.querySelectorAll<HTMLElement>("[data-coding-activity]")].find(node => node.dataset.codingActivity === key);
      if (!detail) {
        detail = el("details", "", "coding-activity");
        detail.dataset.codingActivity = key;
      }
      timeline.renderGroup(detail, entry.values, run, entry === lastActivity && run === all.at(-1));
      ordered.push(detail);
    } else if (entry.kind === "changes") {
      ordered.push(changesRow(turnChanges.place(changesBlock(block), entry.value, run, terminal(run.phase) && run === all.at(-1) && !s.recovery && !s.checkpointBusy)));
    } else {
      const key = JSON.stringify([run.ref.run_id, entry.value.pending_id, entry.value.pending_revision]);
      const form = [...block.querySelectorAll<HTMLElement>("[data-coding-question]")].find(node => node.dataset.questionKey === key);
      if (form) ordered.push(form);
    }
  }
  return ordered;
}

function placeEnvChecklist(page: Page, block: HTMLElement, ordered: HTMLElement[], last: boolean) {
  if (!last) {
    block.querySelector(":scope > [data-coding-env-checklist]")?.remove();
    return;
  }
  const html = buildEnvironmentChecklistHtml(page.s.state.environment_readiness);
  if (!html) {
    block.querySelector(":scope > [data-coding-env-checklist]")?.remove();
    return;
  }
  let box = block.querySelector<HTMLElement>(":scope > [data-coding-env-checklist]");
  if (!box) {
    box = el("div", "", "coding-env-checklist");
    box.dataset.codingEnvChecklist = "";
  }
  if (box.dataset.html !== html) {
    box.dataset.html = html;
    setContentHtml(box, html);
  }
  const userIdx = ordered.findIndex(node => node.dataset.kind === "user");
  ordered.splice(userIdx >= 0 ? userIdx + 1 : 0, 0, box);
}

function placeRoundMaterials(block: HTMLElement, run: RunView, ordered: HTMLElement[]) {
  const html = buildRoundMaterialsHtml(run);
  if (!html) {
    block.querySelector(":scope > [data-coding-round-materials]")?.remove();
    return;
  }
  let box = block.querySelector<HTMLElement>(":scope > [data-coding-round-materials]");
  if (!box || box.tagName !== "DIV") {
    box?.remove();
    box = el("div", "", "coding-round-materials");
    box.dataset.codingRoundMaterials = "";
  }
  if (box.dataset.html !== html) {
    box.dataset.html = html;
    setContentHtml(box, html);
  }
  const envIdx = ordered.findIndex(node => node.hasAttribute("data-coding-env-checklist"));
  const userIdx = ordered.findIndex(node => node.dataset.kind === "user");
  const anchor = envIdx >= 0 ? envIdx : userIdx;
  ordered.splice(anchor >= 0 ? anchor + 1 : 0, 0, box);
}

/** The plan sits right under the task it came from, and the subtasks right after the step that sent them. */
function placeCards(page: Page, block: HTMLElement, run: RunView, all: readonly RunView[], ordered: HTMLElement[], stand: GraphStand) {
  const { s } = page, { planProgress, subagentCards } = page.refs, last = run === all.at(-1);
  placeEnvChecklist(page, block, ordered, last);
  placeRoundMaterials(block, run, ordered);
  if (stand.laterOnSameGraph) block.querySelector(":scope > .coding-plan-progress")?.remove();
  const planCard = stand.laterOnSameGraph ? null : planProgress.render(run, stand.entry, last && !terminal(run.phase), last || stand.latest);
  if (planCard) {
    const matIdx = ordered.findIndex(node => node.hasAttribute("data-coding-round-materials"));
    const envIdx = ordered.findIndex(node => node.hasAttribute("data-coding-env-checklist"));
    const userIdx = ordered.findIndex(node => node.dataset.kind === "user");
    const anchor = matIdx >= 0 ? matIdx : envIdx >= 0 ? envIdx : userIdx;
    ordered.splice(anchor >= 0 ? anchor + 1 : 0, 0, planCard);
  }
  const children = subagentCards.render(run, s.subagentGroups.find(group => group.run_id === run.ref.run_id));
  if (children) {
    const at = ordered.map(node => node.classList.contains("coding-activity") && Boolean(node.querySelector('[data-kind="dispatch-subagent"]'))).lastIndexOf(true);
    ordered.splice(at >= 0 ? at + 1 : ordered.length, 0, children);
  }
}

/** The supplement on its way shows after the round it goes to, until the round's own record has it; after that, the tray of what is still open. */
function placeTray(page: Page, block: HTMLElement, run: RunView, all: readonly RunView[], ordered: HTMLElement[]) {
  const { host, s, turns } = page, { inputReceipts } = page.refs, last = run === all.at(-1);
  const sending = last ? inputReceipts.bubble(s.current, run) : null;
  const waiting = last ? host.receipts.tray(turns, s.queuedInputs, { run_id: run.ref.run_id }, inputReceipts.act(s.current, run.ref.run_id)) : null;
  for (const node of [sending, waiting]) if (node) ordered.push(node);
  for (const node of block.querySelectorAll(":scope > .is-sending,:scope > .mw-tray")) if (node !== sending && node !== waiting) node.remove();
}

/** Puts in only the entries that are missing or misplaced: polling keeps open tools and a focused question form intact. */
function settle(block: HTMLElement, ordered: readonly HTMLElement[]) {
  let cursor = block.firstElementChild;
  for (const node of ordered) {
    if (node !== cursor) block.insertBefore(node, cursor);
    cursor = node.nextElementSibling;
  }
}

/** The pending decision sits where the work stopped; the Host renders it and owns the decision. */
function placeReview(page: Page, block: HTMLElement, run: RunView, all: readonly RunView[]) {
  const { s } = page;
  let inline = block.querySelector<HTMLElement>(":scope > [data-coding-inline-review]");
  if (run !== all.at(-1) || run.phase !== "awaiting-review") {
    inline?.remove();
    return;
  }
  if (!inline) {
    inline = el("div", "", "coding-inline-review");
    inline.dataset.codingInlineReview = "";
  }
  const footer = block.querySelector(":scope > .coding-run-footer");
  if (inline.nextElementSibling !== footer || inline.parentElement !== block) block.insertBefore(inline, footer);
  const signal = s.viewSignal, target = inline;
  void Promise.resolve(showReviews(page, target, [run.ref], s.runtimeSessionId)).then(() => {
    if (!signal?.aborted) offerApproval(page, target);
  });
}

/** While the model is still writing its latest reply, a caret marks the end of that text — and only that text. */
function markWriting(run: RunView, all: readonly RunView[], groups: readonly Group[], ordered: readonly HTMLElement[]) {
  const tail = groups.at(-1), writing = run === all.at(-1) && ["starting", "running"].includes(run.phase) && tail?.kind === "turn" && tail.value.kind === "assistant";
  ordered.forEach((node, at) => {
    if (node.classList.contains("coding-turn")) node.classList.toggle("is-writing", writing && at === ordered.length - 1);
  });
}

/** Draws one round in its block: the entries in their order, then what hangs off them. */
export function drawRun(page: Page, block: HTMLElement, run: RunView, all: readonly RunView[]) {
  const { s } = page, { renderCards, timeline } = page.refs;
  renderQuestions(page, block, run);
  const groups = groupEntries(run), ordered = entryNodes(page, block, run, all, groups), stand = graphStand(page, run, all);
  placeCards(page, block, run, all, ordered, stand);
  const cards = renderCards(block, run);
  if (cards) ordered.push(cards);
  markWriting(run, all, groups, ordered);
  for (const detail of block.querySelectorAll(":scope > [data-coding-activity]")) if (!ordered.includes(detail as HTMLElement)) detail.remove();
  placeTray(page, block, run, all, ordered);
  settle(block, ordered);
  placeReview(page, block, run, all);
  const settled = !s.recovery && !s.checkpointBusy, last = run === all.at(-1);
  const headRev = !run.code_revision && last ? s.state.environment_readiness?.head_commit?.slice(0, 7) ?? null : run.code_revision;
  timeline.renderFooter(block, headRev ? { ...run, code_revision: headRev } : run, all.indexOf(run), last && (run.phase === "reconcile-required" || settled), !last && stand.latest && settled);
}
