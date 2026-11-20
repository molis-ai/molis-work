/** Read-only field comparison. It never merges or interprets a version as execution authority. */
export const SYNC_COMPARISON_SCRIPT=String.raw`
    const comparison=(view,collection)=>{
      const body=node('div',''),labels={title:"workbench.settings-sync-comparison.title",name:"workbench.settings-sync-comparison.name",body:"workbench.settings-sync-comparison.body",markdown:"workbench.settings-sync-comparison.body",content:"workbench.settings-sync-comparison.content",text:"workbench.settings-sync-comparison.text",description:"workbench.settings-sync-comparison.description",state:"workbench.settings-sync-comparison.status",status:"workbench.settings-sync-comparison.status",questions:"workbench.settings-sync-comparison.problem",answers:"workbench.settings-sync-comparison.answer",submissions:"workbench.settings-sync-comparison.submissions",children:"workbench.settings-sync-comparison.child-items",record:"workbench.settings-sync-comparison.capture",facts:"workbench.settings-sync-comparison.business-content",project:"workbench.settings-sync-comparison.project",plugins:"workbench.settings-sync-comparison.plugin",events:"workbench.settings-sync-comparison.history",references:"workbench.settings-sync-comparison.relate",created_at:"workbench.settings-sync-comparison.created",updated_at:"workbench.settings-sync-comparison.updated"};
      const scalar=v=>v===undefined?readText("workbench.settings-sync-comparison.not-present"):v===null?readText("workbench.settings-sync-comparison.deleted"):typeof v==='string'?v:JSON.stringify(v);
      const changes=[];let visited=0,limited=false,imageBudget=4e6;
      const isImage=v=>v&&['image/png','image/jpeg','image/webp'].includes(v.mime_type)&&typeof v.id==='string';
      const imageSource=v=>{
        if(!isImage(v)||typeof v.data_base64!=='string'||v.data_base64.length>Math.min(14e5,imageBudget)||!/^[a-zA-Z0-9+/]+={0,2}$/.test(v.data_base64))return null;
        imageBudget-=v.data_base64.length;return 'data:'+v.mime_type+';base64,'+v.data_base64;
      };
      const walk=(a,b,path)=>{
        if(++visited>5000){limited=true;return;}if(JSON.stringify(a)===JSON.stringify(b))return;
        const images=[imageSource(a),imageSource(b)];
        if(Array.isArray(a)&&Array.isArray(b)&&a.length+b.length<=200&&a.every(isImage)&&b.every(isImage)){
          const l=new Map(a.map(i=>[i.id,i])),r=new Map(b.map(i=>[i.id,i]));
          if(l.size===a.length&&r.size===b.length){for(const id of new Set([...l.keys(),...r.keys()]))walk(l.get(id),r.get(id),[...path,id]);return;}
        }
        if(!images.some(Boolean)&&a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[k],b[k],[...path,labels[k]?readText(labels[k]):k]);return;}
        changes.push({path:path.join(' › ')||readText("workbench.settings-sync-comparison.entire-item"),a,b,images});
      };walk(view.local,view.remote,[]);
      body.append(node('p','settings-muted',collection.title+' · '+readText("workbench.settings-sync-comparison.changed-fields")+' '+changes.length+(limited?' · '+readText("workbench.settings-sync-comparison.some-changes-not-expanded"):'')));
      const localLabel="workbench.settings-sync-comparison.local-version",cloudLabel="workbench.settings-sync-comparison.cloud-version";
      const table=node('table',''),head=node('tr','');
      for(const l of ["workbench.settings-sync-comparison.field",localLabel,cloudLabel])head.append(node('th','',readText(l)));
      table.append(head);table.style.cssText='width:100%;table-layout:fixed';
      let diffBudget=1e5;
      const comparisonLines=(a,b)=>{
        if(!((typeof a==='string'&&typeof b==='string'&&(a.includes('\n')||b.includes('\n')))||(Array.isArray(a)&&Array.isArray(b))))return null;
        const sides=[a,b].map(v=>Array.isArray(v)?v.map(scalar):v.split('\n')),[l,r]=sides,cost=(l.length+1)*(r.length+1)+l.length+r.length;
        if(cost>diffBudget||l.length>150||r.length>150||l.join('').length+r.join('').length>12000)return null;
        diffBudget-=cost;
        const lcs=Array.from({length:l.length+1},()=>new Uint16Array(r.length+1));
        for(let i=l.length-1;i>=0;i--)for(let j=r.length-1;j>=0;j--)lcs[i][j]=l[i]===r[j]?1+lcs[i+1][j+1]:Math.max(lcs[i+1][j],lcs[i][j+1]);
        const same=[new Set(),new Set()];
        for(let i=0,j=0;i<l.length&&j<r.length;)l[i]===r[j]?(same[0].add(i++),same[1].add(j++)):lcs[i+1][j]>=lcs[i][j+1]?i++:j++;
        return sides.map((s,k)=>s.map((t,n)=>same[k].has(n)?document.createTextNode('  '+t+'\n'):node(k?'ins':'del','',(k?'+ ':'− ')+t+'\n')));
      };
      for(const c of changes){
        const row=node('tr','');row.append(node('th','',c.path));const diff=comparisonLines(c.a,c.b);
        for(const [side,value] of [c.a,c.b].entries()){
          const cell=node('td',''),image=c.images[side];
          if(image){const img=node('img','');img.src=image;img.alt=readText(side?cloudLabel:localLabel);img.style.cssText='max-width:100%;max-height:240px;object-fit:contain';cell.append(img);row.append(cell);continue;}
          const text=scalar(value),pre=node('pre','settings-connection-output',diff?'':text.length>2000?text.slice(0,2000)+'\n…':text);
          pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';if(diff)pre.append(...diff[side]);cell.append(pre);
          if(!diff&&text.length>2000)cell.append(button("workbench.settings-sync-comparison.expand-full-content",()=>{pre.textContent=text;}));
          row.append(cell);
        }table.append(row);
      }body.append(table);
      const raw=node('details','settings-data-disclosure');raw.append(node('summary','',readText("workbench.settings-sync-comparison.complete-versions")));
      for(const [side,label] of [['local',localLabel],['remote',cloudLabel]]){
        const text=JSON.stringify(view[side],null,2)||'null';raw.append(node('h3','',readText(label)),node('pre','settings-connection-output',text.length>20000?text.slice(0,20000)+'\n… '+readText("workbench.settings-sync-comparison.long-content-shortened-preview"):text));
        raw.append(button("workbench.settings-sync-comparison.export-complete-version",()=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=node('a','');link.href=url;link.download='sync-'+side+'-'+view.revision+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
      }body.append(raw);
      if(view.location){const target=new URL(view.location,location.origin);if(target.origin===location.origin&&target.protocol===location.protocol){const link=node('a','mw-btn mw-btn--secondary',readText("workbench.settings-sync-comparison.locate-current-content"));link.href=target.pathname+target.search+target.hash;body.prepend(link);}}
      return body;
    };
`;
