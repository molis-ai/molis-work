import { messageOf, setOptions } from "./dom.js";
import { installConflicts, renderConflicts } from "./conflicts.js";
import { refresh } from "./list.js";
import { active, request, reveal, showReviews } from "./page.js";
import type { GitPage } from "./page.js";
import { loadResults, outcomeLabel } from "./results.js";
import type { DecisionOutcome, OperationRecord, PrSupportAnswer, SummaryAnswer, Translate } from "./types.js";

/** An operation by what it is called, here and in the record (whose tools carry a git- prefix); undefined for one the page does not know. */
export function operationLabel(L: Translate, name: string): string | undefined {
  switch (name) {
    case "commit": return L("git.op.commit");
    case "branch-create": return L("git.op.branch-create");
    case "branch-switch": return L("git.op.branch-switch");
    case "push": return L("git.op.push");
    case "pr-create": return L("git.op.pr-create");
    case "merge": return L("git.op.merge");
    case "pull": return L("git.op.pull");
    case "resolve": return L("git.op.resolve");
    case "merge-abort": return L("git.op.merge-abort");
    default: return undefined;
  }
}

const draftKey = (workspace: string) => `molis-commit-draft:${workspace}`;

/** A commit message handed over from a Coding round, or nothing. */
function handedDraft(workspace: string): string {
  try { return sessionStorage.getItem(draftKey(workspace)) ?? ""; }
  catch { /* storage is blocked here: there is no handed-over message to keep */ return ""; }
}

function forgetDraft(workspace: string): void {
  try { sessionStorage.removeItem(draftKey(workspace)); }
  catch { /* storage is blocked here: nothing was kept */ }
}

/** The text of an operation's record; an address in it (the PR that was opened) becomes a link. */
function recordItem(page: GitPage, op: OperationRecord): HTMLElement {
  const { L, S } = page, item = document.createElement("li");
  item.dataset.outcome = op.outcome;
  const text = `${operationLabel(L, String(op.tool).replace(/^git-/, "")) || op.tool} · ${outcomeLabel(L, op.outcome)} · ${S(op.detail || op.failure_reason || op.summary || "")}`;
  for (const [index, part] of text.split(/(https:\/\/[^\s，。）)]+)/).entries()) {
    if (index % 2 === 0) { item.append(part); continue; }
    const link = document.createElement("a");
    link.href = part; link.textContent = part; link.target = "_blank"; link.rel = "noopener noreferrer";
    page.lifetime.listen(link, "click", (event) => {
      if (!globalThis.molisWorkOpenExternalUrl) return;
      event.preventDefault();
      void globalThis.molisWorkOpenExternalUrl(part);
    });
    item.append(link);
  }
  return item;
}

async function loadOperations(page: GitPage): Promise<void> {
  const epoch = page.generation;
  try {
    const value = await request<{ operations: OperationRecord[] }>(page, "/operations");
    if (!active(page, epoch)) return;
    page.operations.replaceChildren(...value.operations.slice(0, 6).map((op) => recordItem(page, op)));
  } catch { /* the record is only a list of what was done; it stays as it was */ }
}

/** The block for branch, commit, push and PR: read from the repository's summary. */
export async function loadSource(page: GitPage): Promise<void> {
  const { L, S, sc, s, message, scStatus } = page, epoch = page.generation;
  try {
    const value = await request<SummaryAnswer>(page, "/summary");
    if (!active(page, epoch)) return;
    const summary = value.summary;
    page.summary = summary;
    page.scWorkspace = value.workspace.workspace_id;
    sc.hidden = !summary;
    if (!summary) { scStatus.textContent = S(value.message || ""); return; }
    page.draft = value.draft || "";
    // A commit message handed over from a Coding round arrives once, to be edited before anything runs.
    // It stays until that commit is made, so a reload keeps it, and it never replaces what the person has typed.
    const handed = handedDraft(page.scWorkspace);
    if (handed && !message.value.trim()) { message.value = handed; scStatus.textContent = L("git.commit.handed"); }
    s("[data-git-branch]").textContent = summary.branch || L("git.branch.detached", { commit: (summary.head_commit || "").slice(0, 8) });
    s("[data-git-sync]").textContent = summary.upstream ? `↑${summary.ahead} ↓${summary.behind} · ${summary.upstream}` : (summary.remotes.length ? L("git.sync.unpushed") : L("git.sync.no-remote"));
    const commit = s<HTMLButtonElement>("[data-git-commit]");
    commit.disabled = !summary.staged.length && !summary.merging;
    commit.textContent = summary.staged.length ? L("git.commit.staged", { count: summary.staged.length }) : summary.merging ? L("git.commit.merge") : L("git.commit.nothing");
    const push = s<HTMLButtonElement>("[data-git-push]");
    push.disabled = !summary.branch || !summary.remotes.length || !summary.head_commit || Boolean(summary.upstream && !summary.ahead);
    push.textContent = !summary.remotes.length ? L("git.sync.no-remote") : summary.upstream ? (summary.ahead ? L("git.push.count", { count: summary.ahead }) : L("git.push.synced")) : L("git.push.upstream");
    // Branches Coding keeps for its independent writer directories are checked out there: they can be neither
    // switched to here nor a sensible PR target, so they are not offered.
    const others = summary.branches.filter((branch) => branch !== summary.branch && !branch.startsWith("molis-work/writer/"));
    const choice = s<HTMLSelectElement>("[data-git-branch-choice]"), mergeChoice = s<HTMLSelectElement>("[data-git-merge-choice]");
    setOptions(choice, others, choice.value);
    setOptions(mergeChoice, others, mergeChoice.value);
    const pull = s<HTMLButtonElement>("[data-git-pull]");
    pull.disabled = !summary.upstream || summary.merging;
    pull.textContent = !summary.upstream ? L("git.pull.no-upstream") : summary.behind ? L("git.pull.count", { count: summary.behind }) : L("git.pull.any");
    renderConflicts(page);
    // The PR target follows the repository's main branch unless the person picked one; a value left over from the
    // branch previously checked out is not a choice.
    const base = s<HTMLSelectElement>("[data-git-pr-base]");
    setOptions(base, others, base.dataset.chosen === "true" && others.includes(base.value) ? base.value : ["main", "master"].find((branch) => others.includes(branch)));
    if (summary.conflicted.length) scStatus.textContent = L("git.conflict.count", { count: summary.conflicted.length });
    await loadOperations(page);
  } catch { if (active(page, epoch)) sc.hidden = true; }
}

/** Asks the Host to review one operation against the repository as shown, and opens the review. */
export async function prepare(page: GitPage, operation: { action: string } & Record<string, unknown>, label: string, source: HTMLElement): Promise<void> {
  const { L, S, scStatus, diffNotice, q } = page;
  if (!page.summary || page.busy || !page.lifetime.visible) return;
  const epoch = page.generation;
  page.busy = true;
  page.lastPrepared = operation.action;
  scStatus.textContent = L("git.op.preparing", { op: label });
  try {
    await request(page, "/operations", "POST", { workspace_id: page.scWorkspace, operation_id: crypto.randomUUID(), revision: page.summary.revision, operation });
    if (!active(page, epoch)) return;
    scStatus.textContent = L("git.op.review", { op: label });
    page.ticket++;
    page.displayed = null;
    page.action.hidden = true;
    page.resultPanel.hidden = true;
    reveal(page, source);
    q("[data-git-title]").textContent = label;
    q("[data-git-kind]").textContent = L("git.op.review-kind");
    q("[data-git-scope]").textContent = "";
    q("[data-git-diff]").replaceChildren();
    diffNotice.textContent = L("git.op.review-note");
    await showReviews(page);
    if (active(page, epoch)) await loadOperations(page);
  } catch (error) {
    if (active(page, epoch)) { scStatus.textContent = S(messageOf(error)); await loadSource(page); }
  } finally {
    page.busy = false;
  }
}

/** What a decided review says to the person who decided it, by how it ended. */
function decisionNotice(L: Translate, state: string, reason: string): string {
  switch (state) {
    case "unavailable": return L("git.decision.no-receipt", { reason });
    case "uncertain": return L("git.decision.uncertain", { reason });
    case "rejected": return L("git.decision.rejected", { reason });
    case "reconciled": return L("git.decision.reconciled", { reason });
    case "failed": return L("git.decision.failed", { reason });
    case "settled": return L("git.decision.settled", { reason });
    default: return L("git.decision.pending", { reason });
  }
}

/** A review of this workspace was decided: say how it ended and read the repository again. */
export async function afterDecision(page: GitPage, outcome: DecisionOutcome): Promise<void> {
  const { L, message, scStatus, diffNotice, result, action } = page;
  if (!page.lifetime.visible || !outcome.workspaceId || outcome.workspaceId !== page.workspace) return;
  const state = outcome.state, reason = L("git.decision.details");
  // A commit, branch, push or PR decided here reads as that operation, never as an index change.
  if (page.lastPrepared) {
    const done = state === "settled", label = operationLabel(L, page.lastPrepared) || L("git.op.other");
    if (page.lastPrepared === "commit" && done) { message.value = ""; forgetDraft(page.scWorkspace); }
    scStatus.textContent = state === "unavailable" ? L("git.op.no-receipt", { reason }) : state === "rejected" ? L("git.op.rejected", { op: label })
      : state === "failed" ? L("git.op.failed", { op: label, reason }) : done ? L("git.op.done", { op: label }) : L("git.op.recorded");
    page.lastPrepared = "";
    diffNotice.textContent = scStatus.textContent;
    await refresh(page);
    return;
  }
  if (result.getAttribute("aria-busy") === "true") return;
  if (action.hidden) { page.displayed = null; diffNotice.textContent = `${decisionNotice(L, state, reason)} ${L("git.decision.reopen")}`; }
  const signal = page.viewSignal;
  await refresh(page);
  if (signal && !signal.aborted && !page.resultPanel.hidden) await loadResults(page);
}

const toggle = (page: GitPage, button: HTMLElement, form: HTMLElement): void => {
  page.lifetime.listen(button, "click", () => {
    const open = form.hidden;
    form.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) form.querySelector<HTMLElement>("input,select,textarea")?.focus();
  });
};

/** The pull request form opens after asking what the repository can do about one. */
function installPullRequest(page: GitPage): void {
  const { L, S, s, message } = page;
  const form = s("[data-git-pr-form]"), button = s("[data-git-pr-toggle]");
  toggle(page, button, form);
  page.lifetime.listen(s("[data-git-pr-base]"), "change", (event) => { (event.currentTarget as HTMLElement).dataset.chosen = "true"; });
  page.lifetime.listen(button, "click", async () => {
    if (form.hidden) return;
    const epoch = page.generation, note = s("[data-git-pr-support]"), create = s<HTMLButtonElement>("[data-git-pr-create]");
    note.textContent = L("git.pr.checking");
    create.disabled = true;
    const lines = message.value.trim().split("\n"), title = s<HTMLInputElement>("[data-git-pr-title]"), body = s<HTMLTextAreaElement>("[data-git-pr-body]");
    if (!title.value) title.value = lines[0] || page.summary?.branch || "";
    if (!body.value) body.value = lines.slice(1).join("\n").trim();
    try {
      const support = await request<PrSupportAnswer>(page, "/pr-support");
      if (!active(page, epoch)) return;
      note.textContent = S(support.message);
      create.disabled = support.tool !== "ready";
    } catch (error) { if (active(page, epoch)) note.textContent = S(messageOf(error)); }
  });
  page.lifetime.listen(s("[data-git-pr-create]"), "click", (event) => void prepare(page, {
    action: "pr-create", base: s<HTMLSelectElement>("[data-git-pr-base]").value, title: s<HTMLInputElement>("[data-git-pr-title]").value,
    body: s<HTMLTextAreaElement>("[data-git-pr-body]").value, draft: s<HTMLInputElement>("[data-git-pr-draft]").checked,
  }, operationLabel(L, "pr-create") ?? "", event.currentTarget as HTMLElement));
}

/** Branch, commit, push, pull and merge: each is prepared for Host review and runs only if approved and the repository has not moved. */
export function installSource(page: GitPage): void {
  const { L, s, message, scStatus, lifetime } = page;
  const label = (name: string) => operationLabel(L, name) ?? "";
  const asButton = (event: Event) => event.currentTarget as HTMLElement;
  installConflicts(page);
  lifetime.listen(s("[data-git-merge]"), "click", (event) => {
    const branch = s<HTMLSelectElement>("[data-git-merge-choice]").value;
    if (branch) void prepare(page, { action: "merge", branch }, L("git.op.merge-branch", { branch }), asButton(event));
  });
  lifetime.listen(s("[data-git-pull]"), "click", (event) => void prepare(page, { action: "pull" }, label("pull"), asButton(event)));
  toggle(page, s("[data-git-branch-toggle]"), s("[data-git-branch-form]"));
  installPullRequest(page);
  lifetime.listen(s("[data-git-commit-draft]"), "click", () => {
    message.value = page.draft;
    message.focus();
    if (!page.draft) scStatus.textContent = L("git.commit.empty-index");
  });
  lifetime.listen(s("[data-git-commit]"), "click", (event) => {
    if (!message.value.trim()) { scStatus.textContent = L("git.commit.need-message"); message.focus(); return; }
    void prepare(page, { action: "commit", message: message.value }, label("commit"), asButton(event));
  });
  lifetime.listen(s("[data-git-push]"), "click", (event) => {
    const summary = page.summary;
    const remote = summary?.upstream?.split("/")[0] || summary?.remotes.find((item) => item.name === "origin")?.name || summary?.remotes[0]?.name;
    void prepare(page, { action: "push", remote, set_upstream: !summary?.upstream }, label("push"), asButton(event));
  });
  lifetime.listen(s("[data-git-branch-switch]"), "click", (event) => {
    const name = s<HTMLSelectElement>("[data-git-branch-choice]").value;
    if (name) void prepare(page, { action: "branch-switch", name }, L("git.op.switch-to", { name }), asButton(event));
  });
  lifetime.listen(s("[data-git-branch-create]"), "click", (event) => {
    const field = s<HTMLInputElement>("[data-git-branch-name]"), name = field.value.trim();
    if (!name) { scStatus.textContent = L("git.branch.need-name"); field.focus(); return; }
    void prepare(page, { action: "branch-create", name, checkout: s<HTMLInputElement>("[data-git-branch-checkout]").checked }, L("git.op.create-branch", { name }), asButton(event));
  });
}
