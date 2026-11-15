import { readFileSync } from "node:fs";

/**
 * Shared recovery and file-kind primitives from `@molis-ai/molis-work-plugin-sdk/ui` (`packages/plugin-sdk/src/ui`); the design-system re-exports them for the component board,
 * bundled by esbuild into `dist/onboarding-recovery-primitives.js` and exposed on `globalThis.molisRecoveryParts`
 * so `/onboarding` executes the exact same markup renderers as `/__ui/catalog`.
 */
export const ONBOARDING_RECOVERY_PRIMITIVES_SCRIPT = readFileSync(
  new URL("../../dist/onboarding-recovery-primitives.js", import.meta.url),
  "utf8",
);
