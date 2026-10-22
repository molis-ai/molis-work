import { mountCharacters } from "./client.js";

/** The factories the workbench's deferred loader finds by plugin bundle (`globalThis.molisWorkbenchPluginFactories`). */
type PluginFactories = Record<string, (host: object) => void>;
const page = globalThis as { molisWorkbenchPluginFactories?: PluginFactories };

/** The bundle's entry: the loader calls the factory once the Characters surface is shown; the program finds its own root. */
page.molisWorkbenchPluginFactories ||= {};
page.molisWorkbenchPluginFactories.characters = () => mountCharacters();
