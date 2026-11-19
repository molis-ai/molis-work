import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PLUGIN_DATA_EXPORT_FORMAT, PLUGIN_DATA_EXPORT_PERMISSION, SANDBOX_PACKAGE_FILES, pluginDataActions,
  type PluginDataExportResult, type PluginDataSectionDeclaration, type PluginManifest, type PluginPackageBundle,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { effectsFromContract, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { pluginComponentChoices, type PluginComponentPlan } from "@molis-ai/molis-work-design-system";
import { PAGES_PLUGIN_ID } from "@molis-ai/molis-work-plugin-pages";
import { CODING_PLUGIN_ID } from "@molis-ai/molis-work-plugin-coding";
import { newPublisher, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";
import { fixture, mac, operate, operationsOf, ref, refused } from "./fixtures/home-sandbox.js";

// Audit #7 (PEQ-09): built-in and installed third-party plugins both expose their declared business data
// sections through `plugins.data.sections@1` and read-only `plugins.data.export@1` in the same format.

const THIRD_PARTY_ID = "io.molis.work.example.exportable";
const SCHEMA = "CREATE TABLE tp_items (id INTEGER PRIMARY KEY, label TEXT NOT NULL);";
const CODE = `export const operations = {
  'items.add': async (input, sdk) => {
    await sdk.projectDatabase.transaction([{ sql: 'INSERT INTO tp_items(label) VALUES (?)', parameters: [input.label] }]);
    return true;
  },
  'items.list': async (_input, sdk) => {
    const rows = await sdk.projectDatabase.all('SELECT CAST(id AS TEXT) AS id, label FROM tp_items ORDER BY id');
    return rows.map(row => ({ id: String(row.id), label: String(row.label) }));
  },
};
`;

function exportablePackage(): PluginPackageBundle {
  return signedPackage(newPublisher(), (files: PackageFiles, manifest: PluginManifest) => {
    const contract: SandboxPluginContract = {
      version: 1,
      pluginId: manifest.plugin_id,
      revision: "export-v1",
      entities: [],
      acceptance: [],
      operations: [
        {
          id: "items.add", kind: "command",
          input: { type: "object", properties: { label: { type: "string", maxLength: 100 } }, required: ["label"], additionalProperties: false },
          output: { type: "boolean" }, errors: [], effects: { projectDatabase: ["read", "write"] },
          examples: [{ input: { label: "alpha" }, output: true }],
        },
        {
          id: "items.list", kind: "query",
          input: { type: "object", properties: {}, required: [], additionalProperties: false },
          output: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false } },
          errors: [], effects: { projectDatabase: ["read"] },
          examples: [{ input: {}, output: [] }],
        },
      ],
      pages: [{ id: "home", title: "导出样例", regions: [{ id: "main", title: "条目", operationIds: ["items.list", "items.add"] }] }],
    };
    Object.assign(manifest, sandboxPluginManifest({
      pluginId: manifest.plugin_id,
      name: "Exportable Notes",
      version: manifest.version,
      publisher: manifest.publisher,
      presentation: false,
      effects: effectsFromContract(contract),
      projectDatabase: { version: 1, schema: SCHEMA },
    }));
    const parts: PluginComponentPlan[] = [
      { id: "title", pageId: "home", regionId: "main", intent: "heading", purpose: "说明导出样例插件", props: { title: "导出样例" } },
    ];
    const nodes = parts.map(part => ({ ...part, kind: pluginComponentChoices(part, contract)[0]!.kind }));
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = CODE;
    files[SANDBOX_PACKAGE_FILES.interface] = JSON.stringify({ parts, nodes });
  }, { pluginId: THIRD_PARTY_ID });
}

test("Audit #7 plugins.data.sections and plugins.data.export serve built-in and installed third-party plugins through the same contract", mac, async t => {
  const h = await fixture(t);
  await h.install(exportablePackage());

  const projectCaller: ActionCallContext = {
    actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: h.reference.project_id,
    permissions: ["storage:private", PLUGIN_DATA_EXPORT_PERMISSION],
  };
  const homeCaller: ActionCallContext = {
    actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null,
    permissions: [PLUGIN_DATA_EXPORT_PERMISSION],
  };

  // Write one row into the installed third-party plugin's project database.
  const views = await operationsOf(h.projectClient(), projectCaller, THIRD_PARTY_ID);
  assert.equal(await operate(h.projectClient(), projectCaller, views, "items.add", { label: "from-third-party" }), true);

  // List sections: both built-in Pages (project-partitioned home store) and the installed third-party plugin are discovered.
  const listed = await h.projectClient().invoke(projectCaller, ref(pluginDataActions.sections), {}) as {
    sections: PluginDataSectionDeclaration[];
  };
  assert.ok(listed.sections.some(section => section.plugin_id === PAGES_PLUGIN_ID && section.scope === "home"));
  assert.ok(listed.sections.some(section => section.plugin_id === THIRD_PARTY_ID && section.scope === "project" && section.tables.includes("tp_items")));

  // Export built-in Pages data in the standard format.
  const pagesExport = await h.projectClient().invoke(projectCaller, ref(pluginDataActions.export), {
    plugin_id: PAGES_PLUGIN_ID, project_id: h.reference.project_id,
  }) as PluginDataExportResult;
  assert.equal(pagesExport.format, PLUGIN_DATA_EXPORT_FORMAT);
  assert.equal(pagesExport.version, 1);
  assert.equal(pagesExport.plugin_id, PAGES_PLUGIN_ID);
  assert.equal(pagesExport.project_id, h.reference.project_id);
  assert.ok(pagesExport.sections.length > 0);

  // Export installed third-party plugin data in the exact same format and verify rows match.
  const tpExport = await h.projectClient().invoke(projectCaller, ref(pluginDataActions.export), {
    plugin_id: THIRD_PARTY_ID, project_id: h.reference.project_id,
  }) as PluginDataExportResult;
  assert.equal(tpExport.format, PLUGIN_DATA_EXPORT_FORMAT);
  assert.equal(tpExport.version, 1);
  assert.equal(tpExport.plugin_id, THIRD_PARTY_ID);
  assert.equal(tpExport.project_id, h.reference.project_id);
  assert.equal(tpExport.sections.length, 1);
  const tpItems = tpExport.sections[0]!.items.find(item => item.table === "tp_items");
  assert.ok(tpItems, "exported tp_items table");
  assert.deepEqual(tpItems.rows.map(row => row.label), ["from-third-party"]);

  // Project-only plugin without project_id is refused; unknown plugin_id is refused.
  await assert.rejects(
    h.homeClient().invoke(homeCaller, ref(pluginDataActions.export), { plugin_id: CODING_PLUGIN_ID }),
    refused("host.plugin_data_project_required"),
  );
  await assert.rejects(
    h.homeClient().invoke(homeCaller, ref(pluginDataActions.export), { plugin_id: "io.molis.work.missing" }),
    refused("host.plugin_data_not_found"),
  );
});
