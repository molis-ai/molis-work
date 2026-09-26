/** Static script: all request-specific values are escaped into the rendered DOM. */
export const ARTIFACT_IMPORT_CLIENT_SCRIPT = String.raw`
(() => {
  const form = document.querySelector('[data-artifact-import-form]');
  if (!form) return;
  const messages = JSON.parse(form.dataset.importMessages || '{}');
  const prefix = form.dataset.routePrefix || '';
  const source = form.elements.source;
  const account = form.elements.connection_id;
  const connections = JSON.parse(form.dataset.importConnections || '[]');
  const url = form.elements.url;
  const file = form.elements.file;
  const title = form.elements.title;
  const fields = form.querySelector('[data-import-fields]');
  const submit = form.querySelector('[data-import-submit]');
  const status = form.querySelector('[data-import-status]');
  const error = form.querySelector('[data-import-error]');
  const result = form.querySelector('[data-import-result]');
  let busy = false;
  const clearError = () => { error.hidden = true; error.textContent = ''; };
  const updateSource = () => {
    const local = source.value === 'file';
    const option = source.selectedOptions[0];
    form.querySelector('[data-import-online]').hidden = local;
    form.querySelector('[data-import-file]').hidden = !local;
    url.disabled = local;
    url.required = !local;
    file.disabled = !local;
    file.required = local;
    title.disabled = !local;
    url.placeholder = option.dataset.placeholder;
    form.querySelector('[data-import-help]').textContent = option.dataset.help;
    form.querySelector('[data-import-connection-status]').textContent = option.dataset.connected === 'true' ? messages.ready : messages.missing;
    const connector = source.value === 'google-docs' ? 'google-drive' : source.value;
    account.disabled = local;
    account.required = !local;
    const candidates = connections.filter(row => row.service_id === connector && row.state === 'connected');
    account.replaceChildren(new Option('选择连接', ''), ...candidates.map(row => new Option(row.display_name, row.connection_id)));
    if (candidates.length === 1) account.value = candidates[0].connection_id;
    form.querySelector('[data-import-settings]').href = '/settings/connectors?connector=' + encodeURIComponent(connector);
    submit.textContent = messages.submit;
    clearError();
  };
  source.addEventListener('change', updateSource);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    fields.disabled = true;
    form.setAttribute('aria-busy', 'true');
    clearError();
    status.hidden = false;
    status.textContent = messages.busy;
    submit.textContent = messages.busy;
    let timeout;
    let controller;
    try {
      let input;
      if (source.value === 'file') {
        const selected = file.files[0];
        if (!selected) throw new Error(messages.fileRequired);
        if (!/\.(md|markdown|txt|html|htm)$/i.test(selected.name)) throw new Error(messages.fileType);
        if (selected.size > 2 * 1024 * 1024) throw new Error(messages.fileSize);
        let content;
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer()); }
        catch { throw new Error(messages.fileEncoding); }
        input = { source: 'file', filename: selected.name, content };
        if (title.value.trim()) input.title = title.value.trim();
      } else {
        let parsed;
        try { parsed = new URL(url.value.trim()); } catch { throw new Error(messages.url); }
        if (parsed.protocol !== 'https:') throw new Error(messages.url);
        input = { source: source.value, url: parsed.href, connection_id: account.value };
      }
      const body = JSON.stringify(input);
      // The HTTP gate accepts each key once. Stored document identity and content handle retries safely.
      const requestKey = crypto.randomUUID();
      controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 120000);
      let response;
      try {
        response = await fetch(prefix + '/api/artifacts/import', {
          method: 'POST', signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-molis-work-control-token': document.querySelector('meta[name="molis-work-control-token"]')?.content || '',
            'x-molis-work-idempotency-key': requestKey,
          },
          body,
        });
      } catch { throw new Error(controller.signal.aborted ? messages.timeout : messages.network); }
      let payload;
      try { payload = await response.json(); }
      catch { throw new Error(messages.failed); }
      if (!response.ok) throw new Error(payload && typeof payload.error === 'string' ? payload.error : messages.failed);
      if (!payload || typeof payload.artifact_id !== 'string' || !payload.artifact_id || !Number.isSafeInteger(payload.version) || payload.version < 1) throw new Error(messages.invalidResult);
      const exactPath = prefix + '/artifacts/' + encodeURIComponent(payload.artifact_id) + '/versions/' + payload.version;
      let href = exactPath;
      if (typeof payload.url === 'string') {
        try {
          const destination = new URL(payload.url, location.origin);
          if (destination.origin === location.origin && destination.pathname === exactPath) href = destination.href;
        } catch {}
      }
      form.querySelector('[data-import-result-link]').href = href;
      form.querySelector('[data-import-result-title]').textContent = payload.reused ? messages.reused : messages.success;
      form.querySelector('[data-import-version]').textContent = payload.artifact_id + ' · v' + payload.version;
      const warnings = Array.isArray(payload.warnings) ? payload.warnings.filter(item => typeof item === 'string') : [];
      const warningList = form.querySelector('[data-import-warning-list]');
      warningList.replaceChildren(...warnings.map(text => { const item = document.createElement('li'); item.textContent = text; return item; }));
      form.querySelector('[data-import-warnings]').hidden = !warnings.length;
      fields.hidden = true;
      result.hidden = false;
      form.querySelector('[data-import-result-title]').focus();
    } catch (failure) {
      error.textContent = failure instanceof Error ? failure.message : messages.failed;
      error.hidden = false;
      submit.textContent = messages.retry;
    } finally {
      clearTimeout(timeout);
      busy = false;
      fields.disabled = false;
      form.removeAttribute('aria-busy');
      status.hidden = true;
    }
  });
  form.querySelector('[data-import-again]').addEventListener('click', () => {
    form.reset();
    fields.hidden = false;
    result.hidden = true;
    updateSource();
    source.focus();
  });
  updateSource();
})();
`;
