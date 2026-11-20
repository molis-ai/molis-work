/** Context onboarding welcome steps (opening, language, appearance), spliced into CONTEXT_ONBOARDING_CLIENT. */
export const CONTEXT_ONBOARDING_WELCOME_PART = String.raw`  /* ───────── The opening and the two Welcome questions ───────── */
  function opening() {
    return {kind:'opening', view:'opening', step:'', html:'<div class="stage-single"><div class="stage-sheet opening" data-view="opening"><div class="opening-glow" aria-hidden="true"></div><div class="opening-copy"><div class="opening-caption">' + (document.getElementById('cx-caption')?.innerHTML || '') + '</div><h1 class="ob-greeting-wordmark" id="ob-title" tabindex="-1">' + (document.getElementById('cx-wordmark')?.innerHTML || '') + '</h1></div></div></div>',
      bar:{start:exitButton(), center:'', end:primary("workbench.context-onboarding.begin",'intro-next')}};
  }
  function language() {
    const current = document.documentElement.dataset.uiLanguageTag;
    const catalog = globalThis.molisWorkLanguageCatalog?.().languages || [];
    const next = encodeURIComponent(location.pathname + location.search);
    const option = row => '<a class="mw-choice" data-slot="choice" data-ui-language="' + row.tag + '" href="/locale?lang=' + row.tag + '&next=' + next + '" lang="' + row.html_lang + '" hreflang="' + row.html_lang + '"' + (current === row.tag ? ' aria-current="true"' : '') + '><span class="mw-choice__label">' + esc(row.name) + '</span><span class="mw-choice__check" aria-hidden="true">' + glyph('check') + '</span></a>';
    return {kind:'welcome', view:'language', step:'language',
      html:'<div class="stage-single"><div class="stage-sheet welcome" data-view="welcome" data-step="language"><section class="welcome-q">' + title(globalThis.t.text("workbench.context-onboarding.language")) + '<p>' + globalThis.t.text("workbench.context-onboarding.start-language-know-best-can-change-settings-any") + '</p><div class="welcome-options" role="group" aria-label="' + globalThis.t.text("workbench.context-onboarding.language-2") + '">' + catalog.map(option).join('') + '</div></section><aside class="welcome-scene" aria-hidden="true"><div class="ob-greeting"><strong lang="' + document.documentElement.lang + '">' + globalThis.t("workbench.context-onboarding.greeting") + '</strong><span>Molis Work</span></div></aside></div></div>',
      bar:{start:exitButton() + stepsBar('language'), center:'', end:primary("workbench.context-onboarding.continue",'intro-next')}};
  }
  const miniRow = (g, w, s) => '<div class="ob-mini-row"><i>' + glyph(g) + '</i><span><b style="width:' + w + '%"></b><s style="width:' + s + '%"></s></span></div>';
  function miniWorkbench() {
    const row = miniRow;
    return '<div class="ob-mini"><div class="ob-mini-surface"><b class="ob-mini-title"></b>' + row('target',62,40) + row('rss',48,58) + row('note',70,36) + '</div><div class="ob-mini-bar"><span class="ob-mini-dock"><i></i><i class="is-on"></i><i></i></span><span class="ob-mini-composer"><i></i><em></em></span><span class="ob-mini-avatar"></span></div></div>';
  }
  function appearance() {
    const prefs = globalThis.molisWorkPreferences, theme = prefs ? prefs.theme() : 'system', density = prefs ? prefs.density() : 'standard';
    const opt = (attr, value, label, current, g) => choice({label:globalThis.t.text(label), icon:g, selected:current === value, attrs:{[attr]:value}});
    return {kind:'welcome', view:'appearance', step:'appearance',
      html:'<div class="stage-single"><div class="stage-sheet welcome" data-view="welcome" data-step="appearance"><section class="welcome-q">' + title(globalThis.t.text("workbench.context-onboarding.appearance")) + '<p>' + globalThis.t.text("workbench.context-onboarding.choose-light-dark-follow-system-changes-apply-once") + '</p><div class="welcome-options" role="group" aria-label="' + globalThis.t.text("workbench.context-onboarding.theme") + '">' + opt('data-theme-option','light',"workbench.context-onboarding.light",theme,'sun') + opt('data-theme-option','dark',"workbench.context-onboarding.dark",theme,'moon') + opt('data-theme-option','system',"workbench.context-onboarding.follow-system",theme,'system') + '</div><p class="welcome-label">' + globalThis.t.text("workbench.context-onboarding.interface-density") + '</p><div class="welcome-options" role="group" aria-label="' + globalThis.t.text("workbench.context-onboarding.interface-density") + '">' + opt('data-density-option','standard',"workbench.context-onboarding.standard",density,'rows') + opt('data-density-option','compact',"workbench.context-onboarding.compact",density,'list') + '</div></section><aside class="welcome-scene" aria-hidden="true">' + miniWorkbench() + '</aside></div></div>',
      bar:{start:btn({variant:'ghost', size:'lg', label:globalThis.t.text("workbench.context-onboarding.previous"), cls:'arrival-back', attrs:{'data-action':'intro-back'}}) + stepsBar('appearance'), center:'', end:primary("workbench.context-onboarding.continue",'intro-next')}};
  }`;
