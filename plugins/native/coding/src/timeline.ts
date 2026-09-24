/**
 * How one round reads in the conversation: each tool call is a row that says what it touched and how it
 * ended, consecutive calls fold into one summary, and a round closes with what actually happened.
 *
 * `createCodingTimeline` is injected into the browser with `toString()`, so it must stay self-contained:
 * no imports, no closures over module scope. Everything it shows comes from the run projection; it never
 * infers success the projection does not state.
 */
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
}
export interface TimelineRun {
  ref: { run_id: string };
  phase: string;
  started_at?: string | null;
  ended_at?: string | null;
  activity: TimelineActivity[];
  usage?: { tokens?: { input?: number; output?: number } };
  stop_reason?: string | null;
}

export function createCodingTimeline() {
  const TERMINAL = ["completed", "failed", "stopped", "cancelled", "reconcile-required"];
  const svg = (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));
  const KIND: Record<string, { verb: string; icon: string; noun: string; unit: string }> = {
    read: { verb: "读取", icon: "file", noun: "文件", unit: "个" },
    "read-file": { verb: "读取", icon: "file", noun: "文件", unit: "个" },
    edit: { verb: "修改", icon: "edit", noun: "文件", unit: "个" },
    write: { verb: "写入", icon: "edit", noun: "文件", unit: "个" },
    "run-command": { verb: "运行", icon: "terminal", noun: "命令", unit: "条" },
    grep: { verb: "搜索", icon: "search", noun: "内容", unit: "次" },
    search: { verb: "搜索", icon: "search", noun: "内容", unit: "次" },
    glob: { verb: "查找", icon: "search", noun: "文件", unit: "次" },
    list: { verb: "查看目录", icon: "folder", noun: "目录", unit: "个" },
    "list-directory": { verb: "查看目录", icon: "folder", noun: "目录", unit: "个" },
    "ask-user": { verb: "提问", icon: "question", noun: "问题", unit: "个" },
    "上下文整理": { verb: "整理上下文", icon: "clock", noun: "", unit: "次" },
    "工具调用纠正": { verb: "纠正工具调用", icon: "circle-alert", noun: "", unit: "次" },
  };
  const kindOf = (item: TimelineActivity) => KIND[item.name] ?? { verb: item.name, icon: "activity", noun: "操作", unit: "项" };
  /** A command's own exit code is a fact from its receipt; "passed" is never inferred beyond it. */
  const exitCode = (item: TimelineActivity): number | null => {
    if (item.name !== "run-command" || item.state !== "completed") return null;
    const match = /^exit (-?\d+)/.exec(item.output ?? "");
    return match ? Number(match[1]) : null;
  };
  /** Only side effects go through review; a read started alongside one is merely held until the round resumes. */
  const APPROVABLE = new Set(["edit", "write", "run-command"]);
  const outcome = (item: TimelineActivity, ended: boolean, waiting = false) => {
    const code = exitCode(item);
    if (item.state === "started") return ended ? { tone: "unknown", label: "结果未返回" }
      : waiting ? (APPROVABLE.has(item.name) ? { tone: "waiting", label: "等你批准" } : { tone: "held", label: "等待中" })
      : { tone: "running", label: "进行中" };
    if (item.state === "failed") return { tone: "failed", label: "失败" };
    if (item.state === "unknown") return { tone: "unknown", label: "结果未知" };
    if (code !== null) return code === 0 ? { tone: "ok", label: "exit 0" } : { tone: "failed", label: `exit ${code}` };
    return { tone: "ok", label: "" };
  };
  const statusMark = (tone: string) => tone === "running" ? '<span class="coding-spinner" aria-hidden="true"></span>'
    : tone === "waiting" ? svg("clock") : tone === "held" ? svg("dot") : tone === "ok" ? svg("check") : tone === "failed" ? svg("x") : svg("circle-alert");
  const lines = (text: string, limit: number) => {
    const all = text.replace(/\n$/, "").split("\n");
    return all.length <= limit ? { text: all.join("\n"), hidden: 0 } : { text: all.slice(0, limit).join("\n"), hidden: all.length - limit };
  };
  const rowHtml = (item: TimelineActivity, ended: boolean, waiting: boolean) => {
    const kind = kindOf(item), result = outcome(item, ended, waiting);
    const what = item.target ? `<code>${escape(item.target)}</code>` : "";
    const output = (item.output ?? "").trim();
    const shown = output ? lines(output, 24) : null;
    const body = shown ? `<pre class="coding-tool-output">${escape(shown.text)}${shown.hidden ? `\n… 另有 ${shown.hidden} 行` : ""}${item.output_truncated ? "\n（输出已截断）" : ""}</pre>` : "";
    const head = `<span class="coding-tool-icon">${svg(kind.icon)}</span><span class="coding-tool-verb">${escape(kind.verb)}</span>${what}<span class="coding-tool-state" data-tone="${result.tone}">${statusMark(result.tone)}${result.label ? `<span>${escape(result.label)}</span>` : ""}</span>`;
    return body
      ? `<details class="coding-tool" data-tone="${result.tone}" data-tool="${escape(item.call_id)}"><summary>${head}</summary>${body}</details>`
      : `<div class="coding-tool" data-tone="${result.tone}" data-tool="${escape(item.call_id)}"><div class="coding-tool-head">${head}</div></div>`;
  };
  /** "读取 4 个文件 · 运行 3 条命令", or what is happening right now. */
  const summaryText = (items: TimelineActivity[], ended: boolean, waiting: boolean) => {
    const started = ended ? [] : [...items].reverse().filter(item => item.state === "started");
    const running = (waiting ? started.find(item => APPROVABLE.has(item.name)) : undefined) ?? started[0];
    if (running) {
      const kind = kindOf(running), what = `${kind.verb}${running.target ? " " + running.target : ""}`;
      return waiting ? (APPROVABLE.has(running.name) ? { live: false, waiting: true, text: `等你批准：${what}` } : { live: false, waiting: true, text: `暂停中：${what}` })
        : { live: true, waiting: false, text: `正在${what}` };
    }
    const counts = new Map<string, { kind: ReturnType<typeof kindOf>; targets: Set<string>; calls: number }>();
    for (const item of items) {
      const kind = kindOf(item), key = kind.verb + kind.noun;
      const entry = counts.get(key) ?? { kind, targets: new Set<string>(), calls: 0 };
      entry.calls += 1; if (item.target) entry.targets.add(item.target); counts.set(key, entry);
    }
    const parts = [...counts.values()].map(({ kind, targets, calls }) => `${kind.verb} ${kind.noun === "文件" || kind.noun === "目录" ? targets.size || calls : calls} ${kind.unit}${kind.noun}`);
    const failed = items.filter(item => outcome(item, ended).tone === "failed").length;
    return { live: false, waiting: false, text: parts.join(" · ") + (failed ? ` · ${failed} 项未成功` : "") };
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
    const summary = summaryText(items, ended, waiting);
    const signature = JSON.stringify([run.phase, latest, items.map(item => [item.call_id, item.state, item.target, (item.output ?? "").length])]);
    if (detail.dataset.signature !== signature) {
      detail.dataset.signature = signature;
      detail.dataset.rendering = "true";
      const head = `<span class="coding-tools-summary${summary.live ? " is-live" : summary.waiting ? " is-waiting" : ""}">${summary.live ? '<span class="coding-spinner" aria-hidden="true"></span>' : svg(summary.waiting ? "clock" : "activity")}<span>${escape(summary.text)}</span></span><span class="coding-tools-chevron" aria-hidden="true">${svg("chevron-right")}</span>`;
      const summaryNode = detail.querySelector("summary") ?? detail.appendChild(document.createElement("summary"));
      summaryNode.innerHTML = head;
      let list = detail.querySelector(".coding-tool-list");
      if (!list) { list = document.createElement("div"); list.className = "coding-tool-list"; detail.append(list); }
      const openRows = new Set([...list.querySelectorAll("details.coding-tool[open]")].map((node: Element) => node.dataset.tool));
      list.innerHTML = items.map(item => rowHtml(item, ended, waiting)).join("");
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
    return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  };
  const LIVE_TEXT: Record<string, string> = {
    starting: "正在准备", running: "正在工作", compacting: "正在整理上下文", pausing: "正在暂停", paused: "已暂停",
    "awaiting-input": "等你回答上面的问题", "awaiting-review": "等你决定上面这一步",
  };
  /** The live line at the bottom of an active round, or the closing card of a finished one. */
  const renderFooter = (block: Element, run: TimelineRun, index: number) => {
    let footer = block.querySelector(":scope > .coding-run-footer") as Element | null;
    if (!footer) { footer = document.createElement("div"); footer.className = "coding-run-footer"; }
    // Re-inserting a node restarts its entrance animation, so it only moves when something follows it.
    if (block.lastElementChild !== footer) block.append(footer);
    const ended = TERMINAL.includes(run.phase);
    if (!ended) {
      footer.dataset.state = run.phase === "awaiting-review" || run.phase === "awaiting-input" ? "waiting" : "live";
      footer.dataset.started = run.started_at ?? "";
      const text = LIVE_TEXT[run.phase] ?? "正在工作";
      const html = `<div class="coding-live">${footer.dataset.state === "waiting" ? svg("waiting") : '<span class="coding-pulse" aria-hidden="true"></span>'}<span class="coding-live-text">${escape(text)}</span><span class="coding-live-time" data-coding-elapsed>${escape(duration(run.started_at))}</span></div>`;
      if (footer.dataset.html !== text + footer.dataset.state) { footer.innerHTML = html; footer.dataset.html = text + footer.dataset.state; }
      return;
    }
    const edited = new Set(run.activity.filter(item => ["edit", "write"].includes(item.name) && item.state === "completed" && item.target).map(item => item.target));
    const commands = run.activity.filter(item => item.name === "run-command" && item.state === "completed");
    const lastCommand = commands.at(-1), lastCode = lastCommand ? exitCode(lastCommand) : null;
    const tone = run.phase === "completed" ? "done" : run.phase === "failed" || run.phase === "reconcile-required" ? "failed" : "stopped";
    const title = { done: "这一轮完成", failed: run.phase === "reconcile-required" ? "这一轮需要核对结果" : "这一轮没有完成", stopped: "这一轮已停止" }[tone];
    const facts = [
      duration(run.started_at, run.ended_at) && `用时 ${duration(run.started_at, run.ended_at)}`,
      edited.size ? `修改 ${edited.size} 个文件` : "没有修改文件",
      commands.length ? `运行 ${commands.length} 条命令` : "",
      lastCommand ? `最后一条 ${lastCommand.target || "命令"} → exit ${lastCode ?? "?"}` : "",
    ].filter(Boolean);
    const reason = tone !== "done" && run.stop_reason ? `<p class="coding-run-reason">${escape(run.stop_reason)}</p>` : "";
    const files = edited.size ? `<ul class="coding-run-files">${[...edited].slice(0, 8).map(path => `<li>${svg("edit")}<code>${escape(path)}</code></li>`).join("")}${edited.size > 8 ? `<li>另有 ${edited.size - 8} 个文件</li>` : ""}</ul>` : "";
    const html = `<div class="coding-run-card" data-tone="${tone}">
      <header><span class="coding-run-mark">${svg(tone === "done" ? "check" : tone === "failed" ? "circle-alert" : "clock")}</span><strong>${escape(title)}</strong><span class="coding-run-round">第 ${index + 1} 轮</span></header>
      <p class="coding-run-facts">${facts.map(escape).join(" · ")}</p>${reason}${files}
      <div class="coding-run-actions">${edited.size ? `<button class="mw-btn" type="button" data-coding-change-open="${escape(run.ref.run_id)}" data-coding-card-open>${svg("columns")}查看变更</button>` : ""}<button class="mw-btn mw-btn--ghost" type="button" data-coding-report-open="${escape(run.ref.run_id)}" data-coding-card-open>${svg("file")}执行报告</button></div>
    </div>`;
    if (footer.dataset.html !== html) { footer.innerHTML = html; footer.dataset.html = html; footer.dataset.state = "ended"; }
  };
  /** Keep elapsed times honest without re-rendering the transcript. */
  const tick = (scope: Element) => {
    scope.querySelectorAll(".coding-run-footer[data-state=live] [data-coding-elapsed], .coding-run-footer[data-state=waiting] [data-coding-elapsed]").forEach((node: Element) => {
      const started = (node.closest(".coding-run-footer") as Element).dataset.started;
      node.textContent = duration(started);
    });
  };
  return { renderGroup, renderFooter, tick };
}
