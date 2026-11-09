/**
 * The journey's text-model step (specs/archive/onboarding-model-link). It reads and saves through the model settings capability
 * (`/api/settings/models?setup=1` and the same save). The screen is a journey step: the question on the left, this
 * step's own content on the right. The settings document is not drawn here.
 */
export const ONBOARDING_MODEL_SLIDE_CLIENT = String.raw`
(() => {
  const draw = globalThis.molisWorkOnboardingDraw;
  const host = globalThis.molisWorkOnboardingModelHost;
  if (!draw || !host) return;
  const readText = draw.readText;
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
  const field = (id, label, extra, hint) => '<div class="ob-cfg-block"><label class="ob-label" for="' + id + '">' + globalThis.t.text(label) + '</label><input class="mw-input" id="' + id + '" data-ob-model-field ' + extra + ' autocomplete="off" spellcheck="false">' + (hint ? '<p class="ob-quiet">' + globalThis.t.text(hint) + '</p>' : '') + '</div>';
  const right = () => {
    const problem = host.problem();
    const problemLine = problem ? '<p class="ob-error" role="alert">' + draw.esc(problem) + '</p>' : '';
    if (!data) return draw.stageHead(globalThis.t.text("workbench.onboarding-model-slide.common-providers"), '') + draw.note(globalThis.t.text("workbench.onboarding-model-slide.preparing"), 'clock') + problemLine;
    const templates = data.templates || [];
    const chosen = templateOf(templateId);
    const choices = '<div class="mw-choice-group" role="group" aria-label="' + globalThis.t.text("workbench.onboarding-model-slide.common-providers") + '">' + templates.map(item => draw.choice({
      label: item.display_name, selected: item.template_id === templateId, attrs: { 'data-ob-template': item.template_id },
    })).join('') + '</div>';
    const missing = !chosen ? '' : !chosen.fills_base_url
      ? globalThis.t.text("workbench.onboarding-model-slide.name-format-chosen-still-needed-base-url-api", { name: chosen.display_name })
      : !chosen.fills_model
        ? globalThis.t.text("workbench.onboarding-model-slide.name-address-format-filled-still-needed-api-key", { name: chosen.display_name })
        : globalThis.t.text("workbench.onboarding-model-slide.name-address-format-model-filled-still-needed-api", { name: chosen.display_name });
    const form = !draft ? '' : '<div class="ob-model-form">'
      + (chosen && !chosen.fills_base_url ? field('ob-model-base', "workbench.onboarding-model-slide.base-url", 'type="url" inputmode="url" data-ob-base') : '')
      + (chosen && !chosen.fills_model ? field('ob-model-id', "workbench.onboarding-model-slide.model-id", 'data-ob-model-id') : '')
      + field('ob-model-key', "workbench.onboarding-model-slide.api-key", 'type="password" data-ob-key', "workbench.onboarding-model-slide.stored-only-computer-not-shown-again-after-saving")
      + (statusText ? '<p class="ob-quiet" role="status">' + draw.esc(statusText) + '</p>' : '')
      + (errorText ? '<p class="ob-error" role="alert">' + draw.esc(errorText) + '</p>' : '')
      + '</div>';
    const connected = host.modelLabel();
    const lead = draft ? missing : connected
      ? globalThis.t.text("workbench.onboarding-model-slide.connected-text-select-goes")
      : globalThis.t.text("workbench.onboarding-model-slide.pick-common-provider-its-address-format-filled-add");
    return draw.stageHead(globalThis.t.text("workbench.onboarding-model-slide.common-providers"), draw.esc(connected)) + draw.note(lead, draft ? 'key' : connected ? 'check' : 'key')
      + problemLine
      + (errorText && !draft ? '<p class="ob-error" role="alert">' + draw.esc(errorText) + '</p>' : '')
      + choices + form;
  };
  const view = () => {
    const offer = host.startOffer();
    const proceed = draw.primary(offer.label, 'start', { disabled: offer.disabled || saving });
    return {
      kind: 'onboard', view: 'model', step: 'model',
      left: draw.question(globalThis.t.text("workbench.onboarding-model-slide.connect-text-model"), globalThis.t.text("workbench.onboarding-model-slide.originals-kept-device-connect-write-summary-later")),
      right: right(),
      bar: {
        start: draw.exitButton() + draw.stepsBar('model'),
        center: draw.barStatus({ glyph: 'key', title: globalThis.t.text("workbench.onboarding-model-slide.text-model"), caption: globalThis.t.text(saving ? "workbench.onboarding-model-slide.checking-connection-then-saving" : "workbench.onboarding-model-slide.originals-kept-device-connect-write-summary-later") }),
        end: draft
          ? draw.secondary("common.control.back", 'model-back', { icon: 'back' }) + draw.secondary(offer.label, 'start', { disabled: offer.disabled || saving }) + draw.primary("workbench.onboarding-model-slide.save-configuration", 'model-save', { disabled: saving })
          : draw.secondary("common.control.back", 'model-back', { icon: 'back' }) + proceed,
      },
    };
  };
  const paint = (focus, part) => { host.render(focus, part); restore(); };
  const load = async template => molisWorkRequest('/api/settings/models?setup=1' + (template ? '&template=' + encodeURIComponent(template) : ''), { fallback: globalThis.t.text("workbench.onboarding-model-slide.cannot-load-model-settings") });
  const fail = error => molisWorkRequest.text(error, globalThis.t.text("workbench.onboarding-model-slide.model-settings-operation-failed"));
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
      saving = true; errorText = ''; statusText = globalThis.t.text("workbench.onboarding-model-slide.checking-connection-then-saving");
      paint();
      try {
        const modelId = (document.querySelector('[data-ob-model-id]') ? typed.modelId : (provider.models[0]?.model_id || '')).trim();
        const base = (document.querySelector('[data-ob-base]') ? typed.base : provider.base_url).trim();
        await molisWorkRequest('/api/settings/models/' + encodeURIComponent(provider.provider_id), {
          method: 'POST', fallback: globalThis.t.text("workbench.onboarding-model-slide.model-settings-operation-failed"),
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
        if (!draft) errorText = globalThis.t.text("workbench.onboarding-model-slide.cannot-load-model-settings");
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
