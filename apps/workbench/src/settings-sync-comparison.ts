/** Read-only field comparison. It never merges or interprets a version as execution authority. */
export const SYNC_COMPARISON_SCRIPT=String.raw`
    const comparison=(view,collection)=>{
      const body=node('div',''),labels={title:"workbench.settings-sync-comparison.title",name:"workbench.settings-sync-comparison.name",body:"workbench.settings-sync-comparison.body",markdown:"workbench.settings-sync-comparison.body",content:"workbench.settings-sync-comparison.content",text:"workbench.settings-sync-comparison.text",description:"workbench.settings-sync-comparison.description",state:"workbench.settings-sync-comparison.status",status:"workbench.settings-sync-comparison.status",questions:"workbench.settings-sync-comparison.problem",answers:"workbench.settings-sync-comparison.answer",submissions:"workbench.settings-sync-comparison.submissions",children:"workbench.settings-sync-comparison.child-items",record:"workbench.settings-sync-comparison.capture",facts:"workbench.settings-sync-comparison.business-content",project:"workbench.settings-sync-comparison.project",plugins:"workbench.settings-sync-comparison.plugin",events:"workbench.settings-sync-comparison.history",references:"workbench.settings-sync-comparison.relate",created_at:"workbench.settings-sync-comparison.created",updated_at:"workbench.settings-sync-comparison.updated"};
      const scalar=value=>value===undefined?globalThis.t.text("workbench.settings-sync-comparison.not-present"):value===null?globalThis.t.text("workbench.settings-sync-comparison.deleted"):typeof value==='string'?value:JSON.stringify(value);
      const changes=[];let visited=0,limited=false;
      const walk=(a,b,path)=>{
        if(++visited>5000){limited=true;return;}if(JSON.stringify(a)===JSON.stringify(b))return;
        const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
        if(object(a)&&object(b)){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[key],b[key],[...path,labels[key]?globalThis.t.text(labels[key]):key]);return;}
        changes.push({path:path.join(' › ')||globalThis.t.text("workbench.settings-sync-comparison.entire-item"),a,b});
      };walk(view.local,view.remote,[]);
      body.append(node('p','settings-muted',collection.title+' · '+globalThis.t.text("workbench.settings-sync-comparison.changed-fields")+' '+changes.length+(limited?' · '+globalThis.t.text("workbench.settings-sync-comparison.some-changes-not-expanded"):'')));
      const table=node('table',''),head=node('tr','');for(const label of ['字段','本机版本','云端版本'])head.append(node('th','',label));table.append(head);table.style.width='100%';table.style.tableLayout='fixed';
      for(const change of changes){const row=node('tr','');row.append(node('th','',change.path));for(const value of [change.a,change.b]){const cell=node('td',''),text=scalar(value),pre=node('pre','settings-connection-output',text.length>2000?text.slice(0,2000)+'\n…':text);pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';cell.append(pre);if(text.length>2000)cell.append(button("workbench.settings-sync-comparison.expand-full-content",()=>{pre.textContent=text;}));row.append(cell);}table.append(row);}body.append(table);
      const raw=node('details','settings-data-disclosure');raw.append(node('summary','',globalThis.t.text("workbench.settings-sync-comparison.complete-versions")));
      for(const [side,label] of [['local','本机版本'],['remote','云端版本']]){
        const text=JSON.stringify(view[side],null,2)||'null';raw.append(node('h3','',label),node('pre','settings-connection-output',text.length>20000?text.slice(0,20000)+'\n… '+globalThis.t.text("workbench.settings-sync-comparison.long-content-shortened-preview"):text));
        raw.append(button("workbench.settings-sync-comparison.export-complete-version",()=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=node('a','');link.href=url;link.download='sync-'+side+'-'+view.revision+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
      }body.append(raw);
      if(view.location){const target=new URL(view.location,location.origin);if(target.origin===location.origin&&target.protocol===location.protocol){const link=node('a','mw-btn mw-btn--secondary',globalThis.t.text("workbench.settings-sync-comparison.locate-current-content"));link.href=target.pathname+target.search+target.hash;body.prepend(link);}}
      return body;
    };
`;
