import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/** The person's restrictions over the App's declared memory classes; never a permission grant. */
export function renderMemoryClassSettings(): string {
  const field = (key: string, title: string, values: readonly (readonly [string, string])[]) =>
    `<label class="setting-copy"><span>${uiText(title)}</span><select class="mw-select" disabled data-memory-class="${key}" aria-label="${uiText(title)}">${values.map(([value, text]) => `<option value="${value}">${uiText(text)}</option>`).join("")}</select></label>`;
  return `<section class="settings-section" aria-labelledby="memory-classes-title" data-memory-classes>
    <h2 id="memory-classes-title">${uiText("workbench.settings-memory-classes.control-memory-class")}</h2>
    <p class="settings-muted">${uiText("workbench.settings-memory-classes.choose-who-uses-which-memories-each-work-scene")}</p>
    <form data-memory-class-form><fieldset class="mw-fieldset" disabled><legend class="mw-sr-only">${uiText("workbench.settings-memory-classes.control-memory-class")}</legend>
      <div class="memory-toolbar">
        ${field("consumer", "workbench.settings-memory-classes.consumer", [["agent", "workbench.settings-memory.agent-work"], ["assistant", "workbench.settings-memory.assistant"], ["ui", "workbench.settings-memory.interface-suggestions"], ["plugin", "workbench.settings-memory.plugins"], ["mcp", "workbench.settings-memory.external-ai-clients"]])}
        ${field("current_scene", "workbench.settings-memory-classes.work-scene", [["coding", "workbench.settings-memory.coding"], ["assistant", "workbench.settings-memory.assistant"], ["common", "workbench.settings-memory-classes.common"]])}
        ${field("scene", "workbench.settings-memory-classes.memory-scene", [["", "workbench.settings-memory-classes.all-scenes"], ["coding", "workbench.settings-memory.coding"], ["assistant", "workbench.settings-memory.assistant"], ["common", "workbench.settings-memory-classes.common"]])}
        ${field("kind", "workbench.settings-memory.kind", [["", "workbench.settings-memory.all-kinds"], ["preference", "workbench.settings-memory.preference"], ["convention", "workbench.settings-memory.convention"], ["fact", "workbench.settings-memory.background-fact"], ["experience", "workbench.settings-memory.lesson"], ["habit", "workbench.settings-memory-classes.habit"], ["project-decision", "workbench.settings-memory-classes.project-decision"]])}
        ${field("lifecycle", "workbench.settings-memory-classes.retention", [["", "workbench.settings-memory-classes.all-retention-types"], ["session", "workbench.settings-memory-classes.within-session"], ["short-term", "workbench.settings-memory-classes.short-term"], ["long-term", "workbench.settings-memory-classes.long-term"]])}
      </div>
      <div class="memory-toolbar">
        ${field("read", "workbench.settings-memory-classes.reading", [["inherit", "workbench.settings-memory-classes.use-existing-settings"], ["explicit-only", "workbench.settings-memory-classes.explicit-queries-only"], ["off", "workbench.settings-memory-classes.do-not-read"]])}
        ${field("form", "workbench.settings-memory-classes.automatic-formation", [["inherit", "workbench.settings-memory-classes.use-existing-settings"], ["off", "workbench.settings-memory-classes.do-not-form-automatically"]])}
        <button class="mw-btn mw-btn--primary mw-btn--sm" type="submit">${uiText("workbench.settings-memory-classes.save-class-restrictions")}</button>
      </div>
    </fieldset></form>
    <p class="settings-muted">${uiText("workbench.settings-memory-classes.blocking-reads-does-not-delete-memories-blocking-automatic")}</p>
    <p class="settings-muted">${uiText("workbench.settings-memory-classes.choose-use-existing-settings-both-controls-save-remove")}</p>
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
    if (!rows.length) list.append(el("li", "settings-muted", globalThis.t.text("workbench.settings-memory-classes.no-additional-class-restrictions-existing-settings-apply")));
    for (const row of rows) {
      const item = el("li", "memory-row"), copy = el("span", "memory-row-copy");
      copy.textContent = keys.map(key => text(key, row.selector[key])).join(" · ") + "：" + text("read", row.read) + " / " + text("form", row.form);
      const edit = button(globalThis.t.text("workbench.settings-memory.edit"), null, globalThis.t.text("workbench.settings-memory.edit") + "：" + copy.textContent);
      edit.addEventListener("click", () => { for (const key of keys) controls[key].value = row.selector[key] || ""; selectRule(); for (const key of keys) value(key, controls[key].value); controls.read.focus(); });
      item.append(copy, edit); list.append(item);
    }
  };
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (saving || !rules()) return;
    const chosen = selector(), read = controls.read.value, formation = controls.form.value;
    const next = rules().filter(row => !same(row.selector, chosen));
    if (read !== "inherit" || formation !== "inherit") next.push({ selector: chosen, read, form: formation });
    saving = true; error.hidden = true; status.textContent = globalThis.t.text("workbench.settings-memory-classes.saving"); paint();
    try { await savePrefs(next); status.textContent = globalThis.t.text("workbench.settings-memory-classes.class-restrictions-saved"); }
    catch (failure) { molisWorkRequest.show(error, failure); error.hidden = false; status.textContent = globalThis.t.text("workbench.settings-memory-classes.not-saved-please-try-again"); }
    finally { saving = false; paint(); }
  });
  selectRule();
  return paint;
}`;
