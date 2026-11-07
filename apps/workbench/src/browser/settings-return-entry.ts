import { createSettingsReturn } from "./settings-return.js";

/** The bundle's entry (dist/settings-return-client.js): the page global the client bootstrap calls once, in the outer document. */
declare global {
  var molisWorkSettingsReturn: typeof createSettingsReturn | undefined;
}
globalThis.molisWorkSettingsReturn = createSettingsReturn;
