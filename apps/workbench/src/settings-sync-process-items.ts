/**
 * The person's process-item steps in sync settings (specs/batch-06-shared-tools/sync-cutover.md steps 1–5; layout chosen by the user
 * 2026-11-12): four rows in order, each with its state, and a button only on the step whose turn it is, behind a confirmation. Read
 * when the page opens and after each step, not on the page's periodic refresh: reading it asks the service and checks the kept file.
 */
export const SYNC_PROCESS_ITEMS_SCRIPT=String.raw`
    const steps=root.querySelector('[data-sync-process-items]');
    const stepRow=(title,text,action)=>{const row=node('div','settings-setting-row'),copy=node('span','setting-copy');copy.append(node('strong','',readText(title)),node('span','settings-muted',text));row.append(copy);if(action)row.append(action);return row;};
    const stepButton=(label,title,text,path)=>{const el=button(label,()=>sheet(title,node('p','',readText(text)),[[label,async()=>{const response=await request('/process-items'+path,{},'POST');if(root.isConnected){drawSteps(response.status,response);load();}}]]));el.dataset.processItemsStep=path.slice(1);return el;};
    const drawSteps=(view,result)=>{
      const selected=state?.policy?.selections?.some(s=>s.collection_id==='process_items');
      if(!view||view.available===false||(!selected&&view.cutover?.phase==='open')){steps.hidden=true;return;}
      steps.hidden=false;steps.replaceChildren(node('h2','',readText('workbench.settings-sync.steps-title')));
      const phase=view.cutover?.phase,complete=phase==='complete',kept=view.capture;
      const unsettled=view.projects.filter(p=>p.unsettled.length),moving=view.projects.filter(p=>p.layout!=='current'||p.pending||p.unsettled.length||p.refused.length);
      steps.append(stepRow('workbench.settings-sync.step-1',readText(complete?'workbench.settings-sync.done-once':phase==='unsupported'?'workbench.settings-sync.switch-unready':phase==='seeding'?'workbench.settings-sync.switch-resume':'workbench.settings-sync.step-to-do'),
        complete||phase==='unsupported'?null:stepButton('workbench.settings-sync.switch','workbench.settings-sync.switch-q','workbench.settings-sync.switch-detail','/cut-over')));
      steps.append(stepRow('workbench.settings-sync.step-2',kept?readText('workbench.settings-sync.count-kept',{count:kept.items.length}):unsettled.length?readText('workbench.settings-sync.to-do-n',{count:unsettled.length}):readText('workbench.settings-sync.not-needed'),
        complete&&unsettled.length&&!kept?stepButton('workbench.settings-sync.keep','workbench.settings-sync.keep-q','workbench.settings-sync.keep-detail','/capture'):null));
      steps.append(stepRow('workbench.settings-sync.step-3',view.adopted?readText('workbench.settings-sync.adopted'):!complete?readText('workbench.settings-sync.wait-step-1'):unsettled.length&&!kept?readText('workbench.settings-sync.wait-step-2'):readText('workbench.settings-sync.to-do-n',{count:moving.length}),
        complete&&!view.adopted&&(!unsettled.length||kept)?stepButton('workbench.knowledge-detail.adopt','workbench.settings-sync.adopt-q','workbench.settings-sync.adopt-detail','/adopt'):null));
      for(const p of view.projects)if(p.refused.length)steps.append(node('p','settings-form-error',readText('workbench.settings-sync.adopt-refused',{name:p.name,reason:p.refused.join(readText('workbench.kit.reason-separator'))})));
      for(const p of result?.projects||[])if(p.state==='refused')steps.append(node('p','settings-form-error',readText('workbench.settings-sync.adopt-refused',{name:view.projects.find(row=>row.project_id===p.project_id)?.name||p.project_id,reason:p.refused.join(readText('workbench.kit.reason-separator'))})));
      steps.append(stepRow('workbench.settings-sync.step-4',!kept?readText('workbench.settings-sync.not-needed'):view.adopted?readText('workbench.settings-sync.count-take-over',{count:kept.items.length}):readText('workbench.settings-sync.wait-step-3'),kept&&view.adopted?stepButton('workbench.settings-sync.take-over-all','workbench.settings-sync.take-q','workbench.settings-sync.take-detail','/take-over'):null));
      if(kept&&view.adopted){const list=node('ul','settings-muted');for(const item of kept.items)list.append(node('li','',item.name+' · '+item.artifact_id+' · '+(item.versions===null?readText('workbench.settings-sync.deleted-device'):readText('workbench.settings-sync.versions',{count:item.versions}))));steps.append(list);}
      if(result?.outcomes){const count=kind=>result.outcomes.filter(row=>row.outcome===kind).length;steps.append(node('p','',readText('workbench.settings-sync.take-result',{same:count('same')+count('kept'),queued:count('queued'),conflict:count('conflict')})));}
    };
    const loadSteps=async()=>{try{const view=await request('/process-items');if(root.isConnected)drawSteps(view);}catch{if(root.isConnected)steps.hidden=true;}};
`;
