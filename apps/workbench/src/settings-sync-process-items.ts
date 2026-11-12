/**
 * The person's process-item steps in sync settings (specs/batch-06-shared-tools/sync-cutover.md steps 1–5; layout chosen by the user
 * 2026-11-12): four rows in order, each with its state, and a button only on the step whose turn it is, behind a confirmation. Read
 * when the page opens and after each step, not on the page's periodic refresh: reading it asks the service and checks the kept file.
 */
export const SYNC_PROCESS_ITEMS_SCRIPT=String.raw`
    const steps=root.querySelector('[data-sync-process-items]');
    const stepRow=(title,text,action)=>{const row=node('div','settings-setting-row'),copy=node('span','setting-copy');copy.append(node('strong','',L(title)),node('span','settings-muted',text));row.append(copy);if(action)row.append(action);return row;};
    const stepButton=(label,title,text,path)=>{const el=button(label,()=>sheet(title,node('p','',L(text)),[[label,async()=>{const response=await request('/process-items'+path,{},'POST');if(root.isConnected){drawSteps(response.status,response);load();}}]]));el.dataset.processItemsStep=path.slice(1);return el;};
    const drawSteps=(view,result)=>{
      const selected=state?.policy?.selections?.some(s=>s.collection_id==='process_items');
      if(!view||view.available===false||(!selected&&view.cutover?.phase==='open')){steps.hidden=true;return;}
      steps.hidden=false;steps.replaceChildren(node('h2','',L('过程项同步切换')));
      const phase=view.cutover?.phase,complete=phase==='complete',kept=view.capture;
      const unsettled=view.projects.filter(p=>p.unsettled.length),moving=view.projects.filter(p=>p.layout!=='current'||p.pending||p.unsettled.length||p.refused.length);
      steps.append(stepRow('① 切换过程项同步',L(complete?'已完成（任一设备一次）':phase==='unsupported'?'同步服务尚不支持切换':phase==='seeding'?'切换进行中，可继续':'待做'),
        complete||phase==='unsupported'?null:stepButton('切换','切换过程项同步？','把这个账号的过程项从旧同步流搬到新流。任一设备做一次即可；完成后每台设备再各自采用。','/cut-over')));
      steps.append(stepRow('② 保全本机未上传的过程项',kept?L('已保全 {count} 项',{count:kept.items.length}):unsettled.length?L('待做 · {count} 个项目',{count:unsettled.length}):L('这台设备不需要'),
        complete&&unsettled.length&&!kept?stepButton('保全','保全本机未上传的过程项？','把本机还没上传的过程项原样存成恢复件，采用后再由你接管。原内容不变。','/capture'):null));
      steps.append(stepRow('③ 采用本机项目库并接上新流',view.adopted?L('已采用，本机已接上新流'):!complete?L('等①完成'):unsettled.length&&!kept?L('等②完成'):L('待做 · {count} 个项目',{count:moving.length}),
        complete&&!view.adopted&&(!unsettled.length||kept)?stepButton('采用','采用本机项目库？','逐个关闭并采用要搬的项目库，先各存一份备份；全部成功后本机接上新流。有项目无法采用时，本机不接新流，原库不变。','/adopt'):null));
      for(const p of view.projects)if(p.refused.length)steps.append(node('p','settings-form-error',L('「{name}」无法采用：{reason}',{name:p.name,reason:p.refused.join('；')})));
      for(const p of result?.projects||[])if(p.state==='refused')steps.append(node('p','settings-form-error',L('「{name}」无法采用：{reason}',{name:view.projects.find(row=>row.project_id===p.project_id)?.name||p.project_id,reason:p.refused.join('；')})));
      steps.append(stepRow('④ 接管保全的过程项',!kept?L('这台设备不需要'):view.adopted?L('{count} 项可接管',{count:kept.items.length}):L('等③完成'),kept&&view.adopted?stepButton('接管全部','接管保全的过程项？','逐项与新流比较：相同的不动，新流没有的作为新写入上传，有分歧的列为同步冲突，由你选择保留哪一版。','/take-over'):null));
      if(kept&&view.adopted){const list=node('ul','settings-muted');for(const item of kept.items)list.append(node('li','',item.name+' · '+item.artifact_id+' · '+(item.versions===null?L('本机已删除'):L('本机 {count} 版',{count:item.versions}))));steps.append(list);}
      if(result?.outcomes){const count=kind=>result.outcomes.filter(row=>row.outcome===kind).length;steps.append(node('p','',L('结果：相同 {same} · 已排队 {queued} · 冲突 {conflict}（在下方「同步冲突」处理）',{same:count('same')+count('kept'),queued:count('queued'),conflict:count('conflict')})));}
    };
    const loadSteps=async()=>{try{const view=await request('/process-items');if(root.isConnected)drawSteps(view);}catch{if(root.isConnected)steps.hidden=true;}};
`;
