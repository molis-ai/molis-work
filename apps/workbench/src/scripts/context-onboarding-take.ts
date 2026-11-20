/** The choices of a plugin to take what onboarding hands over (the code folder, the drafts, the documents), joined into the onboarding browser program. */
export const CONTEXT_ONBOARDING_TAKE_PART = String.raw`
  /* The person's own folder, when a code root, can go on to one plugin that declares it takes one (ONB-44, batch12-design §7): it becomes the output; only when ticked, one at most. */
  let takePicked='', lastTakers=[]; function takers(){if(journey&&Array.isArray(journey.takers))lastTakers=journey.takers;return lastTakers;}
  function codeFolder(){const c=source('custom');return c&&c.selected&&c.path&&(c.metadata?.files||[]).some(f=>codeRootFile(f.path))?c.path:'';}
  function takeChoice(){const folder=codeFolder(), name=folder.split('/').filter(Boolean).pop()||folder, list=takers();if(!folder||!list.length)return '';if(!list.some(t=>t.plugin_id===takePicked))takePicked='';
    return '<div class="ob-name" role="group">'+list.map(t=>'<label class="mw-file-row__label"><input type="checkbox" class="mw-check" id="cx-take-'+esc(t.plugin_id)+'" data-take="'+esc(t.plugin_id)+'" '+(takePicked===t.plugin_id?'checked':'')+'><span class="cx-draft-copy"><span class="mw-file-row__name">'+globalThis.t.text("workbench.context-onboarding.hand-folder-to",{folder:esc(name),plugin:esc(t.name)})+'</span><small class="cx-draft-meta">'+globalThis.t.text("workbench.context-onboarding.hand-folder-to-hint",{plugin:esc(t.name)})+'</small></span></label>').join('')+'</div>';}
  /* Which plugin drafts and which keeps the documents, only when several declare it (contract-design §2.5): drafting starts while reading, so it is chosen with the sources; documents with the name. */
  let draftsPicked='', documentsPicked='';
  function pickOne(list, picked, attr, label){if(list.length<2)return '';
    return '<div class="ob-name" role="radiogroup" aria-label="'+esc(label)+'"><span class="ob-label">'+esc(label)+'</span>'+list.map(t=>'<label class="mw-file-row__label"><input type="radio" class="mw-check" name="cx-'+attr+'" data-'+attr+'="'+esc(t.plugin_id)+'" '+(picked===t.plugin_id?'checked':'')+'><span class="mw-file-row__name">'+esc(t.name)+'</span></label>').join('')+'</div>';}
  function draftsChoice(){const list=config.draft_takers||[];if(!list.some(t=>t.plugin_id===draftsPicked))draftsPicked=list.some(t=>t.plugin_id===journey?.drafts_taker)?journey.drafts_taker:'';return pickOne(list,draftsPicked,'drafts-taker',globalThis.t.text("workbench.context-onboarding.drafts-taker"));}
  function documentsChoice(){const list=config.document_takers||[];if(!list.some(t=>t.plugin_id===documentsPicked))documentsPicked='';return pickOne(list,documentsPicked,'documents-taker',globalThis.t.text("workbench.context-onboarding.documents-taker"));}
  /* A handed folder that was not taken, or taken only in part (one call takes 30 materials at most): say so before going on. */
  function takeHeld(){const r=journey.take_result;if(r?.not_taken){takeNotice=r.not_taken;return true;}if(r&&r.materials<r.of){takeNotice='partial';return true;}return false;}
`;
