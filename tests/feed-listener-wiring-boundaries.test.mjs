import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { feedListenerWiringProblems } from "../scripts/check-package-boundaries.mjs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const wiring = {
  service: read("plugins/native/feed/src/connector-sync.ts"),
  runtime: read("plugins/native/feed/src/runtime-connector.ts"),
  plugin: read("plugins/native/feed/src/plugin.ts"),
  host: read("apps/local-host/src/plugin-source-pull-service.ts"),
};
const current = "registry: options.integrations ?? (() => homeIntegrationRegistry(home))";
const withRegistry = registry => {
  assert.ok(wiring.host.includes(current), "the Host still wires the registry this way; update the test with it");
  return { ...wiring, host: wiring.host.replace(current, registry) };
};

test("RAC-1710 the Feed's Listener wiring on the tree as it is has no problem", () => {
  assert.deepEqual(feedListenerWiringProblems(wiring), []);
});

test("RAC-1707 a comment that names the Home's registry does not stand in for the code: a fixture registry is refused", () => {
  for (const registry of [
    "registry: fixtureRegistry /* registry: homeIntegrationRegistry(home) */",
    "// registry: homeIntegrationRegistry(home)\n      registry: fixtureRegistry",
    "/** registry: () => homeIntegrationRegistry(home) */ registry: fixtureRegistry",
  ]) {
    assert.deepEqual(feedListenerWiringProblems(withRegistry(registry)),
      ["the Host's `createConnectorSourcePort` registry is not `() => homeIntegrationRegistry(home)` (alone, or after `??`)"], registry);
  }
});

test("RAC-1708 the registry is the Home's: directly, or as the fallback after a test's injected one, and nothing else", () => {
  for (const registry of [
    current,
    "registry: () => homeIntegrationRegistry(home)",
    "registry: (() => homeIntegrationRegistry(home))",
    "registry: () => (homeIntegrationRegistry(home))",
    "registry: injected?.registry ?? (() => homeIntegrationRegistry(home))",
  ]) {
    assert.deepEqual(feedListenerWiringProblems(withRegistry(registry)), [], registry);
  }
  for (const registry of [
    "registry: options.integrations",
    "registry: homeIntegrationRegistry(home)",
    "registry: options.integrations ? options.integrations : () => homeIntegrationRegistry(home)",
    "registry: (() => homeIntegrationRegistry(home)) ?? options.integrations",
    "registry: options.integrations || (() => homeIntegrationRegistry(home))",
    "registry: () => otherRegistry(home)",
    "registry: () => homeIntegrationRegistry(otherHome)",
    "registry: (home) => homeIntegrationRegistry(home)",
    "registries: () => homeIntegrationRegistry(home)",
  ]) {
    assert.equal(feedListenerWiringProblems(withRegistry(registry)).length, 1, registry);
  }
  const second = { ...wiring, host: `${wiring.host}\nconst other = { connector: createConnectorSourcePort({ home, registry: fixtureRegistry }) };\n` };
  assert.equal(feedListenerWiringProblems(second).length, 1, "every connector port the Host builds takes the Home's registry");
  const none = { ...wiring, host: wiring.host.replace("connector: createConnectorSourcePort(", "connector: otherPort(") };
  assert.deepEqual(feedListenerWiringProblems(none), ["the Host has no `connector: createConnectorSourcePort({ … })`"]);
});

test("RAC-1709 the Feed's three wiring lines count only as code: each one kept only in a comment is a problem", () => {
  for (const [key, needle, stand, owner] of [
    ["service", "this.ports.createListener", "this.ports.openListener", "the Feed service"],
    ["runtime", "services.connector.open(", "services.connector.start(", "the Runtime Feed"],
    ["plugin", "connector = sourcePull?.connector", "connector = sourcePull?.other", "the Feed plugin"],
  ]) {
    assert.ok(wiring[key].includes(needle), `${key} still has ${needle}; update the test with it`);
    for (const comment of [`// ${needle}`, `/* ${needle} */`, `/**\n * ${needle}\n */`]) {
      const source = `${comment}\n${wiring[key].replaceAll(needle, stand)}`;
      assert.deepEqual(feedListenerWiringProblems({ ...wiring, [key]: source }), [`${owner} no longer has \`${needle}\` outside a comment`], `${key} ${comment}`);
    }
  }
});
