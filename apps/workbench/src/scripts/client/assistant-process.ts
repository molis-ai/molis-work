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
 *
 * `put` places a node in order without moving one that already stands in place (`ASSISTANT_PLACER_SCRIPT`).
 */
export const ASSISTANT_PROCESS_FACTORY_SCRIPT = String.raw`(input) => {
  const { L, el, glyph, spinner, keyed, setText, placer } = input;
  const VERBS = { lookup: "查找能力", read: "读取", change: "修改", suggest: "准备操作卡", ask: "向你提问", todo: "更新工作步骤", "lookup-tools": "查找工具",
    delegate: "委托子任务", "delegate-check": "查看子任务", "delegate-follow-up": "让子任务补改", "delegate-stop": "停止子任务",
    "memory-keep": "记下你的要求", "memory-list": "查看记住的事", "memory-forget": "删除一条记忆", "memory-suggest": "建议记住一条",
    "file-read": "读取文件", "file-list": "查看目录", "file-search": "搜索代码", "file-change": "修改文件", command: "运行命令", "command-output": "查看命令输出", "auto-continue": "自动续做", compact: "整理上下文",
    "browser-list": "找到侧栏浏览器", "browser-look": "查看网页", "browser-act": "操作网页", "computer-list": "查看可操作的应用", "computer-look": "查看应用窗口", "computer-act": "操作应用", "ended-on-promise": "收尾" };
  const REASONS = { "not-authorized": "未获授权，没有执行", declined: "你拒绝了，没有执行", interrupted: "这一轮停止了，没有执行", unavailable: "这项能力已关闭或不再可用，没有执行" };
  const VERB_GLYPH = { lookup: "search", "lookup-tools": "search", "file-search": "search", read: "note", "file-read": "file", "file-list": "list", change: "edit",
    "file-change": "code", command: "terminal", "command-output": "terminal", ask: "question", todo: "list", suggest: "zap", delegate: "workflow", "delegate-check": "workflow",
    "delegate-follow-up": "workflow", "delegate-stop": "workflow", "memory-keep": "sparkles", "memory-list": "sparkles", "memory-forget": "sparkles", "memory-suggest": "sparkles",
    "auto-continue": "refresh", compact: "refresh", "browser-list": "globe", "browser-look": "globe", "browser-act": "globe", "computer-list": "system", "computer-look": "system", "computer-act": "system", "ended-on-promise": "alert" };
  const verbGlyph = (item) => item.state === "started" ? spinner() : item.state === "failed" || item.state === "unknown" ? spinner(item.state === "failed" ? "failed" : "verify") : glyph(VERB_GLYPH[item.verb] || "circle");
  const verb = (item) => L(VERBS[item.verb] || item.verb);
  const activityLine = (item) => {
    const what = item.target ? (item.verb === "ask" ? "：" : " ") + item.target : "";
    if (item.state === "started") return L("正在") + verb(item) + what;
    if (item.state === "completed") return L("已") + verb(item) + what + (item.verb === "ask" && item.answer ? " · " + L("你的回答") + "：" + item.answer : "");
    if (item.state === "failed") return verb(item) + what + " — " + L(REASONS[item.reason] || "没有完成");
    return verb(item) + what + " — " + L("结果未确认");
  };
  const phrase = (item) => verb(item) + (item.target ? " " + item.target.split(" · ")[0] : "");
  const summary = (run) => {
    const live = [...run].reverse().find((item) => item.state === "started");
    if (live) return activityLine(live);
    const said = [...new Set(run.map(phrase))], unfinished = run.filter((item) => item.state === "failed" || item.state === "unknown").length;
    let what = said.slice(0, 2).join(L("、")); if (said.length > 2) what = L("{what}等").replace("{what}", what);
    return L("{what} · {n} 步").replace("{what}", what.charAt(0).toUpperCase() + what.slice(1)).replace("{n}", String(run.length))
      + (unfinished ? " · " + unfinished + " " + L("步没有完成") : "");
  };
  const facts = (item) => [item.capability_id && [L("调用的能力"), item.capability_id], item.detail && [L("返回的说明"), item.detail]].filter(Boolean);
  const line = (round, item) => {
    const known = (round.stepLines ||= new Map()), shown = facts(item), tag = shown.length ? "DETAILS" : "P";
    let node = known.get(item.call_id);
    if (!node || node.tagName !== tag) {
      const fresh = tag === "P" ? el("p", "assistant-activity") : el("details", "assistant-activity-fold");
      if (tag === "DETAILS") fresh.append(el("summary", "assistant-activity"), el("div", "assistant-activity-detail"));
      fresh.setAttribute("data-entry", "a:" + item.call_id);
      if (node) node.replaceWith(fresh);
      known.set(item.call_id, node = fresh);
    }
    const head = tag === "P" ? node : node.firstElementChild, words = activityLine(item);
    node.dataset.state = head.dataset.state = item.state;
    if (head.dataset.text !== words || head.dataset.glyph !== item.state) { head.dataset.text = words; head.dataset.glyph = item.state; head.replaceChildren(verbGlyph(item), el("span", "", words)); }
    const signature = JSON.stringify(shown);
    if (tag === "DETAILS" && node.dataset.facts !== signature) {
      node.dataset.facts = signature;
      node.lastElementChild.replaceChildren(...shown.map(([label, value]) => { const row = el("p"); row.append(el("span", "assistant-activity-label", label), el("span", "", value)); return row; }));
    }
    return node;
  };
  const keep = (node, place) => { const had = node.contains(document.activeElement) && document.activeElement; place(node); if (had && document.activeElement !== had) had.focus({ preventScroll: true }); };
  const place = (round, run, put, anchor) => {
    const placed = (round.stepPlaced ||= new Set());
    if (run.length === 1) { const one = line(round, run[0]); keep(one, put); placed.add(one); return; }
    // The steps sit in one body, so the group opens to its natural height like every collapsible (disclosure.ts).
    const box = keyed(round, "data-entry", "g:" + anchor, () => { const box = el("details", "assistant-steps"); box.append(el("summary", "assistant-steps-summary"), el("div", "assistant-steps-body")); return box; });
    box.dataset.state = run.some((item) => item.state === "started") ? "started" : run.some((item) => item.state === "failed" || item.state === "unknown") ? "failed" : "completed";
    setText(box.firstElementChild, summary(run));
    const body = box.lastElementChild, inBody = placer(body);
    const lines = run.map((item) => line(round, item));
    if (!body.childElementCount && lines.some((one) => one.open || one.contains(document.activeElement))) box.open = true;
    const mine = new Set(lines.map((one) => { keep(one, inBody); return one; }));
    [...body.children].forEach((child) => { if (!mine.has(child)) child.remove(); });
    keep(box, put); placed.add(box);
  };
  const sweep = (round) => {
    const placed = round.stepPlaced || new Set(); round.stepPlaced = null;
    [...round.children].forEach((child) => { if (/^[ag]:/.test(child.getAttribute("data-entry") || "") && !placed.has(child)) child.remove(); });
    for (const [id, node] of round.stepLines || []) if (!node.isConnected) round.stepLines.delete(id);
  };
  return { activityLine, place, sweep };
}`;
