import { readFileSync } from "node:fs";

/**
 * Bound both on the standalone page and when the same document enters the settings stage. It starts with the service-connection
 * parts' progress program (src/browser/model-settings-progress.ts, bundled into dist/ when the package builds), which moves the
 * first key's steps; the page does not carry a copy of it.
 */
export const MODEL_SETTINGS_CLIENT_SCRIPT = readFileSync(new URL("../../dist/model-settings-progress.js", import.meta.url), "utf8").trim() + `
(() => {
  if (globalThis.molisWorkBindModelSettings) return;
  const bound = new WeakSet();
  let otherTabs = null;
  try { otherTabs = new BroadcastChannel('molis-work:model-ready'); } catch (error) { otherTabs = null; }
  const bind = (scope, options = {}) => {
    const roots = [...scope.querySelectorAll('[data-model-settings]')];
    if (scope.matches?.('[data-model-settings]')) roots.push(scope);
    roots.forEach((root) => {
      if (bound.has(root)) return;
      bound.add(root);
      const find = (selector) => root.querySelector(selector);
      let busy = false;
      let dirty = false;
      const status = (text, failed) => {
        const line = find('[data-model-status]');
        line.textContent = text; line.toggleAttribute('data-failed', Boolean(failed)); line.setAttribute('aria-live', failed ? 'assertive' : 'polite');
        if (failed) line.scrollIntoView({ block: 'nearest' });
      };
      // A refused key is said under its own field (§13.1), and goes once the person changes it.
      let edits = 0, recheck = 0;
      const keyControl = () => { const field = find('[data-model-key-field]'); return field && !field.hidden ? find('[data-model-api-key]') : find('[data-model-connection]'); };
      const clearRefusal = () => { root.querySelectorAll('[data-model-key-error]').forEach((node) => node.remove()); root.querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid')); };
      const progress = (at, state) => { const node = find('[data-connection-progress]'); if (node) globalThis.molisWorkConnectionProgress?.(node, { at, state }); };
      root.addEventListener('input', (event) => {
        // Filtering the fetched list changes nothing on the form.
        if (event.target.closest?.('[data-model-picker]')) { const words = event.target.value.trim().toLowerCase(); picks().forEach((o) => { o.hidden = Boolean(words) && !o.textContent.toLowerCase().includes(words); }); return; }
        if (event.target.matches?.('[data-model-api-key], [data-model-connection]')) clearRefusal();
        edits += 1; dirty = true; status(L('有未保存的修改'));
      });
      const picks = () => [...root.querySelectorAll('[data-model-pick]')];
      const ids = () => [...root.querySelectorAll('[data-model-rows] [data-model-id]')];
      const markListed = () => { const listed = ids().map((input) => input.value.trim()); picks().forEach((o) => o.setAttribute('aria-selected', String(listed.includes(o.dataset.modelPick)))); };
      const pick = (id) => {
        if (ids().some((input) => input.value.trim() === id)) return status(L('{model} 已经在列表里', { model: id }));
        let input = ids().find((field) => !field.value.trim());
        if (!input) { find('[data-model-rows] .model-field-hint')?.remove(); find('[data-model-rows]').append(find('[data-model-row-template]').content.cloneNode(true)); input = ids().at(-1); }
        input.value = id; dirty = true; markListed();
        status(L('已加入 {model}，保存后生效', { model: id }));
      };
      root.addEventListener('keydown', (event) => {
        const first = event.target.matches?.('[data-model-picker] input') && picks().find((o) => !o.hidden);
        // The save button shows ↵: Enter in one of the form's text fields saves, as it says.
        if (!first && event.key === 'Enter' && !event.isComposing && event.target.matches?.('[data-model-detail] input:not([type=checkbox]):not([role=combobox])')) { event.preventDefault(); find('[data-model-save]')?.click(); return; }
        if (!first || !['ArrowDown', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Enter') pick(first.dataset.modelPick); else first.focus();
      });
      // The key the form would save with: a typed one, else the chosen connection (the saved one when neither).
      const credential = () => {
        const field = find('[data-model-key-field]'), key = field && !field.hidden ? find('[data-model-api-key]')?.value.trim() : '';
        return { connection_id: find('[data-model-connection]')?.value || '', ...(key ? { api_key: key } : {}) };
      };
      const refresh = async (query = '') => {
        const doc = new DOMParser().parseFromString(await molisWorkRequest('/settings/models' + query, { as: 'text', fallback: L('无法读取模型设置') }), 'text/html');
        const replacement = doc.querySelector('[data-model-settings]');
        if (!replacement) throw new Error(L('模型设置页面不完整'));
        root.replaceChildren(...replacement.childNodes);
        dirty = false;
      };
      const mutate = (path, body, method = 'POST') => molisWorkRequest('/api/settings/models/' + path, { method, body, fallback: L('模型设置操作失败') });
      // A key the save or removal left with no model using it: it stays in Connectors until the person removes it.
      const released = (key) => {
        const box = find('[data-model-released]');
        if (!box || !key) return;
        box.dataset.connection = key.connection_id; box.dataset.revision = key.revision; box.hidden = false;
        box.querySelector('p').textContent = L('原来那把密钥现在没有模型在用，还留在服务连接里。');
      };
      // A save the check refused: nothing was written, and a saved provider keeps working on what it had (§13.1). A refused key is
      // said under its field; a rate limit says it is the service's and checks again by itself in a minute unless the form changed.
      const refused = (error) => {
        const name = find('[data-model-name]')?.value || '', kept = find('[data-model-detail]')?.hasAttribute('data-model-saved');
        const unsaved = kept ? L('没有保存，原来的照常在用。') : L('还没保存，填的还在。');
        if (error?.code === 'model_provider.key_rejected') {
          progress(0, 'failed');
          // A saved provider is replacing its key only when a new one was typed or another connection chosen; otherwise the key
          // refused is the one it uses now, and "the old one keeps working" would be untrue.
          const select = find('[data-model-connection]'), typed = find('[data-model-key-field]:not([hidden]) [data-model-api-key]')?.value.trim();
          const replacing = !kept || Boolean(typed) || Boolean(select && select.value !== (select.querySelector('option[selected]') ?? select.options[0])?.value);
          const control = keyControl(), note = document.createElement('p');
          note.className = 'mw-field__error'; note.setAttribute('role', 'alert'); note.dataset.modelKeyError = '';
          note.textContent = !kept ? L('{name} 拒绝了这把密钥，可能过期了或少复制了字符。还没保存，换一把再试。', { name })
            : replacing ? L('{name} 拒绝了新密钥。旧密钥照常在用；新的没保存，填的还在。', { name })
            : L('{name} 拒绝了现在用的这把密钥，可能过期或被撤销了。没有保存；换一把新密钥再试。', { name });
          control?.setAttribute('aria-invalid', 'true'); control?.closest('.model-field')?.append(note);
          setTimeout(() => control?.focus()); // after the form is unlocked
          return status(replacing ? unsaved : L('没有保存。'), true);
        }
        if (error?.code === 'model_provider.rate_limited') {
          progress(1, 'hold');
          const box = find('[data-model-limited]'), seen = edits, wait = 60000;
          const time = new Date(Date.now() + wait).toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' });
          // What was kept is said once, on the status line.
          box.querySelector('p').textContent = L('这是服务那边的原因，不是你填错了。约 {minutes} 分钟后（{time}）自动再查一次。', { minutes: 1, time });
          box.hidden = false;
          recheck = setTimeout(() => { if (root.isConnected && !box.hidden && edits === seen) find('[data-model-recheck]')?.click(); }, wait);
          return status(unsaved, true);
        }
        progress(1, 'failed');
        status(molisWorkRequest.text(error, L('操作失败，输入已保留')), true);
      };
      root.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button || !root.contains(button) || busy) return;
        const detail = find('[data-model-detail]');
        const provider = detail?.dataset.modelDetail;
        const query = provider ? '?provider=' + encodeURIComponent(provider) : '';
        let locked = [];
        const begin = () => {
          busy = true; root.setAttribute('aria-busy', 'true');
          locked = [...root.querySelectorAll('button,input,select')].filter((control) => !control.disabled);
          locked.forEach((control) => { control.disabled = true; });
        };
        try {
          if (button.matches('[data-model-add]')) {
            find('[data-model-rows]').append(find('[data-model-row-template]').content.cloneNode(true));
            find('[data-model-rows]').querySelectorAll('.model-field-hint').forEach((node) => node.remove());
            [...root.querySelectorAll('[data-model-id]')].at(-1)?.focus();
            dirty = true; return;
          }
          if (button.matches('[data-model-remove]')) { button.closest('[data-model-row]').remove(); dirty = true; markListed(); return; }
          if (button.matches('[data-model-pick]')) { pick(button.dataset.modelPick); return; }
          if (button.matches('[data-model-fetch]')) {
            begin(); status(L('正在向服务要模型列表…'));
            const { models = [] } = await mutate(encodeURIComponent(provider) + '/models', {
              base_url: find('[data-model-base-url]').value, api_format: find('[data-model-api-format]').value, ...credential(),
            });
            const picker = find('[data-model-picker]'), input = picker.querySelector('input');
            picker.querySelector('[role=listbox]').replaceChildren(...models.map((model) => {
              const option = document.createElement('button');
              option.type = 'button'; option.setAttribute('role', 'option'); option.dataset.modelPick = option.textContent = model.model_id;
              if (model.display_name) { const name = document.createElement('span'); name.className = 'model-picker-name'; name.textContent = model.display_name; option.append(name); }
              return option;
            }));
            picker.hidden = false; input.value = ''; input.setAttribute('aria-expanded', String(models.length > 0)); markListed();
            status(models.length ? L('服务提供 {count} 个模型，选一个加进列表', { count: models.length }) : L('服务没有列出模型，请手填模型名。'));
            if (models.length) setTimeout(() => input.focus());
            return;
          }
          if (button.matches('[data-model-provider-remove]')) {
            const confirm = find('[data-model-delete-confirm]');
            confirm.hidden = false; confirm.querySelector('[data-model-delete]').focus(); return;
          }
          if (button.matches('[data-model-delete-cancel]')) { find('[data-model-delete-confirm]').hidden = true; return; }
          if (button.matches('[data-model-save], [data-model-recheck]')) {
            clearTimeout(recheck); clearRefusal(); find('[data-model-limited]').hidden = true;
            begin(); status(L('正在保存，并检查连接…')); progress(1, 'running');
            const saved = await mutate(encodeURIComponent(provider), {
              check_connection: true,
              display_name: find('[data-model-name]').value,
              base_url: find('[data-model-base-url]').value,
              api_format: find('[data-model-api-format]').value,
              enabled: find('[data-model-provider-enabled]').checked,
              prompt_cache: find('[data-model-prompt-cache]').value,
              thinking: find('[data-model-thinking]')?.value || 'off',
              models: [...root.querySelectorAll('[data-model-rows] [data-model-row]')].map((row) => ({
                ...JSON.parse(row.dataset.modelRecord || '{}'), model_id: row.querySelector('[data-model-id]').value.trim(),
                enabled: row.querySelector('[data-model-enabled]').checked, reasoning_effort: Boolean(row.querySelector('[data-model-effort]')?.checked),
                vision: { true: true, false: false }[row.querySelector('[data-model-vision]').value],
              })),
              ...credential(),
            });
            dirty = false;
            await refresh(query); status(L(saved.checked ? '连接检查通过，已保存。配置会用于下一轮执行。' : '已保存。配置会用于下一轮执行；可以测试模型是否实际响应。'));
            released(saved.released_key);
            if (saved.first_model_ready) otherTabs?.postMessage('ready');
            await options.saved?.({ first: Boolean(saved.first_model_ready) });
          } else if (button.matches('[data-model-test]')) {
            if (dirty) { status(L('请先保存配置，再测试这个模型。')); return; }
            begin(); status(L('正在等待模型响应…'));
            const result = await mutate(encodeURIComponent(provider) + '/test', {
              model_id: button.closest('[data-model-row]').querySelector('[data-model-id]').value,
            });
            status(result.model_id + '：' + L(result.message));
          } else if (button.matches('[data-model-delete]')) {
            begin();
            const result = await mutate(encodeURIComponent(provider), undefined, 'DELETE'); await refresh(); status(L('供应商已移除')); released(result.released_key);
          } else if (button.matches('[data-model-released-keep]')) {
            find('[data-model-released]').hidden = true; status(L('旧密钥留着，可以在服务连接里移除。'));
          } else if (button.matches('[data-model-released-remove]')) {
            begin();
            const box = find('[data-model-released]');
            await molisWorkRequest('/api/settings/connectors/connections/' + encodeURIComponent(box.dataset.connection) + '/manage', {
              method: 'POST', body: { action: 'remove', expected_revision: box.dataset.revision }, fallback: L('没能移除旧密钥，请到服务连接里移除。'),
            });
            // Only the list of keys changes; what is being edited stays.
            root.querySelectorAll('[data-model-connection] option').forEach((option) => { if (option.value === box.dataset.connection) option.remove(); });
            box.hidden = true; status(L('旧密钥已移除'));
          } else if (button.matches('[data-model-provider], [data-model-add-provider], [data-model-template], [data-model-refresh], [data-model-discard]')) {
            if (dirty && !button.matches('[data-model-discard]')) {
              status(L('请先保存修改，或使用「撤销未保存修改」后切换。')); return;
            }
            begin();
            const next = button.matches('[data-model-add-provider]') ? '?new=1'
              : button.dataset.modelTemplate ? '?new=1&template=' + encodeURIComponent(button.dataset.modelTemplate)
              : button.dataset.modelProvider ? '?provider=' + encodeURIComponent(button.dataset.modelProvider) : query;
            await refresh(next);
            if (button.dataset.modelTemplate) find('[data-model-api-key]')?.focus();
          }
        } catch (error) {
          if (button.matches('[data-model-save], [data-model-recheck]')) refused(error);
          else status(molisWorkRequest.text(error, L('操作失败，输入已保留')), true);
        } finally { busy = false; root.removeAttribute('aria-busy'); locked.forEach((control) => { if (control.isConnected) control.disabled = false; }); }
      });
      const syncKeyField = () => {
        const field = find('[data-model-key-field]');
        const selected = find('[data-model-connection]')?.value;
        if (field) field.hidden = Boolean(selected);
      };
      syncKeyField();
      root.addEventListener('change', (event) => {
        if (event.target.matches('[data-model-connection]')) syncKeyField();
        if (!event.target.matches('[data-model-api-format]')) return;
        const required = find('[data-model-prompt-cache] option[value=required]');
        if (required) required.disabled = event.target.value !== 'anthropic-messages';
        if (required?.disabled && required.selected) find('[data-model-prompt-cache]').value = 'off';
      });
      window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    });
  };
  globalThis.molisWorkBindModelSettings = bind;
  document.addEventListener('molis-work:settings-embed', (event) => bind(event.detail.root));
  bind(document);
})();
`;
