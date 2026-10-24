/**
 * The Assistant's 上下文 group (specs/visual-ui-experience §assistant-information, VUX-08/09): what the next Send carries
 * (待发送), what the latest round used (本次使用) and what earlier rounds used (历史引用), kept apart so a draft, this
 * execution and an old reference are never read as one another.
 *
 * - 待发送 is what the strip above the input names, read from the island (`pending()`); removing one stays in the strip.
 * - 本次使用 and 历史引用 are the work's own facts: each round's materials and the selection it saw, and the objects the work holds as materials,
 *   each once, under the latest round that used it (a round's materials name their objects). Only an object no round names
 *   (recorded outside a Send) is placed by when it was recorded against the latest round's start. Objects are read again
 *   from their owners (`view.objects`), so one that changed since says so.
 * - The drop zone stays first: dropping or picking a file adds to 待发送.
 */
export const ASSISTANT_SIDE_CONTEXT_FACTORY_SCRIPT = String.raw`({ L, el, kinds, tile, glyph, group, sideAct, paintBlock, keepFocus, current, pending, sidePanelHere, sidePreview,
  readBack, readImage, openObject, objectState, objectTitle, objectDetail, objectGlyph, surfaceName, pickFile, addFiles, expired, block }) => {
  const GLYPH = { image: "image", file: "file", method: "zap", capability: "zap", text: "note", selection: "text", object: "file" };
  const nameOf = (material) => material.title.replace(/^(方法|用|图片|引用)：/, "");
  const objectTile = (object, round) => {
    const state = objectState(object), open = openObject(object);
    const box = el("div", "assistant-tile" + (open ? " is-openable" : "") + (state ? " is-attention" : ""));
    box.append(tile(objectGlyph(object), state ? "attention" : ""));
    if (open) { const name = el("button", "assistant-item-title", object.title); name.type = "button"; name.setAttribute("aria-label", L("打开") + "：" + object.title); name.addEventListener("click", () => { void open(); }); box.append(name); }
    else box.append(el("span", "assistant-item-title", objectTitle(object)));
    box.append(el("span", "assistant-item-sub" + (state ? " is-attention" : ""), [state || surfaceName(object.open && object.open.surface) || L("引用"),
      round ? L("第 {n} 轮").replace("{n}", String(round)) : ""].filter(Boolean).join(" · ")));
    box.title = objectDetail(object);
    return box;
  };
  const materialTile = ({ material, round }) => {
    const box = el("div", "assistant-tile"), name = nameOf(material);
    const readable = material.kind === "file" && material.text && sidePanelHere()
      ? () => { sidePreview({ preview: { title: name, media_type: "text/plain", text: material.text } }); } : readBack(material, name) || readImage(material, name);
    const title = el(readable ? "button" : "span", "assistant-item-title", name);
    if (readable) { title.type = "button"; title.setAttribute("aria-label", L("预览") + "：" + name); box.classList.add("is-openable"); title.addEventListener("click", readable); }
    box.append(tile(GLYPH[material.kind] || "file", ""), title, el("span", "assistant-item-sub", [L(kinds[material.kind] || "材料"),
      round ? L("第 {n} 轮").replace("{n}", String(round)) : "", material.expired ? L("已失效") : ""].filter(Boolean).join(" · ")));
    if (material.expired) box.title = L(expired);
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
      ...(round.context && round.context.selection ? [{ kind: "selection", title: L("选中的内容") + "：" + round.context.selection.text.replace(/\s+/g, " ").slice(0, 28) }] : [])];
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
      zone.append(el("p", "assistant-drop-label", L("待发送")));
      const hint = el("div", "assistant-drop-hint");
      hint.append(glyph("upload"), el("span", "", L("拖到这里，或 @ 引用、/ 用能力")), sideAct(L("添加文件"), L("下次发送带上"), async () => { pickFile(); }, false, "secondary"));
      zone.append(hint);
      if (waiting.length) zone.append(tiles(waiting.map((one) => materialTile({ material: one }))));
      zone.addEventListener("dragover", (event) => { if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault(); });
      window.molisDropZone?.(zone, (on) => { if (on) zone.dataset.dropping = "true"; else delete zone.dataset.dropping; }, undefined, L("不支持拖入这种内容"));
      zone.addEventListener("drop", (event) => { const dropped = [...(event.dataTransfer?.files || [])]; if (!dropped.length) return; event.preventDefault(); void addFiles(dropped); });
      const content = el("div", "assistant-group-list");
      content.append(zone);
      if (now.length) content.append(group(L("本次使用"), tiles(now)));
      if (before.length) content.append(group(L("历史引用"), tiles(before)));
      const changed = objects.filter((o) => o.state !== "current").length;
      paintBlock(node, L("上下文"), "paperclip", content, changed ? changed + " " + L("项有变化") : waiting.length ? waiting.length + " " + L("项待发送") : now.length + before.length ? String(now.length + before.length) : "", changed > 0);
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
export const ASSISTANT_SIDE_SURROUNDINGS_FACTORY_SCRIPT = String.raw`({ L, el, card, group, stack, paintBlock, keepFocus, api, environmentBlock, toolsBlock }) => {
  let asked = "", held = null, at = 0, asking = false, last = null;
  const count = (text, value) => L(text).replace("{n}", String(value));
  const CONNECTION = { connected: "已连接", "needs-authorization": "需要登录授权", failed: "连接失败", disconnected: "未连接", unchecked: "还没检查", incomplete: "还没设置完", off: "已关闭" };
  const TOOLS = { callable: "工具可调用", partial: "部分工具可调用", blocked: "工具不可调用", "none-discovered": "还没发现工具" };
  const paint = (work, read) => {
    const env = environmentBlock(), tools = toolsBlock();
    if (!env || !tools) return;
    const signature = JSON.stringify([work && work.work_id, read]);
    if (env.dataset.signature === signature) return;
    env.dataset.signature = signature;
    if (!work || !read) { paintBlock(env, "", "", null); paintBlock(tools, "", "", null); return; }
    const { environment, connections, tools: can } = read, carried = environment.executor, git = carried && carried.git;
    keepFocus(env, () => {
      const rows = [card({ icon: environment.scope.kind === "project" ? "folder" : "user", title: environment.scope.kind === "project" ? environment.scope.title || L("本项目") : L("个人"),
        sub: environment.scope.kind === "project" ? L("项目范围：只用这个项目的能力与资料") : L("个人范围：不属于任何项目") })];
      if (carried && carried.workspace) rows.push(card({ icon: "folder", title: carried.workspace.name, sub: L("目录") + " · " + carried.workspace.path, detail: carried.workspace.path }));
      if (git) rows.push(card({ icon: "git-branch", tone: git.conflicted ? "blocked" : "", title: (git.repository ? git.repository + " · " : "") + (git.branch || L("分离的 HEAD")),
        sub: [git.ahead ? count("领先 {n}", git.ahead) : "", git.behind ? count("落后 {n}", git.behind) : "",
          git.changed ? count("{n} 处未提交", git.changed) : L("没有未提交的改动"), git.conflicted ? count("{n} 处冲突", git.conflicted) : ""].filter(Boolean).join(" · "),
        subTone: git.conflicted ? "blocked" : "" }));
      else if (carried) rows.push(card({ icon: "folder", tone: carried.problem ? "attention" : "", title: carried.workspace ? L("不是 Git 仓库") : L("还没有工作目录"), sub: carried.problem || "", subTone: carried.problem ? "attention" : "" }));
      paintBlock(env, L("工作环境"), "folder", stack(rows), git && git.conflicted ? count("{n} 处冲突", git.conflicted) : git ? git.branch || L("分离的 HEAD") : "", Boolean(git && git.conflicted));
    });
    keepFocus(tools, () => {
      const box = el("div", "assistant-group-list");
      const linked = connections.map((one) => card({ icon: "link", tone: ["needs-authorization", "failed"].includes(one.state) ? "blocked" : one.state === "connected" ? "" : "attention", title: one.title,
        sub: [L(CONNECTION[one.state] || one.state), one.account || "", one.state === "connected" ? L(TOOLS[one.tools] || one.tools) : ""].filter(Boolean).join(" · "),
        subTone: ["needs-authorization", "failed"].includes(one.state) ? "blocked" : "" }));
      if (read.connections_problem) linked.push(card({ icon: "link", tone: "attention", title: L("连接暂时读不到"), sub: read.connections_problem, subTone: "attention" }));
      if (linked.length) box.append(group(L("你的连接"), stack(linked, work.work_id + ":tools:connections")));
      const callable = can.callable.map((one) => card({ icon: "zap", title: one.provider, sub: count("{n} 项可用", one.count) }));
      if (can.executor === "plugin") callable.unshift(card({ icon: "terminal", title: work.executor.title || L("执行方"), sub: can.callable.length || can.unavailable.length ? L("自己的读写与命令，加上为这个会话选的 MCP 工具") : L("自己的读写与命令；MCP 工具在执行方的页面里为会话选择") }));
      if (can.problem) callable.push(card({ icon: "zap", tone: "attention", title: L("工具暂时读不到"), sub: can.problem, subTone: "attention" }));
      if (callable.length) box.append(group(L("可调用"), stack(callable, work.work_id + ":tools:callable")));
      const blocked = can.unavailable.map((one) => card({ icon: "zap", tone: "blocked", title: one.title, sub: one.provider + (one.reason ? " · " + L(one.reason) : ""), subTone: "blocked" }));
      if (blocked.length) box.append(group(L("现在不能用"), stack(blocked, work.work_id + ":tools:blocked")));
      const needs = connections.filter((one) => ["needs-authorization", "failed"].includes(one.state)).length, total = can.callable.reduce((sum, one) => sum + one.count, 0);
      paintBlock(tools, L("连接与工具"), "link", box.children.length ? box : null, needs ? count("{n} 项要处理", needs) : total ? count("{n} 项可用", total) : "", needs > 0);
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
export const ASSISTANT_SIDE_USAGE_FACTORY_SCRIPT = String.raw`({ L, el, progress, api, toast, box, current, adopt }) => {
  const number = (value) => Number(value).toLocaleString("en-US");
  const MARK = { estimated: "估算", partial: "部分", "partial-estimated": "部分估算" };
  const tag = (coverage) => MARK[coverage] ? "（" + L(MARK[coverage]) + "）" : "", marked = (value, coverage) => coverage === "unknown" ? L("暂不可用") : number(value) + tag(coverage);
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
    details.append(el("summary", "", L("用量") + (usage ? " · " + number(usage.tokens) + " tokens" + (usage.budget_tokens !== null ? " / " + number(usage.budget_tokens) : "") : "") + (over ? " · " + L("已到上限") : "")));
    if (round) {
      const report = round.usage, wait = round.ended_at ? L("暂不可用") : L("进行中");
      const tokens = report ? report.tokens : {}, coverage = report && report.coverage || {}, model = round.model, context = report && report.context, windowSize = model && model.window_tokens;
      const used = context && context.coverage !== "unknown" ? context.tokens : null;
      const where = [model ? (model.now ? model.model_id + " → " + model.now : model.model_id) : "", round.ended_at ? L("更新于") + " " + new Date(round.ended_at).toLocaleTimeString() : L("进行中")].filter(Boolean).join(" · ");
      details.append(section(L("上下文窗口"), used !== null && windowSize ? progress(Math.min(used, windowSize), windowSize, L("上下文窗口")) : null,
        row(L("已用"), used === null ? report ? L("暂不可用") : wait : marked(used, context.coverage) + (windowSize ? " / " + number(windowSize) + " · " + Math.min(100, Math.round(used / windowSize * 100)) + "%" : " · " + L("窗口大小暂不可用"))),
        where ? el("p", "assistant-material-origin", where) : null));
      details.append(!report ? section(L("本轮"), row(L("输入"), wait, true), row(L("输出"), wait, true)) : section(L("本轮"), row(L("输入"), marked(tokens.input, coverage.input)), row(L("输出"), marked(tokens.output, coverage.output)),
        tokens.cached_input ? row(L("缓存读取"), marked(tokens.cached_input, coverage.cached_input)) : null, tokens.cache_creation ? row(L("缓存写入"), marked(tokens.cache_creation, coverage.cache_creation)) : null,
        tokens.reasoning ? row(L("推理"), number(tokens.reasoning)) : null,
        row(L("费用"), typeof report.cost_usd === "number" && coverage.cost_usd !== "unknown" ? "$" + report.cost_usd.toFixed(4) + tag(coverage.cost_usd) : L("暂不可用"), typeof report.cost_usd !== "number"),
        report.unavailable_reason ? el("p", "assistant-material-origin", L(report.unavailable_reason)) : null));
      details.append(section(L("账户额度"), row(L("额度与重置"), L("暂不可用"), true)));
    }
    if (usage && usage.budget_of) details.append(el("p", "assistant-material-origin", L("子任务按委托它的工作计算") + "：「" + usage.budget_of.title + "」"));
    else if (usage) {
      const form = el("form", "assistant-usage-form");
      const field = el("input", "assistant-usage-input"); field.type = "number"; field.min = "1000"; field.step = "1000"; field.inputMode = "numeric";
      field.placeholder = L("不单独设限"); field.value = usage.budget_tokens !== null ? String(usage.budget_tokens) : "";
      field.setAttribute("aria-label", L("这项工作的用量上限（tokens，含子任务）"));
      const save = el("button", "assistant-side-action", L("保存上限")); save.type = "submit";
      form.append(el("span", "assistant-material-origin", L("上限（tokens，含子任务）")), field, save);
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); save.disabled = true;
        try { adopt(await api("/works/" + encodeURIComponent(work.work_id) + "/budget", "POST", { budget_tokens: field.value.trim() === "" ? null : Number(field.value) })); }
        catch (error) { toast(error); }
        finally { save.disabled = false; }
      });
      details.append(section(L("这项工作") + " · " + number(usage.rounds) + " " + L("轮"), form));
    }
    node.replaceChildren(details);
  } };
}`;
