#!/usr/bin/env node
// Action-contract snapshot (specs/repository-anti-corruption §4.7, slice W2-15): the callable contract of every built-in
// Manifest, written down in tooling/gates/actions/. One row per action (`capability_id@version`) and one per consumer scene
// (`scene_id@version`): the provider that registers it, what kind of call it is and who may make it, and a hash each of its
// input schema, its output schema and the rest of its structured declaration. Persisted consumers pin exactly this
// (`capability_id@version` plus the provider: workflow steps, judgment bindings, MCP tool names), so a row that changes
// while its `@version` stays is a contract that changed under the people holding the old reference.
//
//   node scripts/gates/action-contract-snapshot.mjs                 check: exit 1 when the snapshot and the product differ
//   node scripts/gates/action-contract-snapshot.mjs --update        rewrite the snapshot (pnpm actions:update)
//   --root <dir>                                                    another repository root (tests of the gate)
//
// The check also runs in `pnpm test:contracts` (tests/action-contract-snapshot.test.ts). It needs the packages built.
//
// FOUR FILES
//   actions.tsv       the actions the built-in Manifests declare (`actions`), read from the workbench's BUILTIN_PLUGIN_CATALOG, the
//                     list the Manifest contract test walks. Pure: no Host is started.
//   scenes.tsv        the consumer scenes they declare (`action_scenes`).
//   host-actions.tsv  what a Host with every built-in plugin enabled registers that NO Manifest declares: the `system.*`
//                     providers, the Runtime SDK services, and plugin-owned actions registered in code beside the Manifest. It is
//                     read from the live action directory of a Host on a throwaway Home (action-contract-host.mjs). A row here is
//                     a contract with no Manifest to carry it; when its plugin declares it, the row moves to actions.tsv. The
//                     step-1 capability snapshot (specs/archive/post-merge-review §7.2) listed all three kinds together.
//   host-scenes.tsv   the consumer scenes the Host registers that NO Manifest declares (the home dock, `home.dock@1` of
//                     `system.home`), read from the Host's scene directory with the permissions of everyone who may see a scene.
//                     A judgment binding pins a scene by `scene_id@version` and the provider id, as an action reference does, so a
//                     scene is a contract with the same rules. A row here moves to scenes.tsv when its plugin declares it.
//   The check also requires the two layers to agree: every Manifest action is registered by the Host, and where its plugin
//   registers it, with the declaration the Manifest holds and under one provider id (recorded as registered_provider). Every
//   Manifest scene is likewise registered by its plugin.
//
// WHAT A ROW HOLDS (tooling/gates/README.md, section 动作合同快照, has the longer account)
//   readable   capability_id, version, provider, registered_provider (Manifest rows only), operation, kind, scope, effect (declared, or inferred from the id as
//              `actionEffect` does), scheduling, audiences, permissions and subject kinds (sorted; their order is not a
//              contract), and the semantic input and output types that workflows match on
//   hashed     input and output: sha256 of the JSON Schema in canonical form (keys sorted, array order kept) with the
//              annotation keywords `title`, `description`, `$comment` and `examples` taken out, because editing a label or a
//              sentence of help is not a change of the shape; `const`, `default` and `enum` values are data and stay as they are,
//              and a property that happens to be called `title` is a property, not an annotation.
//              traits: everything else the action declares except the prose and the presentation (`title`, `description`,
//              `result_view`, and the title and hint of offer choices): required actions, undo and background-job wiring,
//              search and file sources, execution policy, authorship, workflow content, and whatever field is added to the
//              action metadata later. New fields are covered without touching this file.
//   provider   in actions.tsv the Manifest's `plugin_id`; in host-actions.tsv the id the Host registers it under.
//   registered_provider   (actions.tsv and scenes.tsv) the id the Host registers the Manifest's action or scene under, read from the
//              Host's directory. THIS is the provider a persisted reference holds (a workflow step's `provider_id`, `allowed_actions`,
//              the Feed and Inbox scene references), and the kernel refuses a call whose reference names another one
//              (`actions.provider_changed`). It is the `plugin_id` for a plugin registered under its own id, and
//              `plugin-install-<sha256(plugin_id, publisher.signature)>` for a Runtime-assembled one, so moving a plugin from the
//              native to the Runtime assembly, or giving it another signature, changes it for every action of the plugin and the
//              check names each one. The check ties a Host view to the plugin by `provider.plugin_id`. Without a Host (the Manifest
//              layer alone, which the gate's own tests use) the column is carried over from the committed file, not checked.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ACTION_SNAPSHOT_DIRECTORY = "tooling/gates/actions";
export const ACTIONS_FILE = `${ACTION_SNAPSHOT_DIRECTORY}/actions.tsv`;
export const SCENES_FILE = `${ACTION_SNAPSHOT_DIRECTORY}/scenes.tsv`;
export const HOST_ACTIONS_FILE = `${ACTION_SNAPSHOT_DIRECTORY}/host-actions.tsv`;
export const HOST_SCENES_FILE = `${ACTION_SNAPSHOT_DIRECTORY}/host-scenes.tsv`;
export const ACTION_REFRESH_COMMAND = "node scripts/gates/action-contract-snapshot.mjs --update";

export const ACTION_COLUMNS = ["capability_id", "version", "provider", "operation", "kind", "scope", "effect", "scheduling", "audiences", "permissions",
  "subjects", "input_type", "output_type", "input", "output", "traits"];
/** The rows of actions.tsv are a Manifest's: they also say which provider id the Host registers the action under. */
export const MANIFEST_ACTION_COLUMNS = [...ACTION_COLUMNS.slice(0, 3), "registered_provider", ...ACTION_COLUMNS.slice(3)];
export const SCENE_COLUMNS = ["scene_id", "version", "provider", "registered_provider", "scope", "permissions", "configuration_permissions", "subjects", "input_type", "result_type",
  "input", "result", "event", "traits"];
/** The rows of host-scenes.tsv are the Host's own: the provider column is the id the Host registers the scene under. */
export const HOST_SCENE_COLUMNS = SCENE_COLUMNS.filter((column) => column !== "registered_provider");
/** The columns that are the shape of the call; the others say how it behaves and who may make it. */
const REGISTERED = "registered_provider";
const SHAPE_COLUMNS = new Set(["subjects", "input_type", "output_type", "result_type", "input", "output", "result", "event", "traits"]);

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const NONE = "-";
const HASH_LENGTH = 12;

// ---- canonical form and hashes ---------------------------------------------------------------------------------------
/** Keyword names whose value is a map from names to schemas: the keys there are names, whatever they are called. */
const NAME_MAPS = new Set(["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]);
/** Keywords whose value is data, not a schema: kept as written. */
const DATA_KEYWORDS = new Set(["const", "default", "enum"]);
const ANNOTATIONS = new Set(["title", "description", "$comment"]);

class NotPlainData extends Error {}

/**
 * `value` as plain JSON data with object keys in order. `schema` takes the annotation keywords out of JSON Schema positions.
 * Anything that is not plain JSON data (a function, a class instance, NaN, a symbol, bigint) throws NotPlainData: a contract
 * that cannot be written down as data cannot be hashed honestly.
 */
const normal = (value, where, { schema, inData = false, namesOnly = false }) => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new NotPlainData(`${where} is ${value}, which JSON cannot hold`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => normal(item, `${where}[${index}]`, { schema, inData }));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const key of Object.keys(value).sort(byText)) {
      const item = value[key];
      if (item === undefined) continue;
      if (schema && !inData && !namesOnly) {
        if (ANNOTATIONS.has(key) && typeof item === "string") continue;
        if (key === "examples") continue;
      }
      out[key] = normal(item, `${where}.${key}`, {
        schema,
        inData: inData || (schema && !namesOnly && DATA_KEYWORDS.has(key)),
        namesOnly: schema && !inData && !namesOnly && NAME_MAPS.has(key),
      });
    }
    return out;
  }
  throw new NotPlainData(`${where} is a ${typeof value === "object" ? value?.constructor?.name ?? "object" : typeof value}, not plain JSON data`);
};

/** The canonical JSON text of `value` (object keys sorted, array order kept). */
export const canonicalJson = (value, where = "value") => JSON.stringify(normal(value, where, { schema: false }));

const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, HASH_LENGTH);
/** The hash of a JSON Schema in canonical form, annotations taken out. */
export const schemaHash = (schema, where = "schema") => hashOf(JSON.stringify(normal(schema, where, { schema: true })));

// ---- the rows --------------------------------------------------------------------------------------------------------
const list = (items) => (items?.length ? [...items].sort(byText).join(",") : NONE);
const OFFER_DISPLAY = { subject_offer_choices: ["title"], fragment_offer_choices: ["title", "hint"] };
/** The action metadata that is neither a column of its own nor prose or presentation. */
const ACTION_NOT_TRAITS = new Set(["title", "description", "kind", "scope", "effect", "scheduling", "audiences", "permissions", "subject_kinds", "input_type", "output_type",
  "input_schema", "output_schema", "result_view"]);
const SCENE_NOT_TRAITS = new Set(["scene_id", "version", "title", "description", "trigger", "scope", "permissions", "configuration_permissions",
  "subject_kinds", "input_type", "result_type", "input_schema", "result_schema", "event_schema", "recommendation_labels"]);

const withoutDisplay = (field, choices) => (!Array.isArray(choices) ? choices : choices.map((choice) => {
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) return choice;
  const copy = { ...choice };
  for (const key of OFFER_DISPLAY[field]) delete copy[key];
  return copy;
}));

const traitsOf = (declaration, excluded, where) => {
  const rest = {};
  for (const key of Object.keys(declaration)) {
    // An empty list says what absence says (`subject_kinds: []` on an action that has no subject).
    if (excluded.has(key) || declaration[key] === undefined || (Array.isArray(declaration[key]) && declaration[key].length === 0)) continue;
    rest[key] = Object.hasOwn(OFFER_DISPLAY, key) ? withoutDisplay(key, declaration[key]) : declaration[key];
  }
  return Object.keys(rest).length ? hashOf(canonicalJson(rest, where)) : NONE;
};

const positiveVersion = (key, version) => {
  if (!Number.isInteger(version) || version < 1) throw new NotPlainData(`${key}: version is not a positive integer`);
};

/** The cells of one action row: `definition` is an ActionDefinition (or an ActionView, which carries the same fields). */
const actionCells = (definition, provider, effectOf) => {
  const key = `${definition.capability_id}@${definition.version}`;
  positiveVersion(key, definition.version);
  const meta = definition.action;
  return {
    capability_id: definition.capability_id, version: String(definition.version), provider, operation: definition.operation,
    kind: meta.kind, scope: meta.scope, effect: effectOf(meta, definition.capability_id), scheduling: meta.scheduling ?? NONE,
    audiences: list(meta.audiences), permissions: list(meta.permissions),
    subjects: list(meta.subject_kinds), input_type: meta.input_type ?? NONE, output_type: meta.output_type ?? NONE,
    input: schemaHash(meta.input_schema, `${key} input_schema`),
    output: meta.output_schema === undefined ? NONE : schemaHash(meta.output_schema, `${key} output_schema`),
    traits: traitsOf(meta, ACTION_NOT_TRAITS, `${key} traits`),
  };
};

const sceneCells = (scene, provider) => {
  const key = `${scene.scene_id}@${scene.version}`;
  positiveVersion(key, scene.version);
  return {
    scene_id: scene.scene_id, version: String(scene.version), provider, registered_provider: NONE, scope: scene.scope,
    permissions: list(scene.permissions), configuration_permissions: list(scene.configuration_permissions),
    subjects: list(scene.subject_kinds), input_type: scene.input_type ?? NONE, result_type: scene.result_type ?? NONE,
    input: schemaHash(scene.input_schema, `${key} input_schema`),
    result: schemaHash(scene.result_schema, `${key} result_schema`),
    event: scene.event_schema === undefined ? NONE : schemaHash(scene.event_schema, `${key} event_schema`),
    // The sentence that names the trigger and the labels of the recommendation values are prose for the person.
    traits: traitsOf(scene, SCENE_NOT_TRAITS, `${key} traits`),
  };
};

const actionKey = (cells) => `${cells.capability_id}@${cells.version}`;
const sceneKey = (cells) => `${cells.scene_id}@${cells.version}`;
/** A scene registration is a provider's too: the same scene could be registered by a plugin and by the Host's own provider. */
const hostSceneKey = (cells) => `${cells.scene_id}@${cells.version} via ${cells.provider}`;
/** A registration is a provider's: the same capability can be registered by a plugin and by the Host's own provider. */
const hostKey = (cells) => `${cells.capability_id}@${cells.version} via ${cells.provider}`;
const rowOrder = (idColumn) => (a, b) => byText(a.cells[idColumn], b.cells[idColumn]) || Number(a.cells.version) - Number(b.cells.version) || byText(a.cells.provider, b.cells.provider);

/**
 * The rows for the Manifests: `manifests` are `{ plugin_id, actions?, action_scenes? }` (a PluginManifest is one); `effectOf`
 * is `actionEffect` of the contracts package, passed in so this module needs no build of its own. Returns
 * `{ actions: row[], scenes: row[], problems: string[] }`; a row is `{ key, cells }` with `cells` keyed by column name.
 */
export const buildRows = (manifests, effectOf) => {
  const problems = [], actions = [], scenes = [];
  const seen = new Map();
  const claim = (key, owner) => {
    if (seen.has(key)) { problems.push(`${key} is declared twice (${seen.get(key)} and ${owner}); a capability or scene is registered once`); return false; }
    seen.set(key, owner);
    return true;
  };
  for (const manifest of manifests) {
    const owner = manifest.plugin_id;
    for (const definition of manifest.actions ?? []) {
      try {
        const cells = { ...actionCells(definition, definition.provider_id ?? owner, effectOf), registered_provider: NONE };
        if (claim(actionKey(cells), owner)) actions.push({ key: actionKey(cells), cells });
      } catch (error) {
        if (!(error instanceof NotPlainData)) throw error;
        problems.push(`${owner}: ${error.message}`);
      }
    }
    for (const scene of manifest.action_scenes ?? []) {
      try {
        const cells = sceneCells(scene, owner);
        if (claim(`scene ${sceneKey(cells)}`, owner)) scenes.push({ key: sceneKey(cells), cells });
      } catch (error) {
        if (!(error instanceof NotPlainData)) throw error;
        problems.push(`${owner}: ${error.message}`);
      }
    }
  }
  actions.sort(rowOrder("capability_id"));
  scenes.sort(rowOrder("scene_id"));
  return { actions, scenes, problems };
};

const sameCells = (a, b, columns) => columns.every((column) => a[column] === b[column]);

const providerIdOf = (view) => (typeof view.provider?.provider_id === "string" && view.provider.provider_id ? view.provider.provider_id : null);

/**
 * The rows the Host registers beyond the Manifests. `views` are what the Host's action directory lists (`ActionView`:
 * `capability_id`, `version`, `operation`, `action`, `provider: { provider_id, plugin_id? }`), over every audience and both
 * scopes, so one registration appears several times; `declared` are the Manifest rows of buildRows. A view is a Manifest's own
 * when its provider's `plugin_id` is the Manifest that declares that `capability_id@version`; it must then hold exactly the
 * declaration the Manifest holds, and the same provider id in every view. Any other registration is a Host row, including one
 * under a Home-level provider of an `capability_id@version` a Manifest also declares (the Goals plugin declares
 * goals.planning.personal.*, which the Host registers as io.molis.work.goals.home). Returns `{ rows, registered, problems }`:
 * `registered` maps each Manifest action's `capability_id@version` to the provider id the Host registers it under (its plugin's
 * registration, or, where the plugin registers none, the provider(s) that do); `problems` also names a Manifest action that no
 * view registers.
 */
export const buildHostRows = (views, declared, effectOf) => {
  const problems = [], rows = new Map(), seenAnywhere = new Map(), byPlugin = new Map();
  const byKey = new Map(declared.map((row) => [row.key, row]));
  for (const view of views) {
    const provider = providerIdOf(view);
    const key = `${view.capability_id}@${view.version}`;
    try {
      const own = byKey.get(key);
      if (own && provider) seenAnywhere.set(key, new Set([...(seenAnywhere.get(key) ?? []), provider]));
      if (own && provider && view.provider?.plugin_id === own.cells.provider) {
        byPlugin.set(key, new Set([...(byPlugin.get(key) ?? []), provider]));
        const cells = actionCells(view, own.cells.provider, effectOf);
        if (!sameCells(cells, own.cells, ACTION_COLUMNS)) problems.push(`${key}: the Host registers it under ${provider} with a declaration other than the Manifest's (${ACTION_COLUMNS.filter((column) => cells[column] !== own.cells[column]).join(", ")} differ)`);
        continue;
      }
      if (!provider) { problems.push(`${key}: a registration of it names no provider id`); continue; }
      const cells = actionCells(view, provider, effectOf);
      const hostRowKey = hostKey(cells), before = rows.get(hostRowKey);
      if (before && !sameCells(before.cells, cells, ACTION_COLUMNS)) problems.push(`${hostRowKey}: registered with two different declarations (${ACTION_COLUMNS.filter((column) => cells[column] !== before.cells[column]).join(", ")} differ between audiences or scopes)`);
      else if (!before) rows.set(hostRowKey, { key: hostRowKey, cells });
    } catch (error) {
      if (!(error instanceof NotPlainData)) throw error;
      problems.push(`${provider}: ${error.message}`);
    }
  }
  const registered = new Map();
  for (const row of declared) {
    const ids = [...(byPlugin.get(row.key) ?? seenAnywhere.get(row.key) ?? [])].sort(byText);
    if (!ids.length) problems.push(`${row.key}: ${row.cells.provider} declares it but the Host registers it under no provider at all (a Manifest declares what the Host registers)`);
    else if (byPlugin.has(row.key) && ids.length > 1) problems.push(`${row.key}: the Host registers it under ${ids.length} provider ids (${ids.join(", ")}); a persisted reference names exactly one, so a registration is under one`);
    else registered.set(row.key, ids.join(","));
  }
  return { rows: [...rows.values()].sort(rowOrder("capability_id")), registered, problems };
};

/**
 * What the Host's scene directory holds. `views` are what it lists (`ActionSceneView`: `definition`, `provider: { provider_id,
 * plugin_id? }`) over every audience and both scopes, so one registration appears several times; `declared` are the scene rows of
 * buildRows. A scene is the Manifest's when its provider's `plugin_id` is the Manifest that declares it; any other registration is a
 * Host row, the way buildHostRows treats an action: it needs a provider id, and every listing of it holds one declaration.
 * Returns `{ rows, registered, problems }`: `rows` are the Host's own scenes (key `scene_id@version via provider`), `registered` maps
 * each Manifest scene to the provider id the Host registers it under, and `problems` also names a Manifest scene that no view
 * registers or that is registered under two provider ids.
 */
export const buildHostScenes = (views, declared) => {
  const problems = [], found = new Map(), rows = new Map(), byKey = new Map(declared.map((row) => [row.key, row]));
  for (const view of views) {
    const key = `${view.definition?.scene_id}@${view.definition?.version}`, own = byKey.get(key), provider = providerIdOf(view);
    try {
      if (own && provider && view.provider?.plugin_id === own.cells.provider) { found.set(key, new Set([...(found.get(key) ?? []), provider])); continue; }
      if (!provider) { problems.push(`scene ${key}: a registration of it names no provider id`); continue; }
      const cells = sceneCells(view.definition, provider);
      const rowKey = hostSceneKey(cells), before = rows.get(rowKey);
      if (before && !sameCells(before.cells, cells, HOST_SCENE_COLUMNS)) problems.push(`scene ${rowKey}: registered with two different declarations (${HOST_SCENE_COLUMNS.filter((column) => cells[column] !== before.cells[column]).join(", ")} differ between audiences or scopes)`);
      else if (!before) rows.set(rowKey, { key: rowKey, cells });
    } catch (error) {
      if (!(error instanceof NotPlainData)) throw error;
      problems.push(`${provider}: ${error.message}`);
    }
  }
  const registered = new Map();
  for (const row of declared) {
    const ids = [...(found.get(row.key) ?? [])].sort(byText);
    if (!ids.length) problems.push(`scene ${row.key}: ${row.cells.provider} declares it but the Host registers it under no provider at all (a Manifest declares what the Host registers)`);
    else if (ids.length > 1) problems.push(`scene ${row.key}: the Host registers it under ${ids.length} provider ids (${ids.join(", ")}); a persisted reference names exactly one, so a registration is under one`);
    else registered.set(row.key, ids[0]);
  }
  return { rows: [...rows.values()].sort(rowOrder("scene_id")), registered, problems };
};

// ---- the files -------------------------------------------------------------------------------------------------------
const HEADERS = {
  actions: [
    "# Action contract snapshot: the built-in Manifests' callable actions, one row per capability_id@version.",
    "# Generated by `node scripts/gates/action-contract-snapshot.mjs --update` (pnpm actions:update); do not edit by hand.",
    "# provider is the Manifest's plugin_id; registered_provider is the id the Host registers the action under, which persisted references (workflow",
    "# steps, allowed_actions, scene references) name and the kernel compares (actions.provider_changed). effect is the declared one, or inferred",
    "# from the id (a delete-like id cannot be undone).",
    "# audiences, permissions and subjects (subject kinds) are sorted; input_type and output_type are the semantic types workflows match on.",
    "# input, output and traits are sha256 prefixes: input and output of the JSON Schema without its title/description annotations; traits of",
    "# the rest of the declaration (required actions, undo, background job, sources, execution policy, authorship, ...) without prose and",
    "# presentation. `-` means none.",
    "# A row whose hash changed while its @version did not is a contract that changed under the references that pin it: bump the version, or",
    "# say in the PR why the change cannot break a pinned reference (docs/system/CONTRACT-CHANGES.md). Say what it means for callers.",
  ],
  scenes: [
    "# Consumer scene snapshot: the built-in Manifests' judgment-consuming scenes, one row per scene_id@version.",
    "# Generated by `node scripts/gates/action-contract-snapshot.mjs --update` (pnpm actions:update); do not edit by hand.",
    "# provider is the Manifest's plugin_id; registered_provider is the id the Host registers the scene under (scene references name it).",
    "# input, result and event are sha256 prefixes of the JSON Schemas without annotations; traits of the rest (recommendation source)",
    "# without prose. `-` means none. See actions.tsv for how a changed row is read.",
  ],
  host: [
    "# Actions a Host with every built-in plugin enabled registers that no built-in Manifest declares, one row per capability_id@version and provider.",
    "# Generated by `node scripts/gates/action-contract-snapshot.mjs --update` (pnpm actions:update); do not edit by hand.",
    "# They are the system.* providers, the Runtime SDK services of each installed plugin, and plugin-owned actions registered in code beside the",
    "# Manifest. provider is the id the Host registers them under. Same columns and reading as actions.tsv. When a plugin declares one of them in",
    "# its Manifest, the row moves to actions.tsv; a row with no Manifest is a contract nothing in the plugin's package carries.",
  ],
  hostScenes: [
    "# Consumer scenes the Host registers that no built-in Manifest declares, one row per scene_id@version and provider.",
    "# Generated by `node scripts/gates/action-contract-snapshot.mjs --update` (pnpm actions:update); do not edit by hand.",
    "# provider is the id the Host registers the scene under, which judgment bindings pin (a binding names scene_id@version and this provider).",
    "# Same columns and reading as scenes.tsv without registered_provider. When a plugin declares one of them in its Manifest, the row moves",
    "# to scenes.tsv.",
  ],
};

const render = (kind, columns, rows) => `${[...HEADERS[kind], columns.join("\t"), ...rows.map((row) => columns.map((column) => row.cells[column]).join("\t"))].join("\n")}\n`;

/** The four files: where, what columns, how a row is named, and the rows and noun for the messages. */
const FILES = [
  { kind: "actions", file: ACTIONS_FILE, columns: MANIFEST_ACTION_COLUMNS, keyOf: actionKey, noun: "action", registered: true, rows: (built) => built.actions },
  { kind: "scenes", file: SCENES_FILE, columns: SCENE_COLUMNS, keyOf: sceneKey, noun: "scene", registered: true, rows: (built) => built.scenes },
  { kind: "host", file: HOST_ACTIONS_FILE, columns: ACTION_COLUMNS, keyOf: hostKey, noun: "host-registered action", rows: (built) => built.host },
  { kind: "hostScenes", file: HOST_SCENES_FILE, columns: HOST_SCENE_COLUMNS, keyOf: hostSceneKey, noun: "host-registered scene", rows: (built) => built.hostScenes },
];

export const renderActionSnapshot = (rows) => render("actions", MANIFEST_ACTION_COLUMNS, rows);
export const renderSceneSnapshot = (rows) => render("scenes", SCENE_COLUMNS, rows);
export const renderHostActionSnapshot = (rows) => render("host", ACTION_COLUMNS, rows);
export const renderHostSceneSnapshot = (rows) => render("hostScenes", HOST_SCENE_COLUMNS, rows);

/**
 * The rows of a snapshot file. Returns `{ rows, problems }`; a file that cannot be read as the table it should be gives
 * problems and no rows.
 */
export const parseSnapshot = (text, columns, keyOf = actionKey, name = "snapshot") => {
  const lines = text.split("\n").filter((line) => line !== "" && !line.startsWith("#"));
  if (lines[0] !== columns.join("\t")) return { rows: [], problems: [`${name}: the column header is not \`${columns.join(" ")}\` (tab separated); regenerate it`] };
  const problems = [], rows = [], keys = new Set();
  for (const [index, line] of lines.slice(1).entries()) {
    const cells = line.split("\t");
    if (cells.length !== columns.length) { problems.push(`${name}: row ${index + 1} has ${cells.length} cells, expected ${columns.length}`); continue; }
    const record = Object.fromEntries(columns.map((column, at) => [column, cells[at]]));
    const key = keyOf(record);
    if (keys.has(key)) { problems.push(`${name}: ${key} is listed twice`); continue; }
    keys.add(key);
    rows.push({ key, cells: record });
  }
  return { rows, problems };
};

// ---- what changed ----------------------------------------------------------------------------------------------------
/**
 * Compares committed rows with the live rows. `added` and `removed` are rows; `changed` has the columns that differ. `bumped`
 * pairs a removed `id@old` with an added `id@new` of the same provider, which is how a version bump looks. `inPlace` is the
 * `changed` subset where the shape (subjects, types, schemas, traits) differs while the version did not: the review stop.
 * `reregistered` is the `changed` subset where the provider id the Host registers it under differs: every reference that pins the
 * old id stops resolving, whatever else is the same.
 */
export const diffSnapshots = (committed, live, columns) => {
  const idColumn = columns[0];
  const before = new Map(committed.map((row) => [row.key, row])), after = new Map(live.map((row) => [row.key, row]));
  let added = live.filter((row) => !before.has(row.key)), removed = committed.filter((row) => !after.has(row.key));
  const changed = [];
  for (const row of live) {
    const old = before.get(row.key);
    if (!old) continue;
    const differing = columns.filter((column) => old.cells[column] !== row.cells[column]);
    if (differing.length) changed.push({ key: row.key, columns: differing, before: old, after: row });
  }
  const bumped = [];
  for (const gone of [...removed]) {
    const successor = added.find((row) => row.cells[idColumn] === gone.cells[idColumn] && row.cells.provider === gone.cells.provider);
    if (!successor) continue;
    bumped.push({ id: gone.cells[idColumn], from: gone.cells.version, to: successor.cells.version, columns: columns.filter((column) => gone.cells[column] !== successor.cells[column] && column !== "version") });
    removed = removed.filter((row) => row !== gone);
    added = added.filter((row) => row !== successor);
  }
  return { added, removed, changed, bumped, inPlace: changed.filter((entry) => entry.columns.some((column) => SHAPE_COLUMNS.has(column))),
    reregistered: changed.filter((entry) => entry.columns.includes(REGISTERED)) };
};

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const preview = (lines, limit = 30) => (lines.length > limit ? [...lines.slice(0, limit), `... and ${lines.length - limit} more`] : lines);
const named = (row) => (row.key.includes(row.cells.provider) ? row.key : `${row.key} (${row.cells.provider})`);
/** The change in words for a PR description, one list per kind; empty when nothing differs. */
export const describeDiff = (difference, noun = "action") => {
  const out = [];
  if (difference.inPlace.length) {
    out.push(`${plural(difference.inPlace.length, noun)} changed shape under the SAME version (a reference that pins ${noun}@version now meets another contract: bump the version, or say why no pinned reference can break):`,
      ...preview(difference.inPlace.map((entry) => `    ${entry.key}: ${entry.columns.join(", ")}`)));
  }
  // A new registered provider is its own list: it breaks every pinned reference whatever else stayed the same.
  if (difference.reregistered.length) {
    out.push(`${plural(difference.reregistered.length, noun)} registered under another provider id (a reference that pins the old provider id meets actions.provider_changed and stops resolving: workflow steps, allowed_actions, Feed and Inbox scene references):`,
      ...preview(difference.reregistered.map((entry) => `    ${entry.key}: ${entry.before.cells[REGISTERED]} -> ${entry.after.cells[REGISTERED]}`)));
  }
  const rest = difference.changed.filter((entry) => !difference.inPlace.includes(entry)).map((entry) => ({ ...entry, columns: entry.columns.filter((column) => column !== REGISTERED) })).filter((entry) => entry.columns.length);
  if (rest.length) out.push(`${plural(rest.length, noun)} changed who may call it or how (same shape, same version):`, ...preview(rest.map((entry) => `    ${entry.key}: ${entry.columns.map((column) => `${column} ${entry.before.cells[column]} -> ${entry.after.cells[column]}`).join("; ")}`)));
  if (difference.bumped.length) out.push(`${plural(difference.bumped.length, noun)} moved to a new version (references pinned to the old version stop resolving):`,
    ...preview(difference.bumped.map((entry) => `    ${entry.id}: v${entry.from} -> v${entry.to}${entry.columns.length ? ` (also: ${entry.columns.join(", ")})` : ""}`)));
  if (difference.added.length) out.push(`${plural(difference.added.length, noun)} added:`, ...preview(difference.added.map((row) => `    ${named(row)}`)));
  if (difference.removed.length) out.push(`${plural(difference.removed.length, noun)} removed (references pinned to them stop resolving):`, ...preview(difference.removed.map((row) => `    ${named(row)}`)));
  return out;
};

// ---- check and update ------------------------------------------------------------------------------------------------
/**
 * All rows for the product: the Manifest layer, and (when the Host's views are given) the Host layer with the agreement check,
 * which also fills in the provider id the Host registers each Manifest action and scene under. `hostScenes` are the scenes the
 * Host lists; without them every Manifest scene is reported as registered by no one.
 */
export const buildAll = ({ manifests, effectOf, hostViews, hostScenes = [] }) => {
  const built = buildRows(manifests, effectOf);
  built.host = null;
  built.hostScenes = null;
  if (hostViews && !built.problems.length) {
    const host = buildHostRows(hostViews, built.actions, effectOf);
    const scenes = buildHostScenes(hostScenes, built.scenes);
    built.host = host.rows;
    built.hostScenes = scenes.rows;
    built.problems.push(...host.problems, ...scenes.problems);
    for (const row of built.actions) row.cells[REGISTERED] = host.registered.get(row.key) ?? NONE;
    for (const row of built.scenes) row.cells[REGISTERED] = scenes.registered.get(row.key) ?? NONE;
  }
  return built;
};

/**
 * Without a Host (the Manifest layer alone) nothing says which provider id a row is registered under, so each row keeps what the
 * committed file says; a row the file lacks gets `-` and shows up as added anyway. Only the Host's own views check that column.
 */
const carryRegistration = (rows, committedText, entry) => {
  const known = new Map(committedText === null ? [] : parseSnapshot(committedText, entry.columns, entry.keyOf, entry.file).rows.map((row) => [row.key, row.cells[REGISTERED]]));
  return rows.map((row) => ({ key: row.key, cells: { ...row.cells, [REGISTERED]: known.get(row.key) ?? NONE } }));
};

const activeFiles = (built) => FILES.filter((entry) => !["host", "hostScenes"].includes(entry.kind) || built.host !== null);

/**
 * Checks the committed snapshot under `root` against the product. Returns `{ problems, summary }`; `problems` is empty when
 * the files are exactly what the Manifests (and the Host, when its views are given) generate.
 */
export const checkActionSnapshots = ({ root, manifests, effectOf, hostViews, hostScenes }) => {
  const built = buildAll({ manifests, effectOf, hostViews, hostScenes });
  const problems = built.problems.map((problem) => `action contract: ${problem}`);
  if (problems.length) return { problems, summary: "" };
  for (const entry of activeFiles(built)) {
    const where = path.join(root, entry.file);
    if (!existsSync(where)) { problems.push(`${entry.file}: missing. Generate it with \`${ACTION_REFRESH_COMMAND}\` (pnpm actions:update) and commit it.`); continue; }
    const text = readFileSync(where, "utf8");
    const rows = entry.registered && built.host === null ? carryRegistration(entry.rows(built), text, entry) : entry.rows(built);
    const generated = render(entry.kind, entry.columns, rows);
    if (text === generated) continue;
    const parsed = parseSnapshot(text, entry.columns, entry.keyOf, entry.file);
    const lines = parsed.problems.length ? parsed.problems : describeDiff(diffSnapshots(parsed.rows, rows, entry.columns), entry.noun);
    problems.push(`${entry.file}: the product no longer matches the committed snapshot${lines.length ? `:\n  ${lines.join("\n  ")}` : " (the file was edited by hand: only formatting, order or comments differ from what the product generates)"}\n`
      + `  If the change is intended, refresh it on purpose with \`pnpm actions:update\` (${ACTION_REFRESH_COMMAND}), commit ${ACTION_SNAPSHOT_DIRECTORY}, and say in the PR what it means for callers (workflow steps and bindings that pin the capability, MCP tool names, Skills).`);
  }
  const declaring = new Set(manifests.filter((manifest) => manifest.actions?.length || manifest.action_scenes?.length).map((manifest) => manifest.plugin_id));
  return { problems, summary: `${plural(built.actions.length, "action")} and ${plural(built.scenes.length, "scene")} in ${plural(declaring.size, "Manifest")}${built.host ? `, ${plural(built.host.length, "action")} and ${plural(built.hostScenes.length, "scene")} more registered by the Host` : ""}` };
};

/** Rewrites the snapshot under `root` from the product. Returns `{ problems, changes }`, `changes` being the words for the PR. */
export const updateActionSnapshots = ({ root, manifests, effectOf, hostViews, hostScenes }) => {
  if (!hostViews) return { problems: ["action contract: the snapshot is written from the Host's directory too (the provider id each action is registered under); none was given"], changes: [] };
  const built = buildAll({ manifests, effectOf, hostViews, hostScenes });
  if (built.problems.length) return { problems: built.problems.map((problem) => `action contract: ${problem}`), changes: [] };
  const changes = [];
  for (const entry of activeFiles(built)) {
    const where = path.join(root, entry.file);
    const previous = existsSync(where) ? readFileSync(where, "utf8") : null;
    const rows = entry.rows(built);
    const text = render(entry.kind, entry.columns, rows);
    if (previous === text) continue;
    const parsed = previous === null ? { rows: [], problems: [] } : parseSnapshot(previous, entry.columns, entry.keyOf, entry.file);
    changes.push(...(parsed.problems.length ? [`${entry.file} was not readable as a snapshot and is regenerated whole`] : describeDiff(diffSnapshots(parsed.rows, rows, entry.columns), entry.noun)));
    mkdirSync(path.dirname(where), { recursive: true });
    writeFileSync(where, text);
  }
  return { problems: [], changes };
};

// ---- command line ----------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href) {
  const USAGE = "usage: action-contract-snapshot.mjs [--update] [--root <dir>]";
  const args = process.argv.slice(2);
  let update = false, root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--update") update = true;
    else if (args[index] === "--root" && args[index + 1]) root = path.resolve(args[++index]);
    else { console.error(`unknown argument ${args[index]}\n${USAGE}`); process.exit(2); }
  }
  let product;
  try {
    const { loadProduct } = await import("./action-contract-host.mjs");
    product = await loadProduct();
  } catch (error) {
    console.error(`action contract: the product could not be loaded (${String(error?.message ?? error).split("\n")[0]}). Run \`pnpm build\` first.`);
    process.exit(2);
  }
  if (update) {
    const result = updateActionSnapshots({ root, ...product });
    if (result.problems.length) { console.error(result.problems.join("\n")); process.exit(2); }
    console.log(result.changes.length ? `action contract snapshot rewritten (${ACTION_SNAPSHOT_DIRECTORY}); say this in the PR:\n  ${result.changes.join("\n  ")}` : `action contract snapshot unchanged (${ACTION_SNAPSHOT_DIRECTORY})`);
  } else {
    const result = checkActionSnapshots({ root, ...product });
    if (result.problems.length) { console.error(result.problems.join("\n")); process.exit(1); }
    console.log(`action contract snapshot matches the product (${result.summary})`);
  }
}
