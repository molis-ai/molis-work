/** Bound both on the standalone page and when the same document enters the settings stage. */
export const MODEL_SETTINGS_CLIENT_SCRIPT = `
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
      root.addEventListener('input', (event) => {
        // Filtering the fetched list changes nothing on the form.
        if (event.target.closest?.('[data-model-picker]')) { const words = event.target.value.trim().toLowerCase(); picks().forEach((o) => { o.hidden = Boolean(words) && !o.textContent.toLowerCase().includes(words); }); return; }
        dirty = true; status(L('有未保存的修改'));
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
          if (button.matches('[data-model-save]')) {
            begin(); status(L('正在保存，并检查连接…'));
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
            if (saved.first_model_ready) { options.ready?.(); otherTabs?.postMessage('ready'); }
          } else if (button.matches('[data-model-test]')) {
            if (dirty) { status(L('请先保存配置，再测试这个模型。')); return; }
            begin(); status(L('正在等待模型响应…'));
            const result = await mutate(encodeURIComponent(provider) + '/test', {
              model_id: button.closest('[data-model-row]').querySelector('[data-model-id]').value,
            });
            status(result.model_id + '：' + L(result.message));
          } else if (button.matches('[data-model-delete]')) {
            begin();
            await mutate(encodeURIComponent(provider), undefined, 'DELETE'); await refresh(); status(L('供应商及其密钥已移除'));
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
          status(molisWorkRequest.text(error, L('操作失败，输入已保留')), true);
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
