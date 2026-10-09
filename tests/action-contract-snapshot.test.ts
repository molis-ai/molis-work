import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACTIONS_FILE, HOST_ACTIONS_FILE, SCENES_FILE, buildAll, canonicalJson, checkActionSnapshots, schemaHash,
} from "../scripts/gates/action-contract-snapshot.mjs";
import { collectHostViews, loadProduct, withIsolatedHome } from "../scripts/gates/action-contract-host.mjs";

// specs/repository-anti-corruption §4.7 (W2-15): the callable contract of every built-in Manifest is written down in
// tooling/gates/actions (capability@version, provider, who may call it, a hash of each schema), together with what the Host
// registers that no Manifest declares. The Manifest layer needs no Host and is mutation-verified on copies of the real Manifests;
// the Host layer is mutation-verified on copies of the directory a real Host listed. Nothing here writes to the repository:
// the committed files are only read, and the tests that need to change one work on a copy in a temporary directory.
const root = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(root, "scripts/gates/action-contract-snapshot.mjs");

interface Product { manifests: any[]; effectOf: (meta: any, id: string) => string; hostViews: any[] }
let product: Product;
before(async () => { product = await loadProduct(); }, { timeout: 180_000 });

const copyOfManifests = () => product.manifests.map((manifest) => ({ plugin_id: manifest.plugin_id,
  actions: structuredClone(manifest.actions ?? []), action_scenes: structuredClone(manifest.action_scenes ?? []) }));
const copyOfViews = () => structuredClone(product.hostViews);
const allActions = (manifests: any[]) => manifests.flatMap((manifest) => manifest.actions as any[]);
const find = (actions: any[], predicate: (definition: any) => boolean, what: string) => {
  const found = actions.find(predicate);
  assert.ok(found, `the Manifests hold no action with ${what}; the mutation below needs one (pick another or add the case)`);
  return found;
};
/** The problems the Manifest layer reports for these Manifests against the committed files. */
const manifestProblems = (manifests: any[]) => checkActionSnapshots({ root, manifests, effectOf: product.effectOf }).problems.join("\n");
/** The problems the whole product (Manifests and the Host's directory) reports against the committed files. */
const productProblems = (hostViews: any[], manifests = product.manifests) => checkActionSnapshots({ root, manifests, effectOf: product.effectOf, hostViews }).problems.join("\n");

const scratch: string[] = [];
const scratchRoot = (...files: string[]) => {
  const dir = mkdtempSync(path.join(tmpdir(), "action-contract-test-"));
  scratch.push(dir);
  for (const file of files) { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), readFileSync(path.join(root, file))); }
  return dir;
};
after(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });

// ---- the real gate -----------------------------------------------------------------------------------------------------
test("the committed snapshot is what the built-in Manifests and the Host's action directory generate", () => {
  const result = checkActionSnapshots({ root, manifests: product.manifests, effectOf: product.effectOf, hostViews: product.hostViews });
  assert.deepEqual(result.problems, [], "Refresh on purpose with `pnpm actions:update` and say in the PR what the change means for callers (docs/system/CONTRACT-CHANGES.md)");
});

test("every action and scene a built-in Manifest declares has a row, and every row has a Manifest", () => {
  const built = buildAll({ manifests: product.manifests, effectOf: product.effectOf, hostViews: product.hostViews });
  assert.deepEqual(built.problems, []);
  const declaredActions = product.manifests.flatMap((manifest) => (manifest.actions ?? []).map((definition: any) => `${definition.capability_id}@${definition.version} ${manifest.plugin_id}`));
  assert.deepEqual(built.actions.map((row: any) => `${row.key} ${row.cells.provider}`).sort(), declaredActions.sort());
  const declaredScenes = product.manifests.flatMap((manifest) => (manifest.action_scenes ?? []).map((scene: any) => `${scene.scene_id}@${scene.version} ${manifest.plugin_id}`));
  assert.deepEqual(built.scenes.map((row: any) => `${row.key} ${row.cells.provider}`).sort(), declaredScenes.sort());
  assert.ok(declaredActions.length > 400 && declaredScenes.length >= 2, "the built-in Manifests were not read");
  // The committed files are the same rows, read back from disk.
  const committed = (file: string) => readFileSync(path.join(root, file), "utf8").split("\n").filter((line) => line && !line.startsWith("#")).length - 1;
  assert.equal(committed(ACTIONS_FILE), declaredActions.length);
  assert.equal(committed(SCENES_FILE), declaredScenes.length);
  assert.equal(committed(HOST_ACTIONS_FILE), built.host.length);
});

test("the Host layer lists the providers no Manifest carries, and no Manifest provider hides in it", () => {
  const built = buildAll({ manifests: product.manifests, effectOf: product.effectOf, hostViews: product.hostViews });
  const providers = new Set(built.host.map((row: any) => row.cells.provider));
  assert.ok([...providers].some((provider: string) => provider.startsWith("system.")), "the system.* providers are missing from the Host layer");
  assert.ok([...providers].some((provider: string) => provider.startsWith("sdk.artifacts.plugin-install-")), "the Runtime SDK services are missing from the Host layer");
  const manifestKeys = new Set(built.actions.map((row: any) => `${row.key} ${row.cells.provider}`));
  for (const row of built.host) assert.ok(!manifestKeys.has(`${row.cells.capability_id}@${row.cells.version} ${row.cells.provider}`), `${row.key} is both a Manifest row and a Host row`);
});

// ---- the hash: what it sees and what it leaves out ---------------------------------------------------------------------
test("a schema hash sees the shape and not the prose", () => {
  const schema = { type: "object", properties: { title: { type: "string", minLength: 1 }, count: { type: "integer" } }, required: ["title"], additionalProperties: false };
  const hash = schemaHash(schema);
  assert.equal(schemaHash({ additionalProperties: false, required: ["title"], properties: { count: { type: "integer" }, title: { minLength: 1, type: "string" } }, type: "object" }), hash, "key order is not a change");
  assert.equal(schemaHash({ ...schema, title: "A label", description: "A sentence", $comment: "c", examples: [{ title: "x" }],
    properties: { title: { ...schema.properties.title, title: "Name", description: "shown to people" }, count: { ...schema.properties.count, description: "how many" } } }), hash, "annotations are prose");
  assert.notEqual(schemaHash({ ...schema, properties: { ...schema.properties, title: { type: "number" } } }), hash, "a property called title is a property, not an annotation");
  assert.notEqual(schemaHash({ ...schema, properties: { ...schema.properties, extra: { type: "string" } } }), hash, "a new property is a change");
  assert.notEqual(schemaHash({ ...schema, required: [] }), hash, "required is a change");
  assert.notEqual(schemaHash({ ...schema, required: ["count", "title"] }), schemaHash({ ...schema, required: ["title", "count"] }), "array order is kept");
  assert.notEqual(schemaHash({ type: "string", enum: [{ title: "a" }] }), schemaHash({ type: "string", enum: [{ title: "b" }] }), "values under enum are data: a title string inside one is not an annotation");
  assert.notEqual(schemaHash({ const: { description: "x" } }), schemaHash({ const: { description: "y" } }), "const is data");
  assert.notEqual(schemaHash({ properties: { default: { type: "string" } } }), schemaHash({ properties: { default: { type: "number" } } }), "a property called default is a property");
  assert.notEqual(schemaHash({ properties: { examples: { type: "string" } } }), schemaHash({ properties: {} }), "a property called examples is a property, not the examples annotation");
  assert.equal(schemaHash({ properties: { default: { type: "string", description: "x" } } }), schemaHash({ properties: { default: { type: "string" } } }),
    "the schema of a property called default is a schema, not default data: its annotations are prose");
  assert.throws(() => schemaHash({ type: "string", pattern: () => 1 }), /not plain JSON data/);
  assert.throws(() => canonicalJson({ at: new Date(0) }), /not plain JSON data/);
  assert.throws(() => canonicalJson({ n: Number.NaN }), /JSON cannot hold/);
});

// ---- the Manifest layer: what a change looks like ----------------------------------------------------------------------
test("a changed input or output schema under the same version is named as such", () => {
  const manifests = copyOfManifests();
  const target = find(allActions(manifests), (definition) => definition.action.input_schema?.properties, "an input schema with properties");
  target.action.input_schema = { ...target.action.input_schema, properties: { ...target.action.input_schema.properties, added_by_mutation: { type: "string" } } };
  const other = find(allActions(manifests), (definition) => definition !== target && definition.action.output_schema?.type === "object", "an object output schema");
  other.action.output_schema = { ...other.action.output_schema, type: "array" };
  const problems = manifestProblems(manifests);
  assert.match(problems, /changed shape under the SAME version/);
  assert.match(problems, new RegExp(`${target.capability_id.replaceAll(".", "\\.")}@1: input`));
  assert.match(problems, new RegExp(`${other.capability_id.replaceAll(".", "\\.")}@1: output`));
  assert.match(problems, /pnpm actions:update/);
});

test("prose and presentation edits do not change the snapshot", () => {
  const manifests = copyOfManifests();
  const actions = allActions(manifests);
  for (const definition of actions) {
    definition.action.title += " (reworded)";
    definition.action.description += " More help.";
    definition.action.input_schema = { ...definition.action.input_schema, description: "A new sentence.", title: "A new label" };
    if (definition.action.output_schema) definition.action.output_schema = { ...definition.action.output_schema, description: "Another sentence." };
    definition.action.audiences = [...definition.action.audiences].reverse();
    definition.action.permissions = [...definition.action.permissions].reverse();
  }
  find(actions, (definition) => definition.action.result_view, "a result_view").action.result_view.summary += " reworded";
  const subjectOffer = find(actions, (definition) => definition.action.subject_offer_choices?.length, "subject offer choices");
  subjectOffer.action.subject_offer_choices = subjectOffer.action.subject_offer_choices.map((choice: any) => ({ ...choice, title: `${choice.title} (reworded)` }));
  const fragmentOffer = find(actions, (definition) => definition.action.fragment_offer_choices?.length, "fragment offer choices");
  fragmentOffer.action.fragment_offer_choices = fragmentOffer.action.fragment_offer_choices.map((choice: any) => ({ ...choice, title: `${choice.title} (reworded)`, hint: `${choice.hint} (reworded)` }));
  for (const scene of manifests.flatMap((manifest) => manifest.action_scenes)) {
    scene.title += " (reworded)"; scene.description += " More."; scene.trigger += " (reworded)";
    if (scene.recommendation_labels) scene.recommendation_labels = Object.fromEntries(Object.keys(scene.recommendation_labels).map((key) => [key, `${key}!`]));
  }
  assert.equal(manifestProblems(manifests), "");
});

test("who may call an action, and how, is in the snapshot: permissions, audiences, kind, scope, scheduling, effect, semantic types, subjects, provider", () => {
  const cases: Array<[string, (manifests: any[]) => any, string]> = [
    ["permissions", (manifests) => { const a = find(allActions(manifests), (d) => d.action.permissions.length, "a permission"); a.action.permissions = [...a.action.permissions, "mutation:extra"]; return a; }, "permissions"],
    ["audiences", (manifests) => { const a = find(allActions(manifests), (d) => !d.action.audiences.includes("plugin"), "an action not offered to plugins"); a.action.audiences = [...a.action.audiences, "plugin"]; return a; }, "audiences"],
    ["kind", (manifests) => { const a = find(allActions(manifests), (d) => d.action.kind === "operation", "an operation"); a.action.kind = "judgment"; return a; }, "kind"],
    ["scope", (manifests) => { const a = find(allActions(manifests), (d) => d.action.scope === "project", "a project action"); a.action.scope = "home"; return a; }, "scope"],
    ["scheduling", (manifests) => { const a = find(allActions(manifests), (d) => d.action.scheduling === undefined, "a serial action"); a.action.scheduling = "concurrent"; return a; }, "scheduling"],
    ["effect", (manifests) => { const a = find(allActions(manifests), (d) => d.action.effect === "irreversible", "an irreversible action"); a.action.effect = "write"; return a; }, "effect"],
    ["operation", (manifests) => { const a = find(allActions(manifests), (d) => d.operation === "query", "a query"); a.operation = "command"; return a; }, "operation"],
  ];
  for (const [name, mutate, column] of cases) {
    const manifests = copyOfManifests();
    const target = mutate(manifests);
    const problems = manifestProblems(manifests);
    assert.match(problems, new RegExp(`${target.capability_id.replaceAll(".", "\\.")}@1:.*${column}`), `${name}: the change was not named`);
  }
  // Semantic types and subject kinds are part of the shape.
  for (const [name, mutate, column] of [
    ["input_type", (manifests: any[]) => { const a = find(allActions(manifests), (d) => d.action.input_type, "an input_type"); a.action.input_type += ".mutated"; return a; }, "input_type"],
    ["subjects", (manifests: any[]) => { const a = find(allActions(manifests), (d) => d.action.subject_kinds.length, "a subject kind"); a.action.subject_kinds = [...a.action.subject_kinds, "mutation"]; return a; }, "subjects"],
  ] as const) {
    const manifests = copyOfManifests();
    const target = mutate(manifests);
    const problems = manifestProblems(manifests);
    assert.match(problems, /changed shape under the SAME version/, `${name} is a change of shape`);
    assert.match(problems, new RegExp(`${target.capability_id.replaceAll(".", "\\.")}@1:.*${column}`));
  }
});

test("the rest of the declaration is covered by the traits hash, including fields added to the metadata later", () => {
  const cases: Array<[string, (action: any) => boolean, (action: any) => void]> = [
    ["required_actions", (a) => a.required_actions?.length, (a) => { a.required_actions = [...a.required_actions, { capability_id: "mutation.extra", version: 1 }]; }],
    ["undo", (a) => a.undo, (a) => { a.undo = { ...a.undo, version: 9 }; }],
    ["background_job", (a) => a.background_job, (a) => { a.background_job = { ...a.background_job, done: [...a.background_job.done, "mutated"] }; }],
    ["search_source", (a) => a.search_source, (a) => { a.search_source = { ...a.search_source, kinds: [...a.search_source.kinds, "mutated"] }; }],
    ["execution", (a) => a.execution, (a) => { a.execution = { ...a.execution, mutated: true }; }],
    ["authorship", (a) => a.authorship, (a) => { delete a.authorship; }],
    ["a field that does not exist yet", () => true, (a) => { a.future_contract_field = { anything: [1, 2] }; }],
  ];
  for (const [name, applies, mutate] of cases) {
    const manifests = copyOfManifests();
    const target = find(allActions(manifests), (d) => applies(d.action), name);
    mutate(target.action);
    const problems = manifestProblems(manifests);
    assert.match(problems, new RegExp(`${target.capability_id.replaceAll(".", "\\.")}@1:.*traits`), `${name}: not seen`);
  }
});

test("a version bump, a new action, a removed action and a moved action are each named", () => {
  const manifests = copyOfManifests();
  const [first, second, third] = manifests.filter((manifest) => manifest.actions.length > 2);
  const bumped = first.actions[0];
  bumped.version = 2;
  const added = structuredClone(first.actions[1]);
  added.capability_id = "mutation.brand.new";
  first.actions.push(added);
  const removed = second.actions.pop();
  const moved = third.actions.shift();
  first.actions.push(moved);
  const problems = manifestProblems(manifests);
  assert.match(problems, new RegExp(`${bumped.capability_id.replaceAll(".", "\\.")}: v1 -> v2`), "a version bump is a move to a new version");
  assert.match(problems, /action[s]? added:[\s\S]*mutation\.brand\.new@1/);
  assert.match(problems, new RegExp(`action[s]? removed[^]*${removed.capability_id.replaceAll(".", "\\.")}@1`));
  assert.match(problems, new RegExp(`${moved.capability_id.replaceAll(".", "\\.")}@1: provider ${third.plugin_id.replaceAll(".", "\\.")} -> ${first.plugin_id.replaceAll(".", "\\.")}`));
  assert.doesNotMatch(problems, /SAME version/, "none of these changed a shape under a version");
});

test("the same capability declared twice, or a declaration that is not plain data, is refused with its name", () => {
  const twice = copyOfManifests();
  twice[1].actions.push(structuredClone(twice[0].actions[0]));
  assert.match(manifestProblems(twice), new RegExp(`${twice[0].actions[0].capability_id.replaceAll(".", "\\.")}@1 is declared twice`));
  const loose = copyOfManifests();
  const target = loose[0].actions[0];
  target.action.input_schema = { ...target.action.input_schema, pattern: () => true };
  assert.match(manifestProblems(loose), new RegExp(`${loose[0].plugin_id.replaceAll(".", "\\.")}: .*input_schema.*not plain JSON data`));
  const versionless = copyOfManifests();
  versionless[0].actions[0].version = 0;
  assert.match(manifestProblems(versionless), /version is not a positive integer/);
});

test("a changed consumer scene is named under its own file", () => {
  const manifests = copyOfManifests();
  const scene = manifests.flatMap((manifest) => manifest.action_scenes)[0];
  scene.result_schema = { ...scene.result_schema, mutated: true };
  const problems = manifestProblems(manifests);
  assert.match(problems, /tooling\/gates\/actions\/scenes\.tsv: [\s\S]*scene[s]? changed shape under the SAME version/);
  assert.match(problems, new RegExp(`${scene.scene_id.replaceAll(".", "\\.")}@1: result`));
  scene.result_schema = undefined; // not a plain schema any more: still named, not a crash
  assert.doesNotThrow(() => manifestProblems(manifests));
});

// ---- the committed files, edited by hand -------------------------------------------------------------------------------
test("a hand-edited, missing or damaged snapshot file is refused", () => {
  const check = (dir: string) => checkActionSnapshots({ root: dir, manifests: product.manifests, effectOf: product.effectOf }).problems.join("\n");
  const edit = (change: (text: string) => string) => {
    const dir = scratchRoot(ACTIONS_FILE, SCENES_FILE);
    writeFileSync(path.join(dir, ACTIONS_FILE), change(readFileSync(path.join(dir, ACTIONS_FILE), "utf8")));
    return check(dir);
  };
  assert.equal(check(scratchRoot(ACTIONS_FILE, SCENES_FILE)), "", "the copy of the committed files passes");
  const rows = (text: string) => text.split("\n");
  const firstRow = (text: string) => rows(text).findIndex((line) => line && !line.startsWith("#") && !line.startsWith("capability_id\t")) ;
  assert.match(edit((text) => text.replace(/\t[0-9a-f]{12}\t/, "\t000000000000\t")), /changed shape under the SAME version/, "a hash edited by hand differs from the product");
  assert.match(edit((text) => rows(text).filter((_, at) => at !== firstRow(text)).join("\n")), /action[s]? added/, "a deleted row is a row the product has and the file lacks");
  assert.match(edit((text) => `${text}${rows(text)[firstRow(text)].replace(/^[^\t]+/, "mutation.extra.row")}\n`), /action[s]? removed/, "an invented row is not in the product");
  assert.match(edit((text) => { const lines = rows(text); const at = firstRow(text); [lines[at], lines[at + 1]] = [lines[at + 1], lines[at]]; return lines.join("\n"); }), /edited by hand: only formatting, order or comments/, "a reordered file is not what the gate generates");
  assert.match(edit((text) => text.replace(/^# Generated by.*\n/m, "")), /edited by hand/, "the generated header is part of the file");
  assert.match(edit((text) => text.replace("capability_id\tversion", "capability_id\tedition")), /column header is not/, "a different header cannot be read");
  assert.match(edit((text) => `${text}${rows(text)[firstRow(text)]}\n`), /is listed twice/, "a row listed twice cannot be keyed");
  assert.match(edit(() => ""), /column header is not/);
  const missing = scratchRoot(SCENES_FILE);
  assert.match(check(missing), /actions\.tsv: missing\. Generate it with `node scripts\/gates\/action-contract-snapshot\.mjs --update`/);
});

// ---- the Host layer ----------------------------------------------------------------------------------------------------
const hostView = (overrides: Record<string, unknown> = {}) => ({ capability_id: "mutation.host.read", version: 1, operation: "query", provider: { provider_id: "system.mutation" },
  action: { title: "Read", description: "Read.", kind: "query", scope: "home", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: {}, additionalProperties: false }, output_schema: { type: "object", properties: {}, additionalProperties: false } }, ...overrides });

test("a registration the Host gains, loses or changes is named under host-actions.tsv", () => {
  const added = productProblems([...copyOfViews(), hostView()]);
  assert.match(added, /host-actions\.tsv: [\s\S]*host-registered action[s]? added:[\s\S]*mutation\.host\.read@1 via system\.mutation/);

  const lost = productProblems(copyOfViews().filter((view: any) => view.provider.provider_id !== "system.search"));
  assert.match(lost, /host-registered action[s]? removed[^]*search\./);

  const views = copyOfViews();
  const system = find(views, (view) => view.provider.provider_id === "system.memory" && view.action.input_schema?.properties, "a system.memory action with an input schema");
  for (const view of views.filter((candidate: any) => candidate.capability_id === system.capability_id && candidate.provider.provider_id === system.provider.provider_id)) {
    view.action.input_schema = { ...view.action.input_schema, properties: { ...view.action.input_schema.properties, added_by_mutation: { type: "string" } } };
  }
  const changed = productProblems(views);
  assert.match(changed, /changed shape under the SAME version/);
  assert.match(changed, new RegExp(`${system.capability_id.replaceAll(".", "\\.")}@1 via system\\.memory: input`));

  const moved = copyOfViews().map((view: any) => (view.provider.provider_id === "system.placement" ? { ...view, provider: { provider_id: "system.placement-two" } } : view));
  const movedProblems = productProblems(moved);
  assert.match(movedProblems, /host-registered action[s]? added:[^]*via system\.placement-two/, "the provider is part of a Host row's identity");
  assert.match(movedProblems, /host-registered action[s]? removed[^]*via system\.placement\b/);
});

test("the Host must register what each Manifest declares, and the plugin's registration must be the Manifest's declaration", () => {
  const unregistered = productProblems(copyOfViews().filter((view: any) => !(view.provider.plugin_id && view.capability_id === product.manifests[0].actions[0].capability_id)));
  assert.match(unregistered, new RegExp(`${product.manifests[0].actions[0].capability_id.replaceAll(".", "\\.")}@1: ${product.manifests[0].plugin_id.replaceAll(".", "\\.")} declares it but the Host registers it under no provider`));

  const differing = copyOfViews();
  const declared = new Set(product.manifests.flatMap((manifest) => (manifest.actions ?? []).map((definition: any) => `${definition.capability_id}@${definition.version} ${manifest.plugin_id}`)));
  const own = find(differing, (view) => declared.has(`${view.capability_id}@${view.version} ${view.provider.plugin_id}`) && view.action.input_schema?.properties, "a Manifest action registered by its plugin, with an input schema");
  own.action = { ...own.action, input_schema: { ...own.action.input_schema, properties: { ...own.action.input_schema.properties, only_in_the_host: { type: "string" } } } };
  assert.match(productProblems(differing), new RegExp(`${own.capability_id.replaceAll(".", "\\.")}@1: the Host registers it under ${own.provider.plugin_id.replaceAll(".", "\\.")} with a declaration other than the Manifest's \\(input differ\\)`));

  const split = [...copyOfViews(), hostView(), hostView({ action: { ...hostView().action, permissions: ["mutation:other"] } })];
  assert.match(productProblems(split), /mutation\.host\.read@1 via system\.mutation: registered with two different declarations \(permissions differ/);
});

test("a capability a Manifest declares and a Home-level provider also registers is one Host row of its own", () => {
  const built = buildAll({ manifests: product.manifests, effectOf: product.effectOf, hostViews: product.hostViews });
  const both = built.host.filter((row: any) => built.actions.some((declared: any) => declared.key === `${row.cells.capability_id}@${row.cells.version}`));
  assert.ok(both.length >= 1, "the Goals personal planning actions are registered under io.molis.work.goals.home as well as declared by the Goals Manifest");
  for (const row of both) assert.notEqual(row.cells.provider, built.actions.find((declared: any) => declared.key === `${row.cells.capability_id}@${row.cells.version}`).cells.provider);
});

// ---- the Host runs on a throwaway Home ---------------------------------------------------------------------------------
test("the Host half never runs against the real Home: it needs the throwaway one, and puts the environment back", async () => {
  const names = ["HOME", "MOLIS_WORK_HOME", "MOLIS_WORK_SECRET_BACKEND", "MOLIS_WORK_ENCRYPTION_KEY"];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  await assert.rejects(collectHostViews(tmpdir()), /refusing to start a Host/, "the temporary directory itself is not a throwaway Home");
  await assert.rejects(collectHostViews(path.join(tmpdir(), "action-contract-no-such-home")), /refusing to start a Host/, "a Home the environment does not point at is refused");
  let inside = "";
  await withIsolatedHome(async (home: string) => {
    inside = home;
    assert.equal(process.env.HOME, home);
    assert.equal(process.env.MOLIS_WORK_HOME, home);
    assert.equal(process.env.MOLIS_WORK_SECRET_BACKEND, "file");
    assert.ok(realpathSync(home).startsWith(realpathSync(tmpdir()) + path.sep));
    await assert.rejects(collectHostViews(path.join(home, "other")), /refusing to start a Host/, "only the Home the environment points at is accepted");
  });
  assert.ok(!existsSync(inside), "the throwaway Home is removed");
  assert.deepEqual(Object.fromEntries(names.map((name) => [name, process.env[name]])), before, "the environment is put back");
});

// ---- the command line --------------------------------------------------------------------------------------------------
test("pnpm actions:update writes the committed files, and the check reads them back", { timeout: 240_000 }, () => {
  const dir = scratchRoot();
  const run = (...args: string[]) => spawnSync(process.execPath, [script, "--root", dir, ...args], { encoding: "utf8", env: { ...process.env, NODE_ENV: "test" } });
  const written = run("--update");
  assert.equal(written.status, 0, `${written.stdout}${written.stderr}`);
  for (const file of [ACTIONS_FILE, SCENES_FILE, HOST_ACTIONS_FILE]) {
    assert.equal(readFileSync(path.join(dir, file), "utf8"), readFileSync(path.join(root, file), "utf8"), `${file}: the command writes what is committed`);
  }
  assert.match(written.stdout, /snapshot rewritten/);
  const file = path.join(dir, ACTIONS_FILE);
  writeFileSync(file, readFileSync(file, "utf8").replace(/\t[0-9a-f]{12}\t/, "\t000000000000\t"));
  const failed = run();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /changed shape under the SAME version/);
  assert.match(failed.stderr, /pnpm actions:update/);
  assert.equal(spawnSync(process.execPath, [script, "--nonsense"], { encoding: "utf8" }).status, 2, "an unknown argument is a usage error, not a pass");
});
