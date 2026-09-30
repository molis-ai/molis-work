/**
 * Settings › 诊断 › “助理与执行服务”: the execution runtime's own account of its assembly, and the Assistant's latest
 * rounds with the exact identities and versions they ran with. For developers; the conversation never shows these.
 */
export function renderAgentDiagnostics({ L }: { L(text: string): string }): string {
  return `<details class="settings-section prompt-diagnostics" id="agent-diagnostics" data-agent-diagnostics>
      <summary><strong>${L("助理与执行服务")}</strong><span class="settings-muted">${L("执行服务实际装配了什么、本机缺哪些能力、有没有没记下来的运行记录；助理最近几轮各自用的模型、角色、提示词版本、带上的资料和失败的步骤。")}</span></summary>
      <div data-agent-diagnostics-body><p class="settings-muted mw-loading">${L("正在读取…")}</p></div>
    </details>`;
}

/** Reads only when opened. No template interpolation inside. */
export const AGENT_DIAGNOSTICS_CLIENT_SCRIPT = String.raw`
globalThis.molisWorkBindAgentDiagnostics = (container = document) => {
  const root = container.matches?.("[data-agent-diagnostics]") ? container : container.querySelector?.("[data-agent-diagnostics]");
  if (!root || root.dataset.agentDiagnosticsBound) return;
  root.dataset.agentDiagnosticsBound = "1";
  const L = globalThis.L || ((text) => text);
  const body = root.querySelector("[data-agent-diagnostics-body]");
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  // An identifier, shown exactly and breakable so a long one never widens the page.
  const code = (text) => { const node = el("code", "", String(text)); node.style.wordBreak = "break-all"; return node; };
  const line = (...parts) => { const node = el("span", "settings-muted"); parts.forEach((part) => node.append(typeof part === "string" ? document.createTextNode(part) : part)); return node; };
  const issue = (text, level) => el("li", "prompt-diagnostics-issue prompt-diagnostics-issue--" + (level || "warning"), text);
  const SLOT = { ready: "就绪", disabled: "已关闭", unavailable: "不可用" };
  const HOST = { absent: "没有", unavailable: "不可用", undetermined: "探不出来，按没有处理" };
  const PHASE = { starting: "开始中", running: "进行中", "awaiting-review": "等你确认", "awaiting-input": "等你回答", paused: "已暂停", compacting: "整理上下文中",
    completed: "完成", failed: "失败", cancelled: "已取消", stopped: "已停止", "reconcile-required": "结果待核对", unknown: "运行时里读不到" };
  const MATERIAL = { selection: "选中内容", object: "对象", text: "文字", file: "文件", image: "图片", capability: "指定能力", method: "方法" };
  const LAYER = { base: "产品约束", role: "角色", project: "项目", task: "任务" };
  const time = (iso) => { const date = new Date(iso); return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(iso || ""); };

  const runtimePart = (runtime) => {
    const section = el("section");
    section.append(el("h3", "prompt-diagnostics-heading", L("执行服务")));
    if (!runtime) { section.append(el("p", "settings-muted", L("当前执行服务没有提供装配记录。"))); return section; }
    const list = el("ul", "prompt-diagnostics-list");
    const head = el("li", "prompt-diagnostics-owner");
    head.append(el("strong", "", runtime.app.app_id + " " + runtime.app.app_version), line(L("状态") + " " + runtime.state + " · " + L("装配指纹") + " ", code(runtime.fingerprint)));
    list.append(head);
    const slots = el("li", "prompt-diagnostics-owner");
    slots.append(el("strong", "", L("装配槽")));
    const slotList = el("ul", "prompt-diagnostics-issues");
    runtime.slots.forEach((slot) => {
      const words = slot.slot + "：" + L(SLOT[slot.state] || slot.state) + (slot.implementation ? " · " + slot.implementation + (slot.version ? " " + slot.version : "") : "")
        + (slot.fallback ? " · " + L("用的是回退实现") : "") + (slot.why ? " · " + slot.why : "");
      slotList.append(issue(words, slot.state === "ready" ? "info" : "warning"));
    });
    slots.append(slotList);
    list.append(slots);
    const host = el("li", "prompt-diagnostics-owner");
    host.append(el("strong", "", L("本机能力")), line(L("已具备") + "：" + (runtime.host.effective.join("、") || L("无"))));
    if (runtime.host.not_present.length) {
      const missing = el("ul", "prompt-diagnostics-issues");
      runtime.host.not_present.forEach((item) => missing.append(issue(item.capability + "：" + L(HOST[item.state] || item.state)
        + (runtime.host.requested.includes(item.capability) ? " · " + L("应用要求了它") : ""), runtime.host.requested.includes(item.capability) ? "warning" : "info")));
      host.append(missing);
    }
    list.append(host);
    const ledger = el("li", "prompt-diagnostics-owner");
    ledger.append(el("strong", "", L("没记下来的运行记录")));
    if (!runtime.ledger_failures.length) ledger.append(line(L("没有：重启后每一轮都能回放。")));
    else {
      const failures = el("ul", "prompt-diagnostics-issues");
      runtime.ledger_failures.forEach((entry) => failures.append(issue(entry.kind + " #" + entry.seq + (entry.code ? " · " + entry.code : "") + (entry.detail ? " · " + entry.detail : ""))));
      ledger.append(line(L("这些运行在重启后回放不出来。")), failures);
    }
    list.append(ledger);
    section.append(list);
    return section;
  };

  const roundItem = (round) => {
    const item = el("li", "prompt-diagnostics-owner");
    item.append(el("strong", "", (round.work_title || L("（已删除的工作）")) + " · " + time(round.started_at)),
      line(L(PHASE[round.phase] || round.phase) + (round.stop_reason ? " · " + round.stop_reason : "")),
      line(L("运行") + " ", code(round.run_id), " · " + L("会话") + " ", code(round.session_id || "—"), " · " + L("工作") + " ", code(round.work_id),
        round.project_id ? " · " + L("项目") + " " : "", round.project_id ? code(round.project_id) : ""));
    const frozen = round.frozen;
    if (frozen) {
      item.append(line(L("模型") + " ", code(frozen.model_id), " · " + L("角色") + " ", code(frozen.role.id + " v" + frozen.role.version), " · " + L("执行") + " " + frozen.execution
        + (frozen.character ? " · Character " + frozen.character.title + "（" + frozen.character.artifact_id + " v" + frozen.character.version + "）" : "")
        + (frozen.history === "digest" ? " · " + L("前文用摘要") : "") + (frozen.thinking ? " · " + L("思考") + " " + frozen.thinking : "")));
      if (frozen.prompts.length) item.append(line(L("提示词") + "：" + frozen.prompts.map((prompt) => prompt.prompt_id + " v" + prompt.version + "（" + L(LAYER[prompt.layer] || prompt.layer)
        + (prompt.user_revision !== undefined ? "，" + L("你的版本") + " #" + prompt.user_revision : "") + "）").join("、")));
    } else item.append(line(L("运行时里已读不到这一轮开跑时的记录。")));
    if (round.materials.length) item.append(line(L("资料") + "：" + round.materials.map((material) => material.title + "（" + L(MATERIAL[material.kind] || material.kind) + "，"
      + (material.explicit ? L("你加的") : L("页面带来的")) + (material.draft ? "，" + L("未保存的修改") : "")
      + (material.object ? "，" + material.object.kind + ":" + material.object.id + (material.object.version !== undefined && material.object.version !== null ? "@" + material.object.version : "") : "")
      + (material.capability ? "，" + material.capability.capability_id + " v" + material.capability.version : "") + (material.method ? "，" + material.method.method_id : "") + "）").join("、")));
    if (round.usage) item.append(line(L("用量") + "：" + L("输入") + " " + round.usage.input.toLocaleString() + " · " + L("输出") + " " + round.usage.output.toLocaleString()
      + (round.usage.cached_input ? " · " + L("缓存读取") + " " + round.usage.cached_input.toLocaleString() : "")));
    if (round.failures.length) {
      const failures = el("ul", "prompt-diagnostics-issues");
      // The runtime's summary often opens with the tool's name again: shown once.
      round.failures.forEach((failure) => failures.append(issue(failure.tool + (failure.target ? " · " + failure.target : "") + (failure.state === "unknown" ? " · " + L("结果未知") : "") + "："
        + (failure.summary.startsWith(failure.tool + " · ") ? failure.summary.slice(failure.tool.length + 3) : failure.summary))));
      item.append(failures);
    }
    return item;
  };

  const load = async () => {
    if (root.dataset.loaded) return;
    root.dataset.loaded = "1";
    try {
      const response = await fetch("/api/assistant/diagnostics");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || L("没有完成，请重试"));
      const rounds = el("section");
      rounds.append(el("h3", "prompt-diagnostics-heading", L("助理最近几轮")));
      if (!data.rounds.length) rounds.append(el("p", "settings-muted", L("最近 7 天没有助理的轮次。")));
      else { const list = el("ul", "prompt-diagnostics-list"); data.rounds.forEach((round) => list.append(roundItem(round))); rounds.append(list); }
      body.replaceChildren(runtimePart(data.runtime), rounds);
    } catch (failure) { delete root.dataset.loaded; body.replaceChildren(el("p", "settings-form-error", failure.message)); }
  };
  root.addEventListener("toggle", () => { if (root.open) load(); });
  if (location.hash === "#agent-diagnostics") { root.open = true; load(); }
};
globalThis.molisWorkBindAgentDiagnostics(document);
`;
