/** Bound both on the standalone page and when the same document enters the settings stage. */
export const MODEL_SETTINGS_CLIENT_SCRIPT = `
(() => {
  if (globalThis.molisWorkBindModelSettings) return;
  const bound = new WeakSet();
  const bind = (scope) => {
    const roots = [...scope.querySelectorAll('[data-model-settings]')];
    if (scope.matches?.('[data-model-settings]')) roots.push(scope);
    roots.forEach((root) => {
      if (bound.has(root)) return;
      bound.add(root);
      let busy = false;
      let dirty = false;
      const status = (text) => { root.querySelector('[data-model-status]').textContent = text; };
      root.addEventListener('input', () => { dirty = true; status(L('有未保存的修改')); });
      root.addEventListener('change', () => { dirty = true; });
      const refresh = async (query = '') => {
        const response = await fetch('/settings/models' + query);
        if (!response.ok) throw new Error(L('无法读取模型设置'));
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const replacement = doc.querySelector('[data-model-settings]');
        if (!replacement) throw new Error(L('模型设置页面不完整'));
        root.replaceChildren(...replacement.childNodes);
        dirty = false;
      };
      const mutate = async (path, method, body) => {
        const response = await fetch('/api/settings/models/' + path, {
          method, headers: molisWorkControlHeaders(), ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L('模型设置操作失败'));
        return result;
      };
      root.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button || !root.contains(button) || busy) return;
        const detail = root.querySelector('[data-model-detail]');
        const provider = detail?.dataset.modelDetail;
        const query = provider ? '?provider=' + encodeURIComponent(provider) : '';
        let locked = [];
        const begin = () => {
          busy = true; root.setAttribute('aria-busy', 'true');
          locked = [...root.querySelectorAll('button,input,select')].filter((control) => !control.disabled);
          locked.forEach((control) => { control.disabled = true; });
        };
        try {
          if (button.matches('[data-model-key-reveal]')) {
            const input = root.querySelector('[data-model-api-key]');
            input.type = input.type === 'password' ? 'text' : 'password';
            button.setAttribute('aria-pressed', String(input.type === 'text'));
            return;
          }
          if (button.matches('[data-model-add]')) {
            root.querySelector('[data-model-rows]').append(root.querySelector('[data-model-row-template]').content.cloneNode(true));
            root.querySelector('[data-model-rows]').querySelectorAll('.model-field-hint').forEach((node) => node.remove());
            [...root.querySelectorAll('[data-model-id]')].at(-1)?.focus();
            dirty = true; return;
          }
          if (button.matches('[data-model-remove]')) { button.closest('[data-model-row]').remove(); dirty = true; return; }
          if (button.matches('[data-model-provider-remove]')) {
            const confirm = root.querySelector('[data-model-delete-confirm]');
            confirm.hidden = false; confirm.querySelector('[data-model-delete]').focus(); return;
          }
          if (button.matches('[data-model-delete-cancel]')) { root.querySelector('[data-model-delete-confirm]').hidden = true; return; }
          if (button.matches('[data-model-save]')) {
            begin(); status(L('正在保存…'));
            const key = root.querySelector('[data-model-api-key]');
            await mutate(encodeURIComponent(provider), 'POST', {
              display_name: root.querySelector('[data-model-name]').value,
              base_url: root.querySelector('[data-model-base-url]').value,
              api_format: root.querySelector('[data-model-api-format]').value,
              enabled: root.querySelector('[data-model-provider-enabled]').checked,
              prompt_cache: root.querySelector('[data-model-prompt-cache]').value,
              models: [...root.querySelectorAll('[data-model-rows] [data-model-row]')].map((row) => ({
                ...JSON.parse(row.dataset.modelRecord || '{}'), model_id: row.querySelector('[data-model-id]').value.trim(),
                enabled: row.querySelector('[data-model-enabled]').checked,
              })),
              ...(key.value.trim() ? { api_key: key.value } : {}),
            });
            key.value = ''; dirty = false;
            await refresh(query); status(L('已保存。配置会用于下一轮执行；可以测试模型是否实际响应。'));
          } else if (button.matches('[data-model-test]')) {
            if (dirty) { status(L('请先保存配置，再测试这个模型。')); return; }
            begin(); status(L('正在等待模型响应…'));
            const result = await mutate(encodeURIComponent(provider) + '/test', 'POST', {
              model_id: button.closest('[data-model-row]').querySelector('[data-model-id]').value,
            });
            status(result.model_id + '：' + L(result.message));
          } else if (button.matches('[data-model-delete]')) {
            begin();
            await mutate(encodeURIComponent(provider), 'DELETE'); await refresh(); status(L('供应商及其密钥已移除'));
          } else if (button.matches('[data-model-provider], [data-model-add-provider], [data-model-refresh], [data-model-discard]')) {
            if (dirty && !button.matches('[data-model-discard]')) {
              status(L('请先保存修改，或使用「撤销未保存修改」后切换。')); return;
            }
            begin();
            const next = button.matches('[data-model-add-provider]') ? '?new=1'
              : button.dataset.modelProvider ? '?provider=' + encodeURIComponent(button.dataset.modelProvider) : query;
            await refresh(next);
          }
        } catch (error) {
          status(error instanceof TypeError ? L('无法连接本地服务，输入已保留，请重试。') : error.message || L('操作失败，输入已保留'));
        } finally { busy = false; root.removeAttribute('aria-busy'); locked.forEach((control) => { if (control.isConnected) control.disabled = false; }); }
      });
      root.addEventListener('change', (event) => {
        if (!event.target.matches('[data-model-api-format]')) return;
        const required = root.querySelector('[data-model-prompt-cache] option[value=required]');
        if (required) required.disabled = event.target.value !== 'anthropic-messages';
        if (required?.disabled && required.selected) root.querySelector('[data-model-prompt-cache]').value = 'off';
      });
      window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    });
  };
  globalThis.molisWorkBindModelSettings = bind;
  document.addEventListener('molis-work:settings-embed', (event) => bind(event.detail.root));
  bind(document);
})();
`;
