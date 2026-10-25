/**
 * The journey's text-model step (specs/onboarding-model-link). It reads and saves through the model settings capability
 * (`/api/settings/models?setup=1` and the same save). The screen is a journey step: the question on the left, this
 * step's own content on the right. The settings document is not drawn here.
 */
export const ONBOARDING_MODEL_SLIDE_CLIENT = String.raw`
(() => {
  const draw = globalThis.molisWorkOnboardingDraw;
  const host = globalThis.molisWorkOnboardingModelHost;
  if (!draw || !host) return;
  const L = draw.L;
  let active = false, opening = false, saving = false, turn = 0;
  let data = null, templateId = null, draft = null, errorText = '', statusText = '';
  const typed = { key: '', modelId: '', base: '' };
  const templateOf = id => (data?.templates || []).find(item => item.template_id === id) || null;
  const remember = () => {
    const key = document.querySelector('[data-ob-key]');
    const model = document.querySelector('[data-ob-model-id]');
    const base = document.querySelector('[data-ob-base]');
    if (key) typed.key = key.value;
    if (model) typed.modelId = model.value;
    if (base) typed.base = base.value;
  };
  const restore = () => {
    const key = document.querySelector('[data-ob-key]');
    const model = document.querySelector('[data-ob-model-id]');
    const base = document.querySelector('[data-ob-base]');
    if (key) key.value = typed.key;
    if (model) model.value = typed.modelId;
    if (base) base.value = typed.base;
  };
  const field = (id, label, extra, hint) => '<div class="ob-cfg-block"><label class="ob-label" for="' + id + '">' + L(label) + '</label><input class="mw-input" id="' + id + '" data-ob-model-field ' + extra + ' autocomplete="off" spellcheck="false">' + (hint ? '<p class="ob-quiet">' + L(hint) + '</p>' : '') + '</div>';
  const right = () => {
    const problem = host.problem();
    const problemLine = problem ? '<p class="ob-error" role="alert">' + draw.esc(problem) + '</p>' : '';
    if (!data) return draw.stageHead(L('常用供应商'), '') + draw.note(L('正在准备…'), 'clock') + problemLine;
    const templates = data.templates || [];
    const chosen = templateOf(templateId);
    const choices = '<div class="mw-choice-group" role="group" aria-label="' + L('常用供应商') + '">' + templates.map(item => draw.choice({
      label: L(item.display_name), selected: item.template_id === templateId, attrs: { 'data-ob-template': item.template_id },
    })).join('') + '</div>';
    const missing = !chosen ? '' : !chosen.fills_base_url
      ? L('{name} 的格式已经选好，还差 Base URL、API Key 和模型 ID。', { name: L(chosen.display_name) })
      : !chosen.fills_model
        ? L('{name} 的地址和格式已经填好，还差 API Key 和模型 ID。', { name: L(chosen.display_name) })
        : L('{name} 的地址、格式和模型已经填好，还差 API Key。', { name: L(chosen.display_name) });
    const form = !draft ? '' : '<div class="ob-model-form">'
      + (chosen && !chosen.fills_base_url ? field('ob-model-base', 'Base URL', 'type="url" inputmode="url" data-ob-base') : '')
      + (chosen && !chosen.fills_model ? field('ob-model-id', '模型 ID', 'data-ob-model-id') : '')
      + field('ob-model-key', 'API Key', 'type="password" data-ob-key', '只保存在本机，保存后不再显示。')
      + (statusText ? '<p class="ob-quiet" role="status">' + draw.esc(statusText) + '</p>' : '')
      + (errorText ? '<p class="ob-error" role="alert">' + draw.esc(errorText) + '</p>' : '')
      + '</div>';
    const connected = host.modelLabel();
    const lead = draft ? missing : connected
      ? L('已连接 · 选中的正文会发给它整理')
      : L('选一个常用供应商，替你填好地址和格式，再填上 API Key 就能用。不在列表里的，选最后两个通用格式。');
    return draw.stageHead(L('常用供应商'), connected || '') + draw.note(lead, draft ? 'key' : connected ? 'check' : 'key')
      + problemLine
      + (errorText && !draft ? '<p class="ob-error" role="alert">' + draw.esc(errorText) + '</p>' : '')
      + choices + form;
  };
  const view = () => {
    const offer = host.startOffer();
    const proceed = draw.primary(offer.label, 'start', { disabled: offer.disabled || saving });
    return {
      kind: 'onboard', view: 'model', step: '模型',
      left: draw.question(L('连接文字模型'), L('原文先暂存在本机，连接后再生成摘要')),
      right: right(),
      bar: {
        start: draw.exitButton() + draw.stepsBar('模型'),
        center: draw.barStatus({ glyph: 'key', title: L('文字模型'), caption: L(saving ? '正在保存，并检查连接…' : '原文先暂存在本机，连接后再生成摘要') }),
        end: draft
          ? draw.secondary('返回', 'model-back', { icon: 'back' }) + draw.secondary(offer.label, 'start', { disabled: offer.disabled || saving }) + draw.primary('保存配置', 'model-save', { disabled: saving })
          : draw.secondary('返回', 'model-back', { icon: 'back' }) + proceed,
      },
    };
  };
  const paint = (focus, part) => { host.render(focus, part); restore(); };
  const load = async template => molisWorkRequest('/api/settings/models?setup=1' + (template ? '&template=' + encodeURIComponent(template) : ''), { fallback: L('无法读取模型设置') });
  const fail = error => molisWorkRequest.text(error, L('模型设置操作失败'));
  globalThis.molisWorkOnboardingModel = {
    get active() { return active; },
    ensure() {
      if (opening) return;
      if (data) { active = true; return; }
      void this.act('model');
    },
    close() { turn += 1; active = false; opening = false; saving = false; },
    view,
    async act(action) {
      if (action === 'model') {
        host.showModel();
        if (opening) return;
        if (data) { active = true; host.render(); return; }
        opening = true;
        const mine = ++turn;
        try {
          data = await load(null);
          if (mine !== turn) return;
          templateId = null; draft = null; errorText = ''; statusText = '';
          typed.key = ''; typed.modelId = ''; typed.base = '';
          active = true;
        } catch (error) {
          if (mine !== turn) return;
          data = { templates: [] }; draft = null; templateId = null;
          errorText = fail(error); active = true;
        } finally { opening = false; }
        if (mine === turn) host.render();
        return;
      }
      if (action === 'model-back') {
        turn += 1; active = false; saving = false;
        host.reviewFiles();
        await host.reload();
        host.render();
        return;
      }
      if (action !== 'model-save' || !draft || saving) return;
      remember();
      const provider = draft.provider;
      const mine = ++turn;
      saving = true; errorText = ''; statusText = L('正在保存，并检查连接…');
      paint();
      try {
        const modelId = (document.querySelector('[data-ob-model-id]') ? typed.modelId : (provider.models[0]?.model_id || '')).trim();
        const base = (document.querySelector('[data-ob-base]') ? typed.base : provider.base_url).trim();
        await molisWorkRequest('/api/settings/models/' + encodeURIComponent(provider.provider_id), {
          method: 'POST', fallback: L('模型设置操作失败'),
          body: {
            check_connection: true, display_name: provider.display_name, base_url: base, api_format: provider.api_format,
            enabled: true, prompt_cache: provider.prompt_cache || 'off', thinking: provider.thinking || 'off',
            models: (provider.models.length ? provider.models : [{ model_id: '', enabled: true }]).map((row, index) => ({
              model_id: index === 0 ? modelId : row.model_id, enabled: row.enabled !== false,
            })),
            connection_id: '',
            ...(typed.key.trim() ? { api_key: typed.key.trim() } : {}),
          },
        });
        if (mine !== turn) return;
        saving = false; active = false; typed.key = ''; statusText = ''; draft = null; templateId = null;
        await host.reload();
        host.render();
      } catch (error) {
        if (mine !== turn) return;
        saving = false; errorText = fail(error); statusText = '';
        paint('ob-model-key');
      }
    },
    async pick(id) {
      if (!active || saving || opening) return;
      remember();
      const mine = ++turn;
      opening = true; errorText = '';
      try {
        const next = await load(id);
        if (mine !== turn) return;
        draft = next.draft || null;
        templateId = draft ? id : null;
        if (!draft) errorText = L('无法读取模型设置');
        else { typed.key = ''; typed.modelId = ''; typed.base = ''; }
      } catch (error) {
        if (mine !== turn) return;
        errorText = fail(error);
      } finally { opening = false; }
      if (mine === turn) paint(draft ? 'ob-model-key' : undefined, 'right');
    },
  };
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      event.preventDefault();
      void globalThis.molisWorkOnboardingModel.act('model-back');
    } else if (event.key === 'Enter' && event.target?.matches?.('[data-ob-model-field]') && !event.isComposing) {
      event.preventDefault();
      document.querySelector('[data-action="model-save"]:not(:disabled)')?.click();
    }
  });
})();
`;
