import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { packSandboxProject } from "@molis-ai/molis-work-plugin-cli";
import { signPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import { defineSubjectContextAction, subjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract, SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { PluginComponentNode, PluginComponentPlan } from "@molis-ai/molis-work-design-system";
import type { SandboxUiContribution } from "@molis-ai/molis-work-plugin-sdk";
import { newPublisher } from "./sandbox-package.js";

type ReaderFixture = { title: string; content: string; invalidOpenId: string };

export function authoredObjectSlot(pluginId: string, kind: string, reader?: ReaderFixture) {
  const reference = { type: "object", additionalProperties: false, required: ["kind", "id"],
    properties: { kind: { type: "string" }, id: { type: "string" } } } as const;
  const input: SandboxSchema = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } };
  const empty: SandboxSchema = { type: "object", additionalProperties: false, properties: {}, required: [] };
  const contract: SandboxPluginContract = { version: 1, pluginId, revision: "reference-mount", entities: [],
    pages: [{ id: "home", title: "Reference collection", regions: [{ id: "main", title: "References", operationIds: ["references.list", "references.save"] }] }],
    operations: [
      { id: "references.list", kind: "query", input: empty, output: { type: "object", properties: { references: {
        type: "array", items: { ...reference, required: [...reference.required] },
      } }, required: ["references"], additionalProperties: false }, errors: [], effects: { storage: ["read"] }, examples: [{ input: {}, output: { references: [] } }] },
      { id: "references.save", kind: "command", input, output: { type: "boolean" }, errors: [], effects: { storage: ["write"] },
        examples: [{ input: { id: "example-reference" }, output: true }] },
    ], acceptance: [] };
  const parts: PluginComponentPlan[] = [
    { id: "editor", pageId: "home", regionId: "main", intent: "input", purpose: "Keep an original reference", props: { title: "Keep a reference" },
      submit: { operationId: "references.save", input: { id: { source: "form", field: "id" } } } },
    { id: "objects", pageId: "home", regionId: "main", intent: "reading", purpose: "Display the originals",
      props: {}, read: { operationId: "references.list", input: {}, outputPath: "references" }, surfaceSlot: { slot_id: "references.originals" } },
  ];
  const nodes: PluginComponentNode[] = parts.map(part => ({ ...part, kind: part.surfaceSlot ? "surface-slot" : "form" }));
  const ui: SandboxUiContribution = { slots: [{ slot_id: "references.originals", accepts: [], accepts_forms: ["card"] }] };
  const surface = { parts, nodes, ui };
  let code = `export const operations = {
    "references.list": async (_, sdk) => ({ references: JSON.parse((await sdk.storage.get("references")) ?? "[]") }),
    "references.save": async (input, sdk) => { await sdk.storage.set("references", JSON.stringify([{ kind: ${JSON.stringify(kind)}, id: input.id }])); return true; }
  };`;
  if (reader) {
    const context = defineSubjectContextAction("test.context", 1, kind, "Reference context", []);
    const subject = { kind, id: "example-reference" };
    contract.operations.push({ id: "references.context", kind: "query", read_protocol: { kind: "subject_context", subject_kind: kind },
      input: context.action.input_schema, output: context.action.output_schema!, errors: [], effects: { storage: ["read"] },
      examples: [{ input: { subject_id: subject.id }, output: subjectContext({ subject, title: reader.title, content: reader.content, revision: "1",
        open: { surface: "workbench", id: subject.id } }) }] });
    code += `
operations["references.context"] = async ({ subject_id }, sdk) => {
  const { references } = await operations["references.list"]({}, sdk);
  const subject = references.find(entry => entry.id === subject_id);
  if (!subject) throw Error("The owner no longer holds this object");
  return { subject, title: ${JSON.stringify(reader.title)}, content: ${JSON.stringify(reader.content)}, revision: "1", truncated: false,
    open: { surface: subject_id === ${JSON.stringify(reader.invalidOpenId)} ? "foreign-stage" : "workbench", id: subject_id } };
};`;
  }
  return { contract, surface, code };
}

export async function packSignedObjectSlot(t: TestContext, scope: "home" | "project", pluginId: string, kind: string, reader?: ReaderFixture) {
  const directory = await mkdtemp(join(tmpdir(), "signed-object-slot-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publisher = newPublisher(), { contract, surface, code } = authoredObjectSlot(pluginId, kind, reader);
  await Promise.all([
    writeFile(join(directory, SANDBOX_PACKAGE_FILES.contract), JSON.stringify(contract)),
    writeFile(join(directory, SANDBOX_PACKAGE_FILES.interface), JSON.stringify(surface)),
    writeFile(join(directory, SANDBOX_PACKAGE_FILES.entrypoint), code),
    writeFile(join(directory, SANDBOX_PACKAGE_FILES.prompts), "[]"),
  ]);
  const packed = await packSandboxProject(directory, join(directory, "unsigned.json"), {
    name: "Original references " + scope, version: scope === "project" ? "1.0.0" : "2.0.0",
    publisherId: "test-author", publisherKeyId: publisher.identity, scope,
  });
  return { surface, bundle: signPluginPackage(packed, publisher.signer) };
}
