import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { setOptions } from "./dom.js";
import { installConflicts, renderConflicts } from "./conflicts.js";
import { refresh } from "./list.js";
import { active, inFolder, request, reveal, sayRefusal, showReviews } from "./page.js";
import type { GitPage } from "./page.js";
import { loadResults, outcomeLabel } from "./results.js";
import type { DecisionOutcome, OperationRecord, PrSupportAnswer, SummaryAnswer, Translate } from "./types.js";

const uiText = globalThis.t;

/** An operation by what it is called, here and in the record (whose tools carry a git- prefix); undefined for one the page does not know. */
export function operationLabel(_L: Translate, name: string): string | undefined {
  switch (name) {
    case "commit": return uiText.text("git.op.commit");
    case "branch-create": return uiText.text("git.op.branch-create");
    case "branch-switch": return uiText.text("git.op.branch-switch");
    case "push": return uiText.text("git.op.push");
    case "pr-create": return uiText.text("git.op.pr-create");
    case "merge": return uiText.text("git.op.merge");
    case "pull": return uiText.text("git.op.pull");
    case "resolve": return uiText.text("git.op.resolve");
    case "merge-abort": return uiText.text("git.op.merge-abort");
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
  const { readText } = page, item = document.createElement("li");
  item.dataset.outcome = op.outcome;
  const text = `${operationLabel(readText, String(op.tool).replace(/^git-/, "")) || op.tool} · ${outcomeLabel(readText, op.outcome)} · ${(op.detail || op.failure_reason || op.summary || "")}`;
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

/** Read the operation list and reconcile only the operation this page prepared. A notification is merely a read hint. */
async function loadOperations(page: GitPage): Promise<boolean> {
  const { readText, message, scStatus, diffNotice } = page;
  const epoch = page.generation, workspace = page.workspace, prepared = page.lastPrepared;
  const current = () => active(page, epoch) && page.workspace === workspace && page.lastPrepared === prepared && !page.busy;
  const reason = uiText.text("git.decision.details");
  try {
    const value = await request<{ workspace: { workspace_id: string }; operations: OperationRecord[] }>(page, inFolder("/operations", workspace));
    if (!current() || value.workspace.workspace_id !== workspace) return false;
    page.operations.replaceChildren(...value.operations.slice(0, 6).map((op) => recordItem(page, op)));
    if (!prepared) return false;
    const record = value.operations.find(operation => operation.review_id === prepared.reviewId);
    if (!record || record.outcome === "pending" || record.outcome === "running") return false;
    const done = record.outcome === "succeeded", label = operationLabel(readText, prepared.action) || uiText.text("git.op.other");
    if (prepared.action === "commit" && done && message.value === prepared.message) { message.value = ""; forgetDraft(page.scWorkspace); }
    scStatus.textContent = record.outcome === "unknown" ? uiText.text("git.decision.uncertain", { reason }) : record.outcome === "denied" ? uiText.text("git.op.rejected", { op: label })
      : record.outcome === "failed" ? uiText.text("git.op.failed", { op: label, reason }) : done ? uiText.text("git.op.done", { op: label }) : `${label} · ${outcomeLabel(readText, record.outcome)}`;
    if (record.outcome !== "unknown") page.lastPrepared = null;
    diffNotice.textContent = scStatus.textContent;
    return true;
  } catch {
    if (prepared && current()) scStatus.textContent = uiText.text("git.op.no-receipt", { reason });
    return false;
  }
}

/** The block for branch, commit, push and PR: read from the repository's summary. */
export async function loadSource(page: GitPage): Promise<void> {
  const { sc, s, message, scStatus } = page, epoch = page.generation;
  try {
    const value = await request<SummaryAnswer>(page, inFolder("/summary", page.workspace));
    if (!active(page, epoch)) return;
    const summary = value.summary;
    page.summary = summary;
    page.scWorkspace = value.workspace.workspace_id;
    sc.hidden = !summary;
    if (!summary) { scStatus.textContent = (value.message || ""); return; }
    page.draft = value.draft || "";
    // A commit message handed over from a Coding round arrives once, to be edited before anything runs.
    // It stays until that commit is made, so a reload keeps it, and it never replaces what the person has typed.
    const handed = handedDraft(page.scWorkspace);
    if (handed && !message.value.trim()) { message.value = handed; scStatus.textContent = uiText.text("git.commit.handed"); }
    s("[data-git-branch]").textContent = summary.branch || uiText.text("git.branch.detached", { commit: (summary.head_commit || "").slice(0, 8) });
    s("[data-git-sync]").textContent = summary.upstream ? `↑${summary.ahead} ↓${summary.behind} · ${summary.upstream}` : (summary.remotes.length ? uiText.text("git.sync.unpushed") : uiText.text("git.sync.no-remote"));
    const commit = s<HTMLButtonElement>("[data-git-commit]");
    commit.disabled = !summary.staged.length && !summary.merging;
    commit.textContent = summary.staged.length ? uiText.text("git.commit.staged", { count: summary.staged.length }) : summary.merging ? uiText.text("git.commit.merge") : uiText.text("git.commit.nothing");
    const push = s<HTMLButtonElement>("[data-git-push]");
    push.disabled = !summary.branch || !summary.remotes.length || !summary.head_commit || Boolean(summary.upstream && !summary.ahead);
    push.textContent = !summary.remotes.length ? uiText.text("git.sync.no-remote") : summary.upstream ? (summary.ahead ? uiText.text("git.push.count", { count: summary.ahead }) : uiText.text("git.push.synced")) : uiText.text("git.push.upstream");
    // Branches Coding keeps for its independent writer directories are checked out there: they can be neither
    // switched to here nor a sensible PR target, so they are not offered.
    const others = summary.branches.filter((branch) => branch !== summary.branch && !branch.startsWith("molis-work/writer/"));
    const choice = s<HTMLSelectElement>("[data-git-branch-choice]"), mergeChoice = s<HTMLSelectElement>("[data-git-merge-choice]");
    setOptions(choice, others, choice.value);
    setOptions(mergeChoice, others, mergeChoice.value);
    const pull = s<HTMLButtonElement>("[data-git-pull]");
    pull.disabled = !summary.upstream || summary.merging;
    pull.textContent = !summary.upstream ? uiText.text("git.pull.no-upstream") : summary.behind ? uiText.text("git.pull.count", { count: summary.behind }) : uiText.text("git.pull.any");
    renderConflicts(page);
    // The PR target follows the repository's main branch unless the person picked one; a value left over from the
    // branch previously checked out is not a choice.
    const base = s<HTMLSelectElement>("[data-git-pr-base]");
    setOptions(base, others, base.dataset.chosen === "true" && others.includes(base.value) ? base.value : ["main", "master"].find((branch) => others.includes(branch)));
    if (summary.conflicted.length) scStatus.textContent = uiText.text("git.conflict.count", { count: summary.conflicted.length });
    await loadOperations(page);
  } catch { if (active(page, epoch)) sc.hidden = true; }
}

/** Asks the Host to review one operation against the repository as shown, and opens the review. */
export async function prepare(page: GitPage, operation: { action: string } & Record<string, unknown>, label: string, source: HTMLElement): Promise<void> {
  const { scStatus, diffNotice, q } = page;
  if (!page.summary || page.busy || !page.lifetime.visible) return;
  const epoch = page.generation;
  page.busy = true;
  scStatus.textContent = uiText.text("git.op.preparing", { op: label });
  let answer: { review_id: string };
  try {
    answer = await request(page, "/operations", "POST", { workspace_id: page.scWorkspace, operation_id: crypto.randomUUID(), revision: page.summary.revision, operation });
  } catch (error) {
    if (active(page, epoch)) {
      await loadSource(page);
      // Said after the reload, which writes its own status. Once the person makes the folder the output, the same review is asked for.
      if (active(page, epoch)) sayRefusal(page, scStatus, error, page.scWorkspace, () => { void prepare(page, operation, label, source); });
    }
    return;
  } finally {
    page.busy = false;
  }
  if (!active(page, epoch)) return;
  const prepared = { action: operation.action, reviewId: answer.review_id,
    ...(typeof operation.message === "string" ? { message: operation.message } : {}) };
  page.lastPrepared = prepared;
  const current = () => active(page, epoch) && page.lastPrepared === prepared && !page.busy;
  try {
    scStatus.textContent = uiText.text("git.op.review", { op: label });
    page.ticket++;
    page.displayed = null;
    page.action.hidden = true;
    page.resultPanel.hidden = true;
    reveal(page, source);
    q("[data-git-title]").textContent = label;
    q("[data-git-kind]").textContent = uiText.text("git.op.review-kind");
    q("[data-git-scope]").textContent = "";
    q("[data-git-diff]").replaceChildren();
    diffNotice.textContent = uiText.text("git.op.review-note");
    await showReviews(page);
    if (current()) await afterDecision(page, { workspaceId: page.workspace, state: "pending" });
  } catch (error) {
    if (current()) { scStatus.textContent = (messageOf(error)); await loadSource(page); }
  }
}

/** What a decided review says to the person who decided it, by how it ended. */
function decisionNotice(_L: Translate, state: string, reason: string): string {
  switch (state) {
    case "unavailable": return uiText.text("git.decision.no-receipt", { reason });
    case "uncertain": return uiText.text("git.decision.uncertain", { reason });
    case "rejected": return uiText.text("git.decision.rejected", { reason });
    case "reconciled": return uiText.text("git.decision.reconciled", { reason });
    case "failed": return uiText.text("git.decision.failed", { reason });
    case "settled": return uiText.text("git.decision.settled", { reason });
    default: return uiText.text("git.decision.pending", { reason });
  }
}

/** A review of this workspace was decided: say how it ended and read the repository again. */
export async function afterDecision(page: GitPage, outcome: DecisionOutcome): Promise<void> {
  const { readText, diffNotice, result, action } = page;
  if (page.busy || !page.lifetime.visible || !outcome.workspaceId || outcome.workspaceId !== page.workspace) return;
  const state = outcome.state, reason = uiText.text("git.decision.details");
  // A delayed decision can belong to an earlier index review. Read this operation's own result.
  const prepared = page.lastPrepared;
  if (prepared) {
    const epoch = page.generation;
    if (await loadOperations(page) && active(page, epoch) && !page.busy && (page.lastPrepared === prepared || page.lastPrepared === null)) await refresh(page);
    return;
  }
  if (result.getAttribute("aria-busy") === "true") return;
  if (action.hidden) { page.displayed = null; diffNotice.textContent = `${decisionNotice(readText, state, reason)} ${uiText.text("git.decision.reopen")}`; }
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

function pullRequestNote(support: PrSupportAnswer): string {
  if (support.outcome !== "pr-support") return support.message;
  switch (support.tool) {
    case "ready": return uiText.text("git.host.pr-ready", { host: support.host ?? "" });
    case "missing": return uiText.text("git.pr.support-missing");
    case "unauthenticated": return uiText.text("git.host.pr-signin", { host: support.host ?? "" });
    case "unsupported":
      if (support.host !== null) return uiText.text("git.host.remote-elsewhere", { host: support.host });
      if (support.local_remote) return uiText.text("git.host.remote-local", { remote: support.local_remote.name, url: support.local_remote.url });
      return uiText.text("git.pr.support-no-remote");
  }
}

/** The pull request form opens after asking what the repository can do about one. */
function installPullRequest(page: GitPage): void {
  const { readText, s, message } = page;
  const form = s("[data-git-pr-form]"), button = s("[data-git-pr-toggle]");
  toggle(page, button, form);
  page.lifetime.listen(s("[data-git-pr-base]"), "change", (event) => { (event.currentTarget as HTMLElement).dataset.chosen = "true"; });
  page.lifetime.listen(button, "click", async () => {
    if (form.hidden) return;
    const epoch = page.generation, note = s("[data-git-pr-support]"), create = s<HTMLButtonElement>("[data-git-pr-create]");
    note.translate = true;
    note.textContent = uiText.text("git.pr.checking");
    create.disabled = true;
    const lines = message.value.trim().split("\n"), title = s<HTMLInputElement>("[data-git-pr-title]"), body = s<HTMLTextAreaElement>("[data-git-pr-body]");
    if (!title.value) title.value = lines[0] || page.summary?.branch || "";
    if (!body.value) body.value = lines.slice(1).join("\n").trim();
    try {
      const support = await request<PrSupportAnswer>(page, inFolder("/pr-support", page.workspace));
      if (!active(page, epoch)) return;
      note.translate = support.outcome === "pr-support";
      note.textContent = pullRequestNote(support);
      create.disabled = support.outcome !== "pr-support" || support.tool !== "ready";
    } catch (error) { if (active(page, epoch)) { note.translate = false; note.textContent = messageOf(error); } }
  });
  page.lifetime.listen(s("[data-git-pr-create]"), "click", (event) => void prepare(page, {
    action: "pr-create", base: s<HTMLSelectElement>("[data-git-pr-base]").value, title: s<HTMLInputElement>("[data-git-pr-title]").value,
    body: s<HTMLTextAreaElement>("[data-git-pr-body]").value, draft: s<HTMLInputElement>("[data-git-pr-draft]").checked,
  }, operationLabel(readText, "pr-create") ?? "", event.currentTarget as HTMLElement));
}

/** Branch, commit, push, pull and merge: each is prepared for Host review and runs only if approved and the repository has not moved. */
export function installSource(page: GitPage): void {
  const { readText, s, message, scStatus, lifetime } = page;
  const label = (name: string) => operationLabel(readText, name) ?? "";
  const asButton = (event: Event) => event.currentTarget as HTMLElement;
  installConflicts(page);
  lifetime.listen(s("[data-git-merge]"), "click", (event) => {
    const branch = s<HTMLSelectElement>("[data-git-merge-choice]").value;
    if (branch) void prepare(page, { action: "merge", branch }, uiText.text("git.op.merge-branch", { branch }), asButton(event));
  });
  lifetime.listen(s("[data-git-pull]"), "click", (event) => void prepare(page, { action: "pull" }, label("pull"), asButton(event)));
  toggle(page, s("[data-git-branch-toggle]"), s("[data-git-branch-form]"));
  installPullRequest(page);
  lifetime.listen(s("[data-git-commit-draft]"), "click", () => {
    message.value = page.draft;
    message.focus();
    if (!page.draft) scStatus.textContent = uiText.text("git.commit.empty-index");
  });
  lifetime.listen(s("[data-git-commit]"), "click", (event) => {
    if (!message.value.trim()) { scStatus.textContent = uiText.text("git.commit.need-message"); message.focus(); return; }
    void prepare(page, { action: "commit", message: message.value }, label("commit"), asButton(event));
  });
  lifetime.listen(s("[data-git-push]"), "click", (event) => {
    const summary = page.summary;
    const remote = summary?.upstream?.split("/")[0] || summary?.remotes.find((item) => item.name === "origin")?.name || summary?.remotes[0]?.name;
    void prepare(page, { action: "push", remote, set_upstream: !summary?.upstream }, label("push"), asButton(event));
  });
  lifetime.listen(s("[data-git-branch-switch]"), "click", (event) => {
    const name = s<HTMLSelectElement>("[data-git-branch-choice]").value;
    if (name) void prepare(page, { action: "branch-switch", name }, uiText.text("git.op.switch-to", { name }), asButton(event));
  });
  lifetime.listen(s("[data-git-branch-create]"), "click", (event) => {
    const field = s<HTMLInputElement>("[data-git-branch-name]"), name = field.value.trim();
    if (!name) { scStatus.textContent = uiText.text("git.branch.need-name"); field.focus(); return; }
    void prepare(page, { action: "branch-create", name, checkout: s<HTMLInputElement>("[data-git-branch-checkout]").checked }, uiText.text("git.op.create-branch", { name }), asButton(event));
  });
}
