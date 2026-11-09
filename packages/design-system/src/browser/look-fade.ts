import { createLookFade } from "../look-fade.js";

declare global {
  var molisWorkLookFade: ReturnType<typeof createLookFade>;
}

globalThis.molisWorkLookFade = createLookFade();
