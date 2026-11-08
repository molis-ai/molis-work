import type { AccountUi } from "./account-management.js";
export interface TenantPanel {
  ui: AccountUi;
  begin(title: string): () => boolean;
  list<T>(path: string): Promise<T[]>;
  select(label: string, name: string, options: [string, string][]): HTMLSelectElement;
  submit(text: string, operation: () => Promise<void>): void;
  change(path: string, body: unknown, message: string, patch?: boolean, reload?: () => Promise<void>): Promise<void>;
  load(): Promise<void>;
  cleanup(run: () => void): void;
}
export const tenantRoleLabels = { OWNER: "所有者", ADMIN: "管理员", MEMBER: "成员" };
export const tenantPath = (id: string) => '/tenants/' + encodeURIComponent(id);
export function createTenantPanel(ui: AccountUi, load: () => Promise<void>) {
  let generation = 0, active = true, cleanup = () => {};
  const panel: TenantPanel = {
    ui, load, cleanup(run) { cleanup(); cleanup = run; },
    begin(title) { cleanup(); cleanup = () => {}; const own = ++generation; ui.form.onsubmit = e => e.preventDefault(); ui.form.replaceChildren(ui.node('h3', ui.L(title))); ui.message.textContent = ''; return () => active && own === generation && ui.dialog.open; },
    async list<T>(path: string) {
      const values: T[] = [], seen = new Set<string>(); let cursor: string | null = null;
      do { const page: { items: T[]; nextCursor: string | null } = await ui.request(path + (path.includes('?') ? '&' : '?') + 'limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        values.push(...page.items); cursor = page.nextCursor;
        if (cursor && seen.has(cursor)) throw Error('Repeated account cursor'); if (cursor) seen.add(cursor);
      } while (cursor); return values;
    },
    select(label, name, options) { const wrap = ui.node('label', '', 'mw-field'), select = ui.node('select', '', 'mw-input'); select.name = name; select.required = true;
      wrap.append(ui.node('span', ui.L(label)), select); for (const [value, text] of options) { const option = ui.node('option', text); option.value = value; select.append(option); } ui.form.append(wrap); return select; },
    submit(text, operation) { const button = ui.button(text, () => {}); button.type = 'submit'; button.className = 'mw-btn mw-btn--primary'; ui.form.onsubmit = e => { e.preventDefault(); void ui.perform(operation); }; },
    async change(path, body, text, patch, reload = load) {
      try { await ui.request(path, body, { 'Idempotency-Key': crypto.randomUUID() }, patch ? 'PATCH' : undefined); }
      catch (error) { if (active && ui.dialog.open) await reload(); throw error; }
      if (active && ui.dialog.open) { await reload(); ui.message.textContent = ui.L(text); }
    },
  };
  return { panel, dispose: () => { cleanup(); cleanup = () => {}; active = false; generation++; ui.form.onsubmit = null; } };
}
