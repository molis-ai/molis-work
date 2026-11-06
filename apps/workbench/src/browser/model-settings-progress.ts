import { updateConnectionProgress } from "./service-connection-item.js";

/**
 * The model settings page (src/scripts/settings-models.ts) moves the first key's step progress with the service-connection
 * parts' own program, not a copy of it: this hands that one function to the page's inline script, which runs on the settings
 * page, in the settings stage and on the Home page alike.
 */
(globalThis as { molisWorkConnectionProgress?: typeof updateConnectionProgress }).molisWorkConnectionProgress ??= updateConnectionProgress;
