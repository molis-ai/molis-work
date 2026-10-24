/** The person's restrictions over the App's declared memory classes; never a permission grant. */
export function renderMemoryClassSettings(L: (text: string) => string): string {
  const field = (key: string, title: string, values: readonly (readonly [string, string])[]) =>
    `<label class="setting-copy"><span>${L(title)}</span><select class="mw-select" disabled data-memory-class="${key}" aria-label="${L(title)}">${values.map(([value, text]) => `<option value="${value}">${L(text)}</option>`).join("")}</select></label>`;
  return `<section class="settings-section" aria-labelledby="memory-classes-title" data-memory-classes>
    <h2 id="memory-classes-title">${L("按分类控制记忆")}</h2>
    <p class="settings-muted">${L("选择谁在什么场景下使用哪类记忆，再分别限制读取与自动形成。多条限制同时适用时，采用更严格的一条；总开关和原有权限仍然有效。")}</p>
    <form data-memory-class-form><fieldset class="mw-fieldset" disabled><legend class="mw-sr-only">${L("按分类控制记忆")}</legend>
      <div class="memory-toolbar">
        ${field("consumer", "使用方", [["agent", "Agent 工作"], ["assistant", "助理"], ["ui", "界面推荐"], ["plugin", "插件"], ["mcp", "外部 AI 客户端"]])}
        ${field("current_scene", "工作场景", [["coding", "Coding"], ["assistant", "助理"], ["common", "通用"]])}
        ${field("scene", "记忆场景", [["", "全部场景"], ["coding", "Coding"], ["assistant", "助理"], ["common", "通用"]])}
        ${field("kind", "类别", [["", "全部类别"], ["preference", "偏好"], ["convention", "约定"], ["fact", "背景事实"], ["experience", "经验"], ["habit", "习惯"], ["project-decision", "项目决策"]])}
        ${field("lifecycle", "保留时间", [["", "全部保留类型"], ["session", "会话内"], ["short-term", "短期"], ["long-term", "长期"]])}
      </div>
      <div class="memory-toolbar">
        ${field("read", "读取方式", [["inherit", "沿用原设置"], ["explicit-only", "仅主动查询"], ["off", "不读取"]])}
        ${field("form", "自动形成", [["inherit", "沿用原设置"], ["off", "不自动形成"]])}
        <button class="mw-btn mw-btn--primary mw-btn--sm" type="submit">${L("保存分类限制")}</button>
      </div>
    </fieldset></form>
    <p class="settings-muted">${L("不读取不会删除记忆；不自动形成仍保留本人明确保存与认可。仅主动查询不会自动放进任务上下文。")}</p>
    <p class="settings-muted">${L("两项都选“沿用原设置”并保存，可移除这一组分类限制。")}</p>
    <p class="settings-muted" data-memory-class-status role="status" aria-live="polite"></p>
    <p class="settings-form-error" data-memory-class-error role="alert" hidden></p>
    <ul class="memory-list" data-memory-class-list></ul>
  </section>`;
}

/** Bound by the existing page; read/save callbacks keep HTTP and preference ownership there. */
export const MEMORY_CLASS_SETTINGS_CLIENT_SCRIPT = String.raw`
(L, part, el, button, readPrefs, savePrefs) => {
  const section = part("classes"), form = section.querySelector("form"), fields = form.querySelector("fieldset");
  const status = part("class-status"), error = part("class-error"), list = part("class-list");
  const controls = Object.fromEntries([...form.querySelectorAll("select")].map(node => [node.dataset.memoryClass, node]));
  const keys = ["consumer", "current_scene", "scene", "kind", "lifecycle"];
  let saving = false, loaded = false;
  const rules = () => readPrefs()?.class_restrictions;
  const selector = () => Object.fromEntries(keys.filter(key => controls[key].value).map(key => [key, controls[key].value]));
  const same = (a, b) => keys.every(key => a[key] === b[key]);
  const value = (key, next) => { controls[key].value = next; controls[key].dispatchEvent(new Event("change", { bubbles: true })); };
  const text = (key, choice) => [...controls[key].options].find(option => option.value === (choice || ""))?.textContent || choice;
  const selectRule = () => {
    const current = controls.current_scene.value, scenes = controls.scene;
    for (const option of scenes.options) option.disabled = Boolean(option.value && option.value !== current && option.value !== "common");
    if (scenes.selectedOptions[0]?.disabled) value("scene", "");
    const rule = rules()?.find(row => same(row.selector, selector()));
    value("read", rule?.read || "inherit"); value("form", rule?.form || "inherit"); status.textContent = "";
  };
  for (const key of keys) controls[key].addEventListener("change", selectRule);
  const paint = () => {
    const rows = rules(); fields.disabled = saving || !rows; list.inert = saving; list.replaceChildren();
    for (const control of Object.values(controls)) control.disabled = fields.disabled;
    if (!rows) return;
    if (!loaded) { loaded = true; selectRule(); }
    if (!rows.length) list.append(el("li", "settings-muted", L("没有额外分类限制，沿用原设置。")));
    for (const row of rows) {
      const item = el("li", "memory-row"), copy = el("span", "memory-row-copy");
      copy.textContent = keys.map(key => text(key, row.selector[key])).join(" · ") + "：" + text("read", row.read) + " / " + text("form", row.form);
      const edit = button(L("修改"), null, L("修改") + "：" + copy.textContent);
      edit.addEventListener("click", () => { for (const key of keys) controls[key].value = row.selector[key] || ""; selectRule(); for (const key of keys) value(key, controls[key].value); controls.read.focus(); });
      item.append(copy, edit); list.append(item);
    }
  };
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (saving || !rules()) return;
    const chosen = selector(), read = controls.read.value, formation = controls.form.value;
    const next = rules().filter(row => !same(row.selector, chosen));
    if (read !== "inherit" || formation !== "inherit") next.push({ selector: chosen, read, form: formation });
    saving = true; error.hidden = true; status.textContent = L("正在保存…"); paint();
    try { await savePrefs(next); status.textContent = L("分类限制已保存"); }
    catch (failure) { molisWorkRequest.show(error, failure); error.hidden = false; status.textContent = L("尚未保存，请重试。"); }
    finally { saving = false; paint(); }
  });
  selectRule();
  return paint;
}`;
