import { icon } from "@molis-ai/molis-work-design-system";

/** Peer of capture/Assistant; deliberately not a project-installed plugin. */
export function renderImHostEntry(label = "群聊"): string {
  const text = label.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  return `<button class="immersive-plugin-link plugin-rail-item" type="button" data-im-toggle aria-pressed="false" aria-label="${text}" title="${text}">${icon("review")}<span>${text}</span></button>`;
}

export const IM_HOST_STYLES = `
body.immersive-workbench .im-host{position:fixed;inset:var(--desktop-titlebar-height,32px) 0 0 var(--plugin-rail-width,48px);z-index:9;background:var(--paper);overflow:hidden}
body.immersive-workbench .im-host iframe{display:block;border:0;width:100%;height:100%;background:var(--paper)}
body.immersive-workbench [data-im-toggle][aria-pressed=true]{background:var(--nav-selected,var(--wash));color:var(--ink)}
body.immersive-workbench[data-im-open=true] :is(.tree-pane,.tree-resizer,.immersive-plugin-stage){visibility:hidden;pointer-events:none}
@media(max-width:600px){body.immersive-workbench .im-host{inset:calc(var(--desktop-titlebar-height,44px) + var(--tab-strip-h,44px) + var(--assistant-island-row,44px)) 0 0}body.immersive-workbench[data-im-open=true] .workspace-chrome.project-island{visibility:hidden;pointer-events:none}}
`;

export const IM_HOST_SCRIPT = String.raw`(() => {
  const button=document.querySelector('[data-im-toggle]');
  if(!button)return;
  let section=null,frame=null;
  const close=()=>{if(section)section.hidden=true;delete document.body.dataset.imOpen;button.setAttribute('aria-pressed','false');};
  button.addEventListener('click',()=>{
    if(section&&!section.hidden){close();return;}
    if(!section){section=document.createElement('section');section.className='im-host';section.setAttribute('aria-label','群聊与 Thread');frame=document.createElement('iframe');frame.title='群聊与 Thread';frame.src='/im?embedded=1';section.append(frame);document.querySelector('.immersive-workspace').append(section);}
    document.querySelector('[data-assistant-composer]:popover-open')?.hidePopover();
    document.body.dataset.imOpen='true';section.hidden=false;button.setAttribute('aria-pressed','true');frame.focus();
  });
  document.addEventListener('click',event=>{if(event.target.closest('[data-plugin-id],[data-assistant-toggle],[data-project-menu]'))close();});
})();`;
