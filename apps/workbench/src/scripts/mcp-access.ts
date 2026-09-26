export const MCP_ACCESS_CLIENT_SCRIPT = `
(() => {
  const root = document.querySelector('[data-mcp-access]');
  if (!root) return;
  const client = root.querySelector('[data-mcp-client]');
  const custom = root.querySelector('[data-mcp-custom]');
  const project = root.querySelector('[name=project]');
  const result = root.querySelector('[data-mcp-access-result]');
  const pendingScope = root.querySelector('[data-mcp-scope-pending]');
  let scopeDirty = false;
  const syncScope = () => {
    const selectedClient = client.value === 'custom' ? custom.querySelector('input').value.trim() : client.value;
    scopeDirty = selectedClient !== root.dataset.clientId || project.value !== root.dataset.projectId;
    pendingScope.hidden = !scopeDirty;
    if (result) result.hidden = scopeDirty;
  };
  const syncCustom = () => { custom.hidden = client.value !== 'custom'; custom.querySelector('input').required = !custom.hidden; };
  client?.addEventListener('change', () => { syncCustom(); syncScope(); });
  project.addEventListener('change', syncScope);
  custom.querySelector('input').addEventListener('input', syncScope);
  if (client) syncCustom();
  const rows = root.querySelector('[data-mcp-access-rows]');
  if (!rows) return;
  const form = root.querySelector('[data-mcp-access-search]');
  const feedback = root.querySelector('[data-mcp-access-feedback]');
  const refresh = root.querySelector('[data-mcp-access-refresh]');
  let busy = false;
  const message = (text, failed = false) => { feedback.textContent = text; feedback.hidden = !text; feedback.setAttribute('role', failed ? 'alert' : 'status'); };
  const setBusy = value => { busy = value; root.setAttribute('aria-busy', String(value)); root.querySelectorAll('button,select,input').forEach(node => { node.disabled = value; }); };
  async function update() {
    const query = new URLSearchParams({ client_id: root.dataset.clientId, project_id: root.dataset.projectId, format: 'html', q: form.elements.q.value, filter: form.elements.filter.value });
    const response = await fetch('/api/settings/mcp/actions?' + query.toString(), {cache:'no-store'});
    const payload = await response.json();
    if (!response.ok || typeof payload.html !== 'string') throw new Error(payload.error || L('无法读取授权状态'));
    const opened = Array.from(rows.querySelectorAll('details[open]')).map(node => node.closest('[data-grant-row]').dataset.grantRow);
    rows.innerHTML = payload.html;
    rows.querySelectorAll('[data-grant-row]').forEach(node => { if (opened.includes(node.dataset.grantRow)) node.querySelector('details').open = true; });
    const url = new URL(location.href); url.searchParams.set('q',form.elements.q.value); url.searchParams.set('filter',form.elements.filter.value); history.replaceState(null,'',url);
    refresh.hidden = true;
  }
  async function reload() {
    if (busy || scopeDirty) return; setBusy(true); message('');
    try { await update(); } catch(error) { message(error.message || L('无法读取授权状态'),true); refresh.hidden=false; }
    finally { setBusy(false); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void reload(); });
  refresh.addEventListener('click', reload);
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-mcp-grant]');
    if (!button || busy || scopeDirty) return;
    const [capability_id,version,provider_id] = JSON.parse(button.dataset.mcpGrant);
    const enabled = button.dataset.grantEnabled === 'true';
    const rowKey = button.dataset.mcpGrant;
    setBusy(true); message(L('正在保存…'));
    try {
      const response = await fetch('/api/settings/mcp/actions', {method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({client_id:root.dataset.clientId,project_id:root.dataset.projectId || null,capability_id,version,provider_id,enabled})});
      const payload = await response.json();
      if (!response.ok) { message(payload.error || L('无法保存授权'),true); refresh.hidden=false; return; }
      await update(); message(L(enabled ? '授权已保存' : '授权已撤销'));
      const row = Array.from(rows.querySelectorAll('[data-grant-row]')).find(node => node.dataset.grantRow === rowKey);
      row?.querySelector('button,summary')?.focus();
    } catch { message(L('保存结果未确认，请刷新列表检查后再操作。'),true); refresh.hidden=false; }
    finally { setBusy(false); }
  });
})();
`;
