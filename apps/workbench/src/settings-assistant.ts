/**
 * “助理”: what the Assistant may use (its own grants, separate from Coding's and external agents'), and what each
 * plugin contributes for it — with the exact gaps a plugin's developer can close.
 */
export function renderAssistantSettings({ L, projectId }: { L(text: string): string; projectId: string | null }): string {
  return `<section class="settings-document assistant-settings" aria-labelledby="settings-title" data-assistant-settings data-project="${projectId ? projectId.replace(/[^a-zA-Z0-9_.:-]/g, "") : ""}">
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("助理")}</h1>
      <p>${L("助理能用哪些能力，以及每个插件为助理提供了什么。关掉的能力只对助理生效，不影响 Coding、外部 Agent 或你自己在页面里操作。")}</p></div></header>
    <section class="settings-section assistant-rules" aria-labelledby="assistant-rules-title" data-assistant-rules>
      <h2 id="assistant-rules-title">${L("提醒规则")}</h2>
      <p class="settings-muted">${L("助理什么时候可以提醒你。规则按写下的条件执行，不靠猜；暂时不提醒的事会留着，条件结束后再出现，过期的不补发。")}</p>
      <div data-assistant-rules-list><p class="settings-muted">${L("正在读取…")}</p></div>
      <form class="assistant-rule-form" data-assistant-rule-quiet>
        <strong>${L("在这些地方不提醒")}</strong>
        <div class="assistant-rule-surfaces" data-assistant-rule-surfaces></div>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="failed" checked> ${L("这一轮失败仍然提醒")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="needs-decision"> ${L("需要我决定时仍然提醒")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="reminder" checked> ${L("我自己设的提醒到时间仍然提醒")}</label>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="submit">${L("添加规则")}</button>
      </form>
      <form class="assistant-rule-form" data-assistant-rule-pause>
        <strong>${L("暂停提醒")}</strong>
        <select class="mw-input" data-assistant-rule-duration aria-label="${L("暂停多久")}">
          <option value="30">${L("30 分钟")}</option><option value="60" selected>${L("1 小时")}</option><option value="day">${L("到今天结束")}</option>
        </select>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="failed" checked> ${L("这一轮失败仍然提醒")}</label>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="submit">${L("暂停")}</button>
      </form>
      <p class="settings-form-error" data-assistant-rules-error role="alert" hidden></p>
    </section>
    <section class="settings-section assistant-usage" aria-labelledby="assistant-usage-title" data-assistant-usage>
      <h2 id="assistant-usage-title">${L("用量与上限")}</h2>
      <p class="settings-muted" data-assistant-usage-today>${L("正在读取…")}</p>
      <form class="assistant-rule-form" data-assistant-budget>
        <label class="settings-field"><span>${L("助理每天最多用（tokens，输入加输出；留空不限）")}</span>
          <input class="mw-input" type="number" min="1000" step="1000" inputmode="numeric" data-assistant-budget-input aria-label="${L("每日上限")}"></label>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="submit">${L("保存")}</button>
      </form>
      <p class="settings-muted">${L("到了上限，新的一轮不会开始，已做的都保留；定时安排到点时也会说明没有开始。只统计助理自己的轮次，按运行时报告的用量。")}</p>
      <p class="settings-form-error" data-assistant-budget-error role="alert" hidden></p>
    </section>
    <section class="settings-section assistant-memory" aria-labelledby="assistant-memory-title" data-assistant-memory>
      <h2 id="assistant-memory-title">${L("记忆与偏好")}</h2>
      <p class="settings-muted">${L("助理只记你明确要它记住的（例如“以后回答都用要点列表”），或你认可的建议；不会从你的一次选择或修改里自己学。个人的在你所有工作里用；项目的只在那个项目里用。停用是保留但暂不使用；删除后不会再被想起。")}</p>
      <p class="settings-muted">${L("这些设置对所有角色和委托出去的子任务同样生效，换角色不会绕过。主动提醒和新资料提示从不使用记忆，只在你让助理做事时才用。")}</p>
      <div class="assistant-memory-prefs">
        <label class="settings-check"><input type="checkbox" data-assistant-memory-pref="form"> ${L("允许记住我明确要求记住的事")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-memory-pref="use_personal"> ${L("在工作里使用个人记忆")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-memory-pref="use_project"> ${L("在项目的工作里使用这个项目的记忆")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-memory-pref="learn_personal"> ${L("从工作里提出值得记住的个人偏好或经验（等我认可才生效）")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-memory-pref="learn_project"> ${L("从项目的工作里提出这个项目的约定或经验（等我认可才生效）")}</label>
      </div>
      <div data-assistant-memory-candidates hidden></div>
      <div data-assistant-memory-list><p class="settings-muted">${L("正在读取…")}</p></div>
      <p class="settings-form-error" data-assistant-memory-error role="alert" hidden></p>
    </section>
    <p class="prompt-settings-notice" role="note">${L("读取类能力直接使用；修改类每次执行前都会请你确认准确参数；不可撤回的操作每次单独确认。")}</p>
    <div class="prompt-settings-tools">
      <div class="mw-toggle-group settings-segmented" role="group" aria-label="${L("范围")}" data-assistant-scope-group>
        <button class="mw-toggle" type="button" data-assistant-scope="project" aria-pressed="true">${L("当前项目")}</button>
        <button class="mw-toggle" type="button" data-assistant-scope="personal" aria-pressed="false">${L("个人")}</button>
      </div>
      <input class="mw-input prompt-settings-search" type="search" data-assistant-capability-search placeholder="${L("搜索能力或插件")}" aria-label="${L("搜索能力")}">
    </div>
    <div class="prompt-settings-body" data-assistant-capabilities aria-live="polite"><p class="settings-muted mw-loading">${L("正在读取…")}</p></div>
    <details class="settings-section prompt-diagnostics" id="contributions" data-assistant-contributions>
      <summary><strong>${L("插件接入诊断")}</strong><span class="settings-muted">${L("每个插件为助理提供了什么：能否读回它的对象、改动能否关联回工作、能力是否写清用途；缺什么、为什么。")}</span></summary>
      <div data-assistant-contributions-body><p class="settings-muted mw-loading">${L("正在读取…")}</p></div>
    </details>
  </section>`;
}

/** Runs on the settings page only when the section is on show. No template interpolation inside. */
export const ASSISTANT_SETTINGS_CLIENT_SCRIPT = String.raw`
(() => {
  const root = document.querySelector("[data-assistant-settings]");
  if (!root) return;
  const L = globalThis.L || ((text) => text);
  const project = root.dataset.project || "";
  const body = root.querySelector("[data-assistant-capabilities]");
  const search = root.querySelector("[data-assistant-capability-search]");
  let scope = project ? "project" : "personal", rows = [];
  if (!project) { const group = root.querySelector("[data-assistant-scope-group]"); if (group) group.hidden = true; }
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  // The Assistant's routes answer for the project whose path they are under; the Home's own, for personal work.
  const base = () => (scope === "project" && project ? "/projects/" + encodeURIComponent(project) : "") + "/api/assistant";
  const api = async (path, method, payload) => {
    const response = await fetch(base() + path, method === "POST" ? { method, headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(payload || {}) } : undefined);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || L("没有完成，请重试"));
    return data;
  };
  const EFFECT = { read: "读取", write: "修改", irreversible: "不可撤回" };
  function paint() {
    const query = String(search.value || "").trim().toLowerCase();
    const shown = rows.filter((row) => !query || [row.title, row.provider, row.description, row.capability_id].some((text) => String(text || "").toLowerCase().includes(query)));
    body.replaceChildren();
    if (!shown.length) { body.append(el("p", "settings-muted", rows.length ? L("没有匹配的能力") : L("这里还没有对助理开放的能力"))); return; }
    const groups = new Map();
    shown.forEach((row) => { if (!groups.has(row.provider)) groups.set(row.provider, []); groups.get(row.provider).push(row); });
    groups.forEach((items, provider) => {
      const section = el("section", "settings-section prompt-group");
      const off = items.filter((row) => !row.enabled).length;
      section.append(el("h2", "prompt-group-title", L(provider) + (off ? " · " + L("已关闭") + " " + off : "")));
      const list = el("ul", "prompt-list");
      items.forEach((row) => {
        const item = el("li", "prompt-row assistant-capability");
        const head = el("label", "prompt-row-head");
        const copy = el("div", "prompt-row-copy");
        copy.append(el("strong", "", L(row.title)), el("span", "settings-muted", L(row.description || "")));
        const meta = el("div", "prompt-row-meta");
        meta.append(el("span", "prompt-tag", L(EFFECT[row.effect] || row.effect)));
        const control = el("span", "mw-switch"), toggle = el("input"); toggle.type = "checkbox"; toggle.setAttribute("role", "switch"); toggle.checked = row.enabled;
        const track = el("span", "mw-switch__track"); track.setAttribute("aria-hidden", "true"); control.append(toggle, track);
        toggle.setAttribute("aria-label", (row.enabled ? L("关闭") : L("打开")) + "：" + row.title);
        toggle.addEventListener("change", async () => {
          toggle.disabled = true;
          try { await api("/capabilities", "POST", { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, enabled: toggle.checked }); row.enabled = toggle.checked; paint(); }
          catch (failure) { toggle.checked = row.enabled; toggle.disabled = false; alert(failure.message); }
        });
        head.append(copy, meta, control);
        item.append(head);
        // A change that can be undone runs when asked without a confirmation; the person may want it confirmed each time.
        if (row.reversible && row.enabled) {
          const mode = el("label", "settings-muted assistant-capability-mode"), box = el("input"); box.type = "checkbox"; box.checked = Boolean(row.confirm_always);
          mode.append(box, document.createTextNode(" " + L("每次执行前都请我确认（它可以撤销，默认在你明确要求时直接执行）")));
          box.addEventListener("change", async () => {
            box.disabled = true;
            try { await api("/capabilities", "POST", { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, confirm_always: box.checked }); row.confirm_always = box.checked; }
            catch (failure) { box.checked = Boolean(row.confirm_always); alert(failure.message); }
            finally { box.disabled = false; }
          });
          item.append(mode);
        }
        list.append(item);
      });
      section.append(list);
      body.append(section);
    });
  }
  const load = async () => {
    body.replaceChildren(el("p", "settings-muted", L("正在读取…")));
    try { rows = (await api("/capabilities")).capabilities; paint(); }
    catch (failure) { body.replaceChildren(el("p", "settings-form-error", failure.message)); }
  };
  root.querySelectorAll("[data-assistant-scope]").forEach((button) => button.addEventListener("click", () => {
    scope = button.dataset.assistantScope;
    root.querySelectorAll("[data-assistant-scope]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
    contributions.dataset.loaded = ""; if (contributions.open) loadContributions();
    load();
  }));
  search.addEventListener("input", paint);
  const contributions = root.querySelector("[data-assistant-contributions]");
  const contributionsBody = root.querySelector("[data-assistant-contributions-body]");
  const AREA = { context: "对象上下文", results: "结果关联", capabilities: "能力说明" };
  const loadContributions = async () => {
    if (contributions.dataset.loaded) return;
    contributions.dataset.loaded = "1";
    try {
      const data = await api("/contributions");
      const list = el("ul", "prompt-diagnostics-list");
      data.contributions.forEach((item) => {
        const row = el("li", "prompt-diagnostics-owner");
        const facts = [L("能力") + " " + item.actions + "（" + L("读取") + " " + item.reads + " · " + L("修改") + " " + item.changes + "）",
          item.readable_kinds.length ? L("可读回对象") + "：" + item.readable_kinds.join("、") : L("不能读回对象"),
          item.changes ? L("改动可关联") + " " + item.linked_changes + "/" + item.changes : "", item.searchable ? L("参与搜索") : ""].filter(Boolean).join(" · ");
        row.append(el("strong", "", L(item.title)), el("span", "settings-muted", facts));
        if (item.gaps.length) {
          const gaps = el("ul", "prompt-diagnostics-issues");
          item.gaps.forEach((gap) => gaps.append(el("li", "prompt-diagnostics-issue prompt-diagnostics-issue--warning", L(AREA[gap.area] || gap.area) + "：" + gap.text)));
          row.append(gaps);
        }
        list.append(row);
      });
      contributionsBody.replaceChildren(data.contributions.length ? list : el("p", "settings-muted", L("这里还没有向助理开放能力的插件")));
    } catch (failure) { delete contributions.dataset.loaded; contributionsBody.replaceChildren(el("p", "settings-form-error", failure.message)); }
  };
  contributions.addEventListener("toggle", () => { if (contributions.open) loadContributions(); });
  // Attention rules belong to the person, not to a project: always the Home's own route.
  const rulesApi = async (path, payload) => {
    const response = await fetch("/api/assistant" + path, payload ? { method: "POST", headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(payload) } : undefined);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || L("没有完成，请重试"));
    return data;
  };
  const SURFACES = [["pages", "Pages"], ["coding", "Coding"], ["goals", "Goals"], ["jelly", "Jelly"], ["cognia", "Cognia"], ["dataset", "Dataset"], ["form", "Forms"], ["workflows", "工作流程"], ["lingguang", "灵光"], ["home", "项目首页"]];
  const surfaceName = (id) => (SURFACES.find((row) => row[0] === id) || [id, id])[1];
  const KIND = { failed: "失败", "needs-decision": "需要决定", completed: "做完", result: "交回结果", material: "相关新资料", reminder: "你设的提醒" };
  const rulesList = root.querySelector("[data-assistant-rules-list]");
  const rulesError = root.querySelector("[data-assistant-rules-error]");
  const surfacesBox = root.querySelector("[data-assistant-rule-surfaces]");
  SURFACES.forEach(([id, name]) => { const label = el("label", "settings-check"); const box = el("input"); box.type = "checkbox"; box.value = id; box.dataset.assistantRuleSurface = ""; label.append(box, document.createTextNode(" " + L(name))); surfacesBox.append(label); });
  const describe = (rule) => (rule.kind === "pause" ? L("暂停提醒") : (rule.surfaces.length ? L("在") + " " + rule.surfaces.map((id) => L(surfaceName(id))).join("、") + " " + L("不提醒") : L("任何地方都不提醒")))
    + (rule.except.length ? "；" + rule.except.map((kind) => L(KIND[kind] || kind)).join("、") + L("仍提醒") : "")
    + (rule.until ? "；" + L("到") + " " + new Date(rule.until).toLocaleString() : "");
  const paintRules = (rules) => {
    rulesList.replaceChildren();
    if (!rules.length) { rulesList.append(el("p", "settings-muted", L("还没有规则：出了需要你看的事，助理会在底栏提示。"))); return; }
    const list = el("ul", "prompt-list");
    rules.forEach((rule) => {
      const item = el("li", "prompt-row");
      const head = el("div", "prompt-row-head");
      const copy = el("div", "prompt-row-copy");
      const expired = rule.until && new Date(rule.until) <= new Date();
      copy.append(el("strong", "", rule.label), el("span", "settings-muted", describe(rule) + (expired ? " · " + L("已到期") : "")));
      const control = el("span", "mw-switch"), toggle = el("input"); toggle.type = "checkbox"; toggle.setAttribute("role", "switch"); toggle.checked = rule.enabled;
      const track = el("span", "mw-switch__track"); track.setAttribute("aria-hidden", "true"); control.append(toggle, track);
      toggle.setAttribute("aria-label", L("启用") + "：" + rule.label);
      toggle.addEventListener("change", () => run(() => rulesApi("/rules", { rule_id: rule.rule_id, rule: Object.assign({}, rule, { enabled: toggle.checked }) })));
      const remove = el("button", "mw-btn mw-btn--ghost mw-btn--sm", L("删除")); remove.type = "button";
      remove.addEventListener("click", () => run(() => rulesApi("/rules/remove", { rule_id: rule.rule_id })));
      head.append(copy, control, remove);
      item.append(head); list.append(item);
    });
    rulesList.append(list);
  };
  const run = async (work) => {
    rulesError.hidden = true;
    try { paintRules((await work()).rules); } catch (failure) { rulesError.textContent = failure.message; rulesError.hidden = false; }
  };
  const exceptOf = (form) => [...form.querySelectorAll("[data-assistant-rule-except]")].filter((box) => box.checked).map((box) => box.dataset.assistantRuleExcept);
  root.querySelector("[data-assistant-rule-quiet]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget, surfaces = [...form.querySelectorAll("[data-assistant-rule-surface]")].filter((box) => box.checked).map((box) => box.value);
    const except = exceptOf(form);
    const label = (surfaces.length ? L("在") + " " + surfaces.map((id) => L(surfaceName(id))).join("、") + " " + L("时不提醒") : L("任何地方都不提醒")) + (except.length ? "，" + except.map((kind) => L(KIND[kind])).join("、") + L("除外") : "");
    run(() => rulesApi("/rules", { rule: { kind: "quiet", surfaces, except, label } }));
  });
  root.querySelector("[data-assistant-rule-pause]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget, choice = form.querySelector("[data-assistant-rule-duration]").value;
    const until = choice === "day" ? (() => { const end = new Date(); end.setHours(23, 59, 0, 0); return end; })() : new Date(Date.now() + Number(choice) * 60000);
    const except = exceptOf(form);
    run(() => rulesApi("/rules", { rule: { kind: "pause", surfaces: [], except, until: until.toISOString(), label: L("暂停提醒到") + " " + until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } }));
  });
  run(() => rulesApi("/rules"));
  // Memories: personal ones live with the person; a project's are read and changed under that project's own route.
  const memoryBox = root.querySelector("[data-assistant-memory-list]");
  const memoryError = root.querySelector("[data-assistant-memory-error]");
  const memoryApi = async (payload, path) => {
    const url = (project ? "/projects/" + encodeURIComponent(project) : "") + "/api/assistant" + (path || "/memories");
    const response = await fetch(url, payload ? { method: "POST", headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(payload) } : undefined);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || L("没有完成，请重试"));
    return data;
  };
  const paintMemories = (memories) => {
    memoryBox.replaceChildren();
    if (!memories.length) { memoryBox.append(el("p", "settings-muted", L("还没有记住任何事：在对话里说“以后……”或“记住……”，助理会记下并告诉你在哪里生效。"))); return; }
    const list = el("ul", "prompt-list");
    memories.forEach((memory) => {
      const item = el("li", "prompt-row" + (memory.disabled ? " is-disabled" : ""));
      const head = el("div", "prompt-row-head"), copy = el("div", "prompt-row-copy");
      const text = el("strong", "", memory.text);
      copy.append(text, el("span", "settings-muted", L(memory.scope === "personal" ? "个人" : memory.scope === "character" ? "角色" : "本项目") + " · " + memory.origin + (memory.disabled ? " · " + L("已停用") : "")));
      const edit = el("button", "mw-btn mw-btn--ghost mw-btn--sm", L("修改")); edit.type = "button";
      edit.addEventListener("click", () => {
        const next = window.prompt(L("修改这条记忆"), memory.text);
        if (next !== null && next.trim() && next.trim() !== memory.text) runMemory(() => memoryApi({ memory_id: memory.memory_id, action: "update", text: next.trim() }));
      });
      edit.setAttribute("aria-label", L("修改") + "：" + memory.text);
      const toggle = el("button", "mw-btn mw-btn--ghost mw-btn--sm", L(memory.disabled ? "启用" : "停用")); toggle.type = "button";
      toggle.setAttribute("aria-label", L(memory.disabled ? "启用" : "停用") + "：" + memory.text);
      toggle.addEventListener("click", () => runMemory(() => memoryApi({ memory_id: memory.memory_id, action: memory.disabled ? "enable" : "disable" })));
      const remove = el("button", "mw-btn mw-btn--ghost mw-btn--sm", L("删除")); remove.type = "button";
      remove.setAttribute("aria-label", L("删除") + "：" + memory.text);
      remove.addEventListener("click", () => { if (window.confirm(L("删除后助理不会再想起这条。确定删除？"))) runMemory(() => memoryApi({ memory_id: memory.memory_id, action: "remove" })); });
      const actions = el("span", "prompt-row-meta"); actions.append(edit, toggle, remove);
      head.append(copy, actions); item.append(head); list.append(item);
    });
    memoryBox.append(list);
  };
  const paintPrefs = (prefs) => root.querySelectorAll("[data-assistant-memory-pref]").forEach((box) => { box.checked = Boolean(prefs[box.dataset.assistantMemoryPref]); });
  const runMemory = async (work) => {
    memoryError.hidden = true;
    try { const data = await work(); if (data.memories) paintMemories(data.memories); if (data.prefs) paintPrefs(data.prefs); }
    catch (failure) { memoryError.textContent = failure.message; memoryError.hidden = false; }
  };
  root.querySelectorAll("[data-assistant-memory-pref]").forEach((box) => box.addEventListener("change", () => {
    const prefs = {}; root.querySelectorAll("[data-assistant-memory-pref]").forEach((one) => { prefs[one.dataset.assistantMemoryPref] = one.checked; });
    runMemory(() => memoryApi(prefs, "/memory-prefs"));
  }));
  runMemory(() => memoryApi());
  // Suggestions to keep, from work: each waits for the person, and takes effect only when they keep it.
  const candidateBox = root.querySelector("[data-assistant-memory-candidates]");
  const candidateApi = async (path, payload) => {
    const response = await fetch("/api/assistant/memory-candidates" + (path || ""), payload ? { method: "POST", headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(payload) } : undefined);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || L("没有完成，请重试"));
    return data;
  };
  const paintCandidates = (candidates) => {
    candidateBox.replaceChildren();
    candidateBox.hidden = !candidates.length;
    if (!candidates.length) return;
    candidateBox.append(el("h3", "", L("等你认可的建议")));
    const list = el("ul", "prompt-list");
    candidates.forEach((candidate) => {
      const item = el("li", "prompt-row"), head = el("div", "prompt-row-head"), copy = el("div", "prompt-row-copy");
      copy.append(el("strong", "", candidate.text), el("span", "settings-muted", L(candidate.scope === "personal" ? "个人" : candidate.scope === "character" ? "角色" : "项目") + " · " + L("适用") + "：" + candidate.applies + " · " + L("依据") + "：" + candidate.why + " · " + L("来自工作") + "「" + candidate.work_title + "」"));
      const keep = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("记住")); keep.type = "button";
      keep.setAttribute("aria-label", L("记住") + "：" + candidate.text);
      const drop = el("button", "mw-btn mw-btn--ghost mw-btn--sm", L("不用")); drop.type = "button";
      drop.setAttribute("aria-label", L("不用") + "：" + candidate.text);
      const settle = async (path) => {
        keep.disabled = drop.disabled = true; memoryError.hidden = true;
        try { await candidateApi("/" + encodeURIComponent(candidate.candidate_id) + path, {}); await loadCandidates(); await runMemory(() => memoryApi()); }
        catch (failure) { keep.disabled = drop.disabled = false; memoryError.textContent = failure.message; memoryError.hidden = false; }
      };
      keep.addEventListener("click", () => settle("/accept"));
      drop.addEventListener("click", () => settle("/discard"));
      const actions = el("span", "prompt-row-meta"); actions.append(keep, drop);
      head.append(copy, actions); item.append(head); list.append(item);
    });
    candidateBox.append(list);
  };
  const loadCandidates = async () => { try { paintCandidates((await candidateApi()).candidates || []); } catch { /* the list shows again on the next visit */ } };
  void loadCandidates();
  // Usage and the daily cap belong to the person: the Home's own route.
  const usageLine = root.querySelector("[data-assistant-usage-today]");
  const budgetForm = root.querySelector("[data-assistant-budget]");
  const budgetInput = root.querySelector("[data-assistant-budget-input]");
  const budgetError = root.querySelector("[data-assistant-budget-error]");
  const paintUsage = (usage) => {
    const used = usage.today.input + usage.today.output;
    usageLine.textContent = L("今天助理用了") + " " + used.toLocaleString() + " tokens（" + L("输入") + " " + usage.today.input.toLocaleString() + "，" + L("输出") + " " + usage.today.output.toLocaleString()
      + (usage.today.cached_input ? "，" + L("缓存读取") + " " + usage.today.cached_input.toLocaleString() : "") + "，" + usage.today.rounds + " " + L("轮") + "）"
      + (usage.daily_tokens ? " · " + L("上限") + " " + usage.daily_tokens.toLocaleString() : " · " + L("不设上限"));
    if (document.activeElement !== budgetInput) budgetInput.value = usage.daily_tokens ? String(usage.daily_tokens) : "";
  };
  const usageApi = async (payload) => {
    const response = await fetch("/api/assistant" + (payload ? "/budget" : "/usage"), payload ? { method: "POST", headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(payload) } : undefined);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || L("没有完成，请重试"));
    return data;
  };
  const runUsage = async (work) => { budgetError.hidden = true; try { paintUsage(await work()); } catch (failure) { budgetError.textContent = failure.message; budgetError.hidden = false; } };
  budgetForm.addEventListener("submit", (event) => { event.preventDefault(); const raw = String(budgetInput.value || "").trim(); runUsage(() => usageApi({ daily_tokens: raw ? Number(raw) : null })); });
  runUsage(() => usageApi());
  if (location.hash === "#contributions") { contributions.open = true; loadContributions(); }
  load();
})();
`;
