import { returnRelay } from "./return-trips.js";
import { createSettingsReturn } from "./settings-return.js";

/**
 * The bundle's entry (dist/settings-return-client.js): the page global the client bootstrap calls once, in the outer document, and
 * its `relay`, the tab workspace's pass of a pane frame's settings request.
 */
declare global {
  var molisWorkSettingsReturn: (typeof createSettingsReturn & { relay: typeof returnRelay }) | undefined;
}
globalThis.molisWorkSettingsReturn = Object.assign(createSettingsReturn, { relay: returnRelay });
