import { renderIconSprite, PLUGIN_COMPONENT_STYLES, SELECT_MENU_CLIENT_SCRIPT, SELECT_MENU_STYLES, THEME_BOOTSTRAP_SCRIPT } from '@molis-ai/molis-work-design-system';
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from '@molis-ai/molis-work-ui-host';
import { AGENT_STUDIO_STYLES, AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT, renderAgentStudio } from '@molis-ai/molis-work-plugin-builder';

/**
 * The studio mounted the way the workbench mounts it — its stage, its plugin pack's styles and client — for the
 * studio's own preview server and browser test, which run the studio's routes without the whole workbench. Not a
 * product page: the product draws the studio only in the workbench (specs/artifact-positioning S4).
 */
export const STUDIO_HARNESS_PATH = '/studio';

export function studioHarnessPage(controlToken: string): string {
  const literal = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>插件创作工作台</title>'
    + '<script>' + THEME_BOOTSTRAP_SCRIPT + '</script><link rel="stylesheet" href="/assets/molis-work-settings.css">'
    + '<style>html,body{margin:0;height:100%}.icon-sprite{position:absolute;width:0;height:0;overflow:hidden}[data-work-surface="plugin-builder"]{display:block;height:100vh}'
    + SELECT_MENU_STYLES + PLUGIN_COMPONENT_STYLES + AGENT_STUDIO_STYLES + '</style></head><body>' + renderIconSprite()
    + '<section data-work-surface="plugin-builder">' + renderAgentStudio() + '</section>'
    + '<script>globalThis.molisWorkControlHeaders=()=>({"content-type":"application/json","x-molis-work-control-token":' + literal(controlToken) + ',"x-molis-work-idempotency-key":crypto.randomUUID()});'
    + '(' + AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT + ')({mountPluginClient:(' + UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT + ')(),route:p=>p,root:document.querySelector("[data-work-surface=plugin-builder]")});</script>'
    + '<script>' + SELECT_MENU_CLIENT_SCRIPT + '</script></body></html>';
}
