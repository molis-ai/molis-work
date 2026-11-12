import { readFileSync } from 'node:fs';

/** The same component client, packaged as a browser factory with all of its real dependencies. */
export const PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT = readFileSync(new URL('./plugin-components-browser.js', import.meta.url), 'utf8').trim();
