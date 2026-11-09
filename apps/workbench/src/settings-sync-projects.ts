/** Uses the same settings lifetime, request gate and explicit confirmation sheets. */
export const SYNC_PROJECT_RECYCLE_SCRIPT=String.raw`
    root.querySelector('[data-sync-projects]').addEventListener('click',async()=>{
      try{
        const response=await request('/recycle',undefined,'GET','/api/settings/projects'),spaceId=state?.policy?.spaceId,body=node('div','');
        if(!root.isConnected)return;
        if(!response.items.length)body.append(node('p','settings-muted',globalThis.t.text("workbench.settings-sync-projects.no-projects")));
        for(const item of response.items){
          const row=node('section','settings-section'),action=item.recycled?"workbench.settings-sync-projects.restore-project":"workbench.settings-sync-projects.move-trash",operationId=crypto.randomUUID();
          row.append(node('h3','',item.display_name),node('p','settings-muted',globalThis.t.text(item.recycled?"workbench.settings-sync-projects.recycled":"workbench.settings-sync-projects.ok")));
          row.append(button(action,()=>sheet(action,node('p','',globalThis.t.text(item.recycled?"workbench.settings-sync-projects.restoring-does-not-start-tasks-terminals":"workbench.settings-sync-projects.project-content-retained-deletion-will-propagate-after-synchroni")),[
            [action,async()=>{if(state?.policy?.spaceId!==spaceId)throw new Error(globalThis.t.text("workbench.settings-sync-projects.synchronization-state-changed"));
              await request('/'+encodeURIComponent(item.project_id)+'/recycle',{recycled:!item.recycled,confirmed:true,expected_state:item.state,operation_id:operationId},'POST','/api/settings/projects');
              row.remove();root.querySelector('[data-sync-reload]')?.click();}]
          ])));body.append(row);
        }
        sheet("workbench.settings-sync-projects.project-recycle-bin",body,[]);
      }catch(failure){error.hidden=false;error.textContent=L(failure.message);}
    });
`;
