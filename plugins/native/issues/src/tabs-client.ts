/** Two mounted views keep in-flight Assistant work and unsaved edits with their owner. */
export const ISSUE_TABS_CLIENT_SCRIPT = String.raw`
  if (host.side) {
    const panels = [root.cloneNode(true), root.cloneNode(true)];
    const tabs = document.createElement('div'); tabs.className='issues-tabs-bar'; tabs.role='tablist'; tabs.ariaLabel='Issue';
    tabs.innerHTML = ['记录Issue','Issue列表'].map((label,index) => '<button type="button" class="mw-btn mw-btn--ghost" role="tab" id="issue-tab-'+index+'" aria-controls="issue-panel-'+index+'">'+label+'</button>').join('');
    const buttons = [...tabs.children];
    panels.forEach((panel,index) => {
      // Both forms share the same renderer; keep their label and dialog references distinct.
      if(index) for(const node of panel.querySelectorAll('*')) for(const attribute of ['id','for','aria-labelledby','aria-describedby']) {
        const value=node.getAttribute(attribute); if(value) node.setAttribute(attribute,value.split(' ').map(id=>'list-'+id).join(' '));
      }
      panel.id='issue-panel-'+index; panel.role='tabpanel'; panel.setAttribute('aria-labelledby',buttons[index].id);
    });
    root.className='issues-tabs'; root.replaceChildren(tabs,...panels);
    const select = index => panels.forEach((panel,i) => {
      panel.hidden=i!==index; buttons[i].setAttribute('aria-selected',String(i===index)); buttons[i].tabIndex=i===index?0:-1;
    });
    select(0);
    const history = mountIssues({...host,root:panels[1],side:false,onNew:()=>select(0)});
    const capture = mountIssues({...host,root:panels[0],side:false,capture:true,onSaved:issue=>{
      if(!panels[0].hidden && history.show(issue)) { capture.reset(); select(1); }
    }});
    scope.listen(tabs,'click',event => { const index=buttons.indexOf(event.target.closest('button')); if(index>=0) select(index); });
    scope.listen(tabs,'keydown',event => {
      const index=buttons.indexOf(event.target); if(index<0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); const next=event.key==='Home'?0:event.key==='End'?1:1-index; select(next); buttons[next].focus();
    });
    return;
  }
`;
