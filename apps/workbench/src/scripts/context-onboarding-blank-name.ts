/** The blank project's name, its preview and validation, joined into the onboarding browser program. */
export const CONTEXT_ONBOARDING_BLANK_NAME_PART = String.raw`
  function blankForm() {
    const title = blankName.trim();
    const preview = briefPreview(title || globalThis.t.text("workbench.context-onboarding.new-project"), '', {title:readText("workbench.project-brief.next"), body:'<p class="mw-brief__quiet">' + globalThis.t.text("workbench.context-onboarding.when-plugin-has-something-move-confirm-will-show") + '</p>'}, globalThis.t.text("workbench.context-onboarding.just-now") + ' · ' + globalThis.t.text(materialsOnly ? "workbench.context-onboarding.bring-materials-already-read" : "workbench.context-onboarding.blank-project"));
    const left = question(globalThis.t.text("workbench.context-onboarding.name-new-project-2"), globalThis.t.text(materialsOnly ? "workbench.context-onboarding.imported-materials-come-project-summary-can-be-written" : "workbench.context-onboarding.start-space-materials-next-steps-can-follow"))
      + '<form id="cx-blank-form" class="ob-name"><label class="ob-label" for="cx-blank-name">' + globalThis.t.text("workbench.context-onboarding.project-name") + '</label>'
      + '<input class="mw-input ob-name__input" id="cx-blank-name" required aria-describedby="cx-blank-name-error" autocomplete="off" data-plain-field placeholder="' + esc(globalThis.t.text("workbench.context-onboarding.example-autumn-content-plan")) + '" value="' + esc(blankName) + '">'
      + '<p id="cx-blank-name-error" class="cx-error ob-error" role="alert">' + esc(failureText(error)) + '</p></form>'
      + (materialsOnly ? '' : '<p class="ob-quiet">' + globalThis.t.text("workbench.context-onboarding.not-sure-what-project-yet") + ' ' + btn({variant:'link', size:'sm', label:globalThis.t.text("workbench.context-onboarding.start-personal-space"), attrs:{'data-action':'personal', disabled:busy}}) + '</p>');
    return {kind:'onboard', view:'blank', step:'sources', left, right:preview,
      bar:{start:exitButton() + steps(stepLabels().length, -1), center:barStatus({glyph:'plus', title:globalThis.t.text(materialsOnly ? "workbench.context-onboarding.bring-materials-already-read" : "workbench.context-onboarding.blank-project"), caption:title ? globalThis.t.text("workbench.context-onboarding.will-create-name", {name:title}) : globalThis.t.text("workbench.context-onboarding.write-name-begin")}),
        end:secondary(materialsOnly ? "common.control.back" : "workbench.context-onboarding.bring-materials",'back') + btn({variant:'primary', size:'lg', type:'submit', label:globalThis.t.text(busy ? "workbench.context-onboarding.creating" : "workbench.context-onboarding.create-project"), key:'↵', cls:'ob-continue', disabled:busy, attrs:{form:'cx-blank-form', 'aria-keyshortcuts':'Enter'}})}};
  }
  function updateBlankName(field) {
    blankName = field.value;
    const title = blankName.trim();
    if (title && field.hasAttribute('aria-invalid')) {
      field.removeAttribute('aria-invalid');
      document.getElementById('cx-blank-name-error').textContent = '';
    }
    const preview = app.querySelector('.ob-project-name');
    if (preview) preview.textContent = title || globalThis.t.text("workbench.context-onboarding.new-project");
    const status = bar.querySelector('.mw-bar-status__text small');
    if (status) status.textContent = title ? globalThis.t.text("workbench.context-onboarding.will-create-name", {name:title}) : globalThis.t.text("workbench.context-onboarding.write-name-begin");
  }
  function showMissingBlankName(event) {
    const field = event.target;
    if (field.id !== 'cx-blank-name' || !field.validity.valueMissing) return;
    event.preventDefault();
    field.setAttribute('aria-invalid', 'true');
    document.getElementById('cx-blank-name-error').textContent = globalThis.t.text("workbench.context-onboarding.project-name-required");
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
