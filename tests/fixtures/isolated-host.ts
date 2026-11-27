import type { ReleasePackages } from "@molis-ai/molis-work-plugin-runtime";
/** Direct Runtime fixtures load no Host build or shipped plugin catalog. Platform fixtures use the actual Host catalog. */
export const ISOLATED_HOST_IDS: ReadonlySet<string> = new Set();

/**
 * For a direct Runtime fixture that stands in for one of the Host's own plugins (it calls Host actions as `io.molis.work.coding`, say)
 * without starting the Host's build: every id under the Host's prefix counts as the release's own, so S-reserved-host-prefix does not
 * refuse the stand-in, whoever signed it. Only such a fixture passes it, as `releaseIds`; the prefix rule itself is proven where no fixture passes it
 * (`tests/security-invariants-install-identity.test.ts`, `tests/security-invariants-plugin-install.test.ts`).
 */
export const HOST_STAND_IN_IDS: ReleasePackages = { has: id => id.startsWith("io.molis.work."), signedBy: id => id.startsWith("io.molis.work.") };
