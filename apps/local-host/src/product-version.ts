/**
 * The one product version the Host's code announces: the app version Feed and the search runtime hand to the Search
 * Evidence Layer, Feed's User-Agent, the MCP client version, and the client version the Codex session transport sends.
 * Nothing else in code spells it out; each of those takes it from here.
 *
 * It equals the `version` in the root package.json, as everything that carries the product version does
 * (docs/releases/POLICY.md section 1). `scripts/verify-release-versions.mjs` reads the line below and fails when they differ,
 * so the release pull request changes this one line along with the package files.
 */
export const PRODUCT_VERSION = "0.2.0";
