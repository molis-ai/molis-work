import { PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-design-system";
import { STUDIO_CLIENT_TRANSPORT } from './agent-studio-client-transport.js';
import { STUDIO_CLIENT_STATE } from './agent-studio-client-state.js';
import { STUDIO_CLIENT_RECORD } from './agent-studio-client-record.js';
import { STUDIO_CLIENT_INSTALL } from './agent-studio-client-install.js';
import { STUDIO_CLIENT_FEED } from './agent-studio-client-feed.js';
import { STUDIO_CLIENT_BOARD } from './agent-studio-client-board.js';
import { STUDIO_CLIENT_SESSION } from './agent-studio-client-session.js';

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
 * - `GROUPS`: Parts are UI catalog components; builds from before keep their old names, which map onto the catalog.
 * - The capability board (`CAP_SOURCES`, `usedCapabilities`): what this plugin uses from the project's unified action directory, and the whole directory.
 * - `phaseOf`: A build stopped on a question for the person is waiting for them, not paused.
 * - `toEnable`: The plugins a proposal would need enabled in this project first.
 * - `mockupHtml` (W7): The proposal's picture when an image service drew one; nothing at all when there is none.
 * - `opState`: One row of the task board: where this operation stands, and what its code agent is doing or where it is stuck.
 * - `failure`: What went wrong, in the person's words, and what they can do; the host's own words stay under "Technical details".
 * - `effectsList`: What an installation grants, grouped the way the person weighs it: its own data, what it reads (granted with the installation), and what it changes
 *   outside itself (each listed).
 * - `ask`: A small in-page dialog; resolves with the chosen button's value, or '' when dismissed. `settle` resolves from the form's own submit (synchronous with the click) and
 *   from Escape; a dialog's close event is not delivered while the page is in the background.
 * - `renderHead`: Typing never waits for a build: a change request stops the current round and is taken in.
 * - `usedSlots`: What the rendered plugin actually uses from the catalog: every component carries its catalog slot.
 * - `renderBoard`: Only what has landed counts as placed; a part still waiting its turn is not on the page yet.
 * - `showTip`: What a spec-board part is, and where this plugin already uses it.
 * - `aim`: Points at an element from inside the canvas: above it (the spec board), at its top-right area (a part), or at its right edge.
 * - `schedule`: Hidden views read the authoritative build again on return.
 * - The install click: the plugin opens in place as a workbench stage rather than in a new window. The secrets travel with the install: the host's sealed store keeps them only
 *   if the plugin is installed, and the plugin will only ever name them. An uninstall kept this plugin's data, and this version cannot read it: install fresh only if the person
 *   lets it go.
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
 const valid=s=>typeof s==='string'&&/^app-[a-f0-9-]{36}$/.test(s);
 const entry=s=>[...document.querySelectorAll('[data-work-surface-open]')].find(el=>el.dataset.workSurfaceOpen===s);
 const openPlugin=s=>{if(!valid(s))return;if(host.openPlugin){host.openPlugin(s);return;}const button=entry(s);if(button){button.click();return;}const next=new URL(location.href);next.searchParams.set('openSurface',s);location.assign(next.pathname+next.search);};
 const pluginRemoved=s=>{if(!valid(s))return;if(host.view?.refreshShell){host.view.refreshShell();return;}entry(s)?.remove();[...document.querySelectorAll('[data-work-surface]')].find(el=>el.dataset.workSurface===s)?.remove();};
 const KEY='molis-work-studio-build:'+(host.projectId?.()||'');
 const page={address:()=>{const here={searchParams:new URLSearchParams()};try{const id=sessionStorage.getItem(KEY);if(id)here.searchParams.set('build',id);}catch{}return here;},
  replace:next=>{try{const id=next.searchParams.get('build');if(id)sessionStorage.setItem(KEY,id);else sessionStorage.removeItem(KEY);}catch{}}};
 client({mountPluginClient:host.mountPluginClient,root:host.root||document.querySelector('[data-work-surface="plugin-builder"]'),mode:'studio',
  api:p=>host.route('/api/plugin-builder/studio')+p,plugin:id=>host.route('/plugins/')+id,
  components,page,openPlugin,pluginRemoved,loadMedia:host.loadMedia,download:host.download,
  openSettings:href=>globalThis.molisWorkOpenExternalUrl?globalThis.molisWorkOpenExternalUrl(href):document.dispatchEvent(new CustomEvent('molis-work:open-settings-path',{detail:{href}}))});
}`;
