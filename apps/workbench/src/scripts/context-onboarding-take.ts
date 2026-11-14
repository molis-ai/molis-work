/** The review step's choice of a plugin to take the person's code folder, joined into the onboarding browser program. */
export const CONTEXT_ONBOARDING_TAKE_PART = String.raw`
  /* The person's own folder, when a code root, can go on to one plugin that declares it takes one (ONB-44, batch12-design §7): it becomes the output; only when ticked, one at most. */
  let takePicked='', lastTakers=[]; function takers(){if(journey&&Array.isArray(journey.takers))lastTakers=journey.takers;return lastTakers;}
  function codeFolder(){const c=source('custom');return c&&c.selected&&c.path&&(c.metadata?.files||[]).some(f=>codeRootFile(f.path))?c.path:'';}
  function takeChoice(){const folder=codeFolder(), name=folder.split('/').filter(Boolean).pop()||folder, list=takers();if(!folder||!list.length)return '';if(!list.some(t=>t.plugin_id===takePicked))takePicked='';
    return '<div class="ob-name" role="group">'+list.map(t=>'<label class="mw-file-row__label"><input type="checkbox" class="mw-check" id="cx-take-'+esc(t.plugin_id)+'" data-take="'+esc(t.plugin_id)+'" '+(takePicked===t.plugin_id?'checked':'')+'><span class="cx-draft-copy"><span class="mw-file-row__name">'+globalThis.t.text("workbench.context-onboarding.hand-folder-to",{folder:esc(name),plugin:esc(t.name)})+'</span><small class="cx-draft-meta">'+globalThis.t.text("workbench.context-onboarding.hand-folder-to-hint",{plugin:esc(t.name)})+'</small></span></label>').join('')+'</div>';}
`;
