/**
 * How one round reads in the conversation: each tool call is a row that says what it touched and how it
 * ended, consecutive calls fold into one summary, and a round closes with what actually happened.
 *
 * `createCodingTimeline` is injected into the browser with `toString()`, so it must stay self-contained:
 * no imports, no closures over module scope. Everything it shows comes from the run projection; it never
 * infers success the projection does not state.
 */
import type { codingTimelineWords } from "./timeline-words.js";

/** Runs in the browser only; the plugin build has no DOM library, so elements are typed structurally. */
type Element = any;
declare const document: any;

export interface TimelineActivity {
  call_id: string;
  name: string;
  target: string;
  state: string;
  output?: string;
  output_truncated?: boolean;
  /** Lines the Host left out of a display copy of the output; the timeline never shows them either. */
  output_hidden_lines?: number;
  at?: string | null;
}
export interface TimelineRun {
  ref: { run_id: string };
  phase: string;
  started_at?: string | null;
  ended_at?: string | null;
  activity: TimelineActivity[];
  usage?: { tokens?: { input?: number; output?: number } };
  stop_reason?: string | null;
  step_board?: { terminal: boolean; nodes: Array<{ state: string }> };
  turns?: Array<{ kind: string; text: string; at?: string | null }>;
  turn_changes?: TimelineTurnChanges[];
}
/** What one turn wrote, from the runtime's write receipts (AgentRunView.turn_changes). */
export interface TimelineTurnChanges {
  turn: number;
  sequence: number;
  files: Array<{ path: string; byte_length: number; digest: string; checkpoint_id: string }>;
}

/** The words and tables the timeline reads with (codingTimelineWords), passed in because the factory is injected alone. */
export type TimelineWords = ReturnType<typeof codingTimelineWords>;

export function createCodingTimeline(words: TimelineWords) {
  const TERMINAL = ["completed", "failed", "stopped", "cancelled", "reconcile-required"];
  const svg = (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));
  const { KIND, FAILURES, toolHint: hintFor, other, tally, t: L } = words;
  const kindOf = (item: TimelineActivity) => KIND[item.name] ?? other(item.name);
  /** A command's own exit code is a fact from its receipt; "passed" is never inferred beyond it. */
  const exitCode = (item: TimelineActivity): number | null => {
    if (item.name !== "run-command" || item.state !== "completed") return null;
    const match = /^exit (-?\d+)/.exec(item.output ?? "");
    return match ? Number(match[1]) : null;
  };
  /**
   * A board-report that fails with TASKBOARD_CONFLICT is a version-conflict retry, not a real failure, when a later
   * board-report in the same group lands successfully. The host records board-report's target as empty (it only
   * pulls path/file_path/command/pattern/query from tool args, none of which board-report sets), so "later success"
   * cannot be matched on target and is matched by state alone.
   */
  const wasRetry = (item: TimelineActivity, items: TimelineActivity[]) => {
    if (item.name !== "board-report" || item.state !== "failed") return false;
    if (!/TASKBOARD_CONFLICT/.test(item.output ?? "")) return false;
    const self = items.indexOf(item);
    if (self < 0) return false;
    for (let i = self + 1; i < items.length; i += 1) {
      const later = items[i]!;
      if (later.name === "board-report" && later.state === "completed") return true;
    }
    return false;
  };
  /** Only side effects go through review; a read started alongside one is merely held until the round resumes. */
  const REVIEWED = new Set(["edit", "write", "run-command", "start-command", "command-stop", "dispatch-subagent", "steer-subagent"]);
  const outcome = (item: TimelineActivity, ended: boolean, waiting = false, items?: TimelineActivity[]) => {
    const code = exitCode(item);
    if (item.state === "started") return ended ? { tone: "unknown", label: L("coding.timeline.no-result") }
      : waiting ? (REVIEWED.has(item.name) ? { tone: "waiting", label: L("coding.timeline.approve") } : { tone: "held", label: L("coding.timeline.held") })
      : { tone: "running", label: L("coding.filter.running") };
    if (item.name === "reasoning" && item.state === "completed") return { tone: "quiet", label: "" };
    if (item.state === "failed") {
      if (items && wasRetry(item, items)) return { tone: "retry", label: L("coding.timeline.retried") };
      return { tone: "failed", label: L("coding.timeline.failed") };
    }
    if (item.state === "unknown") return { tone: "unknown", label: L("coding.recovery.unknown") };
    if (code !== null) return code === 0 ? { tone: "ok", label: "exit 0" } : { tone: "failed", label: `exit ${code}` };
    return { tone: "ok", label: "" };
  };
  const mark = (tone: string) => tone === "quiet" ? "" : '<span aria-hidden="true" data-mw-state="'
    + (tone === "running" ? "running" : tone === "waiting" ? "approval" : tone === "held" ? "waiting" : tone === "ok" ? "done" : tone === "failed" ? "failed" : tone === "retry" ? "stale" : "verify") + '"></span>';
  const lines = (text: string, limit: number) => {
    const all = text.replace(/\n$/, "").split("\n");
    return all.length <= limit ? { text: all.join("\n"), hidden: 0 } : { text: all.slice(0, limit).join("\n"), hidden: all.length - limit };
  };
  const toolHint = (item: TimelineActivity): string => {
    const hint = item.state === "failed" ? hintFor((item.output ?? "").trim()) : "";
    return hint ? `<p class="coding-tool-hint">${escape(hint)}</p>` : "";
  };
  const drawRow = (item: TimelineActivity, ended: boolean, waiting: boolean, items: TimelineActivity[]) => {
    const kind = kindOf(item), result = outcome(item, ended, waiting, items);
    // Reasoning is prose, so its row previews the first line as text rather than as a code target.
    const first = item.name === "reasoning" ? (item.output ?? "").trim().split("\n")[0]!.slice(0, 140) : "";
    // A wait the Run sleeps in says until when, in this machine's time.
    const until = item.name === "sleep-wait" && Number.isFinite(Date.parse(item.target)) ? L("coding.timeline.until", { time: new Date(item.target).toLocaleTimeString() }) : "";
    const what = until ? `<span class="coding-tool-preview">${escape(until)}</span>`
      : item.target ? `<code>${escape(item.target)}</code>` : first ? `<span class="coding-tool-preview">${escape(first)}</span>` : "";
    const output = (item.output ?? "").trim();
    const shown = output ? lines(output, item.name === "reasoning" ? 120 : 24) : null;
    const hidden = (shown?.hidden ?? 0) + (item.output_hidden_lines ?? 0);
    const body = shown ? `${toolHint(item)}<pre class="coding-tool-output">${escape(shown.text)}${hidden ? `\n${L("coding.timeline.more-lines", { count: hidden })}` : ""}${item.output_truncated ? `\n${L("coding.timeline.truncated")}` : ""}</pre>` : "";
    const head = `<span class="coding-tool-icon">${svg(kind.icon)}</span><span class="coding-tool-verb">${escape(kind.verb)}</span>${what}<span class="coding-tool-state" data-tone="${result.tone}">${mark(result.tone)}${result.label ? `<span>${escape(result.label)}</span>` : ""}</span>`;
    return body
      ? `<details class="coding-tool" data-tone="${result.tone}" data-kind="${escape(item.name)}" data-tool="${escape(item.call_id)}"><summary>${head}</summary>${body}</details>`
      : `<div class="coding-tool" data-tone="${result.tone}" data-kind="${escape(item.name)}" data-tool="${escape(item.call_id)}"><div class="coding-tool-head">${head}</div></div>`;
  };
  /** "Read 4 files · Ran 3 commands", or what is happening right now. */
  const sumText = (items: TimelineActivity[], ended: boolean, waiting: boolean) => {
    const started = ended ? [] : [...items].reverse().filter(item => item.state === "started");
    const running = (waiting ? started.find(item => REVIEWED.has(item.name)) : undefined) ?? started[0];
    if (running) {
      const kind = kindOf(running), on = running.target ? " " + running.target : "", what = kind.verb + on;
      return waiting ? (REVIEWED.has(running.name) ? { live: false, waiting: true, text: L("coding.timeline.approve") + L("coding.timeline.colon") + what } : { live: false, waiting: true, text: L("coding.timeline.held") + L("coding.timeline.colon") + what })
        : { live: true, waiting: false, text: kind.doing + on };
    }
    const counts = new Map<string, { kind: ReturnType<typeof kindOf>; targets: Set<string>; calls: number }>();
    for (const item of items) {
      const kind = kindOf(item), key = kind.key + kind.verb;
      const entry = counts.get(key) ?? { kind, targets: new Set<string>(), calls: 0 };
      entry.calls += 1; if (item.target) entry.targets.add(item.target); counts.set(key, entry);
    }
    const parts = [...counts.values()].map(({ kind, targets, calls }) => tally(kind, kind.tally === "targets" ? targets.size || calls : calls));
    const failed = items.filter(item => outcome(item, ended, waiting, items).tone === "failed").length;
    return { live: false, waiting: false, text: parts.join(" · ") + (failed ? ` · ${L("coding.timeline.not-succeeded", { count: failed })}` : "") };
  };
  const opened = new Map<string, boolean>();
  /** Render a run of consecutive calls into `detail`, keeping the reader's open/closed choice across polls. */
  const renderGroup = (detail: Element, items: TimelineActivity[], run: TimelineRun, latest: boolean) => {
    const ended = TERMINAL.includes(run.phase), waiting = latest && run.phase === "awaiting-review";
    const key = detail.dataset.codingActivity ?? "";
    if (!detail.dataset.bound) {
      detail.dataset.bound = "true";
      detail.addEventListener("toggle", () => { if (detail.dataset.rendering !== "true") opened.set(key, detail.open); });
    }
    const summary = sumText(items, ended, waiting);
    const signature = JSON.stringify([run.phase, latest, items.map(item => [item.call_id, item.state, item.target, (item.output ?? "").length, item.output_hidden_lines ?? 0])]);
    if (detail.dataset.signature !== signature) {
      detail.dataset.signature = signature;
      detail.dataset.rendering = "true";
      const head = `<span class="coding-tools-summary${summary.live ? " is-live" : summary.waiting ? " is-waiting" : ""}">${summary.live ? '<span class="mw-spinner" aria-hidden="true"></span>' : summary.waiting ? '<span data-mw-state="waiting" aria-hidden="true"></span>' : svg("activity")}<span>${escape(summary.text)}</span></span><span class="coding-tools-chevron" aria-hidden="true">${svg("chevron-right")}</span>`;
      const summaryNode = detail.querySelector("summary") ?? detail.appendChild(document.createElement("summary"));
      summaryNode.innerHTML = head;
      let list = detail.querySelector(".coding-tool-list");
      if (!list) { list = document.createElement("div"); list.className = "coding-tool-list"; detail.append(list); }
      const openRows = new Set([...list.querySelectorAll("details.coding-tool[open]")].map((node: Element) => node.dataset.tool));
      list.innerHTML = items.map(item => drawRow(item, ended, waiting, items)).join("");
      list.querySelectorAll("details.coding-tool").forEach((node: Element) => { if (openRows.has(node.dataset.tool)) (node as Element).open = true; });
      detail.dataset.live = String(summary.live);
      const remembered = opened.get(key);
      // Follow the work while it happens; afterwards keep it folded unless the reader opened it.
      detail.open = remembered ?? (latest && !ended && items.length <= 6);
      queueMicrotask(() => { delete detail.dataset.rendering; });
    }
  };
  const duration = (from?: string | null, to?: string | null) => {
    if (!from) return "";
    const seconds = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000));
    return seconds < 60 ? L("coding.timeline.seconds", { seconds }) : L("coding.timeline.minutes", { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
  };
  /**
   * A failure explained in the user's words, with what to do next. The original code stays visible so the
   * explanation never replaces the fact it explains.
   */
  const explainFailure = (reason: string) => {
    const match = FAILURES.find(([pattern]) => pattern.test(reason));
    return match ? { title: match[1], hint: match[2] } : null;
  };
  const LIVE_TEXT: Record<string, string> = {
    starting: L("coding.phase.starting"), running: L("coding.live.running"), compacting: L("coding.phase.compacting"), pausing: L("coding.live.pausing"), paused: L("coding.live.paused"),
    "awaiting-input": L("coding.live.awaiting-input"), "awaiting-review": L("coding.live.awaiting-review"),
  };
  /** The live line at the bottom of an active round, or the closing card of a finished one. */
  /** `planOpen`: an earlier round whose unfinished graph is still the session's latest plan; only "continue the plan" is offered. */
  const renderFooter = (block: Element, run: TimelineRun, index: number, latest = false, planOpen = false) => {
    let footer = block.querySelector(":scope > .coding-run-footer") as Element | null;
    if (!footer) { footer = document.createElement("div"); footer.className = "coding-run-footer"; }
    // Re-inserting a node restarts its entrance animation, so it only moves when something follows it.
    if (block.lastElementChild !== footer) block.append(footer);
    const ended = TERMINAL.includes(run.phase);
    if (!ended) {
      footer.dataset.state = ["awaiting-review", "awaiting-input", "paused"].includes(run.phase) ? "waiting" : "live";
      footer.dataset.started = run.started_at ?? "";
      const text = LIVE_TEXT[run.phase] ?? LIVE_TEXT.running!;
      // Anything new from the round (a tool, a state change, more text) counts as hearing from it.
      const progress = [run.activity.length, ...run.activity.map(item => `${item.state}:${(item.output ?? "").length}`), ...(run.turns ?? []).map(turn => turn.text.length)].join(",");
      if (footer.dataset.progress !== progress) { footer.dataset.progress = progress; footer.dataset.heard = String(Date.now()); }
      // Only a round waiting on the model can go quiet; a running command or test is allowed to take its time.
      footer.dataset.quietable = String(run.phase === "running" && !run.activity.some(item => item.state === "started" && item.name !== "reasoning"));
      const html = `<div class="coding-live"><span data-mw-state="${run.phase === "paused" ? "paused" : run.phase === "awaiting-input" ? "answer" : run.phase === "awaiting-review" ? "approval" : "running"}" aria-hidden="true"></span><span class="coding-live-text">${escape(text)}</span><span class="coding-live-time mw-num" data-num-ghost="${escape(L("coding.timeline.minutes", { minutes: 59, seconds: 59 }))}" data-coding-elapsed>${escape(duration(run.started_at))}</span></div><p class="coding-live-quiet" data-coding-quiet role="status" hidden></p>`;
      if (footer.dataset.html !== text + footer.dataset.state) { footer.innerHTML = html; footer.dataset.html = text + footer.dataset.state; }
      tick(block);
      return;
    }
    const edited = new Set(run.activity.filter(item => ["edit", "write"].includes(item.name) && item.state === "completed" && item.target).map(item => item.target));
    const commands = run.activity.filter(item => item.name === "run-command" && item.state === "completed"), dispatched = run.activity.filter(item => item.name === "dispatch-subagent" && item.state === "completed").length;
    const lastCommand = commands.at(-1), lastCode = lastCommand ? exitCode(lastCommand) : null;
    // A plan round is only done when its plan is: an ended round with steps left says so and offers to continue.
    const left = run.step_board && !run.step_board.terminal ? run.step_board.nodes.filter(node => !["succeeded", "cancelled"].includes(node.state)).length : 0;
    const completedFraction = run.step_board?.nodes.length ? run.step_board.nodes.filter(node => node.state === "succeeded").length / run.step_board.nodes.length : undefined;
    // A round that ended on an announcement ("我先读……") without calling a single tool did nothing; it says so plainly
    const said = [...(run.turns ?? [])].reverse().find(turn => turn.kind === "assistant")?.text.trim() ?? "";
    // Thinking is not doing: a round whose only activity is the model's reasoning still did nothing.
    const acted = run.activity.some(item => item.name !== "reasoning");
    const stalled = latest && run.phase === "completed" && !acted && said.length < 160 && /^(好的[，,]?\s*)?(我先|我来|我会|让我|现在开始|接下来我|首先我)/.test(said);
    const tone = run.phase === "completed" ? left || stalled ? "partial" : "done" : run.phase === "failed" || run.phase === "reconcile-required" ? "failed" : "stopped";
    const title = { done: L("coding.round.done"), partial: stalled ? L("coding.round.stalled") : L("coding.round.plan-left", { count: left }), failed: run.phase === "reconcile-required" ? L("coding.round.reconcile") : L("coding.round.failed"), stopped: L("coding.round.stopped") }[tone];
    // A round cut off by a restart has no end time. Its last recorded moment is when it stopped; measuring to now
    // would keep the card changing every second, and each redraw replaces its buttons under the pointer. A recovered
    // round may have kept no moment after its start at all, and then it shows no duration rather than "0 s".
    const stoppedAt = run.ended_at ?? [...run.activity.map(item => item.at), ...(run.turns ?? []).map(turn => turn.at)]
      .filter((at): at is string => typeof at === "string" && (!run.started_at || at > run.started_at)).sort().at(-1);
    const facts = [
      stoppedAt && duration(run.started_at, stoppedAt) && L("coding.round.took", { duration: duration(run.started_at, stoppedAt) }),
      edited.size ? tally(KIND.edit!, edited.size) : L("coding.round.no-edits"),
      dispatched && tally(KIND["dispatch-subagent"]!, dispatched),
      commands.length ? tally(KIND["run-command"]!, commands.length) : "",
      lastCommand ? L("coding.round.last-command", { command: lastCommand.target || L("coding.round.command"), code: lastCode ?? "?" }) : "",
    ].filter(Boolean);
    // A reason that only restates the title ("已停止" under "这一轮已停止") adds nothing. "已停止" is the runtime's own
    // default reason for a stop, so it restates the title in every language.
    const stated = (run.stop_reason ?? "").trim(), restates = stated !== "" && (title.includes(stated.replace(/^已/, "")) || (tone === "stopped" && stated === "已停止"));
    const explained = run.phase === "failed" && stated ? explainFailure(stated) : null;
    const reason = tone !== "done" && stated && !restates
      ? explained ? `<p class="coding-run-reason"><strong>${escape(explained.title)}</strong>${escape(L("coding.timeline.colon"))}${escape(explained.hint)}<br><small>${escape(stated)}</small></p>` : `<p class="coding-run-reason">${escape(stated)}</p>`
      : "";
    // Only the newest unfinished round can be picked up again; an interrupted one is checked first.
    const resume = !latest ? (planOpen && left ? `<button class="mw-btn mw-btn--primary" type="button" data-coding-continue="${escape(run.ref.run_id)}">${svg("play")}${escape(L("coding.round.continue-plan"))}</button>` : "") : run.phase === "reconcile-required"
      ? `<button class="mw-btn mw-btn--primary" type="button" data-coding-recover-continue="${escape(run.ref.run_id)}">${svg("play")}${escape(L("coding.round.check-continue"))}</button>`
      : ["failed", "stopped", "cancelled"].includes(run.phase) || left
        ? `<button class="mw-btn mw-btn--primary" type="button" data-coding-continue="${escape(run.ref.run_id)}">${svg("play")}${escape(left ? L("coding.round.continue-plan") : L("coding.round.resume"))}</button>`
      : stalled ? `<button class="mw-btn mw-btn--primary" type="button" data-coding-nudge="${escape(run.ref.run_id)}">${svg("play")}${escape(L("coding.round.nudge"))}</button>` : "";
    const files = edited.size ? `<ul class="coding-run-files">${[...edited].slice(0, 8).map(path => `<li>${svg("edit")}<code>${escape(path)}</code></li>`).join("")}${edited.size > 8 ? `<li>${escape(L("coding.round.more-files", { count: edited.size - 8 }))}</li>` : ""}</ul>` : "";
    const html = `<div class="coding-run-card" data-tone="${tone}">
      <header><span class="coding-run-mark" aria-hidden="true" data-mw-state="${run.phase === "reconcile-required" ? "verify" : tone === "done" ? "round-ended" : tone === "partial" && !stalled ? "partial" : tone === "failed" ? "failed" : "stopped"}"${completedFraction === undefined ? "" : ` data-ring-progress="${completedFraction}"`}></span><strong>${escape(title)}</strong><span class="coding-run-round">${escape(L("coding.turn.number", { number: index + 1 }))}</span></header>
      <p class="coding-run-facts">${facts.map(escape).join(" · ")}</p>${stalled ? `<p class="coding-run-reason">${escape(L("coding.round.stalled-why"))}</p>` : reason}${files}
      <div class="coding-run-actions">${resume}${edited.size ? `<button class="mw-btn" type="button" data-coding-change-open="${escape(run.ref.run_id)}" data-coding-card-open>${svg("columns")}${escape(L("coding.round.changes"))}</button>` : ""}${edited.size && run.phase === "completed" ? `<button class="mw-btn mw-btn--ghost" type="button" data-coding-commit-round="${escape(run.ref.run_id)}">${svg("git-branch")}${escape(L("coding.round.commit"))}</button>` : ""}<button class="mw-btn mw-btn--ghost" type="button" data-coding-report-open="${escape(run.ref.run_id)}" data-coding-card-open>${svg("file")}${escape(L("coding.report.label"))}</button></div>
    </div>`;
    if (footer.dataset.html !== html) { footer.innerHTML = html; footer.dataset.html = html; footer.dataset.state = "ended"; }
  };
  /** Keep elapsed times honest without re-rendering the transcript. */
  const QUIET_AFTER_SECONDS = 20;
  function tick(scope: Element) {
    scope.querySelectorAll(".coding-run-footer[data-state=live] [data-coding-elapsed], .coding-run-footer[data-state=waiting] [data-coding-elapsed]").forEach((node: Element) => {
      const started = (node.closest(".coding-run-footer") as Element).dataset.started;
      node.textContent = duration(started);
    });
    // Say so when the model has gone quiet, instead of a timer that keeps counting as if all were well.
    scope.querySelectorAll(".coding-run-footer [data-coding-quiet]").forEach((node: Element) => {
      const footer = node.closest(".coding-run-footer") as Element;
      const quiet = Math.floor((Date.now() - Number(footer.dataset.heard ?? Date.now())) / 1000);
      const show = footer.dataset.state === "live" && footer.dataset.quietable === "true" && quiet >= QUIET_AFTER_SECONDS;
      if (node.hidden === !show && (!show || node.dataset.seconds === String(quiet))) return;
      node.hidden = !show; node.dataset.seconds = String(quiet);
      node.textContent = show ? L("coding.live.quiet", { seconds: quiet }) : "";
    });
  }
  return { renderGroup, renderFooter, tick, explainFailure };
}
