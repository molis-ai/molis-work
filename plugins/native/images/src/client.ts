/** The browser owns drafts only; jobs and credentials belong to the local host. */
export const IMAGES_CLIENT_FACTORY_SCRIPT = String.raw`(host) => {
  const { translate: L } = host;
  const root = document.querySelector('[data-images=workbench]');
  if (!root) return;
  const life = host.mountPluginClient(root);
  if (!life) return;
  let viewSignal;
  const $ = (selector) => root.querySelector(selector);
  const projectId = () => String((typeof host.projectId === 'function' ? host.projectId() : host.projectId) || '');
  const compose = $('[data-images-compose]');
  const prompt = $('[data-images-prompt]');
  const size = $('[data-images-size]');
  const ratio = $('[data-images-ratio]');
  const generate = $('[data-images-generate]');
  const result = $('[data-images-result]');
  const dialog = $('[data-images-dialog]');
  const connectionForm = $('[data-images-connection-form]');
  const connectionName = $('[data-images-connection-name]');
  const connectionUrl = $('[data-images-connection-url]');
  const connectionModel = $('[data-images-connection-model]');
  const connectionAuth = $('[data-images-connection-auth]');
  const serviceMenu = $('[data-images-service-menu]');
  let context = projectId(), conns = [], authConnections = [], jobs = [], cid = '', jobId = '';
  let editingId = '', editingFormat = 'openai-images', editingAuth = '', pending = null, resumeConnection = null;
  let submitting = false, saving = false, cancelling = false, listSeq = 0, loadSeq = 0;
  let timer = 0, listSignature = '', resultSignature = '';
  const statuses = {
    running: L('images.status.running'), succeeded: L('images.status.succeeded'), failed: L('images.status.failed'),
    cancelled: L('images.status.cancelled'), interrupted: L('images.status.interrupted'),
  };
  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    node.textContent = String(value || '');
    if (className) node.className = className;
    return node;
  };
  const button = (label, attr, value, variant = 'ghost') => {
    const node = text('button', label, 'mw-btn mw-btn--' + variant);
    node.type = 'button'; node.setAttribute(attr, value || ''); return node;
  };
  const say = (message, isError = false, selector = '[data-images-note]') => {
    if (!life.alive) return;
    const node = $(selector);
    node.textContent = message || ''; node.hidden = !message;
    node.classList.toggle('is-error', Boolean(message && isError));
  };
  const pickedConn = () => conns.find(item => item.id === cid);
  const draftKey = () => 'molis-work-images-draft:' + context;
  const saveDraft = () => {
    try {
      sessionStorage.setItem(draftKey(), JSON.stringify({
        prompt: prompt.value, size: size.value, aspect_ratio: ratio.value,
        connection_id: cid, selected_id: jobId, pending,
      }));
    } catch {}
  };
  const restoreDraft = () => {
    let draft = {};
    try { draft = JSON.parse(sessionStorage.getItem(draftKey()) || '{}') || {}; } catch {}
    prompt.value = typeof draft.prompt === 'string' ? draft.prompt : '';
    size.value = typeof draft.size === 'string' ? draft.size : '';
    ratio.value = typeof draft.aspect_ratio === 'string' ? draft.aspect_ratio : '';
    cid = typeof draft.connection_id === 'string' ? draft.connection_id : '';
    jobId = typeof draft.selected_id === 'string' ? draft.selected_id : '';
    pending = draft.pending && typeof draft.pending.request_id === 'string' && typeof draft.pending.fingerprint === 'string' ? draft.pending : null;
  };
  const request = async (method, path, body, signal) => {
    const response = await life.fetch(host.route('/api/images' + path), {
      method, cache: 'no-store', signal,
      headers: molisWorkControlHeaders(),
      body: method === 'GET' || body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    life.assertCurrent(signal);
    if (!response.ok) {
      const error = new Error(payload.error || L('images.error.request'));
      error.httpStatus = response.status; throw error;
    }
    return payload;
  };
  // Files are named after what was asked for, not the stored image id; several images from one prompt are numbered.
  const fileNameOf = (job, item) => {
    const ext = (/\.[a-z0-9]{2,5}$/i.exec(item.filename || '') || ['.png'])[0];
    const base = String(job.prompt || '').replace(/[\\/:*?"<>|\s]+/g, ' ').trim().slice(0, 40) || L('images.page.title');
    const index = (job.images || []).findIndex((entry) => entry.id === item.id);
    return base + ((job.images || []).length > 1 && index >= 0 ? ' ' + (index + 1) : '') + ext;
  };
  const imageUrl = (job, image, download = false) => host.route('/api/images/jobs/' + encodeURIComponent(job.id) + '/images/' + encodeURIComponent(image.id)) + (download ? '?download=1' : '');
  const dateLabel = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString(document.documentElement.lang || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const syncGenerate = () => {
    if (!life.alive) return;
    generate.disabled = submitting || !context || !pickedConn() || pickedConn().available === false || !prompt.value.trim();
    generate.textContent = submitting ? L('images.compose.submitting') : L('images.compose.generate');
    $('[data-images-project-note]').hidden = Boolean(context);
  };
  const syncParameters = () => {
    const connection = pickedConn();
    $('[data-images-connected]').hidden = !cid && !conns.length;
    $('[data-images-connection-empty]').hidden = conns.length > 0;
    // Until a service is connected, connecting is the step; the generate row waits.
    const submitRow = $('.images-submit-row'); if (submitRow) submitRow.hidden = !conns.length;
    $('[data-images-service-label]').textContent = connection ? connection.name + ' · ' + connection.model : L('images.service.unavailable');
    const unavailable = $('[data-images-service-unavailable]');
    unavailable.hidden = !cid || Boolean(connection && connection.available !== false);
    unavailable.textContent = connection?.unavailable_reason || L('images.service.unavailable');
    $('[data-images-size-field]').hidden = !connection || connection.api_format !== 'openai-images';
    $('[data-images-ratio-field]').hidden = !connection || connection.api_format !== 'gemini';
    $('[data-images-service-options]').querySelectorAll('[data-images-use-connection]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.imagesUseConnection === cid)));
    syncGenerate();
  };
  const paintConnections = () => {
    if (!cid) cid = conns[0]?.id || '';
    const options = $('[data-images-service-options]');
    options.replaceChildren(...conns.map(connection => {
      const node = button('', 'data-images-use-connection', connection.id);
      node.className = 'images-service-option';
      node.append(text('span', connection.name), text('small', connection.model + (connection.available === false ? ' · ' + L('images.account.unavailable') : '')));
      return node;
    }));
    $('[data-images-saved-connections]').replaceChildren(...conns.map(connection => {
      const row = text('div', '', 'images-saved-connection');
      const node = button(connection.name, 'data-images-edit-connection', connection.id, 'secondary');
      node.setAttribute('aria-pressed', String(editingId === connection.id));
      row.append(node, button(L('images.service.delete'), 'data-images-delete-connection', connection.id));
      return row;
    }));
    syncParameters();
  };
  const paintList = () => {
    const signature = JSON.stringify([jobs, jobId]);
    if (signature === listSignature) return;
    listSignature = signature;
    const rows = $('[data-images-rows]');
    const list = $('[data-images=directory]');
    const top = list.scrollTop;
    $('[data-images-history-empty]').hidden = jobs.length > 0;
    rows.replaceChildren(...jobs.map(job => {
      const node = button('', 'data-images-job', job.id);
      node.className = 'feed-stage-entry directory-list-row images-history-row' + (jobId === job.id ? ' is-selected' : '');
      node.setAttribute('aria-pressed', String(jobId === job.id));
      if (job.images?.length) {
        const img = document.createElement('img'); img.className = 'images-history-thumb';
        img.src = imageUrl(job, job.images[0]); img.alt = ''; img.loading = 'lazy'; node.append(img);
      } else {
        const mark = document.createElement('span'); mark.className = 'images-history-thumb images-history-thumb-placeholder';
        mark.innerHTML = '<svg aria-hidden="true"><use href="#icon-image"></use></svg>'; node.append(mark);
      }
      const copy = text('span', '', 'images-history-copy');
      const title = text('strong', job.prompt); title.title = job.prompt;
      const status = text('small', (statuses[job.status] || job.status) + ' · ' + dateLabel(job.created_at)); status.dataset.mwState = job.status === 'succeeded' ? 'done' : job.status === 'running' ? 'generating' : job.status; copy.append(title, status);
      node.append(copy); return node;
    }));
    list.scrollTop = top;
  };
  const expand = () => {
    root.dataset.expanded = 'true'; $('[data-images-workspace]').hidden = false;
  };
  /** The generation record on screen, for the placement bar and the Assistant. */
  const publishContext = (job) => {
    const value = { plugin_id: 'io.molis.work.images', surface_title: L('images.page.title') };
    if (job) value.object = { kind: 'image_job', id: job.id, version: job.status + ':' + (job.images || []).length, title: job.prompt.slice(0, 80) };
    root.setAttribute('data-assistant-context', JSON.stringify(value));
  };
  const showCompose = (focus = false) => {
    jobId = ''; resultSignature = ''; result.hidden = true; compose.hidden = false;
    publishContext(null);
    $('[data-images-title]').textContent = L('images.compose.new');
    expand(); paintList(); saveDraft(); syncGenerate();
    if (focus) prompt.focus();
  };
  const paintResult = (job) => {
    if (!job || jobId !== job.id) return;
    compose.hidden = true; result.hidden = false;
    $('[data-images-title]').textContent = L('images.result.title');
    publishContext(job);
    const signature = JSON.stringify([job, cancelling]);
    if (resultSignature === signature) return;
    resultSignature = signature; result.replaceChildren();
    const heading = text('div', '', 'images-result-heading');
    const status = text('h2', statuses[job.status] || job.status); status.dataset.mwState = job.status === 'succeeded' ? 'done' : job.status === 'running' ? 'generating' : job.status; heading.append(status, button(L('images.result.reuse'), 'data-images-reuse', job.id, 'secondary'));
    if (job.status !== 'running') heading.append(button(L('images.result.delete'), 'data-images-delete-job', job.id));
    result.append(heading, text('p', job.connection_name + ' · ' + job.model + ' · ' + dateLabel(job.created_at), 'images-result-meta'));
    if (job.status !== 'succeeded') {
      const panel = text('div', '', 'images-status-panel'); panel.dataset.status = job.status;
      const message = job.status === 'running' ? L('images.status.waiting')
        : job.status === 'cancelled' ? L('images.status.cancelled-help')
        : job.status === 'interrupted' ? L('images.status.interrupted-help')
        : job.error || L('images.error.no-image');
      panel.append(text('p', message));
      if (job.status === 'running') {
        panel.append(text('small', L('images.status.cancel-warning')));
        const cancel = button(cancelling ? L('images.status.cancelling') : L('images.status.cancel'), 'data-images-cancel', job.id, 'secondary');
        cancel.disabled = cancelling; panel.append(cancel);
      } else {
        panel.append(text('small', L('images.status.retry-help')));
      }
      result.append(panel);
    }
    for (const item of job.images || []) {
      const figure = document.createElement('figure');
      const img = document.createElement('img'); img.className = 'images-result-image';
      img.src = imageUrl(job, item); img.alt = job.prompt;
      img.addEventListener('error', () => {
        if (resultSignature === signature) resultSignature = '';
        const failure = text('p', L('images.error.image-read'), 'images-note is-error');
        img.replaceWith(failure);
      }, { once: true });
      const caption = document.createElement('figcaption');
      const download = text('a', L('images.result.download'), 'mw-btn mw-btn--secondary');
      download.href = imageUrl(job, item, true) + '&name=' + encodeURIComponent(fileNameOf(job, item)); download.download = fileNameOf(job, item);
      // Keep a generated image as a personal material: from Shelf it can be used in a project or handed to other work.
      const keep = text('button', L('images.result.shelf'), 'mw-btn mw-btn--ghost'); keep.type = 'button';
      keep.title = L('images.result.shelf-help');
      keep.addEventListener('click', async () => {
        keep.disabled = true;
        try {
          const response = await fetch(imageUrl(job, item, true), { cache: 'no-store' });
          if (!response.ok) throw new Error(L('images.error.image-read'));
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = ''; for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
          window.dispatchEvent(new CustomEvent('molis:shelf-admit', { detail: { filename: fileNameOf(job, item), mime: item.mime_type || response.headers.get('content-type') || 'image/png', bytes_base64: btoa(binary),
            source: L('images.page.title') + ' · ' + job.prompt.slice(0, 40) } }));
        } catch (error) { say(error.message || L('images.error.shelf'), true); }
        finally { setTimeout(() => { keep.disabled = false; }, 1200); }
      });
      caption.append(text('span', Math.max(1, Math.round(item.byte_length / 1024)) + ' KB'), download, keep);
      figure.append(img, caption); result.append(figure);
    }
    result.append(text('p', job.prompt, 'images-result-prompt'));
    if (job.size || job.aspect_ratio) result.append(text('p', (job.api_format === 'gemini' ? L('images.result.ratio') : L('images.result.size')) + ' · ' + (job.aspect_ratio || job.size), 'images-result-meta'));
  };
  const rememberJob = (job) => {
    listSeq += 1;
    const index = jobs.findIndex(item => item.id === job.id);
    if (index >= 0) jobs[index] = job; else jobs.unshift(job);
    paintList(); if (jobId === job.id) paintResult(job);
  };
  const ensureContext = () => {
    if (context === projectId()) return;
    context = projectId(); listSeq += 1; loadSeq += 1; jobs = []; jobId = '';
    pending = null; submitting = false; cancelling = false; listSignature = ''; resultSignature = '';
    life.clearTimeout(timer); restoreDraft(); paintList(); syncParameters();
    result.hidden = true; compose.hidden = false; say('');
  };
  const schedulePoll = () => {
    life.clearTimeout(timer);
    if (life.visible && jobs.some(job => job.status === 'running')) timer = life.timeout(() => loadJobs().catch(() => {}), 2500);
  };
  const loadJobs = async (signal = viewSignal) => {
    if (!life.visible) return;
    ensureContext(); const ctx = context; const seq = ++listSeq;
    try {
      const payload = await request('GET', '/jobs', undefined, signal);
      if (ctx !== projectId() || seq !== listSeq || !root.isConnected) return;
      jobs = Array.isArray(payload.jobs) ? payload.jobs : []; paintList();
      if (jobId) {
        const job = jobs.find(item => item.id === jobId);
        if (job) paintResult(job); else showCompose();
      }
      say('', false, '[data-images-list-note]');
    } catch (error) {
      if (!life.alive || signal?.aborted || ctx !== projectId() || seq !== listSeq) return;
      say((error.message || L('images.error.history')) + ' ' + L('images.history.retry'), true, '[data-images-list-note]');
      if (jobId) say(L('images.error.progress') + ' ' + L('images.history.retry'), true);
      throw error;
    } finally {
      if (!signal?.aborted && ctx === projectId() && seq === listSeq) schedulePoll();
    }
  };
  const loadConnections = async (signal = viewSignal) => {
    const seq = ++loadSeq;
    const payload = await request('GET', '/connections', undefined, signal);
    if (seq !== loadSeq || !root.isConnected) return;
    conns = Array.isArray(payload.connections) ? payload.connections : [];
    authConnections = Array.isArray(payload.auth_connections) ? payload.auth_connections : [];
    paintConnections(); paintConn();
  };
  const paintConn = () => {
    root.querySelectorAll('[data-images-format]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.imagesFormat === editingFormat)));
    root.querySelectorAll('[data-images-edit-connection]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.imagesEditConnection === editingId)));
    const existing = conns.find(item => item.id === editingId);
    const changedDestination = existing && (existing.api_format !== editingFormat || existing.base_url !== connectionUrl.value.trim());
    const choices = authConnections.filter(item=>item.state==='connected' || item.connection_id===editingAuth);
    connectionAuth.replaceChildren(new Option(L(existing?.auth_connection_id ? 'images.account.keep' : 'images.account.anonymous'), ''), ...choices.map(item=>new Option(item.display_name+(item.state==='connected' ? '' : ' · '+L('images.account.unavailable')), item.connection_id)));
    if (editingAuth && !choices.some(item=>item.connection_id===editingAuth)) {
      const missing = new Option(L('images.account.missing'), editingAuth); connectionAuth.add(missing);
    }
    connectionAuth.value = editingAuth;
    const unavailable = editingAuth && !authConnections.some(item=>item.connection_id===editingAuth && item.state==='connected');
    $('[data-images-key-help]').textContent = unavailable ? L('images.account.reconnect') : changedDestination ? L('images.account.reselect')
      : existing?.has_key ? L('images.account.saved')
      : L('images.account.key-help');
    $('[data-images-connection-heading]').textContent = editingId ? L('images.service.edit') : L('images.service.add');
  };
  const usePreset = (preset) => {
    editingFormat = preset === 'gemini' ? 'gemini' : 'openai-images';
    connectionName.value = preset === 'gemini' ? 'Gemini' : preset === 'openai' ? 'OpenAI' : '';
    connectionUrl.value = preset === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : preset === 'openai' ? 'https://api.openai.com/v1' : '';
    connectionModel.value = preset === 'gemini' ? 'gemini-3.1-flash-image' : preset === 'openai' ? 'gpt-image-1.5' : '';
    paintConn();
  };
  const editConnection = (id) => {
    const connection = conns.find(item => item.id === id); editingId = connection?.id || '';
    editingAuth = connection?.auth_connection_id || '';
    if (connection) {
      editingFormat = connection.api_format; connectionName.value = connection.name;
      connectionUrl.value = connection.base_url; connectionModel.value = connection.model;
      paintConn();
    } else usePreset('openai');
    say('', false, '[data-images-connection-note]');
  };
  const openConnections = () => {
    if (resumeConnection !== cid) editConnection(cid); resumeConnection = null; if (!dialog.open) dialog.showModal(); connectionName.focus();
    const seq = loadSeq + 1, signal = viewSignal;
    void loadConnections(signal).catch(error => { if (seq === loadSeq && !signal?.aborted && dialog.open) say(error.message || L('images.error.request'), true, '[data-images-connection-note]'); });
  };
  const syncSaving = () => {
    if (!life.alive) return;
    $('[data-images-connection-fields]').disabled = saving;
    dialog.querySelectorAll('[data-images-edit-connection], [data-images-delete-connection], [data-images-add-connection], [data-images-dialog-close], [data-images-save-connection]').forEach(node => node.disabled = saving);
    $('[data-images-save-connection]').textContent = saving ? L('images.service.saving') : L('images.service.save');
  };
  life.listen(connectionForm, 'submit', async event => {
    event.preventDefault(); if (saving || !connectionForm.reportValidity()) return;
    const input = {
      ...(editingId ? { id: editingId } : {}), name: connectionName.value.trim(), api_format: editingFormat,
      base_url: connectionUrl.value.trim(), model: connectionModel.value.trim(), auth_connection_id: connectionAuth.value,
    };
    saving = true; syncSaving(); say('', false, '[data-images-connection-note]');
    try {
      const payload = await request('POST', '/connections', input);
      loadSeq += 1;
      const index = conns.findIndex(item => item.id === payload.connection.id);
      if (index >= 0) conns[index] = payload.connection; else conns.push(payload.connection);
      cid = payload.connection.id; editingId = cid;
      paintConnections(); saveDraft(); dialog.close(); say(L(payload.connection.available === false ? 'images.service.saved-connect' : 'images.service.saved'));
    } catch (error) {
      say(error.message || L('images.error.save'), true, '[data-images-connection-note]');
    } finally { saving = false; syncSaving(); }
  });
  life.listen(dialog, 'cancel', event => { if (saving) event.preventDefault(); });
  life.listen(connectionUrl, 'input', paintConn);
  life.listen(connectionAuth, 'change', () => { editingAuth = connectionAuth.value; paintConn(); });
  life.listen(compose, 'input', () => { saveDraft(); syncGenerate(); });
  life.listen(compose, 'submit', async event => {
    event.preventDefault(); ensureContext();
    if (submitting || !context || !pickedConn() || pickedConn().available === false || !compose.reportValidity()) return;
    const currentContext = context;
    const connection = pickedConn();
    const body = { connection_id: connection.id, prompt: prompt.value.trim() };
    if (connection.api_format === 'gemini' && ratio.value.trim()) body.aspect_ratio = ratio.value.trim();
    if (connection.api_format === 'openai-images' && size.value.trim()) body.size = size.value.trim();
    const fingerprint = JSON.stringify(body);
    if (!pending || pending.fingerprint !== fingerprint) pending = { request_id: crypto.randomUUID(), fingerprint };
    body.request_id = pending.request_id; saveDraft(); submitting = true; syncGenerate(); say('');
    try {
      const payload = await request('POST', '/jobs', body);
      if (currentContext !== projectId()) return;
      pending = null; jobId = payload.job.id; expand(); rememberJob(payload.job); saveDraft(); schedulePoll();
    } catch (error) {
      if (currentContext !== projectId()) return;
      const message = error.httpStatus ? error.message : L('images.compose.unconfirmed') + ' ' + (error.message || '');
      say(message, true);
      void loadJobs().catch(() => {});
    } finally {
      if (life.alive && currentContext === projectId()) { submitting = false; syncGenerate(); }
    }
  });
  life.listen(root, 'click', async event => {
    const link = event.target.closest('a[href^="/settings/"]'); if (link && dialog.contains(link)) { resumeConnection = cid; dialog.close(); return; }
    const target = event.target.closest('button'); if (!target || target.disabled) return;
    try {
      if (target.hasAttribute('data-images-connections')) { openConnections(); return; }
      if (target.hasAttribute('data-images-dialog-close')) { if (!saving) dialog.close(); return; }
      if (target.dataset.imagesPreset) { if (!saving) usePreset(target.dataset.imagesPreset); return; }
      if (target.dataset.imagesFormat) { if (!saving) { editingFormat = target.dataset.imagesFormat; paintConn(); } return; }
      if (target.hasAttribute('data-images-add-connection')) { if (!saving) editConnection(''); return; }
      if (target.dataset.imagesEditConnection) { if (!saving) editConnection(target.dataset.imagesEditConnection); return; }
      if (target.dataset.imagesDeleteConnection) {
        const id = target.dataset.imagesDeleteConnection;
        if (!confirm(L('images.service.delete-confirm'))) return;
        target.disabled = true;
        const enable = life.own(() => { target.disabled = false; });
        try {
          await request('DELETE', '/connections/' + encodeURIComponent(id));
          conns = conns.filter(item => item.id !== id);
          if (editingId === id) editConnection('');
          paintConnections(); saveDraft();
          say(L('images.service.deleted'), false, '[data-images-connection-note]');
        } finally { enable(); }
        return;
      }
      if (target.dataset.imagesUseConnection) {
        cid = target.dataset.imagesUseConnection; serviceMenu.open = false; syncParameters(); saveDraft(); return;
      }
      if (target.hasAttribute('data-images-new')) { say(''); showCompose(true); return; }
      if (target.hasAttribute('data-images-back')) {
        jobId = ''; publishContext(null); root.dataset.expanded = 'false'; $('[data-images-workspace]').hidden = true; saveDraft(); return;
      }
      if (target.hasAttribute('data-images-refresh')) {
        target.disabled = true;
        const enable = life.own(() => { target.disabled = false; });
        say('');
        try { await Promise.all([loadConnections(), loadJobs()]); } finally { enable(); }
        return;
      }
      if (target.dataset.imagesJob) {
        const job = jobs.find(item => item.id === target.dataset.imagesJob);
        if (job) { jobId = job.id; say(''); expand(); paintList(); paintResult(job); saveDraft(); }
        return;
      }
      if (target.dataset.imagesReuse) {
        const job = jobs.find(item => item.id === target.dataset.imagesReuse); if (!job) return;
        prompt.value = job.prompt; size.value = job.size || ''; ratio.value = job.aspect_ratio || '';
        cid = job.connection_id;
        pending = null; syncParameters(); say(''); showCompose(true); return;
      }
      if (target.dataset.imagesDeleteJob) {
        const id = target.dataset.imagesDeleteJob, currentContext = context;
        if (!confirm(L('images.result.delete-confirm'))) return;
        target.disabled = true;
        const enable = life.own(() => { target.disabled = false; });
        try {
          await request('DELETE', '/jobs/' + encodeURIComponent(id));
          if (currentContext !== projectId()) return;
          jobs = jobs.filter(item => item.id !== id);
          if (jobId === id) showCompose();
          paintList(); saveDraft(); schedulePoll();
        } finally { enable(); }
        return;
      }
      if (target.dataset.imagesCancel && !cancelling) {
        const currentContext = context, id = target.dataset.imagesCancel;
        cancelling = true; paintResult(jobs.find(item => item.id === jobId));
        try {
          const payload = await request('POST', '/jobs/' + encodeURIComponent(id) + '/cancel', {});
          if (life.alive && currentContext === projectId()) { rememberJob(payload.job); schedulePoll(); }
        } finally {
          if (life.alive && currentContext === projectId()) { cancelling = false; paintResult(jobs.find(item => item.id === jobId)); }
        }
      }
    } catch (error) { say(error.message || L('images.error.request'), true); }
  });
  // The stage stays as the workbench set it (its list first); the composer opens from 新建图片 or a chosen record. Since the
  // client loads when its surface opens (#150), expanding here would override the workbench's own choice.
  restoreDraft(); syncGenerate(); syncSaving();
  life.whenVisible(signal => {
    viewSignal = signal; ensureContext(); syncGenerate();
    void Promise.all([loadConnections(signal), loadJobs(signal)]).catch(error => {
      if (!signal.aborted) say(error.message || L('images.error.request'), true);
    });
    return () => { life.clearTimeout(timer); listSeq++; loadSeq++; };
  });
}`;
