/**
 * What a round did between two messages (specs/visual-ui-experience VUX-13): every step from the Host's activity, in the
 * person's terms, under one quiet line that says what was done to what and how many steps it took, opening to each step.
 *
 * - Grouped by how the round really went: the steps after one message are one group, keyed by that message (or by the
 *   round's start), so a step the view later leaves out (an update of the work steps once they are shown) never gives
 *   the group a new identity, and a group's or a step's node is never replaced while it stands.
 * - A step keeps its node by its call id wherever it stands: alone, or in the group it joined when a second step came.
 *   What the person opened stays open and focused while its state changes in place, and after the round ends; a group
 *   that forms around a step the person opened (or is on) opens with it, so that step does not vanish into a closed one.
 * - The summary and each line say only what the activity records: the operation, the object, the outcome (and why it did
 *   not happen when that is known). Nothing is said about what the model thought.
 * - The technical part (the capability a step called, what came back from a step that did not finish) opens from the
 *   step itself, by pointer, keyboard or touch, instead of a title only a hovering pointer can read.
 * - Nodes for steps the view no longer has are removed, so a step is never shown twice.
 * - Memory references keep the same disclosure node and show only the Host's delivery/version facts; omission reasons
 *   distinguish the length budget from a count limit. Unconfirmed delivery never becomes confirmed use in this view.
 *
 * `put` places a node in order without moving one that already stands in place (`ASSISTANT_PLACER_SCRIPT`).
 */
export const ASSISTANT_PROCESS_FACTORY_SCRIPT = String.raw`(input) => {
  const { readText, el, glyph, spinner, keyed, setText, placer } = input;
  const steps = new WeakMap(), groups = new WeakMap();
  // Each step's verb in the three forms a line takes (bare, under way, done), each its own key so each language says it
  // whole: English needs "Reading" and "Read", not a prefix before "read".
  const VERBS = {
    lookup: ["workbench.assistant-process.lookup.bare", "workbench.assistant-process.lookup.started", "workbench.assistant-process.lookup.completed"],
    read: ["workbench.assistant-process.read.bare", "workbench.assistant-process.read.started", "workbench.assistant-process.read.completed"],
    change: ["workbench.assistant-process.change.bare", "workbench.assistant-process.change.started", "workbench.assistant-process.change.completed"],
    suggest: ["workbench.assistant-process.suggest.bare", "workbench.assistant-process.suggest.started", "workbench.assistant-process.suggest.completed"],
    ask: ["workbench.assistant-process.ask.bare", "workbench.assistant-process.ask.started", "workbench.assistant-process.ask.completed"],
    todo: ["workbench.assistant-process.todo.bare", "workbench.assistant-process.todo.started", "workbench.assistant-process.todo.completed"],
    "lookup-tools": ["workbench.assistant-process.lookup-tools.bare", "workbench.assistant-process.lookup-tools.started", "workbench.assistant-process.lookup-tools.completed"],
    delegate: ["workbench.assistant-process.delegate.bare", "workbench.assistant-process.delegate.started", "workbench.assistant-process.delegate.completed"],
    "delegate-check": ["workbench.assistant-process.delegate-check.bare", "workbench.assistant-process.delegate-check.started", "workbench.assistant-process.delegate-check.completed"],
    "delegate-follow-up": ["workbench.assistant-process.delegate-follow-up.bare", "workbench.assistant-process.delegate-follow-up.started", "workbench.assistant-process.delegate-follow-up.completed"],
    "delegate-stop": ["workbench.assistant-process.delegate-stop.bare", "workbench.assistant-process.delegate-stop.started", "workbench.assistant-process.delegate-stop.completed"],
    "memory-keep": ["workbench.assistant-process.memory-keep.bare", "workbench.assistant-process.memory-keep.started", "workbench.assistant-process.memory-keep.completed"],
    "memory-list": ["workbench.assistant-process.memory-list.bare", "workbench.assistant-process.memory-list.started", "workbench.assistant-process.memory-list.completed"],
    "memory-forget": ["workbench.assistant-process.memory-forget.bare", "workbench.assistant-process.memory-forget.started", "workbench.assistant-process.memory-forget.completed"],
    "memory-suggest": ["workbench.assistant-process.memory-suggest.bare", "workbench.assistant-process.memory-suggest.started", "workbench.assistant-process.memory-suggest.completed"],
    "file-read": ["workbench.assistant-process.file-read.bare", "workbench.assistant-process.file-read.started", "workbench.assistant-process.file-read.completed"],
    "file-list": ["workbench.assistant-process.file-list.bare", "workbench.assistant-process.file-list.started", "workbench.assistant-process.file-list.completed"],
    "file-search": ["workbench.assistant-process.file-search.bare", "workbench.assistant-process.file-search.started", "workbench.assistant-process.file-search.completed"],
    "file-change": ["workbench.assistant-process.file-change.bare", "workbench.assistant-process.file-change.started", "workbench.assistant-process.file-change.completed"],
    command: ["workbench.assistant-process.command.bare", "workbench.assistant-process.command.started", "workbench.assistant-process.command.completed"],
    "command-output": ["workbench.assistant-process.command-output.bare", "workbench.assistant-process.command-output.started", "workbench.assistant-process.command-output.completed"],
    "auto-continue": ["workbench.assistant-process.auto-continue.bare", "workbench.assistant-process.auto-continue.started", "workbench.assistant-process.auto-continue.completed"],
    compact: ["workbench.assistant-process.compact.bare", "workbench.assistant-process.compact.started", "workbench.assistant-process.compact.completed"],
    "browser-list": ["workbench.assistant-process.browser-list.bare", "workbench.assistant-process.browser-list.started", "workbench.assistant-process.browser-list.completed"],
    "browser-look": ["workbench.assistant-process.browser-look.bare", "workbench.assistant-process.browser-look.started", "workbench.assistant-process.browser-look.completed"],
    "browser-act": ["workbench.assistant-process.browser-act.bare", "workbench.assistant-process.browser-act.started", "workbench.assistant-process.browser-act.completed"],
    "computer-list": ["workbench.assistant-process.computer-list.bare", "workbench.assistant-process.computer-list.started", "workbench.assistant-process.computer-list.completed"],
    "computer-look": ["workbench.assistant-process.computer-look.bare", "workbench.assistant-process.computer-look.started", "workbench.assistant-process.computer-look.completed"],
    "computer-act": ["workbench.assistant-process.computer-act.bare", "workbench.assistant-process.computer-act.started", "workbench.assistant-process.computer-act.completed"],
    "ended-on-promise": ["workbench.assistant-process.ended-on-promise.bare", "workbench.assistant-process.ended-on-promise.started", "workbench.assistant-process.ended-on-promise.completed"],
  };
  const REASONS = { "not-authorized": "workbench.assistant-process.not-authorized-nothing-done", declined: "workbench.assistant-process.declined-nothing-done", interrupted: "workbench.assistant-process.turn-stopped-did-not-run", unavailable: "workbench.assistant-process.switched-off-no-longer-available-nothing-done" };
  const VERB_GLYPH = { lookup: "search", "lookup-tools": "search", "file-search": "search", read: "note", "file-read": "file", "file-list": "list", change: "edit",
    "file-change": "code", command: "terminal", "command-output": "terminal", ask: "question", todo: "list", suggest: "zap", delegate: "workflow", "delegate-check": "workflow",
    "delegate-follow-up": "workflow", "delegate-stop": "workflow", "memory-keep": "sparkles", "memory-list": "sparkles", "memory-forget": "sparkles", "memory-suggest": "sparkles",
    "auto-continue": "refresh", compact: "refresh", "browser-list": "globe", "browser-look": "globe", "browser-act": "globe", "computer-list": "system", "computer-look": "system", "computer-act": "system", "ended-on-promise": "alert" };
  const verbGlyph = (item) => item.state === "started" ? spinner() : item.state === "failed" || item.state === "unknown" ? spinner(item.state === "failed" ? "failed" : "verify") : glyph(VERB_GLYPH[item.verb] || "circle");
  // form: 0 bare, 1 under way, 2 done. A line starts with its verb, so it starts with a capital where the language has them.
  const verb = (item, form = 0) => { const key = VERBS[item.verb]?.[form]; return key ? globalThis.t.text(key) : item.verb; };
  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const activityLine = (item) => {
    const what = item.target ? (item.verb === "ask" ? globalThis.t.text("workbench.assistant-process.target-named", { target: item.target }) : " " + item.target) : "";
    if (item.state === "started") return verb(item, 1) + what;
    if (item.state === "completed") return verb(item, 2) + what + (item.verb === "ask" && item.answer ? " · " + globalThis.t.text("workbench.assistant-process.answer-named", { answer: item.answer }) : "");
    return capital(verb(item)) + what + " — " + globalThis.t.text(item.state === "failed" ? REASONS[item.reason] || "workbench.assistant-process.not-finished" : "workbench.assistant-process.result-unconfirmed");
  };
  const BY_PROVIDER = new Set(["read", "change", "suggest"]);
  const phrase = (item) => { const word = verb(item); return word.charAt(0).toLowerCase() + word.slice(1) + (BY_PROVIDER.has(item.verb) && item.target ? " " + item.target.split(" · ")[0] : ""); };
  const summary = (run) => {
    const live = [...run].reverse().find((item) => item.state === "started");
    if (live) return activityLine(live);
    const said = [...new Set(run.map(phrase))], unfinished = run.filter((item) => item.state === "failed" || item.state === "unknown").length;
    let what = said.slice(0, 2).join(globalThis.t.text("common.list.separator")); if (said.length > 2) what = globalThis.t.text("workbench.assistant-process.what-more", { what });
    return globalThis.t.text("workbench.assistant-process.what-n-n", { what: capital(what), n: run.length })
      + (unfinished ? " · " + globalThis.t.text("workbench.assistant-process.did-not-finish", { n: unfinished }) : "");
  };
  // A refusal the platform classified is said in the person's words (its sort, then each field and the rule it broke); the
  // owner's own text stays one fold further down, for tracing (user 2026-10-23 ⑤). An unclassified one shows its text as is.
  const FAILURES = { invalid: "workbench.assistant-process.input-did-not-match-capability-s-contract", forbidden: "workbench.assistant-process.not-permitted-do", not_found: "workbench.assistant-process.what-needed-gone", conflict: "workbench.assistant-process.changed-meantime-needs-reading-again", too_large: "workbench.assistant-process.too-large",
    rate_limited: "workbench.assistant-process.too-many-requests-rate-limited", cancelled: "workbench.assistant-process.cancelled", timeout: "workbench.assistant-process.timed-out", unavailable: "workbench.assistant-process.capability-not-available-now", upstream: "workbench.assistant-process.service-relies-did-not-answer-completely", internal: "workbench.assistant-process.failed-while-running" };
  const RULES = { required: "workbench.assistant-process.something-required-missing", additionalProperties: "workbench.assistant-process.has-something-contract-does-not-include", type: "workbench.assistant-process.wrong-type", enum: "workbench.assistant-process.not-allowed-value" };
  const where = (path) => path === "/" ? globalThis.t.text("workbench.assistant-process.whole-input") : path.slice(1).split("/").join(" › ");
  const facts = (item) => [item.capability_id && [globalThis.t.text("workbench.assistant-process.capability-called"), item.capability_id, true], item.failure && [globalThis.t.text("workbench.assistant-process.reason"), globalThis.t.text(FAILURES[item.failure.kind] || "workbench.assistant-process.not-finished")],
    ...(item.failure?.fields || []).map((field) => [where(field.path), globalThis.t.text(RULES[field.rule] || "workbench.assistant-process.breaks-rule-contract")]), !item.failure && item.detail && [globalThis.t.text("workbench.assistant-process.what-came-back"), item.detail, true]].filter(Boolean);
  const raw = (item) => item.failure && item.detail ? item.detail : "";
  const line = (round, item) => {
    const known = (round.stepLines ||= new Map()), shown = facts(item), tag = shown.length || raw(item) ? "DETAILS" : "P";
    let node = known.get(item.call_id);
    if (!node || node.tagName !== tag) {
      const fresh = tag === "P" ? el("p", "assistant-activity") : el("details", "assistant-activity-fold");
      if (tag === "DETAILS") fresh.append(el("summary", "assistant-activity"), el("div", "assistant-activity-detail"));
      fresh.setAttribute("data-entry", "a:" + item.call_id);
      if (node) node.replaceWith(fresh);
      known.set(item.call_id, node = fresh);
    }
    steps.set(node, item);
    const head = tag === "P" ? node : node.firstElementChild, words = activityLine(item);
    node.dataset.state = head.dataset.state = item.state;
    if (head.dataset.text !== words || head.dataset.glyph !== item.state) { head.dataset.text = words; head.dataset.glyph = item.state; head.replaceChildren(verbGlyph(item), el("span", "", words)); }
    const said = raw(item), signature = JSON.stringify([shown, said]);
    if (tag === "DETAILS" && node.dataset.facts !== signature) {
      node.dataset.facts = signature;
      const rows = shown.map(([label, value, original]) => { const row = el("p"), content = el("span", "", value); if (original) content.translate = false; row.append(el("span", "assistant-activity-label", label), content); return row; });
      if (said) { const fold = el("details", "assistant-activity-raw"), content = el("p", "", said); content.translate = false; fold.append(el("summary", "", globalThis.t.text("workbench.assistant-process.original-message")), content); rows.push(fold); }
      node.lastElementChild.replaceChildren(...rows);
    }
    return node;
  };
  const keep = (node, place) => { const had = node.contains(document.activeElement) && document.activeElement; place(node); if (had && document.activeElement !== had) had.focus({ preventScroll: true }); };
  const place = (round, run, put, anchor) => {
    const placed = (round.stepPlaced ||= new Set());
    if (run.length === 1) { const one = line(round, run[0]); keep(one, put); placed.add(one); return; }
    // The steps sit in one body, so the group opens to its natural height like every collapsible (disclosure.ts).
    const box = keyed(round, "data-entry", "g:" + anchor, () => { const box = el("details", "assistant-steps"); box.append(el("summary", "assistant-steps-summary"), el("div", "assistant-steps-body")); return box; });
    groups.set(box, run);
    box.dataset.state = run.some((item) => item.state === "started") ? "started" : run.some((item) => item.state === "failed") ? "failed" : run.some((item) => item.state === "unknown") ? "unknown" : "completed";
    setText(box.firstElementChild, summary(run));
    const body = box.lastElementChild, inBody = placer(body);
    const lines = run.map((item) => line(round, item));
    if (!body.childElementCount && lines.some((one) => one.open || one.contains(document.activeElement))) box.open = true;
    const mine = new Set(lines.map((one) => { keep(one, inBody); return one; }));
    [...body.children].forEach((child) => { if (!mine.has(child)) child.remove(); });
    keep(box, put); placed.add(box);
  };
  // Recompute composed copy from the displayed facts, preserving the disclosures and the original diagnostic nodes.
  const retitle = (root) => {
    for (const node of root.querySelectorAll('[data-entry^="a:"]')) {
      const item = steps.get(node); if (!item) continue;
      const head = node.tagName === "DETAILS" ? node.firstElementChild : node, words = activityLine(item);
      head.dataset.text = words; setText(head.lastElementChild, words);
      if (node.tagName !== "DETAILS") continue;
      const shown = facts(item), detail = node.lastElementChild;
      [...detail.children].filter((row) => row.tagName === "P").forEach((row, index) => {
        setText(row.firstElementChild, shown[index][0]); setText(row.lastElementChild, shown[index][1]);
      });
      const original = detail.querySelector(":scope > .assistant-activity-raw > summary");
      if (original) setText(original, globalThis.t.text("workbench.assistant-process.original-message"));
      node.dataset.facts = JSON.stringify([shown, raw(item)]);
    }
    for (const node of root.querySelectorAll('[data-entry^="g:"]')) { const run = groups.get(node); if (run) setText(node.firstElementChild, summary(run)); }
  };
  const sweep = (round) => {
    const placed = round.stepPlaced || new Set(); round.stepPlaced = null;
    [...round.children].forEach((child) => { if (/^[ag]:/.test(child.getAttribute("data-entry") || "") && !placed.has(child)) child.remove(); });
    for (const [id, node] of round.stepLines || []) if (!node.isConnected) round.stepLines.delete(id);
  };
  const memoryScope = (scope) => globalThis.t.text(scope === "personal" ? "workbench.assistant-process.personal" : scope === "character" ? "workbench.assistant-process.role" : "workbench.assistant-process.project");
  const memory = (round, trail, put) => {
    const { used = [], omitted = [], uncertain = [], unverified, recording_error } = trail || {};
    if (!(used.length || omitted.length || uncertain.length || unverified || recording_error)) return round.querySelector(':scope > .assistant-memories')?.remove();
    const box = keyed(round, "data-entry", "memories", () => { const box = el("details", "assistant-steps assistant-memories"); box.append(el("summary", "assistant-steps-summary")); return box; });
    const signature = JSON.stringify(trail);
    if (box.dataset.signature === signature) return put(box);
    box.dataset.signature = signature;
    setText(box.firstElementChild, globalThis.t.text("workbench.assistant-process.provided-n-n", { n: used.length }) + (omitted.length ? " · " + globalThis.t.text("workbench.assistant-process.n-left-out", { n: omitted.length }) : ""));
    while (box.children[1]) box.children[1].remove();
    const note = (text) => box.append(el("p", "assistant-memory-omitted", globalThis.t.text(text)));
    const lines = (items) => items.forEach((item) => {
      const row = el("p", "assistant-activity assistant-memory");
      row.append(el("span", "assistant-memory-scope", memoryScope(item.scope)), item.content_changed ? globalThis.t.text("workbench.assistant-process.memory-updated-old-text-hidden") : item.text);
      row.title = item.origin || "";
      box.append(row);
    });
    lines(used);
    if (uncertain.length || unverified) note("workbench.assistant-process.memory-delivery-unconfirmed");
    lines(uncertain);
    if (recording_error) note("workbench.assistant-process.turn-reference-not-saved");
    if (omitted.length) { note(omitted.every((item) => item.reason === "budget") ? "workbench.assistant-process.left-out-length" : "workbench.assistant-process.left-out-length-count"); lines(omitted); }
    put(box);
  };
  return { activityLine, place, sweep, retitle, memory, memoryScope };
}`;

/**
 * A round whose model call waits to try again (VUX-20, VUX-43): its status line counts down to the runtime's own retry time,
 * to the second, in a fixed-width MM:SS, then says it is retrying. The time and the reason are the Host's; the page never
 * retries on its own. One timer serves every waiting round and stops when none is left.
 */
export const ASSISTANT_RETRY_FACTORY_SCRIPT = String.raw`(input) => {
  let timer = 0;
  const line = (status) => {
    const left = Math.max(0, Math.ceil((Date.parse(status.dataset.retryUntil) - Date.now()) / 1000)), readText = input.readText;
    if (!left) return globalThis.t.text("workbench.assistant-process.retrying");
    const time = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0"), reason = status.dataset.retryReason;
    return reason === "rate-limited" ? globalThis.t.text("workbench.assistant-process.rate-limited-retrying-time", { time }) : reason === "not-sent" ? globalThis.t.text("workbench.assistant-process.request-wasn-t-sent-retrying-time", { time }) : globalThis.t.text("workbench.assistant-process.model-service-unavailable-retrying-time", { time });
  };
  const tick = () => {
    const waiting = input.root.querySelectorAll("[data-retry-until]");
    waiting.forEach((status) => input.setText(status, line(status)));
    if (!waiting.length) { clearInterval(timer); timer = 0; }
  };
  return {
    /** Marks a round's status line as waiting (or not), and starts the count when it is the first. */
    mark: (status, wait) => {
      if (!wait) { delete status.dataset.retryUntil; delete status.dataset.retryReason; return; }
      status.dataset.retryUntil = wait.until; status.dataset.retryReason = wait.reason;
      if (!timer) timer = setInterval(tick, 1000);
    },
    line,
    stop: () => { clearInterval(timer); timer = 0; },
  };
}`;
