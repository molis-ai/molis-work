import type { ComposerHandle, ComposerOptions } from "@molis-ai/molis-work-plugin-sdk/page-globals";

/**
 * The hand-over between the composer's two scripts: `composer-loader.ts` (in every page's own script, the public
 * `window.molisComposer`) fetches the program from `COMPOSER_ASSET`, and the program (`composer.ts`) leaves its mount here.
 * Nothing else reads it; pages call `window.molisComposer`.
 */

export const COMPOSER_ASSET = "/assets/molis-work-composer.js";

export type ComposerMount = (root: HTMLElement, options: ComposerOptions) => ComposerHandle;

declare global {
  /** The composer's program, once `/assets/molis-work-composer.js` has run in this document. */
  var molisComposerProgram: ComposerMount | undefined;
}
