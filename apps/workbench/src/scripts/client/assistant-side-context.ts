/**
 * The Assistant's 上下文 group (specs/visual-ui-experience §assistant-information, VUX-08/09): what the next Send carries
 * (待发送), what the latest round used (本次使用) and what earlier rounds used (历史引用), kept apart so a draft, this
 * execution and an old reference are never read as one another.
 *
 * - 待发送 is what the strip above the input names and the files and picks the composer's own strip carries once read, read from
 *   the island (`pending()`); removing one stays in its strip.
 * - 本次使用 and 历史引用 are the work's own facts: each round's materials and the selection it saw, and the objects the work holds as materials,
 *   each once, under the latest round that used it (a round's materials name their objects). Only an object no round names
 *   (recorded outside a Send) is placed by when it was recorded against the latest round's start. Objects are read again
 *   from their owners (`view.objects`), so one that changed since says so.
 * - The drop zone stays first: dropping or picking a file adds to 待发送.
 */
export const ASSISTANT_SIDE_CONTEXT_FACTORY_SCRIPT = String.raw`({ readText, el, kinds, tile, glyph, group, sideAct, paintBlock, keepFocus, current, pending, sidePanelHere, sidePreview,
  readBack, readImage, openObject, objectState, objectTitle, objectDetail, objectGlyph, surfaceName, pickFile, addFiles, expired, block }) => {
  const GLYPH = { image: "image", file: "file", method: "zap", capability: "zap", text: "note", selection: "text", object: "file" };
  const nameOf = (material) => material.title.replace(/^(方法|用|图片|引用)：/, "");
  const objectTile = (object, round) => {
    const state = objectState(object), open = openObject(object);
    const box = el("div", "assistant-tile" + (open ? " is-openable" : "") + (state ? " is-attention" : ""));
    box.append(tile(objectGlyph(object), state ? "attention" : ""));
    if (open) { const name = el("button", "assistant-item-title", object.title); name.type = "button"; name.setAttribute("aria-label", globalThis.t.text("common.control.open") + "：" + object.title); name.addEventListener("click", () => { void open(); }); box.append(name); }
    else box.append(el("span", "assistant-item-title", objectTitle(object)));
    box.append(el("span", "assistant-item-sub" + (state ? " is-attention" : ""), [state || surfaceName(object.open && object.open.surface) || globalThis.t.text("workbench.assistant-side-context.quote"),
      round ? globalThis.t.text("workbench.assistant-side-context.turn-n").replace("{n}", String(round)) : ""].filter(Boolean).join(" · ")));
    box.title = objectDetail(object);
    return box;
  };
  const materialTile = ({ material, round }) => {
    const box = el("div", "assistant-tile"), name = nameOf(material);
    const readable = material.kind === "file" && material.text && sidePanelHere()
      ? () => { sidePreview({ preview: { title: name, media_type: "text/plain", text: material.text } }); } : readBack(material, name) || readImage(material, name);
    const title = el(readable ? "button" : "span", "assistant-item-title", name);
    if (readable) { title.type = "button"; title.setAttribute("aria-label", globalThis.t.text("workbench.assistant-side-context.preview") + "：" + name); box.classList.add("is-openable"); title.addEventListener("click", readable); }
    box.append(tile(GLYPH[material.kind] || "file", ""), title, el("span", "assistant-item-sub", [globalThis.t.text(kinds[material.kind] || "workbench.assistant-side-context.material"),
      round ? globalThis.t.text("workbench.assistant-side-context.turn-n").replace("{n}", String(round)) : "", material.expired ? globalThis.t.text("workbench.assistant-side-context.no-longer-valid") : ""].filter(Boolean).join(" · ")));
    if (material.expired) box.title = expired;
    return box;
  };
  const tiles = (items) => { const box = el("div", "assistant-tiles"); items.forEach((one) => box.append(one)); return box; };
  return { paint() {
    const view = current(), work = view ? view.work : null, rounds = work ? view.rounds : [];
    const latest = rounds.length ? rounds[rounds.length - 1] : null, since = latest ? Date.parse(latest.started_at) : Infinity;
    const objects = work && view.objects ? view.objects.filter((o) => o.relation === "material") : [];
    // Each material once, at the latest round that used it.
    const used = new Map();
    // A round's selection is what it saw of the page, the same as what was handed over; its page object is a material object.
    const seen = (round) => [...(round.materials || []).filter((material) => !material.object),
      ...(round.context && round.context.selection ? [{ kind: "selection", title: globalThis.t.text("workbench.assistant-side-context.selection") + "：" + round.context.selection.text.replace(/\s+/g, " ").slice(0, 28) }] : [])];
    rounds.forEach((round, index) => seen(round).forEach((material) => { const key = material.kind + ":" + material.title; used.delete(key); used.set(key, { material, round: index + 1, now: round === latest }); }));
    const at = new Map();
    rounds.forEach((r, i) => (r.materials || []).forEach((m) => m.object && at.set(m.object.kind + ":" + m.object.id, i + 1)));
    const roundOf = (o) => at.get(o.subject.kind + ":" + o.subject.id), usedNow = (o) => roundOf(o) ? roundOf(o) === rounds.length : Date.parse(o.recorded_at) >= since;
    const waiting = pending();
    const now = [...objects.filter(usedNow).map((o) => objectTile(o)), ...[...used.values()].filter((one) => one.now).map((one) => materialTile({ material: one.material }))];
    const before = [...objects.filter((o) => !usedNow(o)).map((o) => objectTile(o, roundOf(o))), ...[...used.values()].filter((one) => !one.now).map(materialTile)];
    const node = block();
    const signature = JSON.stringify([work && work.work_id, sidePanelHere(), waiting.map((one) => one.kind + ":" + one.title),
      objects.map((o) => [o.subject.id, o.state, o.title, o.current_revision, o.recorded_at, roundOf(o)]), [...used.keys()], latest && latest.run_id]);
    if (!node || node.dataset.signature === signature) return;
    node.dataset.signature = signature;
    keepFocus(node, () => {
      const zone = el("div", "assistant-drop");
      zone.append(el("p", "assistant-drop-label", globalThis.t.text("workbench.assistant-side-context.send")));
      const hint = el("div", "assistant-drop-hint");
      hint.append(glyph("upload"), el("span", "", globalThis.t.text("workbench.assistant-side-context.drop-files-here-bring-capability")), sideAct(globalThis.t.text("workbench.assistant-side-context.add-files"), globalThis.t.text("workbench.assistant-side-context.carried-next-message"), async () => { pickFile(); }, false, "secondary"));
      zone.append(hint);
      if (waiting.length) zone.append(tiles(waiting.map((one) => materialTile({ material: one }))));
      zone.addEventListener("dragover", (event) => { if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault(); });
      window.molisDropZone?.(zone, (on) => { if (on) zone.dataset.dropping = "true"; else delete zone.dataset.dropping; }, undefined, globalThis.t.text("workbench.assistant-side-context.kind-content-can-t-be-dropped-here"));
      zone.addEventListener("drop", (event) => { const dropped = [...(event.dataTransfer?.files || [])]; if (!dropped.length) return; event.preventDefault(); void addFiles(dropped); });
      const content = el("div", "assistant-group-list");
      content.append(zone);
      if (now.length) content.append(group(globalThis.t.text("workbench.assistant-side-context.used-turn"), tiles(now)));
      if (before.length) content.append(group(globalThis.t.text("workbench.assistant-side-context.used-before"), tiles(before)));
      const changed = objects.filter((o) => o.state !== "current").length;
      paintBlock(node, globalThis.t.text("workbench.assistant-side-context.context"), "paperclip", content, changed ? changed + " " + globalThis.t.text("workbench.assistant-side-context.changed") : waiting.length ? waiting.length + " " + globalThis.t.text("workbench.assistant-side-context.send-2") : now.length + before.length ? String(now.length + before.length) : "", changed > 0);
    });
  } };
}`;

/**
 * The Assistant's 工作环境 and 连接与工具 groups (VUX-08/09; the user's 2026-10-20 decision ②): what the Host reads from each
 * owner for the current work (`GET /works/<id>/surroundings`, held there for a few seconds), asked again when the work,
 * its revision or its state changes, never on every redraw. A connection or a repository changes without the work changing,
 * so a read older than 15 s is asked again whenever the side is in sight and redrawn (the page coming back to the front
 * redraws) or focus enters it (opening it does); a failed read is tried again 3 s later. A part its owner could not answer
 * says so in its own row.
 * - 工作环境: the scope (personal, or the project); for a work a plugin carries, the session's directory and its repository, branch, distance to
 *   upstream and what is not committed. A conflict is the summary and stands out.
 * - 连接与工具: each of the person's connections (headed 你的连接: they are the person's, not what this work was given) by its own status (signed in, needs signing in, failed, off) and whether its tools can run;
 *   then what the Assistant can call now by provider, and what it cannot with its owner's reason. A plugin that carries the work keeps its own tools.
 */
export const ASSISTANT_SIDE_SURROUNDINGS_FACTORY_SCRIPT = String.raw`({ readText, el, card, group, stack, paintBlock, keepFocus, api, environmentBlock, toolsBlock }) => {
  let asked = "", held = null, at = 0, asking = false, last = null;
  const count = (text, value) => globalThis.t.text(text).replace("{n}", String(value));
  const CONNECTION = { connected: "workbench.assistant-side-context.connected", "needs-authorization": "workbench.assistant-side-context.needs-sign", failed: "workbench.assistant-side-context.connection-failed", disconnected: "workbench.assistant-side-context.disconnected", unchecked: "workbench.assistant-side-context.not-checked-yet", incomplete: "workbench.assistant-side-context.setup-not-finished", off: "workbench.assistant-side-context.switched-off" };
  const TOOLS = { callable: "workbench.assistant-side-context.tools-can-be-called", partial: "workbench.assistant-side-context.some-tools-can-be-called", blocked: "workbench.assistant-side-context.tools-cannot-be-called", "none-discovered": "workbench.assistant-side-context.no-tools-found-yet" };
  const paint = (work, read) => {
    const env = environmentBlock(), tools = toolsBlock();
    if (!env || !tools) return;
    const signature = JSON.stringify([work && work.work_id, read]);
    if (env.dataset.signature === signature) return;
    env.dataset.signature = signature;
    if (!work || !read) { paintBlock(env, "", "", null); paintBlock(tools, "", "", null); return; }
    const { environment, connections, tools: can } = read, carried = environment.executor, git = carried && carried.git;
    keepFocus(env, () => {
      const rows = [card({ icon: environment.scope.kind === "project" ? "folder" : "user", title: environment.scope.kind === "project" ? environment.scope.title || globalThis.t.text("workbench.assistant-side-context.project") : globalThis.t.text("workbench.assistant-side-context.personal"),
        sub: environment.scope.kind === "project" ? globalThis.t.text("workbench.assistant-side-context.project-scope-only-project-s-capabilities-files") : globalThis.t.text("workbench.assistant-side-context.personal-scope-not-part-any-project") })];
      if (carried && carried.workspace) rows.push(card({ icon: "folder", title: carried.workspace.name, sub: globalThis.t.text("workbench.assistant-side-context.directory") + " · " + carried.workspace.path, detail: carried.workspace.path }));
      if (git) rows.push(card({ icon: "git-branch", tone: git.conflicted ? "blocked" : "", title: (git.repository ? git.repository + " · " : "") + (git.branch || globalThis.t.text("workbench.assistant-side-context.detached-head")),
        sub: [git.ahead ? count("workbench.assistant-side-context.n-ahead", git.ahead) : "", git.behind ? count("workbench.assistant-side-context.n-behind", git.behind) : "",
          git.changed ? count("workbench.assistant-side-context.n-uncommitted", git.changed) : globalThis.t.text("workbench.assistant-side-context.nothing-uncommitted"), git.conflicted ? count("workbench.assistant-side-context.n-conflict", git.conflicted) : ""].filter(Boolean).join(" · "),
        subTone: git.conflicted ? "blocked" : "" }));
      else if (carried) rows.push(card({ icon: "folder", tone: carried.problem ? "attention" : "", title: carried.workspace ? globalThis.t.text("workbench.assistant-side-context.not-git-repository") : globalThis.t.text("workbench.assistant-side-context.no-working-directory-yet"), sub: carried.problem || "", subTone: carried.problem ? "attention" : "" }));
      paintBlock(env, globalThis.t.text("workbench.assistant-side-context.where-runs"), "folder", stack(rows), git && git.conflicted ? count("workbench.assistant-side-context.n-conflict", git.conflicted) : git ? git.branch || globalThis.t.text("workbench.assistant-side-context.detached-head") : "", Boolean(git && git.conflicted));
    });
    keepFocus(tools, () => {
      const box = el("div", "assistant-group-list");
      const linked = connections.map((one) => card({ icon: "link", tone: ["needs-authorization", "failed"].includes(one.state) ? "blocked" : one.state === "connected" ? "" : "attention", title: one.title,
        sub: [globalThis.t.text(CONNECTION[one.state] || one.state), one.account || "", one.state === "connected" ? globalThis.t.text(TOOLS[one.tools] || one.tools) : ""].filter(Boolean).join(" · "),
        subTone: ["needs-authorization", "failed"].includes(one.state) ? "blocked" : "" }));
      if (read.connections_problem) linked.push(card({ icon: "link", tone: "attention", title: globalThis.t.text("workbench.assistant-side-context.connections-can-t-be-read-right-now"), sub: read.connections_problem, subTone: "attention" }));
      if (linked.length) box.append(group(globalThis.t.text("workbench.assistant-side-context.connections"), stack(linked, work.work_id + ":tools:connections")));
      const callable = can.callable.map((one) => card({ icon: "zap", title: one.provider, sub: count("workbench.assistant-side-context.n-available", one.count) }));
      if (can.executor === "plugin") callable.unshift(card({ icon: "terminal", title: work.executor.title || globalThis.t.text("workbench.assistant-side-context.executor"), sub: can.callable.length || can.unavailable.length ? globalThis.t.text("workbench.assistant-side-context.its-own-file-command-tools-plus-mcp-tools") : globalThis.t.text("workbench.assistant-side-context.its-own-file-command-tools-mcp-tools-chosen") }));
      if (can.problem) callable.push(card({ icon: "zap", tone: "attention", title: globalThis.t.text("workbench.assistant-side-context.tools-can-t-be-read-right-now"), sub: can.problem, subTone: "attention" }));
      if (callable.length) box.append(group(globalThis.t.text("workbench.assistant-side-context.can-call"), stack(callable, work.work_id + ":tools:callable")));
      const blocked = can.unavailable.map((one) => card({ icon: "zap", tone: "blocked", title: one.title, sub: one.provider + (one.reason ? " · " + one.reason : ""), subTone: "blocked" }));
      if (blocked.length) box.append(group(globalThis.t.text("workbench.assistant-side-context.not-usable-now"), stack(blocked, work.work_id + ":tools:blocked")));
      const needs = connections.filter((one) => ["needs-authorization", "failed"].includes(one.state)).length, total = can.callable.reduce((sum, one) => sum + one.count, 0);
      paintBlock(tools, globalThis.t.text("workbench.assistant-side-context.connections-tools"), "link", box.children.length ? box : null, needs ? count("workbench.assistant-side-context.n-handle", needs) : total ? count("workbench.assistant-side-context.n-available", total) : "", needs > 0);
    });
  };
  const side = () => environmentBlock()?.parentElement;
  const surround = (work) => {
    last = work;
    const key = work ? work.work_id + ":" + work.revision + ":" + work.state : "";
    if (!work) { asked = ""; held = null; paint(null, null); return; }
    if (!asking && (key !== asked || (Date.now() - at > 15000 && side()?.checkVisibility()))) {
      asked = key; asking = true; at = Date.now();
      api("/works/" + encodeURIComponent(work.work_id) + "/surroundings").then((read) => { if (asked === key) { held = { id: work.work_id, read }; paint(work, read); } })
        .catch(() => { at -= 12000; }).finally(() => { asking = false; });
    }
    paint(work, held && held.id === work.work_id ? held.read : null);
  };
  document.addEventListener("focusin", (event) => { if (last && side()?.contains(event.target)) surround(last); });
  return { paint: surround };
}`;

/**
 * The Assistant's 用量 (VUX-11): the context window, the latest round's tokens, cache, cost and the account's quota are told
 * apart, each from the runtime's own report for that round (`round.usage`, `round.model`), never added up or guessed.
 * - 上下文窗口: the latest call's prompt against the window the round was packed against, with the model and when; a share
 *   is drawn only when both are known. An estimate says so; a field the runtime left unknown reads 暂不可用.
 * - 本轮: input and output, then cache read and write and reasoning when reported. Cost only as the runtime reported it.
 *   Always the latest round: one with no report yet reads 进行中 (or 暂不可用 once ended) with its own model, never the
 *   numbers of a round before it.
 * - The account's quota and reset have no source here, so they read 暂不可用.
 * - 这项工作: the work's own total and its cap, as before.
 */
export const ASSISTANT_SIDE_USAGE_FACTORY_SCRIPT = String.raw`({ readText, el, progress, api, toast, box, current, adopt }) => {
  const number = (value) => Number(value).toLocaleString("en-US");
  const MARK = { estimated: "workbench.assistant-side-context.estimated", partial: "workbench.assistant-side-context.partial", "partial-estimated": "workbench.assistant-side-context.partly-estimated" };
  const tag = (coverage) => MARK[coverage] ? "（" + globalThis.t.text(MARK[coverage]) + "）" : "", marked = (value, coverage) => coverage === "unknown" ? globalThis.t.text("workbench.assistant-side-context.unavailable") : number(value) + tag(coverage);
  const row = (label, value, muted) => { const line = el("p", "assistant-usage-row" + (muted ? " is-muted" : "")); line.append(el("span", "", label), el("span", "mw-num", value)); return line; };
  const section = (title, ...rows) => { const part = el("div", "assistant-usage-part"); part.append(el("p", "assistant-block-sub", title), ...rows.filter(Boolean)); return part; };
  return { paint(work) {
    const node = box(), view = current();
    if (!node) return;
    const usage = work && view && view.usage ? view.usage : null, last = work && view ? view.rounds[view.rounds.length - 1] : null, round = last && (last.usage || last.model) ? last : null;
    const signature = JSON.stringify([work && work.work_id, usage, round && [round.run_id, round.usage, round.model, round.ended_at]]);
    if (node.dataset.signature === signature) return;
    const wasOpen = node.querySelector("details")?.open;
    node.dataset.signature = signature;
    const over = Boolean(usage && usage.budget_tokens !== null && usage.tokens >= usage.budget_tokens);
    node.hidden = !usage && !round;
    if (node.hidden) { node.replaceChildren(); return; }
    const details = el("details", "assistant-usage");
    details.open = wasOpen === undefined ? over : wasOpen || over;
    details.append(el("summary", "", globalThis.t.text("workbench.assistant-side-context.usage") + (usage ? " · " + number(usage.tokens) + " tokens" + (usage.budget_tokens !== null ? " / " + number(usage.budget_tokens) : "") : "") + (over ? " · " + globalThis.t.text("workbench.assistant-side-context.cap-reached") : "")));
    if (round) {
      const report = round.usage, wait = round.ended_at ? globalThis.t.text("workbench.assistant-side-context.unavailable") : globalThis.t.text("workbench.assistant-side-context.progress");
      const tokens = report ? report.tokens : {}, coverage = report && report.coverage || {}, model = round.model, context = report && report.context, windowSize = model && model.window_tokens;
      const used = context && context.coverage !== "unknown" ? context.tokens : null;
      const where = [model ? (model.now ? model.model_id + " → " + model.now : model.model_id) : "", round.ended_at ? globalThis.t.text("workbench.assistant-side-context.updated") + " " + globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: round.ended_at, style: "time-with-seconds" } }) : globalThis.t.text("workbench.assistant-side-context.progress")].filter(Boolean).join(" · ");
      details.append(section(globalThis.t.text("workbench.assistant-side-context.context-window"), used !== null && windowSize ? progress(Math.min(used, windowSize), windowSize, globalThis.t.text("workbench.assistant-side-context.context-window")) : null,
        row(globalThis.t.text("workbench.assistant-side-context.used"), used === null ? report ? globalThis.t.text("workbench.assistant-side-context.unavailable") : wait : marked(used, context.coverage) + (windowSize ? " / " + number(windowSize) + " · " + Math.min(100, Math.round(used / windowSize * 100)) + "%" : " · " + globalThis.t.text("workbench.assistant-side-context.window-size-not-available"))),
        where ? el("p", "assistant-material-origin", where) : null));
      details.append(!report ? section(globalThis.t.text("workbench.assistant-side-context.turn"), row(globalThis.t.text("workbench.assistant-side-context.inputs"), wait, true), row(globalThis.t.text("workbench.assistant-side-context.output"), wait, true)) : section(globalThis.t.text("workbench.assistant-side-context.turn"), row(globalThis.t.text("workbench.assistant-side-context.inputs"), marked(tokens.input, coverage.input)), row(globalThis.t.text("workbench.assistant-side-context.output"), marked(tokens.output, coverage.output)),
        tokens.cached_input ? row(globalThis.t.text("workbench.assistant-side-context.cached-reads"), marked(tokens.cached_input, coverage.cached_input)) : null, tokens.cache_creation ? row(globalThis.t.text("workbench.assistant-side-context.cache-write"), marked(tokens.cache_creation, coverage.cache_creation)) : null,
        tokens.reasoning ? row(globalThis.t.text("workbench.assistant-side-context.reasoning"), number(tokens.reasoning)) : null,
        row(globalThis.t.text("workbench.assistant-side-context.cost"), typeof report.cost_usd === "number" && coverage.cost_usd !== "unknown" ? "$" + report.cost_usd.toFixed(4) + tag(coverage.cost_usd) : globalThis.t.text("workbench.assistant-side-context.unavailable"), typeof report.cost_usd !== "number"),
        report.unavailable_reason ? el("p", "assistant-material-origin", report.unavailable_reason) : null));
      details.append(section(globalThis.t.text("workbench.assistant-side-context.account-quota"), row(globalThis.t.text("workbench.assistant-side-context.quota-reset"), globalThis.t.text("workbench.assistant-side-context.unavailable"), true)));
    }
    if (usage && usage.budget_of) details.append(el("p", "assistant-material-origin", globalThis.t.text("workbench.assistant-side-context.sub-task-counts-toward-work-that-delegated") + "：「" + usage.budget_of.title + "」"));
    else if (usage) {
      const form = el("form", "assistant-usage-form");
      const field = el("input", "assistant-usage-input"); field.type = "number"; field.min = "1000"; field.step = "1000"; field.inputMode = "numeric";
      field.placeholder = globalThis.t.text("workbench.assistant-side-context.no-cap-its-own"); field.value = usage.budget_tokens !== null ? String(usage.budget_tokens) : "";
      field.setAttribute("aria-label", globalThis.t.text("workbench.assistant-side-context.work-s-usage-cap-tokens-sub-tasks-included"));
      const save = el("button", "assistant-side-action", globalThis.t.text("workbench.assistant-side-context.save-cap")); save.type = "submit";
      form.append(el("span", "assistant-material-origin", globalThis.t.text("workbench.assistant-side-context.cap-tokens-sub-tasks-included")), field, save);
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); save.disabled = true;
        try { adopt(await api("/works/" + encodeURIComponent(work.work_id) + "/budget", "POST", { budget_tokens: field.value.trim() === "" ? null : Number(field.value) })); }
        catch (error) { toast(error); }
        finally { save.disabled = false; }
      });
      details.append(section(globalThis.t.text("workbench.assistant-side-context.work") + " · " + number(usage.rounds) + " " + globalThis.t.text("workbench.assistant-side-context.turns"), form));
    }
    node.replaceChildren(details);
  } };
}`;
