/**
 * “Prompt 与 Character”: every prompt and role the Host registers — the system's, and each Plugin's — with the
 * person's edits. Editing changes the words a model reads from its next run on; it never changes what a role may do.
 */
export function renderPromptSettings({ L }: { L(text: string): string }): string {
  return `<section class="settings-document prompt-settings" aria-labelledby="settings-title" data-prompt-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("Prompt 与 Character")}</h1>
      <p>${L("系统和插件交给模型的全部说明文字，以及由它们组成的 Character（角色）。修改从下一轮开始生效，正在进行的一轮不受影响；每一轮的记录会写明用的是默认版还是你的版本。")}</p></div></header>
    <p class="prompt-settings-notice" role="note">${L("改这里的文字不会改变任何权限：能读写哪些目录、能调用哪些能力、哪些操作要你确认，都由系统在代码里执行，与文字写成什么无关。")}</p>
    <div class="prompt-settings-tools">
      <div class="mw-toggle-group settings-segmented" role="group" aria-label="${L("筛选")}">
        <button class="mw-toggle" type="button" data-prompt-filter="all" aria-pressed="true">${L("全部")}</button>
        <button class="mw-toggle" type="button" data-prompt-filter="edited" aria-pressed="false">${L("已修改")}</button>
        <button class="mw-toggle" type="button" data-prompt-filter="updated" aria-pressed="false">${L("默认已更新")}</button>
      </div>
      <input class="mw-input prompt-settings-search" type="search" data-prompt-search placeholder="${L("搜索名称、用途或正文")}" aria-label="${L("搜索 Prompt")}">
    </div>
    <div class="prompt-settings-body" data-prompt-body aria-live="polite"><p class="settings-muted mw-loading">${L("正在读取…")}</p></div>
    <details class="settings-section prompt-diagnostics" id="diagnostics" data-prompt-diagnostics>
      <summary><strong>${L("开发者诊断")}</strong><span class="settings-muted">${L("每个来源登记了什么，哪些没有生效、为什么；以及还没有登记的模型调用。")}</span></summary>
      <div data-prompt-diagnostics-body><p class="settings-muted mw-loading">${L("正在读取…")}</p></div>
    </details>
  </section>`;
}

/** Runs on the settings page only when the section is on show. No template interpolation inside. */
export const PROMPT_SETTINGS_CLIENT_SCRIPT = String.raw`
(() => {
  const root = document.querySelector("[data-prompt-settings]");
  if (!root) return;
  const L = globalThis.L || ((text) => text);
  const body = root.querySelector("[data-prompt-body]");
  const search = root.querySelector("[data-prompt-search]");
  let prompts = [], roles = [], filter = "all", open = null;
  // A Character is made of its prompts: “?role=” (from the Characters page) shows just the ones that make it up.
  let focusRole = new URLSearchParams(location.search).get("role");
  const focusedRole = () => focusRole ? roles.find((role) => role.key === focusRole) : undefined;
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const api = async (path, method, payload) => {
    const response = await fetch("/api/agent-definitions" + path, method === "POST" ? { method, headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(payload || {}) } : undefined);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || L("没有完成，请重试"));
    return data;
  };
  const toast = (text) => { const node = document.querySelector("[data-settings-toast]"); if (!node) return; node.textContent = text; node.classList.add("is-visible"); setTimeout(() => node.classList.remove("is-visible"), 2400); };
  const KIND = { agent: "角色组成", instruction: "模型调用指令" };
  const LAYER = { base: "产品约束", role: "角色", project: "项目", task: "任务" };
  const EXECUTION = { "read-only": "只读", "text-edit": "可改文字", "workspace-write": "可改文件、运行命令", operate: "可调用业务能力" };
  const sourceTitle = (source) => source.kind === "system" ? L("系统") + " · " + L(source.title) : L("插件") + " · " + L(source.title) + (source.plugin_version ? " " + source.plugin_version : "")
    + (source.origin === "generated" ? " · " + L("插件创作台生成") : "") + (source.state === "disabled" ? " · " + L("已停用，暂不会被调用") : "");
  const matches = (prompt) => {
    const role = focusedRole();
    if (role && !role.prompt_keys.includes(prompt.key)) return false;
    if (filter === "edited" && prompt.effective !== "user") return false;
    if (filter === "updated" && !prompt.default_updated) return false;
    const query = String(search.value || "").trim().toLowerCase();
    return !query || [prompt.title, prompt.purpose, prompt.prompt_id, prompt.body, prompt.used_by.join(" ")].some((text) => String(text).toLowerCase().includes(query));
  };
  const stateBadge = (prompt) => {
    const badge = el("span", "prompt-state prompt-state--" + (prompt.default_updated ? "updated" : prompt.effective));
    badge.textContent = prompt.default_updated ? L("你的版本 · 默认已更新") : prompt.effective === "user" ? L("你的版本") : L("默认");
    return badge;
  };
  const editor = (prompt) => {
    const box = el("div", "prompt-editor");
    const area = el("textarea", "mw-textarea prompt-editor-text"); area.value = prompt.body; area.rows = Math.min(24, Math.max(8, prompt.body.split("\n").length + 1));
    area.setAttribute("aria-label", L("编辑") + "：" + prompt.title); area.maxLength = 20000;
    const count = el("span", "settings-muted prompt-editor-count");
    const syncCount = () => { count.textContent = area.value.length + " / 20000"; };
    area.addEventListener("input", syncCount); syncCount();
    const actions = el("div", "prompt-editor-actions");
    const save = el("button", "mw-btn mw-btn--primary mw-btn--sm", L("保存为我的版本")); save.type = "button";
    const cancel = el("button", "mw-btn mw-btn--secondary mw-btn--sm", L("取消")); cancel.type = "button";
    const reset = el("button", "mw-btn mw-btn--ghost mw-btn--sm", L("恢复默认")); reset.type = "button"; reset.hidden = prompt.effective !== "user";
    const error = el("p", "settings-form-error"); error.setAttribute("role", "alert"); error.hidden = true;
    const run = async (button, work) => {
      button.disabled = true; error.hidden = true;
      try { const result = await work(); const index = prompts.findIndex((row) => row.key === result.prompt.key); if (index >= 0) prompts[index] = result.prompt; open = result.prompt.key; paint(); toast(L("已保存，下一轮开始生效")); }
      catch (failure) { error.textContent = failure.message; error.hidden = false; }
      finally { button.disabled = false; }
    };
    save.addEventListener("click", () => {
      if (!area.value.trim()) { error.textContent = L("Prompt 不能为空；要回到原来的文字请用“恢复默认”"); error.hidden = false; return; }
      run(save, () => api("/prompt?key=" + encodeURIComponent(prompt.key), "POST", { body: area.value, expected_revision: prompt.user ? prompt.user.revision : null }));
    });
    reset.addEventListener("click", () => run(reset, () => api("/prompt/reset?key=" + encodeURIComponent(prompt.key), "POST", { expected_revision: prompt.user ? prompt.user.revision : null })));
    cancel.addEventListener("click", () => { open = null; paint(); });
    actions.append(save, cancel, reset, count);
    box.append(area, actions, error);
    // A call that reads a fixed format back (JSON) breaks if the edit asks for text around it: say so where it is edited.
    if (/JSON|Schema|格式/.test(prompt.default_body)) box.insertBefore(el("p", "settings-muted prompt-editor-format", L("这段要求模型按固定格式输出，程序会读取这个格式：修改时保留格式要求，只调整内容；要加前缀等，请写明加在哪个字段里。")), actions);
    if (prompt.effective === "user") {
      // The shipped text stays readable beside the person's, so a newer default can be compared and taken over by hand.
      const shipped = el("details", "prompt-default");
      shipped.open = prompt.default_updated;
      shipped.append(el("summary", "", prompt.default_updated ? L("默认已更新到版本") + " " + prompt.default_version + " · " + L("查看新的默认") : L("查看默认文字")));
      shipped.append(el("pre", "prompt-default-text", prompt.default_body));
      box.append(shipped);
    }
    const history = el("details", "prompt-history");
    history.append(el("summary", "", L("修改记录")));
    history.addEventListener("toggle", async () => {
      if (!history.open || history.dataset.loaded) return;
      history.dataset.loaded = "1";
      try {
        const data = await api("/prompt?key=" + encodeURIComponent(prompt.key));
        const list = el("ul", "prompt-history-list");
        if (!data.history.length) list.append(el("li", "settings-muted", L("还没有修改过")));
        data.history.forEach((row) => list.append(el("li", "", "#" + row.revision + " · " + (row.action === "reset" ? L("恢复默认") : L("保存")) + " · " + new Date(row.at).toLocaleString())));
        if (data.uses.length) list.append(el("li", "settings-muted", L("最近一次使用") + "：" + new Date(data.uses[0].at).toLocaleString() + " · " + (data.uses[0].user_revision ? L("你的版本") + " #" + data.uses[0].user_revision : L("默认"))));
        history.append(list);
      } catch (failure) { history.append(el("p", "settings-form-error", failure.message)); }
    });
    box.append(history);
    return box;
  };
  const promptRow = (prompt) => {
    const row = el("li", "prompt-row");
    row.dataset.key = prompt.key;
    const head = el("div", "prompt-row-head");
    const copy = el("div", "prompt-row-copy");
    copy.append(el("strong", "", L(prompt.title)), el("span", "settings-muted", L(prompt.purpose)));
    const meta = el("div", "prompt-row-meta");
    meta.append(el("span", "prompt-tag", L(prompt.kind === "agent" && prompt.layer ? LAYER[prompt.layer] || prompt.layer : KIND[prompt.kind] || prompt.kind)),
      el("span", "prompt-tag", L("版本") + " " + prompt.default_version), stateBadge(prompt));
    const edit = el("button", "mw-btn mw-btn--secondary mw-btn--sm", open === prompt.key ? L("收起") : L("查看与修改")); edit.type = "button";
    edit.setAttribute("aria-expanded", String(open === prompt.key));
    edit.addEventListener("click", () => { open = open === prompt.key ? null : prompt.key; paint(); });
    head.append(copy, meta, edit);
    row.append(head);
    if (open === prompt.key) row.append(editor(prompt));
    return row;
  };
  function paint() {
    const owners = new Map();
    prompts.filter(matches).forEach((prompt) => { if (!owners.has(prompt.owner_id)) owners.set(prompt.owner_id, { source: prompt.source, prompts: [] }); owners.get(prompt.owner_id).prompts.push(prompt); });
    const focused = document.activeElement && root.contains(document.activeElement) ? document.activeElement.closest("[data-key]")?.dataset.key : null;
    body.replaceChildren();
    const role = focusedRole();
    if (role) {
      const banner = el("div", "prompt-role-focus");
      const copy = el("div", "prompt-role-focus-copy");
      copy.append(el("strong", "", L(role.name)), el("p", "", L("这个 Character 由下面这些 Prompt 组成，按顺序交给模型；改动从它的下一轮开始生效，可随时恢复默认。")));
      banner.append(copy);
      const all = el("button", "mw-btn mw-btn--ghost mw-btn--sm", L("显示全部")); all.type = "button";
      all.addEventListener("click", () => { focusRole = null; const next = new URL(location.href); next.searchParams.delete("role"); history.replaceState(history.state, "", next); paint(); });
      banner.append(all);
      body.append(banner);
    }
    if (!owners.size) { body.append(el("p", "settings-muted", filter === "all" ? L("没有找到匹配的 Prompt") : L("没有符合条件的 Prompt"))); return; }
    owners.forEach((group, ownerId) => {
      const section = el("section", "settings-section prompt-group");
      section.append(el("h2", "prompt-group-title", sourceTitle(group.source)));
      const ownRoles = roles.filter((role) => role.owner_id === ownerId);
      if (ownRoles.length) {
        const list = el("ul", "prompt-roles");
        ownRoles.forEach((role) => {
          const item = el("li");
          const button = el("button", "prompt-role"); button.type = "button";
          button.setAttribute("aria-pressed", String(focusRole === role.key));
          button.title = L("只看组成这个 Character 的 Prompt");
          button.append(el("strong", "", L(role.name) + (role.subagent ? " · " + L("子任务") : "")), el("span", "settings-muted", L(EXECUTION[role.execution] || role.execution) + (role.edited ? " · " + L("含你的修改") : "")));
          button.addEventListener("click", () => { focusRole = focusRole === role.key ? null : role.key; paint(); });
          item.append(button);
          list.append(item);
        });
        section.append(el("p", "prompt-roles-label", L("Character（角色）")), list);
      }
      const list = el("ul", "prompt-list");
      group.prompts.forEach((prompt) => list.append(promptRow(prompt)));
      section.append(list);
      body.append(section);
    });
    if (focused) root.querySelector('[data-key="' + CSS.escape(focused) + '"] button')?.focus();
  }
  // Developer diagnostics: read when opened, so the page itself stays one request per list.
  const diagnostics = root.querySelector("[data-prompt-diagnostics]");
  const diagnosticsBody = root.querySelector("[data-prompt-diagnostics-body]");
  const loadDiagnostics = async () => {
    if (diagnostics.dataset.loaded) return;
    diagnostics.dataset.loaded = "1";
    try {
      const data = await api("/diagnostics");
      const list = el("ul", "prompt-diagnostics-list");
      data.owners.forEach((owner) => {
        const item = el("li", "prompt-diagnostics-owner");
        const counts = [owner.prompts ? L("角色组成") + " " + owner.prompts : "", owner.instructions ? L("模型调用指令") + " " + owner.instructions : "",
          owner.roles ? L("Character") + " " + owner.roles : "", owner.edited ? L("你改过") + " " + owner.edited : ""].filter(Boolean).join(" · ");
        item.append(el("strong", "", sourceTitle(owner.source)), el("span", "settings-muted", counts || L("没有登记任何 Prompt")));
        if (owner.issues.length) {
          const issues = el("ul", "prompt-diagnostics-issues");
          owner.issues.forEach((issue) => issues.append(el("li", "prompt-diagnostics-issue prompt-diagnostics-issue--" + issue.level, L(issue.text))));
          item.append(issues);
        }
        list.append(item);
      });
      diagnosticsBody.replaceChildren(list);
      if (data.unregistered.length) {
        diagnosticsBody.append(el("h3", "prompt-diagnostics-heading", L("还没有登记的模型调用")));
        const rest = el("ul", "prompt-diagnostics-list");
        data.unregistered.forEach((call) => { const item = el("li", "prompt-diagnostics-owner"); item.append(el("strong", "", L(call.title)), el("span", "settings-muted", L(call.reason))); rest.append(item); });
        diagnosticsBody.append(rest);
      }
    } catch (failure) { delete diagnostics.dataset.loaded; diagnosticsBody.replaceChildren(el("p", "settings-form-error", failure.message)); }
  };
  diagnostics.addEventListener("toggle", () => { if (diagnostics.open) loadDiagnostics(); });
  if (location.hash === "#diagnostics") { diagnostics.open = true; loadDiagnostics(); }
  root.querySelectorAll("[data-prompt-filter]").forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.promptFilter;
    root.querySelectorAll("[data-prompt-filter]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
    paint();
  }));
  search.addEventListener("input", paint);
  Promise.all([api("/prompts"), api("/roles")]).then(([p, r]) => {
    prompts = p.prompts; roles = r.roles;
    // Arriving for one Character opens the prompt that is its own (the role layer), the one people mean to change.
    const role = focusedRole();
    if (role) open = prompts.find((prompt) => role.prompt_keys.includes(prompt.key) && prompt.layer === "role")?.key ?? role.prompt_keys[0] ?? null;
    paint();
  })
    .catch((failure) => { body.replaceChildren(el("p", "settings-form-error", failure.message)); });
})();
`;
