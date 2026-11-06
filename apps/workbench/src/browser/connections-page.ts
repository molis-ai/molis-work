import { mountConnectionItems, type updateConnectionProgress } from "./service-connection-item.js";

/**
 * The service-connection parts' row program, for the connections page (`CONNECTORS_SETTINGS_CLIENT_SCRIPT`), which is a string and so
 * cannot import it: the page's rows open in place with the same function the component board uses. The steps move with the parts'
 * progress program that the model settings' script already brings to every page this one is on (`molisWorkConnectionProgress`,
 * src/browser/model-settings-progress.ts), so it is looked up when a step moves rather than bundled a second time.
 */
type Progress = typeof updateConnectionProgress;
const scope = globalThis as typeof globalThis & {
  molisWorkConnectionItems?: { mount: typeof mountConnectionItems; progress: Progress };
  molisWorkConnectionProgress?: Progress;
};
scope.molisWorkConnectionItems ??= { mount: mountConnectionItems, progress: (...args) => scope.molisWorkConnectionProgress?.(...args) };
