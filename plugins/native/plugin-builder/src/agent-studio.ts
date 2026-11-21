import { PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-design-system";
import { STUDIO_CLIENT_STATE } from './agent-studio-client-state.js';
import { STUDIO_CLIENT_RECORD } from './agent-studio-client-record.js';
import { STUDIO_CLIENT_INSTALL } from './agent-studio-client-install.js';
import { STUDIO_CLIENT_FEED } from './agent-studio-client-feed.js';
import { STUDIO_CLIENT_BOARD } from './agent-studio-client-board.js';
import { STUDIO_CLIENT_SESSION } from './agent-studio-client-session.js';

/** The page's root and lifetime, its requests to the studio's routes, and the two embedded modes (a trial's preview and an installed plugin's page), which end here. A part of the studio page's client script (`agent-studio.ts` joins the parts in order). */
const STUDIO_CLIENT_TRANSPORT = String.raw` const selector=host.mode==='preview'?'[data-studio-preview]':host.mode==='installed'?'[data-installed-plugin]':'[data-agent-studio]';
 const root=host.root?(host.root.matches?.(selector)?host.root:host.root.querySelector(selector)):document.querySelector(selector);
 if(!root)return;
 const page=host.page;const lifetime=host.mountPluginClient(root);if(!lifetime)return;
 const Q=n=>globalThis.t.text("plugin-builder.agent-studio.name",{name:n});

 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon=n=>'<svg aria-hidden="true"><use href="#icon-'+n+'"/></svg>';
 const headers=m=>m==='GET'?{}:(globalThis.molisWorkControlHeaders?.()||{'content-type':'application/json'});
 async function request(url,method='GET',body,signal,fallback=globalThis.t.text("plugin-builder.agent-studio.operation-failed-content-preserved")){
  const r=await lifetime.fetch(url,{method,signal,cache:'no-store',headers:headers(method),...(body===undefined?{}:{body:JSON.stringify(body)})});
  const v=await r.json().catch(()=>({}));lifetime.assertCurrent(signal);if(!r.ok)throw Object.assign(new Error(v?.error||fallback),{status:r.status,code:v?.code,text:v?.text,detail:v?.detail});return v;
 }
 const api=(path,...args)=>request(host.api(path),...args);
 let pending=0;globalThis.__molisPluginPending=0;
 const pendingCall=async run=>{globalThis.__molisPluginPending=++pending;try{return await run()}finally{pending--;if(lifetime.alive)globalThis.__molisPluginPending=pending}};
 const pluginCall=id=>(componentId,binding,payload)=>pendingCall(async()=>(await api('/builds/'+id+'/call','POST',{componentId,binding,payload,...(host.acceptance?{acceptance:host.acceptance}:{})})).value);
 if(host.mode==='preview'){
  const readings=new Map(),plugin=host.components({root,call:pluginCall(host.build),onRead:(id,result)=>readings.set(id,result)});
  lifetime.own(()=>plugin.destroy());
  globalThis.__molisPluginRead=async componentId=>{const result=readings.get(componentId);if(!result)throw new Error(globalThis.t.text("common.generated.preview-no-result"));if('error'in result)throw new Error(result.error);return structuredClone(result.value)};
  if(host.acceptance){const refresh=async componentId=>{lifetime.assertCurrent();await plugin.refresh(componentId)};globalThis.__molisPluginRefresh=refresh;lifetime.own(()=>{if(globalThis.__molisPluginRefresh===refresh)delete globalThis.__molisPluginRefresh});}
  if(!host.view){root.textContent=globalThis.t.text("common.generated.preview-no-design");return;}
  plugin.update(host.view).then(()=>{if(lifetime.alive)globalThis.__molisPluginReady=true;}).catch(e=>{if(lifetime.alive)root.textContent=e.message;});
  return;
 }
 if(host.mode==='installed'){
  if(parent!==window)root.dataset.framed='';
  const call=(componentId,binding,payload)=>pendingCall(async()=>{
    const submit=binding==='submit',url=submit?host.route('/api/host/plugin-page-actions'):host.call;
    const body=submit?{mode:'component_submit',component_id:componentId,payload}:{componentId,binding,payload};
    const value=await request(url,'POST',body,undefined,globalThis.t.text("common.generated.input-preserved"));
    return submit?value:value.value;
  });
  const plugin=host.components({root,call,mountSurfaceSlot:host.mountSurfaceSlot});lifetime.own(()=>plugin.destroy());
  const ready=plugin.update(host.view).then(()=>{if(lifetime.alive)globalThis.__molisPluginReady=true;}).catch(e=>{if(lifetime.alive)root.textContent=e.message;});
  lifetime.listen(host.root||root,'molis-work:select-item',event=>{
    const {panel,itemId,intent}=event.detail||{};if(intent!=='open')return;
    if(typeof panel==='string'||typeof itemId==='string')event.preventDefault();
    const unavailable=()=>{if(lifetime.alive){const note=document.createElement('p');note.dataset.pcOpenFailed='';note.setAttribute('role','alert');note.textContent=globalThis.t.text("plugin-builder.agent-studio.record-or-form-unavailable");root.prepend(note);}};
    void ready.then(async()=>{if(!lifetime.alive)return;root.querySelector('[data-pc-open-failed]')?.remove();
      const opened=typeof panel==='string'?plugin.openInput(panel):typeof itemId==='string'?await plugin.openRecord(itemId):true;
      if(!opened)unavailable();
    }).catch(unavailable);
  });
  return;
 }
`;

/**
 * Browser client; a string so the host can inline it. Receives the host's routes and the component renderer.
 *
 * Notes on the script below. They are kept here rather than inside it because the script is served as it stands: a
 * comment inside it is bytes the browser downloads and never runs.
 *
 * - `selector`: In the workbench the studio is drawn in the plugin's stage (host.root); the preview and an installed plugin run in frames.
 * - `globalThis.__molisPluginRead`: Diagnoses the actual rendered query, including selection and filters, without issuing another request.
 * - `host.mode === 'installed'`: An installed plugin: the same renderer; every call goes to the plugin's own sandboxed process through the host.
 * - The frame reads Studio and shared UI words from its own projection; build messages, diagnostics and external capability text are kept as written.
 * - `queue`, `landing`, `picking`, `play`: The UI Agent's placements, paced so each one can be seen: a part waits in the queue, is taken from the spec board, carried to its
 *   place (the spot opens, framed, before the part shows), lands and the spec board ticks it off. A part being landed has left the queue but is not revealed yet; an update
 *   arriving meanwhile must not queue it again. Opening a build, or trying it, shows everything at once.
 * - `wiredCaps`, `wires`, `playWires` (D22): Capabilities being connected are ticked on the capability board only once the code agent has carried them in. It takes the capability
 *   from the board and carries it to the part that calls it. A button on each record has nowhere to show while the list is empty: it is carried to that list instead.
 * - `GROUPS`: Parts are UI catalog components, shown under the catalog's own groups.
 * - The capability board (`CAP_SOURCES`, `usedCapabilities`): what this plugin uses from the project's unified action directory, and the whole directory.
 * - `phaseOf`: A build stopped on a question for the person is waiting for them, not paused.
 * - `toEnable`: The plugins a proposal would need enabled in this project first.
 * - `mockupHtml` (W7): The proposal's picture when an image service drew one; nothing at all when there is none.
 * - `opState`: One row of the task board: where this operation stands, and what its code agent is doing or where it is stuck.
 * - `failure`: What went wrong, in the person's words, and what they can do; the host's own words stay under "Technical details".
 * - `ask`: A small in-page dialog; resolves with the chosen button's value, or '' when dismissed. `settle` resolves from the form's own submit (synchronous with the click) and
 *   from Escape; a dialog's close event is not delivered while the page is in the background.
 * - `renderHead`: Typing never waits for a build: a change request stops the current round and is taken in.
 * - `usedSlots`: What the rendered plugin actually uses from the catalog: every component carries its catalog slot.
 * - `renderBoard`: Only what has landed counts as placed; a part still waiting its turn is not on the page yet.
 * - `showTip`: What a spec-board part is, and where this plugin already uses it.
 * - `aim`: Points at an element from inside the canvas: above it (the spec board), at its top-right area (a part), or at its right edge.
 * - `schedule`: Hidden views read the authoritative build again on return.
 * - Installing (`openSheet`, `renderInstall`): the studio only hands the signed package of the latest version to the shell's install sheet (`host.packageInstall`), which
 *   the shell draws over `[data-as-install-place]`; the page never sees the permissions chosen or a key typed, and hears only how it ended. The place is made once and never
 *   redrawn, so the sheet stays through every repaint. Turning off, permissions and uninstalling are in 设置 › 插件, as for any installed package.
 * - The composer's submit: a request that starts "做一个……" while another plugin is open is most likely a new plugin; it asks rather than rewrite the open one.
 * - The last lines: coming in without a plugin named in the address starts a new one; earlier ones are a click away, never opened for you.
 */
export const AGENT_STUDIO_CLIENT_FACTORY_SCRIPT = String.raw`(host)=>{
`
  + STUDIO_CLIENT_TRANSPORT
  + STUDIO_CLIENT_STATE
  + STUDIO_CLIENT_RECORD
  + STUDIO_CLIENT_INSTALL
  + STUDIO_CLIENT_FEED
  + STUDIO_CLIENT_BOARD
  + STUDIO_CLIENT_SESSION
  + String.raw`}`;

/**
 * The studio as the plugin's own stage in the workbench (specs/artifact-positioning S4): drawn in place, its routes from
 * the host, and the plugin it installed or the model settings opened through the workbench, not a frame's parent.
 * A plugin installed since the page loaded has no entry yet: the workbench is opened again with ?openSurface and opens it.
 * The plugin open in the studio is kept for this browser session (`KEY`), so a reload comes back to it (the address is the workbench's).
 * The browser reads the exact frame provider.
 */
export const AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT = String.raw`(host)=>{
 const client=(` + AGENT_STUDIO_CLIENT_FACTORY_SCRIPT + `),components=` + PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT + `;
 const embedded=host.page?.(),mountSurfaceSlot=host.view?.surfaceSlot;
 if(embedded?.mode==='preview'||embedded?.mode==='installed'){client({...host,...embedded,components,mountSurfaceSlot,api:p=>host.route('/api/plugin-builder/studio')+p});return;}
 const valid=s=>typeof s==='string'&&/^[a-z][a-z0-9.-]{0,199}$/.test(s);
 const entry=s=>[...document.querySelectorAll('[data-work-surface-open]')].find(el=>el.dataset.workSurfaceOpen===s);
 const openPlugin=s=>{if(!valid(s))return;if(host.openPlugin){host.openPlugin(s);return;}const button=entry(s);if(button){button.click();return;}const next=new URL(location.href);next.searchParams.set('openSurface',s);location.assign(next.pathname+next.search);};
 const KEY='molis-work-studio-build:'+(host.projectId?.()||'');
 const page={address:()=>{const here={searchParams:new URLSearchParams()};try{const id=sessionStorage.getItem(KEY);if(id)here.searchParams.set('build',id);}catch{}return here;},
  replace:next=>{try{const id=next.searchParams.get('build');if(id)sessionStorage.setItem(KEY,id);else sessionStorage.removeItem(KEY);}catch{}}};
 client({mountPluginClient:host.mountPluginClient,root:host.root||document.querySelector('[data-work-surface="plugin-builder"]'),mode:'studio',
  api:p=>host.route('/api/plugin-builder/studio')+p,plugin:id=>host.route('/plugins/')+id,
  components,page,openPlugin,loadMedia:host.loadMedia,download:host.download,packageInstall:host.packageInstall,
  openSettings:href=>globalThis.molisWorkOpenExternalUrl?globalThis.molisWorkOpenExternalUrl(href):document.dispatchEvent(new CustomEvent('molis-work:open-settings-path',{detail:{href}}))});
}`;
