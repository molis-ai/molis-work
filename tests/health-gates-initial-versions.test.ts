import assert from "node:assert/strict";
import test from "node:test";
import { initialVersionProblems, sourceVersionProblems } from "../scripts/gates/initial-versions.mjs";

test("U0-03: an active registration cannot hide a later action, manifest, role or prompt version", () => {
  const agent = {
    roles: [{ role_id: "parent", version: 1 }], prompts: [{ prompt_id: "base", version: 1 }],
    subagents: { roles: [{ role_id: "child", version: 1 }] },
  };
  const manifest = { plugin_id: "notes", schema_version: 1, host_api_version: 1, agent, actions: [{ capability_id: "notes.read", version: 1 }] };
  const view = { provider: { provider_id: "system.home" }, capability_id: "home.read", version: 1 };
  const registration = { owner_id: "assistant", prompts: [{ prompt_id: "work", version: 1 }], roles: [{ role_id: "system", version: 1 }] };
  const inspect = () => initialVersionProblems({ manifests: [manifest], hostViews: [view], registrations: [registration] });
  assert.deepEqual(inspect(), []);
  const mutations: Array<[string, (version: number) => void]> = [
    ["schema_version", value => { manifest.schema_version = value; }],
    ["host_api_version", value => { manifest.host_api_version = value; }],
    ["notes.read", value => { manifest.actions[0]!.version = value; }],
    ["home.read", value => { view.version = value; }],
    ["parent", value => { agent.roles[0]!.version = value; }],
    ["base", value => { agent.prompts[0]!.version = value; }],
    ["child", value => { agent.subagents.roles[0]!.version = value; }],
    ["work", value => { registration.prompts[0]!.version = value; }],
    ["system", value => { registration.roles[0]!.version = value; }],
  ];
  for (const [name, setVersion] of mutations) {
    setVersion(2);
    const problems = inspect();
    assert.equal(problems.length, 1);
    assert.ok(problems[0]!.includes(`${name} = 2`), problems[0]);
    setVersion(1);
  }
});

test("U0-03: first-party version constants are checked in source, independently of comments and bundled protocol versions", () => {
  const file = "packages/example/src/store.ts";
  assert.deepEqual(sourceVersionProblems(file, 'const SCHEMA_VERSION = 1 as const, TEXT_VERSION = "1"; const CATALOG_VERSION = "actions/1";'), []);
  assert.deepEqual(sourceVersionProblems(file, '// const OUTDATED_VERSION = 9;\nconst prose = "const EXAMPLE_VERSION = 2";'), []);
  assert.equal(sourceVersionProblems(file, "const SCHEMA_VERSION = 2;").length, 1);
  assert.equal(sourceVersionProblems(file, 'const CATALOG_VERSION = "actions/2";').length, 1);
  assert.equal(sourceVersionProblems(file, "const STORED_VERSION = calculateVersion();").length, 1);
  assert.deepEqual(sourceVersionProblems("plugins/official-integrations/github/src/provider.ts", 'const GITHUB_API_VERSION = "2026-03-10";'), []);
  assert.equal(sourceVersionProblems(file, 'const GITHUB_API_VERSION = 2;').length, 1);
});
