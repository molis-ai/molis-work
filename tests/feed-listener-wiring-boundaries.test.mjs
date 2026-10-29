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

// The one problem a missing wiring line gives. The text is the gate's: if it changes, change it here too.
const missing = (owner, needle) => `${owner} no longer has \`${needle}\` in its code (a comment, a string, a regular expression or template text does not count)`;

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
    // Codex @c2793bc73 P2: the whole fallback in parentheses is still the current form.
    "registry: (options.integrations ?? (() => homeIntegrationRegistry(home)))",
    "registry: ((options.integrations) ?? ((() => homeIntegrationRegistry(home))))",
    // T-215: the left of `??` is not read at all (T-125 ruling 3: a test may inject any registry there), whatever it is.
    "registry: fixtureRegistry ?? (() => homeIntegrationRegistry(home))",
    "registry: createFixtureRegistry() ?? (() => homeIntegrationRegistry(home))",
    "registry: \"not a registry\" ?? (() => homeIntegrationRegistry(home))",
    "registry: undefined ?? (() => homeIntegrationRegistry(home))",
    "registry: first ?? second ?? (() => homeIntegrationRegistry(home))",
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
    // Codex @c2793bc73 P1: a later spread replaces the registry that was checked; so does a second `registry`.
    "registry: () => homeIntegrationRegistry(home),\n      ...(selectFixture ? { registry: fixtureRegistry } : {})",
    "...overrides, registry: () => homeIntegrationRegistry(home)",
    "registry: () => homeIntegrationRegistry(home), registry: fixtureRegistry",
    // Codex @a44d67a2 P1: a computed name can be `registry` again; its name is not read, so it is refused, static or not.
    "registry: () => homeIntegrationRegistry(home),\n      [optionName]: fixtureRegistry",
    "registry: () => homeIntegrationRegistry(home), [\"registry\"]: fixtureRegistry",
    // T-215: a quoted text, a template or a regular expression that spells the thunk is not the thunk, alone or after `??`.
    "registry: \"() => homeIntegrationRegistry(home)\"",
    "registry: '() => homeIntegrationRegistry(home)'",
    "registry: `() => homeIntegrationRegistry(home)`",
    "registry: /() => homeIntegrationRegistry(home)/",
    "registry: fixtureRegistry ?? \"() => homeIntegrationRegistry(home)\"",
    "registry: fixtureRegistry ?? `() => homeIntegrationRegistry(home)`",
  ]) {
    assert.equal(feedListenerWiringProblems(withRegistry(registry)).length, 1, registry);
  }
  // Codex @c2793bc73 P1: a valid port somewhere else in the file does not stand in for the wiring site, the object `createSourcePullPort`
  // returns; nor does a spread in that object, which could replace its `connector`.
  const decoy = {
    ...wiring,
    host: `${wiring.host.replace("connector: createConnectorSourcePort(", "connector: otherPort(")}
const unrelated = { connector: createConnectorSourcePort({registry: () => homeIntegrationRegistry(home)}) };
`,
  };
  assert.deepEqual(feedListenerWiringProblems(decoy), ["the source-pull port `createSourcePullPort` returns has no `connector: createConnectorSourcePort({ … })`"], "a valid port elsewhere is not the wiring site");
  // T-215: a string, a template or a comment that spells a valid port is not the wiring site either: the Host file is read as syntax.
  for (const spelled of [
    "const unrelated = \"connector: createConnectorSourcePort({registry: () => homeIntegrationRegistry(home)})\";",
    "const unrelated = `connector: createConnectorSourcePort({registry: () => homeIntegrationRegistry(home)})`;",
    "// connector: createConnectorSourcePort({registry: () => homeIntegrationRegistry(home)})",
  ]) {
    const quoted = { ...wiring, host: `${wiring.host.replace("connector: createConnectorSourcePort(", "connector: otherPort(")}\n${spelled}\n` };
    assert.deepEqual(feedListenerWiringProblems(quoted), ["the source-pull port `createSourcePullPort` returns has no `connector: createConnectorSourcePort({ … })`"], spelled);
  }
  const portSpread = { ...wiring, host: wiring.host.replace("    plan: request =>", "    ...overrides,\n    plan: request =>") };
  assert.notEqual(portSpread.host, wiring.host);
  assert.deepEqual(feedListenerWiringProblems(portSpread), ["the source-pull port `createSourcePullPort` returns has a spread or a computed name, which could replace its `connector`"], "a spread in the port object");
  // Codex @a44d67a2 P1: so can a computed name after the checked `connector`.
  for (const extra of ["[portName]: otherPort(),", "[\"connector\"]: otherPort(),"]) {
    const computed = { ...wiring, host: wiring.host.replace("    plan: request =>", `    ${extra}\n    plan: request =>`) };
    assert.notEqual(computed.host, wiring.host);
    assert.deepEqual(feedListenerWiringProblems(computed), ["the source-pull port `createSourcePullPort` returns has a spread or a computed name, which could replace its `connector`"], extra);
  }
  const twoConnectors = { ...wiring, host: wiring.host.replace("    plan: request =>", "    connector: otherPort(),\n    plan: request =>") };
  assert.deepEqual(feedListenerWiringProblems(twoConnectors), ["the source-pull port `createSourcePullPort` returns does not have exactly one `connector`"], "two connectors in the port object");
  const noPort = { ...wiring, host: wiring.host.replace("export function createSourcePullPort(", "export function createOtherPort(") };
  assert.deepEqual(feedListenerWiringProblems(noPort), ["the Host has no single `createSourcePullPort` returning one object literal"], "no createSourcePullPort");
  const second = { ...wiring, host: `${wiring.host}\nconst other = { connector: createConnectorSourcePort({ home, registry: fixtureRegistry }) };\n` };
  assert.equal(feedListenerWiringProblems(second).length, 1, "every connector port the Host builds takes the Home's registry");
  const none = { ...wiring, host: wiring.host.replace("connector: createConnectorSourcePort(", "connector: otherPort(") };
  assert.deepEqual(feedListenerWiringProblems(none), ["the source-pull port `createSourcePullPort` returns has no `connector: createConnectorSourcePort({ … })`"], "the wiring site's connector is another port");
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
      assert.deepEqual(feedListenerWiringProblems({ ...wiring, [key]: source }), [missing(owner, needle)], `${key} ${comment}`);
    }
  }
});

const lines = [
  ["service", "this.ports.createListener", "this.ports.openListener", "the Feed service", "this.ports.createListener(source)"],
  ["runtime", "services.connector.open(", "services.connector.start(", "the Runtime Feed", "services.connector.open(slot)"],
  ["plugin", "connector = sourcePull?.connector", "connector = sourcePull?.other", "the Feed plugin", "connector = sourcePull?.connector"],
];

test("RAC-2125 the Feed's three wiring lines count only as code: each one kept only in a string, a regular expression or a template's text is a problem", () => {
  for (const [key, needle, stand, owner] of lines) {
    assert.ok(wiring[key].includes(needle), `${key} still has ${needle}; update the test with it`);
    for (const standIn of [
      "const note = \"NEEDLE\";",
      "const note = 'NEEDLE';",
      "const note = `NEEDLE`;",
      "const note = `NEEDLE ${1}`;",
      "const note = `${1} NEEDLE ${2}`;",
      "const note = `${1} NEEDLE`;",
      "const note = { \"NEEDLE\": 1 };",
      "type Note = \"NEEDLE\";",
      "const note = /NEEDLE/u;",
    ]) {
      const source = `${standIn.replaceAll("NEEDLE", needle)}\n${wiring[key].replaceAll(needle, stand)}`;
      assert.deepEqual(feedListenerWiringProblems({ ...wiring, [key]: source }), [missing(owner, needle)], `${key} ${standIn}`);
    }
  }
});

test("RAC-2126 code beside a literal still counts: the line inside a template's ${ … }, or after a string that holds comment marks, quotes or a backtick, is found", () => {
  for (const [key, needle, stand, , use] of lines) {
    assert.ok(wiring[key].includes(needle), `${key} still has ${needle}; update the test with it`);
    for (const beside of [
      "const used = `a ${USE} b`;",
      "const used = `${USE}`;",
      "const used = `a ${ `b ${USE} c` } d`;",
      "const marks = \"// /* ' `\"; const used = USE;",
      "const marks = '// /* \" `'; const used = USE;",
      "const marks = `// /* ' \" ${1} // /*`; const used = USE;",
      "const marks = /\"/; const used = USE;",
    ]) {
      const source = `${beside.replaceAll("USE", use)}\n${wiring[key].replaceAll(needle, stand)}`;
      assert.deepEqual(feedListenerWiringProblems({ ...wiring, [key]: source }), [], `${key} ${beside}`);
    }
  }
});
