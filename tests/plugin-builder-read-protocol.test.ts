import assert from "node:assert/strict";
import test from "node:test";
import type { SandboxReadOperation } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { expandDesign, normalizeProposal, type AgentDesign, validateAgentDesign } from "@molis-ai/molis-work-plugin-builder";
import { assertContract } from "@molis-ai/molis-work-plugin-sandbox";
import { definePresentationValuesAction } from "@molis-ai/molis-work-plugin-sdk";
import { packageContract, packageParts } from "./fixtures/sandbox-package.js";

const subject = { id: "first", kind: "note" };
const outline = { id: "notes", title: "Notes", description: "Read and write notes", rationale: "Keep the same notes in view", journey: ["Read a note"] };
const protocolId = "notes.presentation";

function mixedDesign() {
  const contract = packageContract();
  const definition = definePresentationValuesAction(protocolId, 1, [subject.kind], "Notes values", []);
  const protocol: SandboxReadOperation = {
    id: protocolId, kind: "query", read_protocol: { kind: "presentation_values", subject_kinds: [subject.kind] },
    input: definition.action.input_schema, output: definition.action.output_schema!,
    effects: { artifacts: ["read"] }, errors: [], examples: [{
      input: { subjects: [subject], fields: ["title"] },
      output: { items: [{ subject, revision: "1", state: "ok", values: { title: "First" } }] },
    }],
  };
  contract.operations.push(protocol);
  contract.pages[0]!.regions[0]!.operationIds.push(protocolId);
  contract.acceptance = [{ id: "show-notes", description: "Show notes", steps: [{ description: "Open the page", expected: "笔记" }] }];
  const design: AgentDesign = { ...outline, contract, parts: packageParts(), acceptance: [{
    id: "show-notes", description: "Show notes",
    steps: [{ action: "page", pageId: "home" }, { action: "expect", componentId: "title", text: "笔记" }],
  }] };
  return { design, protocol };
}

const validate = (design: AgentDesign) => validateAgentDesign(design, [], [], assertContract);

test("SSC-06: Builder validation preserves canonical read schemas, examples and read-only artifacts alongside ordinary components", () => {
  const { design, protocol } = mixedDesign();
  const checked = validate(design);
  assert.deepEqual(checked.contract.operations.find(operation => operation.id === protocolId), protocol);
  assert.deepEqual(checked.contract.operations.filter(operation => operation.read_protocol === undefined), design.contract.operations.slice(0, 2));
  assert.equal(checked.parts.find(part => part.id === "notes")?.read?.operationId, "notes.list");
  assert.equal(checked.parts.find(part => part.id === "editor")?.submit?.operationId, "notes.add");
});

test("SSC-06: a fixed read protocol cannot bind to a Builder component's read or submit", () => {
  for (const mode of ["read", "submit"] as const) {
    const { design } = mixedDesign();
    const part = design.parts.find(part => part.id === (mode === "read" ? "notes" : "editor"))!;
    part[mode] = { operationId: protocolId, input: {} };
    assert.throws(() => validate(design), /平台读取协议不能绑定到页面组件.*notes\.presentation/u);
  }
});

test("SSC-06: Builder keeps the sandbox's rejection of changed schemas, write effects and bad fixed examples", () => {
  const invalid = [
    [(operation: SandboxReadOperation) => { operation.output = { type: "object" }; }, /input and output must be the platform schemas/u],
    [(operation: SandboxReadOperation) => { operation.effects.artifacts = ["write"]; }, /only accepts local read effects/u],
    [(operation: SandboxReadOperation) => { operation.examples[0]!.output = { items: "not an array" }; }, /does not match the fixed read protocol output/u],
  ] as const;
  for (const [change, refusal] of invalid) {
    const { design, protocol } = mixedDesign();
    change(protocol);
    assert.throws(() => validate(design), refusal);
  }
});

test("SSC-06: both Builder authoring stages report a fixed protocol instead of normalizing it into an ordinary query", () => {
  const { design, protocol } = mixedDesign();
  const raw = { ...outline, operations: [protocol] };
  assert.throws(() => normalizeProposal(raw, 0, design.contract.pluginId, []), /read_protocol 要在插件代码工具中声明/u);
  assert.throws(() => expandDesign(raw, outline, design.contract.pluginId, "new", []), /read_protocol 要在插件代码工具中声明/u);
});
