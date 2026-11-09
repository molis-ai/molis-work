/** The blank project's name, its preview and validation, joined into the onboarding browser program. */
export const CONTEXT_ONBOARDING_BLANK_NAME_PART = String.raw`
  function blankForm() {
    const title = blankName.trim();
    const preview = briefPreview(title || L('新项目'), '', {title:'接下来', body:'<p class="mw-brief__quiet">' + L('各插件有要推进或等你确认的事时，会出现在这里。') + '</p>'}, L('刚刚') + ' · ' + L(materialsOnly ? '带入已读取的资料' : '空白项目'));
    const left = question(L('给新项目一个名字'), L(materialsOnly ? '已导入的资料会带入项目，摘要可以稍后整理。' : '先建一个空间，资料和下一步可以慢慢补充。'))
      + '<form id="cx-blank-form" class="ob-name"><label class="ob-label" for="cx-blank-name">' + L('项目名称') + '</label>'
      + '<input class="mw-input ob-name__input" id="cx-blank-name" required aria-describedby="cx-blank-name-error" autocomplete="off" data-plain-field placeholder="' + esc(L('例如：秋季内容计划')) + '" value="' + esc(blankName) + '">'
      + '<p id="cx-blank-name-error" class="cx-error ob-error" role="alert">' + esc(failureText(error)) + '</p></form>'
      + (materialsOnly ? '' : '<p class="ob-quiet">' + L('还没想好是什么项目？') + ' ' + btn({variant:'link', size:'sm', label:L('先在个人空间开始'), attrs:{'data-action':'personal', disabled:busy}}) + '</p>');
    return {kind:'onboard', view:'blank', step:'来源', left, right:preview,
      bar:{start:exitButton() + steps(stepLabels().length, -1), center:barStatus({glyph:'plus', title:L(materialsOnly ? '带入已读取的资料' : '空白项目'), caption:title ? L('将创建「{name}」', {name:title}) : L('写下名字就可以开始')}),
        end:secondary(materialsOnly ? '返回' : '带入材料','back') + btn({variant:'primary', size:'lg', type:'submit', label:L(busy ? '正在创建…' : '创建项目'), key:'↵', cls:'ob-continue', disabled:busy, attrs:{form:'cx-blank-form', 'aria-keyshortcuts':'Enter'}})}};
  }
  function updateBlankName(field) {
    blankName = field.value;
    const title = blankName.trim();
    if (title && field.hasAttribute('aria-invalid')) {
      field.removeAttribute('aria-invalid');
      document.getElementById('cx-blank-name-error').textContent = '';
    }
    const preview = app.querySelector('.ob-project-name');
    if (preview) preview.textContent = title || L('新项目');
    const status = bar.querySelector('.mw-bar-status__text small');
    if (status) status.textContent = title ? L('将创建「{name}」', {name:title}) : L('写下名字就可以开始');
  }
  function showMissingBlankName(event) {
    const field = event.target;
    if (field.id !== 'cx-blank-name' || !field.validity.valueMissing) return;
    event.preventDefault();
    field.setAttribute('aria-invalid', 'true');
    document.getElementById('cx-blank-name-error').textContent = L('请填写项目名称');
    field.focus();
  }
  async function submitBlankName(event) {
    if (event.target.id !== 'cx-blank-form') return;
    event.preventDefault();
    busy = true;
    try { await adopt(true); }
    catch (failure) { error = keepFailure(failure); }
    finally { busy = false; render(blank && error ? 'cx-blank-name' : undefined); }
  }
`;
