/** The browser owns drafts only; jobs and credentials belong to the local host. */
export const IMAGES_CLIENT_FACTORY_SCRIPT = String.raw`(host) => {
  const { translate: L } = host;
  const root = document.querySelector('[data-images=workbench]');
  if (!root || root.dataset.imagesBound) return;
  root.dataset.imagesBound = 'true';
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
  const connectionKey = $('[data-images-connection-key]');
  const serviceMenu = $('[data-images-service-menu]');
  let context = projectId(), connections = [], jobs = [], connectionId = '', selectedId = '';
  let editingId = '', editingFormat = 'openai-images', pending = null;
  let submitting = false, saving = false, cancelling = false, listSeq = 0, loadSeq = 0;
  let timer = 0, listSignature = '', resultSignature = '';
  const statuses = {
    running: L('生成中'), succeeded: L('已生成'), failed: L('生成失败'),
    cancelled: L('已停止本机等待'), interrupted: L('已中断'),
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
    const node = $(selector);
    node.textContent = message || ''; node.hidden = !message;
    node.classList.toggle('is-error', Boolean(message && isError));
  };
  const selectedConnection = () => connections.find(item => item.id === connectionId);
  const draftKey = () => 'molis-work-images-draft:' + context;
  const saveDraft = () => {
    try {
      sessionStorage.setItem(draftKey(), JSON.stringify({
        prompt: prompt.value, size: size.value, aspect_ratio: ratio.value,
        connection_id: connectionId, selected_id: selectedId, pending,
      }));
    } catch {}
  };
  const restoreDraft = () => {
    let draft = {};
    try { draft = JSON.parse(sessionStorage.getItem(draftKey()) || '{}') || {}; } catch {}
    prompt.value = typeof draft.prompt === 'string' ? draft.prompt : '';
    size.value = typeof draft.size === 'string' ? draft.size : '';
    ratio.value = typeof draft.aspect_ratio === 'string' ? draft.aspect_ratio : '';
    connectionId = typeof draft.connection_id === 'string' ? draft.connection_id : '';
    selectedId = typeof draft.selected_id === 'string' ? draft.selected_id : '';
    pending = draft.pending && typeof draft.pending.request_id === 'string' && typeof draft.pending.fingerprint === 'string' ? draft.pending : null;
  };
  const request = async (method, path, body) => {
    const response = await fetch(host.route('/api/images' + path), {
      method, cache: 'no-store',
      headers: molisWorkControlHeaders(),
      body: method === 'GET' || body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || L('图片服务请求失败'));
      error.httpStatus = response.status; throw error;
    }
    return payload;
  };
  const imageUrl = (job, image, download = false) => host.route('/api/images/jobs/' + encodeURIComponent(job.id) + '/images/' + encodeURIComponent(image.id)) + (download ? '?download=1' : '');
  const dateLabel = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString(document.documentElement.lang || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const syncGenerate = () => {
    generate.disabled = submitting || !context || !selectedConnection() || !prompt.value.trim();
    generate.textContent = submitting ? L('正在提交…') : L('生成图片');
    $('[data-images-project-note]').hidden = Boolean(context);
  };
  const syncParameters = () => {
    const connection = selectedConnection();
    $('[data-images-connected]').hidden = !connection;
    $('[data-images-connection-empty]').hidden = connections.length > 0;
    $('[data-images-service-label]').textContent = connection ? connection.name + ' · ' + connection.model : '';
    $('[data-images-size-field]').hidden = !connection || connection.api_format !== 'openai-images';
    $('[data-images-ratio-field]').hidden = !connection || connection.api_format !== 'gemini';
    $('[data-images-service-options]').querySelectorAll('[data-images-use-connection]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.imagesUseConnection === connectionId)));
    syncGenerate();
  };
  const paintConnections = () => {
    if (!connections.some(item => item.id === connectionId)) connectionId = connections[0]?.id || '';
    const options = $('[data-images-service-options]');
    options.replaceChildren(...connections.map(connection => {
      const node = button('', 'data-images-use-connection', connection.id);
      node.className = 'images-service-option';
      node.append(text('span', connection.name), text('small', connection.model));
      return node;
    }));
    $('[data-images-saved-connections]').replaceChildren(...connections.map(connection => {
      const node = button(connection.name, 'data-images-edit-connection', connection.id, 'secondary');
      node.setAttribute('aria-pressed', String(editingId === connection.id));
      return node;
    }));
    syncParameters();
  };
  const paintList = () => {
    const signature = JSON.stringify([jobs, selectedId]);
    if (signature === listSignature) return;
    listSignature = signature;
    const rows = $('[data-images-rows]');
    const list = $('[data-images=directory]');
    const top = list.scrollTop;
    $('[data-images-history-empty]').hidden = jobs.length > 0;
    rows.replaceChildren(...jobs.map(job => {
      const node = button('', 'data-images-job', job.id);
      node.className = 'feed-stage-entry directory-list-row images-history-row' + (selectedId === job.id ? ' is-selected' : '');
      node.setAttribute('aria-pressed', String(selectedId === job.id));
      if (job.images?.length) {
        const img = document.createElement('img'); img.className = 'images-history-thumb';
        img.src = imageUrl(job, job.images[0]); img.alt = ''; img.loading = 'lazy'; node.append(img);
      } else {
        const mark = document.createElement('span'); mark.className = 'images-history-thumb images-history-thumb-placeholder';
        mark.innerHTML = '<svg aria-hidden="true"><use href="#icon-image"></use></svg>'; node.append(mark);
      }
      const copy = text('span', '', 'images-history-copy');
      const title = text('strong', job.prompt); title.title = job.prompt;
      copy.append(title, text('small', (statuses[job.status] || job.status) + ' · ' + dateLabel(job.created_at)));
      node.append(copy); return node;
    }));
    list.scrollTop = top;
  };
  const expand = () => {
    root.dataset.expanded = 'true'; $('[data-images-workspace]').hidden = false;
  };
  const showCompose = (focus = false) => {
    selectedId = ''; resultSignature = ''; result.hidden = true; compose.hidden = false;
    $('[data-images-title]').textContent = L('新建图片');
    expand(); paintList(); saveDraft(); syncGenerate();
    if (focus) prompt.focus();
  };
  const paintResult = (job) => {
    if (!job || selectedId !== job.id) return;
    compose.hidden = true; result.hidden = false;
    $('[data-images-title]').textContent = L('生成结果');
    const signature = JSON.stringify([job, cancelling]);
    if (resultSignature === signature) return;
    resultSignature = signature; result.replaceChildren();
    const heading = text('div', '', 'images-result-heading');
    heading.append(text('h2', statuses[job.status] || job.status), button(L('使用这个提示词'), 'data-images-reuse', job.id, 'secondary'));
    result.append(heading, text('p', job.connection_name + ' · ' + job.model + ' · ' + dateLabel(job.created_at), 'images-result-meta'));
    if (job.status !== 'succeeded') {
      const panel = text('div', '', 'images-status-panel'); panel.dataset.status = job.status;
      const message = job.status === 'running' ? L('正在等待服务生成图片，可以离开此页后再回来查看。')
        : job.status === 'cancelled' ? L('本机已停止等待，远端请求可能仍在生成和计费。')
        : job.status === 'interrupted' ? L('上次生成因本机服务重启而中断。没有自动重新调用厂商。')
        : job.error || L('服务没有返回图片。请检查连接、模型与提示词。');
      panel.append(text('p', message));
      if (job.status === 'running') {
        panel.append(text('small', L('停止本机等待不能保证厂商停止处理或计费。')));
        const cancel = button(cancelling ? L('正在停止…') : L('停止本机等待'), 'data-images-cancel', job.id, 'secondary');
        cancel.disabled = cancelling; panel.append(cancel);
      } else {
        panel.append(text('small', L('可以复用提示词，调整服务配置后再次生成。再次生成会发起新的请求。')));
      }
      result.append(panel);
    }
    for (const item of job.images || []) {
      const figure = document.createElement('figure');
      const img = document.createElement('img'); img.className = 'images-result-image';
      img.src = imageUrl(job, item); img.alt = job.prompt;
      img.addEventListener('error', () => {
        const failure = text('p', L('图片暂时无法读取，请刷新记录后重试。'), 'images-note is-error');
        img.replaceWith(failure);
      }, { once: true });
      const caption = document.createElement('figcaption');
      const download = text('a', L('下载图片'), 'mw-btn mw-btn--secondary');
      download.href = imageUrl(job, item, true); download.download = item.filename;
      caption.append(text('span', Math.max(1, Math.round(item.byte_length / 1024)) + ' KB'), download);
      figure.append(img, caption); result.append(figure);
    }
    result.append(text('p', job.prompt, 'images-result-prompt'));
    if (job.size || job.aspect_ratio) result.append(text('p', (job.api_format === 'gemini' ? L('宽高比') : L('图片尺寸')) + ' · ' + (job.aspect_ratio || job.size), 'images-result-meta'));
  };
  const rememberJob = (job) => {
    listSeq += 1;
    const index = jobs.findIndex(item => item.id === job.id);
    if (index >= 0) jobs[index] = job; else jobs.unshift(job);
    paintList(); if (selectedId === job.id) paintResult(job);
  };
  const ensureContext = () => {
    if (context === projectId()) return;
    context = projectId(); listSeq += 1; loadSeq += 1; jobs = []; selectedId = '';
    pending = null; submitting = false; cancelling = false; listSignature = ''; resultSignature = '';
    clearTimeout(timer); restoreDraft(); paintList(); syncParameters();
    result.hidden = true; compose.hidden = false; say('');
  };
  const schedulePoll = () => {
    clearTimeout(timer);
    if (root.isConnected && jobs.some(job => job.status === 'running')) timer = setTimeout(() => loadJobs().catch(() => {}), 2500);
  };
  const loadJobs = async () => {
    if (!root.isConnected) return;
    ensureContext(); const currentContext = context; const seq = ++listSeq;
    try {
      const payload = await request('GET', '/jobs');
      if (currentContext !== projectId() || seq !== listSeq || !root.isConnected) return;
      jobs = Array.isArray(payload.jobs) ? payload.jobs : []; paintList();
      if (selectedId) {
        const job = jobs.find(item => item.id === selectedId);
        if (job) paintResult(job); else showCompose();
      }
      say('', false, '[data-images-list-note]');
    } catch (error) {
      if (currentContext !== projectId() || seq !== listSeq) return;
      say((error.message || L('无法读取生成记录')) + ' ' + L('可点击刷新重试。'), true, '[data-images-list-note]');
      if (selectedId) say(L('暂时无法更新进度，恢复连接后会继续读取。') + ' ' + L('可点击刷新重试。'), true);
      throw error;
    } finally {
      if (currentContext === projectId() && seq === listSeq) schedulePoll();
    }
  };
  const loadConnections = async () => {
    const seq = ++loadSeq;
    const payload = await request('GET', '/connections');
    if (seq !== loadSeq || !root.isConnected) return;
    connections = Array.isArray(payload.connections) ? payload.connections : []; paintConnections();
  };
  const syncConnectionEditor = () => {
    root.querySelectorAll('[data-images-format]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.imagesFormat === editingFormat)));
    root.querySelectorAll('[data-images-edit-connection]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.imagesEditConnection === editingId)));
    const existing = connections.find(item => item.id === editingId);
    const changedDestination = existing && (existing.api_format !== editingFormat || existing.base_url !== connectionUrl.value.trim());
    $('[data-images-key-help]').textContent = changedDestination ? L('修改 API 基址或协议后，请重新填写密钥。')
      : existing?.has_key ? L('已保存密钥。留空保留现有密钥。')
      : L('密钥只写入本机加密存储，不会出现在历史记录中。');
    $('[data-images-connection-heading]').textContent = editingId ? L('编辑服务') : L('添加服务');
  };
  const usePreset = (preset) => {
    editingFormat = preset === 'gemini' ? 'gemini' : 'openai-images';
    connectionName.value = preset === 'gemini' ? 'Gemini' : preset === 'openai' ? 'OpenAI' : '';
    connectionUrl.value = preset === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : preset === 'openai' ? 'https://api.openai.com/v1' : '';
    connectionModel.value = preset === 'gemini' ? 'gemini-3.1-flash-image' : preset === 'openai' ? 'gpt-image-1.5' : '';
    connectionKey.value = ''; syncConnectionEditor();
  };
  const editConnection = (id) => {
    const connection = connections.find(item => item.id === id); editingId = connection?.id || '';
    if (connection) {
      editingFormat = connection.api_format; connectionName.value = connection.name;
      connectionUrl.value = connection.base_url; connectionModel.value = connection.model; connectionKey.value = '';
      syncConnectionEditor();
    } else usePreset('openai');
    say('', false, '[data-images-connection-note]');
  };
  const openConnections = () => {
    editConnection(connectionId); if (!dialog.open) dialog.showModal(); connectionName.focus();
  };
  const syncSaving = () => {
    $('[data-images-connection-fields]').disabled = saving;
    dialog.querySelectorAll('[data-images-edit-connection], [data-images-add-connection], [data-images-dialog-close], [data-images-save-connection]').forEach(node => node.disabled = saving);
    $('[data-images-save-connection]').textContent = saving ? L('正在保存…') : L('保存服务');
  };
  connectionForm.addEventListener('submit', async event => {
    event.preventDefault(); if (saving || !connectionForm.reportValidity()) return;
    const input = {
      ...(editingId ? { id: editingId } : {}), name: connectionName.value.trim(), api_format: editingFormat,
      base_url: connectionUrl.value.trim(), model: connectionModel.value.trim(), api_key: connectionKey.value,
    };
    saving = true; syncSaving(); say('', false, '[data-images-connection-note]');
    try {
      const payload = await request('POST', '/connections', input);
      loadSeq += 1;
      const index = connections.findIndex(item => item.id === payload.connection.id);
      if (index >= 0) connections[index] = payload.connection; else connections.push(payload.connection);
      connectionId = payload.connection.id; editingId = connectionId; connectionKey.value = '';
      paintConnections(); saveDraft(); dialog.close(); say(L('服务已保存。可以开始生成图片。'));
    } catch (error) {
      say(error.message || L('保存服务失败'), true, '[data-images-connection-note]');
    } finally { input.api_key = ''; saving = false; syncSaving(); }
  });
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => { connectionKey.value = ''; });
  connectionUrl.addEventListener('input', syncConnectionEditor);
  compose.addEventListener('input', () => { saveDraft(); syncGenerate(); });
  compose.addEventListener('submit', async event => {
    event.preventDefault(); ensureContext();
    if (submitting || !context || !selectedConnection() || !compose.reportValidity()) return;
    const currentContext = context;
    const connection = selectedConnection();
    const body = { connection_id: connection.id, prompt: prompt.value.trim() };
    if (connection.api_format === 'gemini' && ratio.value.trim()) body.aspect_ratio = ratio.value.trim();
    if (connection.api_format === 'openai-images' && size.value.trim()) body.size = size.value.trim();
    const fingerprint = JSON.stringify(body);
    if (!pending || pending.fingerprint !== fingerprint) pending = { request_id: crypto.randomUUID(), fingerprint };
    body.request_id = pending.request_id; saveDraft(); submitting = true; syncGenerate(); say('');
    try {
      const payload = await request('POST', '/jobs', body);
      if (currentContext !== projectId()) return;
      pending = null; selectedId = payload.job.id; expand(); rememberJob(payload.job); saveDraft(); schedulePoll();
    } catch (error) {
      if (currentContext !== projectId()) return;
      const message = error.httpStatus ? error.message : L('提交结果未确认。再次点击生成会复用同一请求，避免重复创建任务。') + ' ' + (error.message || '');
      say(message, true);
      void loadJobs().catch(() => {});
    } finally {
      if (currentContext === projectId()) { submitting = false; syncGenerate(); }
    }
  });
  root.addEventListener('click', async event => {
    const target = event.target.closest('button'); if (!target || target.disabled) return;
    try {
      if (target.hasAttribute('data-images-connections')) { openConnections(); return; }
      if (target.hasAttribute('data-images-dialog-close')) { if (!saving) dialog.close(); return; }
      if (target.dataset.imagesPreset) { if (!saving) usePreset(target.dataset.imagesPreset); return; }
      if (target.dataset.imagesFormat) { if (!saving) { editingFormat = target.dataset.imagesFormat; syncConnectionEditor(); } return; }
      if (target.hasAttribute('data-images-add-connection')) { if (!saving) editConnection(''); return; }
      if (target.dataset.imagesEditConnection) { if (!saving) editConnection(target.dataset.imagesEditConnection); return; }
      if (target.dataset.imagesUseConnection) {
        connectionId = target.dataset.imagesUseConnection; serviceMenu.open = false; syncParameters(); saveDraft(); return;
      }
      if (target.hasAttribute('data-images-new')) { say(''); showCompose(true); return; }
      if (target.hasAttribute('data-images-back')) {
        root.dataset.expanded = 'false'; $('[data-images-workspace]').hidden = true; return;
      }
      if (target.hasAttribute('data-images-refresh')) {
        target.disabled = true;
        try { await Promise.all([loadConnections(), loadJobs()]); } finally { target.disabled = false; }
        return;
      }
      if (target.dataset.imagesJob) {
        const job = jobs.find(item => item.id === target.dataset.imagesJob);
        if (job) { selectedId = job.id; say(''); expand(); paintList(); paintResult(job); saveDraft(); }
        return;
      }
      if (target.dataset.imagesReuse) {
        const job = jobs.find(item => item.id === target.dataset.imagesReuse); if (!job) return;
        prompt.value = job.prompt; size.value = job.size || ''; ratio.value = job.aspect_ratio || '';
        if (connections.some(item => item.id === job.connection_id)) connectionId = job.connection_id;
        pending = null; syncParameters(); say(''); showCompose(true); return;
      }
      if (target.dataset.imagesCancel && !cancelling) {
        const currentContext = context, id = target.dataset.imagesCancel;
        cancelling = true; paintResult(jobs.find(item => item.id === selectedId));
        try {
          const payload = await request('POST', '/jobs/' + encodeURIComponent(id) + '/cancel', {});
          if (currentContext === projectId()) { rememberJob(payload.job); schedulePoll(); }
        } finally {
          if (currentContext === projectId()) { cancelling = false; paintResult(jobs.find(item => item.id === selectedId)); }
        }
      }
    } catch (error) { say(error.message || L('图片服务请求失败'), true); }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void loadJobs().catch(() => {});
  });
  const visibilityObserver = new MutationObserver(() => {
    if (!root.hidden && root.isConnected) {
      ensureContext(); syncGenerate(); void loadJobs().catch(() => {});
    }
  });
  visibilityObserver.observe(root, { attributes: true, attributeFilter: ['hidden'] });
  restoreDraft(); expand(); syncGenerate();
  void Promise.all([loadConnections(), loadJobs()]).catch(error => say(error.message || L('图片服务请求失败'), true));
}`;
