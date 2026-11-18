import { mountCharacters } from "./client.js";

/** The factories the workbench's deferred loader finds by plugin bundle (`globalThis.molisWorkbenchPluginFactories`). */
type PluginFactories = Record<string, (host: object) => void>;
const page = globalThis as { molisWorkbenchPluginFactories?: PluginFactories };

/**
 * The bundle's entry: on Settings › 角色 and 项目设置 › 角色 the settings loader adds this script and the page mounts itself, now and
 * whenever the settings cover places the page again (a page already mounted is left as it is).
 */
page.molisWorkbenchPluginFactories ||= {};
page.molisWorkbenchPluginFactories.characters = () => mountCharacters();
mountCharacters();
document.addEventListener("molis-work:settings-embed", () => mountCharacters());
